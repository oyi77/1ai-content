/**
 * Gemini Vision provider — direct Google Gemini API integration.
 */
import axios from 'axios';
import { ConfigError, ProviderError } from '@/utils/app-errors';
import { getConfig } from '@/config/env';
import { trackTokens } from '@/services/token-tracker.service';
import { fetchMediaAsBase64, getGeminiVisionUrl } from '../media-utils';
import { parseGeminiResponse } from '../parse-utils';
import type { AnalysisResult } from '../types';

/**
 * Extract prompt from media using Gemini Vision API (direct).
 */
export async function extractViaGemini(
  mediaUrl: string,
  mediaType: 'video' | 'image',
  systemPrompt: string,
): Promise<AnalysisResult> {
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

  trackTokens({
    provider: 'gemini-direct',
    model: 'gemini-2.5-flash',
    service: 'content_analysis',
    promptTokens,
    completionTokens,
  }).catch(err => { /* non-fatal */ });

  return parseGeminiResponse(generatedText);
}
