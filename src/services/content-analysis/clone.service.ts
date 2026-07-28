/**
 * Content cloning — clone video/image style using Gemini Vision with OmniRoute fallback.
 */
import axios from 'axios';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { trackTokens } from '@/services/token-tracker.service';
import { fetchMediaAsBase64, getGeminiVisionUrl } from './media-utils';
import { parseGeminiResponse } from './parse-utils';
import { parseStoryboard } from './parse-utils';
import { getFallbackResult } from './fallback';
import { extractViaOmniRoute } from './providers/vision-omniroute';
import type { AnalysisResult } from './types';

const CLONE_VIDEO_PROMPT =
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

const CLONE_IMAGE_PROMPT =
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

/**
 * Clone video style using Gemini Vision analysis.
 */
export async function cloneVideo(sourceUrl: string): Promise<AnalysisResult> {
  try {
    logger.info(`Cloning video: ${sourceUrl.slice(0, 50)}...`);

    if (!getConfig().GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY not set for cloneVideo, trying OmniRoute');
      return extractViaOmniRoute(sourceUrl, 'video');
    }

    const media = await fetchMediaAsBase64(sourceUrl);
    const requestBody = {
      contents: [{
        parts: [
          { text: CLONE_VIDEO_PROMPT },
          { inline_data: { mime_type: media.mimeType, data: media.data } },
        ],
      }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 3500 },
    };

    const response = await axios.post(getGeminiVisionUrl(), requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      const fallback = getFallbackResult('video');
      fallback.prompt = `Clone style: ${fallback.prompt}`;
      return fallback;
    }

    const usageMeta = response.data?.usageMetadata;
    trackTokens({
      provider: 'gemini-direct',
      model: 'gemini-2.5-flash',
      service: 'clone_video',
      promptTokens: usageMeta?.promptTokenCount || 3000,
      completionTokens: usageMeta?.candidatesTokenCount || 2500,
    }).catch(() => {});

    const result = parseGeminiResponse(generatedText);
    const storyboard = parseStoryboard(generatedText);
    if (storyboard.length > 0) {
      result.storyboard = storyboard;
    }

    return result;
  } catch (error) {
    logger.warn(`Video cloning via Gemini failed: ${(error as Error).message}, trying OmniRoute`);
    return extractViaOmniRoute(sourceUrl, 'video');
  }
}

/**
 * Clone image style using Gemini Vision analysis.
 */
export async function cloneImage(sourceUrl: string): Promise<AnalysisResult> {
  try {
    logger.info(`Cloning image: ${sourceUrl.slice(0, 50)}...`);

    if (!getConfig().GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY not set for cloneImage, trying OmniRoute');
      return extractViaOmniRoute(sourceUrl, 'image');
    }

    const media = await fetchMediaAsBase64(sourceUrl);
    const requestBody = {
      contents: [{
        parts: [
          { text: CLONE_IMAGE_PROMPT },
          { inline_data: { mime_type: media.mimeType, data: media.data } },
        ],
      }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 2000 },
    };

    const response = await axios.post(getGeminiVisionUrl(), requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 45000,
    });

    const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      const fallback = getFallbackResult('image');
      fallback.prompt = `Clone style: ${fallback.prompt}`;
      return fallback;
    }

    const usageMeta = response.data?.usageMetadata;
    trackTokens({
      provider: 'gemini-direct',
      model: 'gemini-2.5-flash',
      service: 'clone_image',
      promptTokens: usageMeta?.promptTokenCount || 2000,
      completionTokens: usageMeta?.candidatesTokenCount || 1500,
    }).catch(() => {});

    return parseGeminiResponse(generatedText);
  } catch (error) {
    logger.warn(`Image cloning via Gemini failed: ${(error as Error).message}, trying OmniRoute`);
    return extractViaOmniRoute(sourceUrl, 'image');
  }
}
