/**
 * Shared AI Pipeline Service
 *
 * Wraps @1ai/ai-pipeline with environment-based configuration and
 * graceful fallback. If the shared pipeline is unavailable (missing
 * env vars or network error), consumers fall back to their existing
 * provider-specific code.
 *
 * Environment variables:
 *   AI_PIPELINE_MODE      - 'direct' (default) or 'hub'
 *   AI_PIPELINE_DIRECT_URL - OmniRoute/OpenAI-compatible endpoint (default: http://localhost:20128/v1)
 *   AI_PIPELINE_DIRECT_API_KEY - API key for direct mode
 *   AI_PIPELINE_HUB_URL   - 1ai-hub URL for hub mode
 *   AI_PIPELINE_HUB_API_KEY - API key for hub mode
 *   AI_PIPELINE_DEFAULT_MODEL - Default model (default: auto/pro-fast)
 */

import { AIPipeline, AIPipelineConfig, GenerateResult } from '@1ai/ai-pipeline';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';

let _pipeline: AIPipeline | null = null;
let _initAttempted = false;

function getPipelineConfig(): AIPipelineConfig | null {
  const config = getConfig();

  // Only initialise if at least one routing URL is available
  const directUrl = getConfig().AI_PIPELINE_DIRECT_URL;
  const directApiKey = process.env.AI_PIPELINE_DIRECT_API_KEY || config.OMNIROUTE_API_KEY || '';
  const hubUrl = getConfig().AI_PIPELINE_HUB_URL;
  const mode = getConfig().AI_PIPELINE_MODE as 'direct' | 'hub';

  // Must have a URL to work with
  if (mode === 'hub' && !hubUrl) return null;
  if (mode === 'direct' && !directUrl) return null;

  return {
    mode,
    directUrl,
    directApiKey,
    hubUrl,
    hubApiKey: process.env.AI_PIPELINE_HUB_API_KEY,
    defaultModel: process.env.AI_PIPELINE_DEFAULT_MODEL || 'auto/pro-fast',
    maxRetries: 1,
    timeout: 5000, // 5s timeout matching existing LLM_TIMEOUT
    fallbackModels: [],
  };
}

/**
 * Lazy-initialise and return the shared AIPipeline singleton.
 * Returns null if the pipeline cannot be configured.
 */
export function getSharedAIPipeline(): AIPipeline | null {
  if (_pipeline) return _pipeline;

  if (!_initAttempted) {
    _initAttempted = true;
    const cfg = getPipelineConfig();
    if (cfg) {
      try {
        _pipeline = new AIPipeline(cfg);
        logger.info('[SharedAIPipeline] Initialised', { mode: cfg.mode, url: cfg.mode === 'hub' ? cfg.hubUrl : cfg.directUrl });
      } catch (err: any) {
        logger.warn(`[SharedAIPipeline] Init failed: ${err.message}`);
      }
    }
  }

  return _pipeline;
}

/**
 * Generate text via the shared AI pipeline with automatic fallback.
 *
 * Returns null if the pipeline is unavailable or the call fails,
 * allowing callers to fall back to their existing provider code.
 */
export async function pipelineGenerate(
  prompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string },
): Promise<GenerateResult | null> {
  const pipeline = getSharedAIPipeline();
  if (!pipeline) return null;

  try {
    const result = await pipeline.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      systemPrompt: options?.systemPrompt,
    });
    logger.info('[SharedAIPipeline] Generate succeeded', { model: result.model });
    return result;
  } catch (err: any) {
    logger.debug(`[SharedAIPipeline] Generate failed: ${err.message}`);
    return null;
  }
}

/**
 * Reset pipeline state (useful for tests or config changes).
 */
export function resetSharedAIPipeline(): void {
  _pipeline = null;
  _initAttempted = false;
}

export { AIPipeline, AIPipelineConfig, GenerateResult };