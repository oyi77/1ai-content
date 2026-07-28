/**
 * Gemini Vision API URL builder.
 */
import { AIConfigService } from '@/services/ai-config.service';
import { getConfig } from '@/config/env';

export async function getGeminiVisionUrl() {
  const cfg = await AIConfigService.getTaskConfig('transcript').catch(() => null);
  const model = cfg?.model || 'gemini-2.5-flash';
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getConfig().GEMINI_API_KEY || ''}`;
}
