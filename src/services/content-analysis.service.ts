/**
 * Content Analysis Service
 *
 * Handles content cloning, prompt extraction, and viral research
 * Uses Gemini Vision API for media analysis
 */

import { logger } from '@/utils/logger';
import { ConfigError, ProviderError } from '@/utils/app-errors';
import { getConfig } from '@/config/env';
import axios from 'axios';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { trackTokens } from '@/services/token-tracker.service';
import { getOmniRouteService } from '@/services/omniroute.service';
import { AIConfigService } from '@/services/ai-config.service';
import { redis } from '@/config/redis';

interface StoryboardScene {
  time: string;
  description: string;
  text: string;
}

interface Storyboard {
  scenes: StoryboardScene[];
  caption: string;
}

const OMNI_IMAGE_PROMPT = `Analyze this image in detail for AI content creation purposes. Describe:
1. Subject/product (exact appearance, materials, textures, colors)
2. Composition and framing
3. Lighting (direction, quality, temperature)
4. Style and mood
5. Background and setting

Output as a single detailed paragraph (200-400 words) starting with the main subject. Be specific and technical enough to recreate this image with an AI generator.`;

const OMNI_VIDEO_PROMPT = `Analyze this video frame for content recreation purposes. Based on what you see, describe:
1. Characters/people (appearance, clothing, expression, role)
2. Scene content and action
3. Visual style (lighting, color grade, camera angle)
4. Mood and aesthetic
5. What type of content this appears to be (marketing, lifestyle, education, etc.)

Also provide a brief storyboard outline:
STORYBOARD:
Scene 1 | 5s | [description of this scene and what should happen]

Output 300-500 words total.`;

function getGeminiVisionUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${getConfig().GEMINI_API_KEY || ''}`;
}

export interface AnalysisResult {
  success: boolean;
  prompt?: string;
  style?: string;
  elements?: string[];
  storyboard?: Array<{ scene: number; duration: number; description: string }>;
  error?: string;
}

export interface ViralTrend {
  niche: string;
  patterns: string[];
  hashtags: string[];
  audioTypes: string[];
  editStyles: string[];
  topPerformers: string[];
}

/**
 * Fetch media as base64 for Gemini inline_data
 */
async function fetchMediaAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  // Local file path — read directly (axios cannot handle file:// or bare paths)
  const isLocal = !url.startsWith('http://') && !url.startsWith('https://');
  if (isLocal) {
    const localPath = url.startsWith('file://') ? url.slice(7) : url;
    const buf = await readFile(localPath);
    const ext = extname(localPath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';
    else {
      // Magic bytes fallback
      if (buf[0] === 0x89 && buf[1] === 0x50) mimeType = 'image/png';
      else if (buf[0] === 0xFF && buf[1] === 0xD8) mimeType = 'image/jpeg';
    }
    return { data: buf.toString('base64'), mimeType };
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  // Telegram often returns 'application/octet-stream' — detect real type from URL or magic bytes
  let contentType = String(response.headers['content-type'] || 'image/jpeg');
  if (contentType === 'application/octet-stream' || (contentType && !contentType.startsWith('image/'))) {
    // Infer from URL extension
    if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
    else if (url.includes('.png')) contentType = 'image/png';
    else if (url.includes('.webp')) contentType = 'image/webp';
    else if (url.includes('.gif')) contentType = 'image/gif';
    else if (url.includes('.mp4')) contentType = 'video/mp4';
    else {
      // Check magic bytes
      const buf = Buffer.from(response.data);
      if (buf[0] === 0xFF && buf[1] === 0xD8) contentType = 'image/jpeg';
      else if (buf[0] === 0x89 && buf[1] === 0x50) contentType = 'image/png';
      else contentType = 'image/jpeg'; // safe default for Gemini
    }
  }

  const base64 = Buffer.from(response.data).toString('base64');
  return { data: base64, mimeType: String(contentType) };
}

/**
 * Parse Gemini response text into structured AnalysisResult
 */
function parseGeminiResponse(text: string): AnalysisResult {
  // Extract style from the response
  const styleMatch = text.match(/(?:style|aesthetic|mood)[:\s]*([^\n.]+)/i);
  const style = styleMatch ? styleMatch[1].trim() : 'commercial';

  // Extract elements - look for list items or comma-separated keywords
  const elements: string[] = [];
  const listMatches = text.match(/[-*]\s*(.+)/g);
  if (listMatches) {
    listMatches.slice(0, 6).forEach(item => {
      elements.push(item.replace(/^[-*]\s*/, '').trim());
    });
  }

  if (elements.length === 0) {
    // Fallback: extract key phrases
    const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 10);
    sentences.slice(0, 5).forEach(s => elements.push(s.trim()));
  }

  return {
    success: true,
    prompt: text.trim(),
    style,
    elements,
  };
}

/**
 * Content Analysis and Cloning Service
 */
export class ContentAnalysisService {

  /**
   * Extract prompt from video/image — config-driven fallback chain.
   * Primary → transcriptFallback1 → transcriptFallback2 → hardcoded fallback result.
   */
  static async extractPrompt(mediaUrl: string, mediaType: 'video' | 'image'): Promise<AnalysisResult> {
    logger.info(`Extracting prompt from ${mediaType}: ${mediaUrl.slice(0, 50)}...`);

    // Check vision cache
    const cacheKey = `vision:cache:${mediaType}:${Buffer.from(mediaUrl).toString('base64').slice(0, 48)}`;
    const cacheTTL = mediaType === 'image' ? 86400 : 21600; // 24h images, 6h videos
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug(`vision:cache hit for ${mediaUrl.slice(-40)}`);
        return JSON.parse(cached) as AnalysisResult;
      }
    } catch (err) { logger.debug("Cache miss:", err); }

    const [tasksConfig, promptsConfig] = await Promise.all([
      AIConfigService.getTasksConfig().catch(() => null),
      AIConfigService.getPromptsConfig().catch(() => null),
    ]);

    const primary = tasksConfig?.transcript ?? { provider: 'gemini' as const, model: 'gemini-2.5-flash' };
    const fallback1 = tasksConfig?.transcriptFallback1 ?? { provider: 'omniroute' as const, model: 'antigravity/gemini-2.5-flash' };
    const fallback2 = tasksConfig?.transcriptFallback2 ?? { provider: 'groq' as const, model: 'meta-llama/llama-4-scout-17b-16e-instruct' };

    const configuredImagePrompt = promptsConfig?.imageAnalysisPrompt || '';
    const configuredVideoPrompt = promptsConfig?.videoAnalysisPrompt || '';

    const chain = [primary, fallback1, fallback2];

    for (const cfg of chain) {
      try {
        const result = await ContentAnalysisService._extractViaProvider(
          cfg.provider, cfg.model, mediaUrl, mediaType,
          configuredImagePrompt, configuredVideoPrompt,
        );
        if (result.success && result.prompt) {
          try {
            await redis.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL);
          } catch (err) { logger.debug("Non-fatal error:", err); }
          return result;
        }
      } catch (err) {
        logger.warn(`Vision provider ${cfg.provider}/${cfg.model} failed: ${(err as Error).message}`);
      }
    }

    logger.warn('All vision providers failed, returning fallback result');
    return ContentAnalysisService.getFallbackResult(mediaType);
  }

  /**
   * Generic vision dispatch — routes to the right API based on provider name.
   */
  private static async _extractViaProvider(
    provider: string,
    model: string,
    mediaUrl: string,
    mediaType: 'video' | 'image',
    configuredImagePrompt: string,
    configuredVideoPrompt: string,
  ): Promise<AnalysisResult> {
    const imagePrompt = configuredImagePrompt || (mediaType === 'image'
      ? `You are an expert AI image prompt engineer. Analyze this image with MAXIMUM DETAIL:

1. CHARACTER/PERSON (if present): Gender, approximate age range, ethnicity/skin tone, hairstyle & color, facial expression, body posture, clothing (exact description: "navy wool blazer over white Oxford shirt" not "suit"), accessories, hand position, gaze direction. If no person, describe the main product/object with equal detail.
2. SUBJECT/PRODUCT: Exact appearance, materials, textures, brand elements (e.g. "burgundy leather handbag with brushed gold hardware, visible stitching pattern" not "bag")
3. COMPOSITION: Layout, framing, depth of field, subject placement (e.g. "subject center-left, shallow DOF f/1.4, rule-of-thirds, negative space upper-right")
4. LIGHTING: Direction, quality, temperature, number of sources (e.g. "warm key light 45° upper-left at 3200K, soft fill from right, hair/rim light on edges, catchlight in eyes")
5. COLOR PALETTE: Exact colors with relationships (e.g. "warm neutrals: cream, tan, burnt sienna; cool accent: teal in background")
6. TEXTURE & MATERIAL: Surface properties visible (glossy, matte, rough, smooth, metallic, organic, fabric weave)
7. CAMERA: Lens, angle, distance (e.g. "85mm f/1.8, eye-level slightly below, 1.5m distance, natural oval bokeh")
8. STYLE & MOOD: Aesthetic, emotion, commercial intent (e.g. "luxe minimalist, confident, high-end fashion editorial")
9. BACKGROUND: Environment details, depth layers, blur quality, props

