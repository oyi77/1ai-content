/**
 * Vision provider chain — orchestrates fallback across Gemini → Groq → OmniRoute.
 */
import { logger } from '@/utils/logger';
import { AIConfigService } from '@/services/ai-config.service';
import { getConfig } from '@/config/env';
import { redis } from '@/config/redis';
import { extractViaGemini } from './providers/vision-gemini';
import { extractViaGroq } from './providers/vision-groq';
import { extractViaOmniRoute } from './providers/vision-omniroute';
import { getFallbackResult } from './fallback';
import type { AnalysisResult } from './types';

/**
 * System prompt used for image analysis (fallback when no configured prompt).
 */
const FALLBACK_IMAGE_SYSTEM_PROMPT = `You are an expert AI image prompt engineer. Analyze this image with MAXIMUM DETAIL:

1. CHARACTER/PERSON (if present): Gender, approximate age range, ethnicity/skin tone, hairstyle & color, facial expression, body posture, clothing (exact description: "navy wool blazer over white Oxford shirt" not "suit"), accessories, hand position, gaze direction. If no person, describe the main product/object with equal detail.
2. SUBJECT/PRODUCT: Exact appearance, materials, textures, brand elements (e.g. "burgundy leather handbag with brushed gold hardware, visible stitching pattern" not "bag")
3. COMPOSITION: Layout, framing, depth of field, subject placement (e.g. "subject center-left, shallow DOF f/1.4, rule-of-thirds, negative space upper-right")
4. LIGHTING: Direction, quality, temperature, number of sources (e.g. "warm key light 45° upper-left at 3200K, soft fill from right, hair/rim light on edges, catchlight in eyes")
5. COLOR PALETTE: Exact colors with relationships (e.g. "warm neutrals: cream, tan, burnt sienna; cool accent: teal in background")
6. TEXTURE & MATERIAL: Surface properties visible (glossy, matte, rough, smooth, metallic, organic, fabric weave)
7. CAMERA: Lens, angle, distance (e.g. "85mm f/1.8, eye-level slightly below, 1.5m distance, natural oval bokeh")
8. STYLE & MOOD: Aesthetic, emotion, commercial intent (e.g. "luxe minimalist, confident, high-end fashion editorial")
9. BACKGROUND: Environment details, depth layers, blur quality, props

Output as a single cohesive prompt paragraph, 300-400 words. Character description MUST come first if people are present. Prioritize technical precision.`;

/**
 * System prompt used for video analysis (fallback when no configured prompt).
 */
const FALLBACK_VIDEO_SYSTEM_PROMPT = `You are an expert video analysis AI. Analyze this video with MAXIMUM DETAIL:

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

Output 400-600 words total. Character descriptions MUST be detailed enough to recreate with a different AI model.`;

/**
 * Provider descriptor for the fallback chain.
 */
interface ProviderCfg {
  provider: string;
  model: string;
}

/**
 * Extract prompt from video/image using config-driven fallback chain.
 * Primary → transcriptFallback1 → transcriptFallback2 → hardcoded fallback.
 */
export async function extractPrompt(mediaUrl: string, mediaType: 'video' | 'image'): Promise<AnalysisResult> {
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
  } catch (err) {
    logger.debug('Cache miss:', err);
  }

  // Load config-driven prompts and provider chain
  const [tasksConfig, promptsConfig] = await Promise.all([
    AIConfigService.getTasksConfig().catch(() => null),
    AIConfigService.getPromptsConfig().catch(() => null),
  ]);

  const primary: ProviderCfg = tasksConfig?.transcript ?? { provider: 'gemini', model: 'gemini-2.5-flash' };
  const fallback1: ProviderCfg = tasksConfig?.transcriptFallback1 ?? { provider: 'omniroute', model: 'antigravity/gemini-2.5-flash' };
  const fallback2: ProviderCfg = tasksConfig?.transcriptFallback2 ?? { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct' };

  const configuredImagePrompt = promptsConfig?.imageAnalysisPrompt || '';
  const configuredVideoPrompt = promptsConfig?.videoAnalysisPrompt || '';

  const chain: Array<{ provider: string; model: string }> = [primary, fallback1, fallback2];

  for (const cfg of chain) {
    try {
      const result = await extractViaProvider(cfg.provider, cfg.model, mediaUrl, mediaType, configuredImagePrompt, configuredVideoPrompt);
      if (result.success && result.prompt) {
        try {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL);
        } catch (err) {
          logger.debug('Cache write non-fatal:', err);
        }
        return result;
      }
    } catch (err) {
      logger.warn(`Vision provider ${cfg.provider}/${cfg.model} failed: ${(err as Error).message}`);
    }
  }

  logger.warn('All vision providers failed, returning fallback result');
  return getFallbackResult(mediaType);
}

/**
 * Generic vision dispatch — routes to the correct provider based on provider name.
 */
async function extractViaProvider(
  provider: string,
  model: string,
  mediaUrl: string,
  mediaType: 'video' | 'image',
  configuredImagePrompt: string,
  configuredVideoPrompt: string,
): Promise<AnalysisResult> {
  const systemPrompt =
    mediaType === 'image'
      ? (configuredImagePrompt || FALLBACK_IMAGE_SYSTEM_PROMPT)
      : (configuredVideoPrompt || FALLBACK_VIDEO_SYSTEM_PROMPT);

  switch (provider) {
    case 'gemini':
      return extractViaGemini(mediaUrl, mediaType, systemPrompt);
    case 'groq':
      return extractViaGroq(mediaUrl, mediaType, model, systemPrompt);
    default:
      // omniroute or any custom provider
      return extractViaOmniRoute(mediaUrl, mediaType, model || 'antigravity/gemini-2.5-flash', systemPrompt);
  }
}
