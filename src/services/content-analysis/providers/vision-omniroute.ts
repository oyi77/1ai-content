/**
 * OmniRoute Vision provider — fallback for custom LLM providers.
 */
import { logger } from '@/utils/logger';
import { ProviderError } from '@/utils/app-errors';
import { AIConfigService } from '@/services/ai-config.service';
import { getOmniRouteService } from '@/services/omniroute.service';
import { fetchMediaAsBase64 } from '../media-utils';
import { parseGeminiResponse } from '../parse-utils';
import type { AnalysisResult } from '../types';

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

/**
 * Extract prompt from media via OmniRoute vision.
 * Accepts optional model and prompt overrides for config-driven dispatch.
 */
export async function extractViaOmniRoute(
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

  // For HTTP URLs, pass URL directly — avoids large base64 payload
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