Output as a single cohesive prompt paragraph, 300-400 words. Character description MUST come first if people are present. Prioritize technical precision.`
      : '');

    const videoPrompt = configuredVideoPrompt || (mediaType === 'video'
      ? `You are an expert video analysis AI. Analyze this video with MAXIMUM DETAIL:

CHARACTER/PERSON DEFINITION (CRITICAL — describe ALL people visible):
For EACH person/character:
- Gender, approximate age, ethnicity/skin tone
- Hairstyle, hair color, facial features
- Clothing: exact description per scene (e.g. "white cropped hoodie, high-waisted black joggers, white sneakers")
- Accessories: jewelry, glasses, hat, watch, etc.
- Body language: posture, gestures, energy level
- Expressions: emotion per scene (smiling, serious, surprised, etc.)
- Role: presenter, model, customer, actor, hands-only, etc.

VISUAL ANALYSIS:
- Pacing: cuts per second, rhythm, energy level
- Color grading: specific grades, temperature shifts, contrast levels
- Camera: movements (pan, tilt, dolly, zoom speeds), stabilization, angles per scene
- Effects: overlays, graphics, particles, motion blur, text animations
- Transitions: types with timing (cut, fade, dissolve, wipe, zoom)

SCENE BREAKDOWN:
For EACH scene:
- Exact duration and visual content
- Which character(s) appear and what they do
- Camera movement and angle
- Lighting changes
- Text/graphics overlays if any

Then output:
STORYBOARD:
Scene 1 | Xs | [Character action + camera + lighting + text overlay]
Scene 2 | Xs | [Character action + camera + lighting + text overlay]
(continue for ALL scenes)

