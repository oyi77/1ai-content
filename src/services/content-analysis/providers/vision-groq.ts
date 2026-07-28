/**
 * Groq Vision provider — fallback when Gemini fails.
 * Images: sent as base64. Videos: single frame extracted via ffmpeg.
 */
import axios from 'axios';
import { ConfigError, ProviderError } from '@/utils/app-errors';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { trackTokens } from '@/services/token-tracker.service';
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
 * Extract a video frame as base64 via ffmpeg.
 */
async function extractVideoFrame(mediaUrl: string): Promise<{ data: string; mimeType: string }> {
  const { execFile: execFileCb } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFileCb);
  const tmpBase = `/tmp/groq_${Date.now()}`;
  const videoPath = `${tmpBase}.mp4`;
  const framePath = `${tmpBase}.jpg`;

  try {
    const videoRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const { writeFile, readFile, unlink } = await import('fs/promises');
    await writeFile(videoPath, Buffer.from(videoRes.data));
    await execFileAsync('ffmpeg', ['-i', videoPath, '-ss', '00:00:01', '-vframes', '1', framePath, '-y'], { timeout: 15000 });
    const buf = await readFile(framePath);
    return { data: buf.toString('base64'), mimeType: 'image/jpeg' };
  } finally {
    const { unlink } = await import('fs/promises');
    await unlink(videoPath).catch(() => {});
    await unlink(framePath).catch(() => {});
  }
}

/**
 * Extract prompt from media using Groq Vision API.
 * Accepts optional model and prompt overrides for config-driven dispatch.
 */
export async function extractViaGroq(
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
    const frame = await extractVideoFrame(mediaUrl);
    base64Data = frame.data;
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
