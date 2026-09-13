// Main generation pipeline + job entry (split from video-generation.service.ts).
import type { Video } from "@prisma/client";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { CircuitBreaker } from "@/services/circuit-breaker.service";
import { PromptOptimizer } from "@/services/prompt-optimizer.service";
import { ProviderRouter } from "@/services/provider-router.service";
import { QualityCheckService } from "@/services/quality-check.service";
import { getVideoCreditCost } from "@/config/pricing";
import { dispatchToProvider } from "./dispatch";
import { generateWithGeminiGen } from "./providers/geminigen";
import { generatePromptFromNicheAsync } from "./prompt";
import { generateDemoVideo } from "./demo";
import type { VideoGenerationParams, VideoGenerationResult } from "./types";

// Demo mode - returns sample video URLs for testing
function isDemoMode(): boolean {
  const config = getConfig();
  return config.DEMO_MODE || !config.GEMINIGEN_API_KEY;
}

/**
 * Main video generation function with multi-provider fallback
 */
export async function generateVideo(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const niche = params.niche || "fnb";
  const styles = params.styles || ["appetizing"];
  logger.info(
    `🎬 Starting video generation: niche=${niche}, styles=${styles.join(",")}, duration=${params.duration}s`,
  );

  const duration = Math.max(4, Math.min(15, params.duration));

  let prompt = params.prompt;
  if (!prompt) {
    prompt = await generatePromptFromNicheAsync(niche, styles, duration);
  }

  // Handle playground/debug force provider
  if (params._forceProvider) {
    const providerKey = params._forceProvider;
    logger.info(`🛠️ [Playground] Forcing provider: ${providerKey}`);
    const optimizedPrompt = await PromptOptimizer.optimizeForProvider(
      prompt,
      providerKey,
      niche,
      styles,
    );
    const result = await dispatchToProvider(providerKey, {
      ...params,
      prompt: optimizedPrompt,
      duration,
    });
    return { ...result, provider: providerKey };
  }

  if (getConfig().GEMINIGEN_API_KEY) {
    try {
      logger.info("🤖 Trying GeminiGen (priority 0)...");
      const result = await generateWithGeminiGen({
        ...params,
        prompt,
        duration,
      });

      if (result.success) {
        return { ...result, provider: "geminigen" };
      }

      logger.warn(`❌ GeminiGen failed: ${result.error}`);
    } catch (error) {
      logger.warn(`❌ GeminiGen error: ${(error as Error).message}`);
    }
  }

  // Try providers in priority order (dynamic scoring via ProviderRouter)
  const scoredProviders = await ProviderRouter.getOrderedProviders(
    niche,
    styles,
  );
  for (const { key: providerKey, config: provider } of scoredProviders) {
    const canExecute = await CircuitBreaker.canExecute(providerKey);
    if (!canExecute) {
      logger.info(`⏭️ Skipping ${provider.name}: circuit breaker open`);
      continue;
    }

    const optimizedPrompt = await PromptOptimizer.optimizeForProvider(
      prompt,
      providerKey,
      niche,
      styles,
    );

    try {
      logger.info(
        `🤖 Trying ${provider.name} (priority ${provider.priority})...`,
      );
      const result = await dispatchToProvider(providerKey, {
        ...params,
        prompt: optimizedPrompt,
        duration: Math.min(provider.maxDuration, duration),
      });

      if (result.success) {
        await CircuitBreaker.recordSuccess(providerKey);

        // Quality check - if video quality is low, try next provider
        if (result.videoUrl) {
          try {
            const qualityResult = await QualityCheckService.scoreVideo(
              result.videoUrl,
              niche,
              duration,
              !!params.referenceImageUrl,
            );
            if (!qualityResult.passable) {
              logger.warn(
                `⚠️ ${provider.name} quality check failed (score: ${qualityResult.score}), trying next provider`,
              );
              await CircuitBreaker.recordFailure(providerKey);
              continue;
            }
            logger.info(
              `✅ ${provider.name} quality check passed (score: ${qualityResult.score})`,
            );
          } catch (qcError) {
            logger.warn(
              `Quality check error, proceeding: ${(qcError as Error).message}`,
            );
          }
        }

        return { ...result, provider: providerKey };
      }

      await CircuitBreaker.recordFailure(providerKey);
      logger.warn(`❌ ${provider.name} failed: ${result.error}`);
    } catch (error) {
      await CircuitBreaker.recordFailure(providerKey);
      logger.warn(`❌ ${provider.name} error: ${(error as Error).message}`);
    }
  }

  if (isDemoMode()) {
    logger.info("📺 Using demo mode - returning sample video");
    return generateDemoVideo(params, duration, niche, styles);
  }

  return {
    success: false,
    error: "All video generation providers failed",
  };
}

/**
 * Get credit cost for video
 */
export function getCreditCost(duration: number): number {
  return getVideoCreditCost(duration);
}

/**
 * Process video job — called by video.service.ts for queued jobs
 */
export async function processVideoJob(
  video: Video,
): Promise<VideoGenerationResult> {
  logger.info(`Processing video job: ${video.jobId}`);
  return generateVideo({
    prompt: video.title ?? "",
    duration: video.duration,
    niche: video.niche,
    styles: video.styles,
    aspectRatio: "9:16",
  });
}