Output 400-600 words total. Character descriptions MUST be detailed enough to recreate with a different AI model.`
      : '');

    const systemPrompt = mediaType === 'image' ? imagePrompt : videoPrompt;

    if (provider === 'gemini') {
      if (!getConfig().GEMINI_API_KEY) {
        throw new ConfigError('GEMINI_API_KEY');
      }
      const media = await fetchMediaAsBase64(mediaUrl);
      const requestBody = {
        contents: [{
          parts: [
            { text: systemPrompt },
            { inline_data: { mime_type: media.mimeType, data: media.data } },
          ],
        }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: mediaType === 'video' ? 3500 : 2000,
        },
      };
      const response = await axios.post(getGeminiVisionUrl(), requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });
      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!generatedText) throw new ProviderError('Gemini', 'Empty response');
      const usageMeta = response.data?.usageMetadata;
      const promptTokens = usageMeta?.promptTokenCount || (mediaType === 'video' ? 3000 : 2000);
      const completionTokens = usageMeta?.candidatesTokenCount || (mediaType === 'video' ? 2000 : 1500);
      trackTokens({ provider: 'gemini-direct', model: model || 'gemini-2.5-flash', service: 'content_analysis', promptTokens, completionTokens }).catch(err => logger.warn('Token tracking failed', { error: (err as Error).message }));
      return parseGeminiResponse(generatedText);
    }

    if (provider === 'groq') {
      return ContentAnalysisService._extractViaGroq(mediaUrl, mediaType, model, systemPrompt);
    }

    // omniroute or any custom provider — use OmniRoute with the specified model
    return ContentAnalysisService._extractViaOmniRoute(mediaUrl, mediaType, model || 'antigravity/gemini-2.5-flash', systemPrompt);
  }

  /**
   * OmniRoute vision fallback — used when Gemini key is missing or 403.
   * Accepts optional model and prompt overrides for config-driven dispatch.
   */
  private static async _extractViaOmniRoute(
    mediaUrl: string,
    mediaType: 'video' | 'image',
    visionModel?: string,
    promptOverride?: string,
  ): Promise<AnalysisResult> {
    const omni = getOmniRouteService();
    if (!visionModel) {
      const taskCfg = await AIConfigService.getTaskConfig('transcript').catch(() => null);
      visionModel = (taskCfg?.provider === 'omniroute' && taskCfg.model)
        ? taskCfg.model
        : 'antigravity/gemini-2.5-flash';
    }
    const prompt = promptOverride ?? (mediaType === 'image' ? OMNI_IMAGE_PROMPT : OMNI_VIDEO_PROMPT);

    // For HTTP URLs (Telegram CDN), pass URL directly — avoids large base64 payload
    if (mediaType === 'image' && mediaUrl.startsWith('http')) {
      try {
        const result = await omni.analyzeImageUrl(mediaUrl, prompt, visionModel);
        if (result.success && result.content) {
          logger.info(`OmniRoute vision (URL) succeeded for ${mediaType} (${result.model})`);
          return parseGeminiResponse(result.content);
        }
        logger.warn(`OmniRoute analyzeImageUrl returned empty: ${result.error}`);
      } catch (urlErr) {
        logger.warn(`OmniRoute analyzeImageUrl failed: ${(urlErr as Error).message}, trying base64`);
      }
    }

    // Fallback: download and encode as base64
    const media = await fetchMediaAsBase64(mediaUrl);
    const result = await omni.analyzeImage(media.data, media.mimeType, prompt, visionModel);
    if (!result.success || !result.content) {
      throw new ProviderError('OmniRoute', `vision returned empty: ${result.error}`);
    }
    logger.info(`OmniRoute vision (base64) succeeded for ${mediaType} (${result.model})`);
    return parseGeminiResponse(result.content);
  }

  /**
   * Groq vision fallback — used when OmniRoute times out.
   * Images: sent directly as base64. Videos: single frame extracted via ffmpeg first.
   * Accepts optional model and prompt overrides for config-driven dispatch.
   */
  private static async _extractViaGroq(
    mediaUrl: string,
    mediaType: 'video' | 'image',
    modelOverride?: string,
    promptOverride?: string,
  ): Promise<AnalysisResult> {
    const apiKey = getConfig().GROQ_API_KEY;
    if (!apiKey) throw new ConfigError('GROQ_API_KEY');

    const groqModel = modelOverride || 'meta-llama/llama-4-scout-17b-16e-instruct';

    let base64Data: string;
    let imageMime = 'image/jpeg';

    if (mediaType === 'video') {
      // Extract a single frame via ffmpeg
      const { execFile: execFileCb } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFileCb);
      const tmpBase = `/tmp/groq_${Date.now()}`;
      const videoPath = `${tmpBase}.mp4`;
      const framePath = `${tmpBase}.jpg`;
      try {
        const videoRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const { writeFile } = await import('fs/promises');
        await writeFile(videoPath, Buffer.from(videoRes.data));
        await execFileAsync('ffmpeg', ['-i', videoPath, '-ss', '00:00:01', '-vframes', '1', framePath, '-y'], { timeout: 15000 });
        base64Data = (await readFile(framePath)).toString('base64');
      } finally {
        const { unlink } = await import('fs/promises');
        await unlink(videoPath).catch(() => {});
        await unlink(framePath).catch(() => {});
      }
    } else {
      const media = await fetchMediaAsBase64(mediaUrl);
      base64Data = media.data;
      imageMime = media.mimeType.startsWith('image/') ? media.mimeType : 'image/jpeg';
    }

    const prompt = promptOverride ?? (mediaType === 'image' ? OMNI_IMAGE_PROMPT : OMNI_VIDEO_PROMPT);
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: groqModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${base64Data}` } },
          ],
        }],
        max_tokens: 2000,
        temperature: 0.65,
      },
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('Groq', 'Empty response');

    logger.info(`Groq vision succeeded for ${mediaType}`);
    trackTokens({
      provider: 'groq',
      model: groqModel,
      service: `groq_vision_${mediaType}`,
      promptTokens: response.data?.usage?.prompt_tokens || 0,
      completionTokens: response.data?.usage?.completion_tokens || 0,
    }).catch(() => {});

    return parseGeminiResponse(content);
  }

  /**
   * Clone video style using Gemini Vision analysis
   */
  static async cloneVideo(sourceUrl: string): Promise<AnalysisResult> {
    try {
      logger.info(`Cloning video: ${sourceUrl.slice(0, 50)}...`);

      if (!getConfig().GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY not set for cloneVideo, trying OmniRoute');
        return ContentAnalysisService._extractViaOmniRoute(sourceUrl, 'video');
      }

      const media = await fetchMediaAsBase64(sourceUrl);

      const systemPrompt =
        'You are an expert video analyst. Create a DETAILED recreation prompt:\n\n' +
        'CHARACTER/PERSON DEFINITION (CRITICAL — describe ALL people visible):\n' +
        'For EACH person: gender, age range, ethnicity/skin tone, hairstyle & color, facial features.\n' +
        'CLOTHING per scene: exact description (e.g. "white cropped hoodie, high-waisted black joggers, white sneakers" not "casual outfit").\n' +
        'Accessories: jewelry, glasses, hat, watch. Body language & expressions per scene.\n' +
        'Role: presenter, model, customer, actor, hands-only.\n\n' +
        '1. CINEMATOGRAPHY: Camera movements (pan speed, tilt angle, dolly distance), shot types (wide/medium/close-up/macro)\n' +
        '2. COLOR GRADING: Specific grades (teal & orange, desaturated, high-contrast), temperature shifts\n' +
        '3. LIGHTING: Key light setup per scene, practical lights, color gels, golden hour/blue hour\n' +
        '4. TRANSITIONS: Exact types (cut, J-cut, whip pan, zoom, dissolve) with timing\n' +
        '5. TEXT/GRAPHICS: Font style, animation type, position, timing of overlays\n' +
        '6. MOOD & PACING: Energy level, emotional arc, cuts per second, rhythm changes\n\n' +
        'IMPORTANT: Break down into individual scenes with timing.\n' +
        'After the recreation prompt, output:\n' +
        'STORYBOARD:\n' +
        'Scene 1 | 3s | [Character(s) + action + camera + lighting + text overlay]\n' +
        'Scene 2 | 5s | [Character(s) + action + camera + lighting + text overlay]\n' +
        '(continue for ALL scenes)\n\n' +
        'Character descriptions MUST be detailed enough to recreate the exact look with AI.\n' +
        'Output 500-700 words total.';

      const requestBody = {
        contents: [{
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: media.mimeType,
                data: media.data,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 3500,
        },
      };

      const response = await axios.post(getGeminiVisionUrl(), requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        const fallback = this.getFallbackResult('video');
        fallback.prompt = `Clone style: ${fallback.prompt}`;
        return fallback;
      }

      // Track clone video analysis cost
      const cloneVideoMeta = response.data?.usageMetadata;
      trackTokens({ provider: 'gemini-direct', model: 'gemini-2.5-flash', service: 'clone_video', promptTokens: cloneVideoMeta?.promptTokenCount || 3000, completionTokens: cloneVideoMeta?.candidatesTokenCount || 2500 }).catch(err => logger.warn('Token tracking failed', { error: (err as Error).message }));

      const result = parseGeminiResponse(generatedText);

      // Parse storyboard from the response
      const storyboard = this.parseStoryboard(generatedText);
      if (storyboard.length > 0) {
        result.storyboard = storyboard;
      }

      return result;

    } catch (error) {
      logger.warn(`Video cloning via Gemini failed: ${(error as Error).message}, trying OmniRoute`);
      return ContentAnalysisService._extractViaOmniRoute(sourceUrl, 'video');
    }
  }

  /**
   * Clone image style using Gemini Vision analysis
   */
  static async cloneImage(sourceUrl: string): Promise<AnalysisResult> {
    try {
      logger.info(`Cloning image: ${sourceUrl.slice(0, 50)}...`);

      if (!getConfig().GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY not set for cloneImage, trying OmniRoute');
        return ContentAnalysisService._extractViaOmniRoute(sourceUrl, 'image');
      }

      const media = await fetchMediaAsBase64(sourceUrl);

      const systemPrompt =
        'You are an expert at analyzing images for AI recreation. Create a DETAILED prompt:\n\n' +
        '1. CHARACTER/PERSON (if present): Gender, age range, ethnicity/skin tone, hairstyle & color, facial expression & emotion, body posture & gesture, EXACT clothing description (e.g. "cream silk blouse tucked into charcoal wool trousers" not "outfit"), accessories (jewelry, glasses, watch), gaze direction, hand position. If no person, skip to #2.\n' +
        '2. SUBJECT/PRODUCT: Exact object appearance, materials, textures, colors (specific: "burgundy" not "red"), brand elements, surface details\n' +
        '3. COMPOSITION: Layout, rule-of-thirds, negative space, depth layers, focal point, subject-to-frame ratio\n' +
        '4. LIGHTING: Key light direction, fill ratio, rim light, color temperature (e.g. 3200K), quality (hard/soft), catchlights\n' +
        '5. COLOR PALETTE: Dominant + accent colors, saturation, contrast, color grading style\n' +
        '6. CAMERA: Lens (e.g. 85mm f/1.8), angle, distance, depth of field, bokeh quality\n' +
        '7. BACKGROUND: Environment details, blur quality, supporting elements, depth layers\n' +
        '8. STYLE & MOOD: Art direction, aesthetic, emotional tone, commercial intent\n\n' +
        'Character/person description MUST come first and be detailed enough to recreate the exact look.\n' +
        'Output as a single cohesive prompt, 300-400 words. Technical precision over generic language.';

      const requestBody = {
        contents: [{
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: media.mimeType,
                data: media.data,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 2000,
        },
      };

      const response = await axios.post(getGeminiVisionUrl(), requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        const fallback = this.getFallbackResult('image');
        fallback.prompt = `Clone style: ${fallback.prompt}`;
        return fallback;
      }

      // Track clone image analysis cost
      const cloneImgMeta = response.data?.usageMetadata;
      trackTokens({ provider: 'gemini-direct', model: 'gemini-2.5-flash', service: 'clone_image', promptTokens: cloneImgMeta?.promptTokenCount || 2000, completionTokens: cloneImgMeta?.candidatesTokenCount || 1500 }).catch(err => logger.warn('Token tracking failed', { error: (err as Error).message }));

      return parseGeminiResponse(generatedText);

    } catch (error) {
      logger.warn(`Image cloning via Gemini failed: ${(error as Error).message}, trying OmniRoute`);
      return ContentAnalysisService._extractViaOmniRoute(sourceUrl, 'image');
    }
  }

  /**
   * Parse storyboard section from Gemini response text
   */
  private static parseStoryboard(text: string): Array<{ scene: number; duration: number; description: string }> {
    const storyboard: Array<{ scene: number; duration: number; description: string }> = [];

    // Look for STORYBOARD: section
    const storyboardMatch = text.match(/STORYBOARD[:\s]*\n([\s\S]+?)(?:\n\n|$)/i);
    if (!storyboardMatch) return storyboard;

    const lines = storyboardMatch[1].split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Match pattern: Scene N | Xs | Description
      const match = line.match(/Scene\s*(\d+)\s*\|\s*(\d+)s?\s*\|\s*(.+)/i);
      if (match) {
        storyboard.push({
          scene: parseInt(match[1], 10),
          duration: parseInt(match[2], 10),
          description: match[3].trim(),
        });
      }
    }

    return storyboard;
  }

  /**
   * Fallback result when API key is missing or API fails
   */
  private static getFallbackResult(mediaType: 'video' | 'image'): AnalysisResult {
    const templates: Record<string, string> = {
      video: 'Dynamic marketing video: opening hook shot (2s) with bold text overlay and dramatic zoom-in on product, problem scene (3s) showing pain point with desaturated color grade, solution reveal (4s) with product hero shot and warm lighting transition, social proof scene (3s) with testimonial text animation, CTA closing (3s) with brand colors and urgency text. Pacing: 2-3 cuts/second, transitions: mix of hard cuts and zoom transitions, color grade: warm highlights with teal shadows, camera: mix of static close-ups and smooth slider movements.',
      image: 'Professional commercial product photography: subject positioned using rule-of-thirds, warm key light from 45° upper-left with soft fill, rim light on edges for separation. Color palette: warm neutrals (cream, beige) with one accent color. Shot on 85mm f/1.8 lens, shallow depth of field with creamy bokeh background. Surface: clean matte backdrop or lifestyle setting. Post-processing: slight warm grade, enhanced shadows, commercial skin retouching if applicable. Mood: premium, aspirational, clean minimalist aesthetic.',
    };

    return {
      success: true,
      prompt: templates[mediaType],
      style: 'commercial',
      elements: [
        'Professional lighting setup',
        'Deliberate composition',
        'Technical camera settings',
        'Color grading applied',
        'Commercial aesthetic',
      ],
    };
  }

  /**
   * Get viral trends for niche
   */
  static async getViralTrends(niche: string): Promise<ViralTrend> {
    logger.info(`Fetching viral trends for: ${niche}`);

    // Trend data (would be dynamic in production)
    const trendData: Record<string, ViralTrend> = {
      viral: {
        niche: 'viral',
        patterns: [
          'Quick cuts (0.5-1s per scene)',
          'Beat-matching edits',
          'ASMR audio layer',
          'Text-to-speech overlay (Female voice)',
          'Hook in first 3 seconds',
          'Surprise ending',
        ],
        hashtags: ['#fyp', '#viral', '#trending', '#foryou', '#viral2026'],
        audioTypes: ['Trending sounds', 'ASMR', 'Text-to-speech', 'Background music'],
        editStyles: ['Fast-paced', 'Smooth transitions', 'Dynamic zoom', 'Text overlays'],
        topPerformers: ['@user1', '@user2', '@user3'],
      },
      fnb: {
        niche: 'fnb',
        patterns: [
          'Food porn shots',
          'Steam/smoke effects',
          'Close-up texture shots',
          'Before/after reveal',
          'ASMR eating sounds',
          'Recipe steps',
        ],
        hashtags: ['#food', '#foodporn', '#yummy', '#delicious', '#foodie'],
        audioTypes: ['ASMR', 'Cooking sounds', 'Upbeat music', 'Voice-over'],
        editStyles: ['Slow motion', 'Top-down shots', 'Close-ups', 'Time-lapse'],
        topPerformers: ['@foodie1', '@chef2', '@restaurant3'],
      },
      realestate: {
        niche: 'realestate',
        patterns: [
          'Room tours',
          'Drone shots',
          'Before/after renovation',
          'Luxury amenities showcase',
          'Walkthrough style',
          'Ambient music',
        ],
        hashtags: ['#realestate', '#property', '#home', '#luxury', '#interior'],
        audioTypes: ['Ambient music', 'Voice-over', 'Nature sounds', 'Classical'],
        editStyles: ['Smooth pans', 'Wide angles', 'Steady cam', 'Professional'],
        topPerformers: ['@realtor1', '@property2', '@luxury3'],
      },
      ecom: {
        niche: 'ecom',
        patterns: [
          'Product unboxing',
          'Feature highlights',
          'User testimonials',
          'Before/after comparison',
          'Discount urgency',
          'Call-to-action',
        ],
        hashtags: ['#product', '#shopping', '#deal', '#sale', '#musthave'],
        audioTypes: ['Upbeat music', 'Voice-over', 'ASMR', 'Trending sounds'],
        editStyles: ['Product focus', 'Lifestyle shots', 'Quick cuts', 'Text overlays'],
        topPerformers: ['@seller1', '@brand2', '@shop3'],
      },
    };

    return trendData[niche] || trendData.viral;
  }

  /**
   * Generate storyboard from analysis
   */
  static async generateStoryboard(niche: string, _duration: number): Promise<Storyboard> {
    const storyboardTemplates: Record<string, any> = {
      product: {
        scenes: [
          { time: '0-3s', description: 'Hook: Product reveal with dramatic lighting', text: 'Wait for it...' },
          { time: '3-8s', description: 'Feature 1: Close-up of key feature', text: 'Feature highlight' },
          { time: '8-13s', description: 'Feature 2: Different angle/use case', text: 'Versatile design' },
          { time: '13-18s', description: 'Lifestyle: Product in real-world setting', text: 'Perfect for...' },
          { time: '18-25s', description: 'Social proof: Testimonials/reviews', text: '5-star reviews' },
          { time: '25-30s', description: 'CTA: Price + urgency + link', text: 'Limited offer! Link in bio' },
        ],
        caption: 'Check out this amazing product! Limited time offer. Link in bio! #product #musthave #viral',
      },
      fnb: {
        scenes: [
          { time: '0-3s', description: 'Hook: Appetizing food shot', text: 'This is NOT what you think...' },
          { time: '3-8s', description: 'Preparation: Cooking process', text: 'Made fresh daily' },
          { time: '8-13s', description: 'Steam/close-up: Texture and details', text: 'Sizzling hot!' },
          { time: '13-18s', description: 'Plating: Final presentation', text: 'Restaurant quality' },
          { time: '18-25s', description: 'Eating: Satisfaction/ASMR', text: 'So delicious!' },
          { time: '25-30s', description: 'CTA: Location + hours', text: 'Visit us today!' },
        ],
        caption: 'You HAVE to try this! Best [food] in town! Location in bio #food #foodie #yummy',
      },
    };

    return storyboardTemplates[niche] || storyboardTemplates.product;
  }
}
