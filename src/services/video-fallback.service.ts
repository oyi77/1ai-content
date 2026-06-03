/**
 * Video Fallback Service — Multi-provider video generation with real fallback chain.
 *
 * Orchestrator that routes through providers with circuit breaker, prompt enrichment,
 * smart router ordering, and multi-scene concatenation for long durations.
 *
 * Provider implementations live in ./video-fallback/providers/ (split into video-async, video-sync, and registry).
 */

import { logger } from "@/utils/logger";
import { AdminConfigService } from "@/services/admin-config.service";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { trackTokens } from "@/services/token-tracker.service";
import { secureRandomString } from "@/utils/crypto";
import { CircuitBreaker } from "./circuit-breaker.service";
import { ProviderRouter } from "./provider-router.service";
import { PromptEngine } from "@/config/prompt-engine";
import { VideoPostProcessing } from "./video-post-processing.service";
import { AIPromptOptimizer } from "./ai-prompt-optimizer.service";
import { getConfig } from "@/config/env";
import * as fs from "fs";
import * as path from "path";

// Re-export types from providers for backward compatibility
export type {
  VideoFallbackParams,
  VideoFallbackResult,
  VideoProvider,
} from "./video-fallback/providers/providers-registry";
export { getProviders } from "./video-fallback/providers/providers-registry";

// ── Helpers used by orchestrator ──

function getVideoDir(): string {
  return getConfig().VIDEO_DIR;
}

async function downloadToFile(url: string, outputPath: string): Promise<void> {
  const { execFile: execFileCb } = await import("child_process");
  const { promisify } = await import("util");
  await promisify(execFileCb)("wget", ["-q", "-O", outputPath, url]);
}

async function ensureLocalImage(refImage: string | null | undefined): Promise<string | null> {
  if (!refImage) return null;
  // Already a local file that exists
  if (!refImage.startsWith('http') && fs.existsSync(refImage) && fs.statSync(refImage).size > 0) {
    return refImage;
  }
  // HTTP URL — download to temp file
  if (refImage.startsWith('http')) {
    try {
      const axios = (await import("axios")).default;
      const os = (await import("os")).default;
      const tmpPath = path.join(os.tmpdir(), `ref_img_${Date.now()}_${secureRandomString(6).toLowerCase()}.jpg`);
      const response = await axios.get(refImage, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(tmpPath, Buffer.from(response.data));
      return tmpPath;
    } catch (err) {
      logger.warn('[video-fallback] Failed to download reference image:', err);
      return null;
    }
  }
  return null;
}

// ── Main fallback function ──

/**
 * Generate a video using multi-provider fallback chain.
 * Tries each provider in priority order with circuit breaker.
 */
export async function generateVideoWithFallback(
  params: import("./video-fallback/providers/providers-registry").VideoFallbackParams,
): Promise<import("./video-fallback/providers/providers-registry").VideoFallbackResult> {
  // All video providers require minimum 5s duration
  params.duration = Math.max(5, params.duration);

  // Ensure reference image is a valid local file (download if URL)
  const originalRefImage = params.referenceImage;
  const resolvedRef = await ensureLocalImage(params.referenceImage);
  const resolvedParams = resolvedRef !== params.referenceImage
    ? { ...params, referenceImage: resolvedRef }
    : params;
  params = resolvedParams;

  try {

  const { getProviders } = await import("./video-fallback/providers/providers-registry.js");
  const allProviders = getProviders().filter((p: { enabled: boolean }) => p.enabled);

  if (allProviders.length === 0) {
    return { success: false, error: "No video providers configured" };
  }

  // ── Vision-based prompt enrichment (NEW Mar 25) ──
  // If reference image exists, analyse it to ensure the prompt matches the visual subject
  let visionEnrichedPrompt = params.prompt;
  if (params.referenceImage) {
    try {
      const { ContentAnalysisService } =
        await import("./content-analysis.service.js");
      // Pass URL or local path directly — fetchMediaAsBase64 handles both
      const analysis = await ContentAnalysisService.extractPrompt(
        params.referenceImage,
        "image",
      );
      if (analysis.success && analysis.prompt) {
        visionEnrichedPrompt =
          `Visual subject: ${analysis.prompt}. ` +
          `Animation/Style instructions: ${params.prompt}`;
        logger.info(
          `🎬 Vision enrichment added to video prompt (${analysis.prompt.length} chars)`,
        );
      }
    } catch (err) {
      logger.warn(
        "🎬 Vision analysis for video failed, continuing with original prompt",
      );
    }
  }

  // Enrich prompt with V3 engine (using enriched prompt if vision analysis succeeded)
  const enrichedBase = PromptEngine.enrichForVideo(
    visionEnrichedPrompt,
    params.niche || "tech",
    params.style || "professional",
    params.duration,
    undefined,
    undefined,
    !!params.referenceImage,
  );

  // AI-optimise the enriched prompt (LLM rotation with fallback)
  const optimizedFull = await AIPromptOptimizer.optimize(enrichedBase.full, {
    niche: params.niche || "tech",
    style: params.style || "professional",
    hasReferenceImage: !!params.referenceImage,
  }).catch(() => enrichedBase.full);

  const enriched = {
    ...enrichedBase,
    full: optimizedFull || enrichedBase.full,
  };

  const promptMaxChars = await AdminConfigService.getAiParam('prompt_max_chars', 800);
  if (enriched.full && enriched.full.length > promptMaxChars) {
    enriched.full = enriched.full.slice(0, promptMaxChars);
  }

  // Use smart router to order providers by score
  let orderedKeys: string[];
  try {
    orderedKeys = await ProviderRouter.getOrderedProviderKeys(
      params.niche || "tech",
      params.style ? [params.style] : [],
    );
  } catch (routerErr) {
    // If router fails, fall back to static priority ordering
    logger.warn("Provider router failed, using static ordering:", routerErr);
    orderedKeys = allProviders.map((p) => p.key);
  }

  // Build ordered provider list from scored keys
  const providerMap = new Map(allProviders.map((p) => [p.key, p]));
  const providers: import("./video-fallback/providers/providers-registry").VideoProvider[] = [];
  for (const key of orderedKeys) {
    const p = providerMap.get(key);
    if (p) providers.push(p);
  }
  // Add any enabled providers not in the router output (safety net)
  for (const p of allProviders) {
    if (!providers.find((x) => x.key === p.key)) {
      providers.push(p);
    }
  }

  const FULL_PROMPT_PROVIDERS = [
    "geminigen",
    "siliconflow",
    "laozhang",
    "evolink",
    "hypereal",
  ];

  // Filter providers if forcing a specific one (playground/debug)
  const providersToTry = params._forceProvider
    ? allProviders.filter((p) => p.key === params._forceProvider)
    : providers;

  if (params._forceProvider && providersToTry.length === 0) {
    return {
      success: false,
      error: `Forced provider ${params._forceProvider} not found or disabled`,
    };
  }

  const providerErrors: Array<{ name: string; error: string }> = [];
  for (const provider of providersToTry) {
    // Skip providers that don't support ref image if we have one
    if (params.referenceImage && !provider.supportsRefImage) {
      logger.info(`Skipping ${provider.name}: no ref image support`);
      continue;
    }

    const canExecute = await CircuitBreaker.canExecute(provider.key).catch(
      () => true,
    );
    if (!canExecute) {
      logger.info(`Circuit breaker OPEN for ${provider.name} -- skipping`);
      continue;
    }

    const promptForProvider = FULL_PROMPT_PROVIDERS.includes(provider.key)
      ? enriched.full
      : enriched.provider_hint;

    // If provider can handle the full duration → single call
    if (params.duration <= provider.maxDuration) {
      try {
        logger.info(
          `Trying ${provider.name} (${params.duration}s, single call)...`,
        );
        const enrichedParams = { ...params, prompt: promptForProvider };
        const result = await provider.generate(enrichedParams);
        if (result.success) {
          await CircuitBreaker.recordSuccess(provider.key).catch((err) =>
            logger.warn("Circuit breaker update failed", {
              error: err.message,
            }),
          );
          await ProviderRouter.recordSuccess(provider.key).catch((err) =>
            logger.warn("Circuit breaker update failed", {
              error: err.message,
            }),
          );
          logger.info(`${provider.name} succeeded!`);
          trackTokens({
            provider: provider.key,
            model: provider.key,
            service: "video_gen",
            promptTokens: 0,
            completionTokens: 0,
          }).catch((err) =>
            logger.warn("Token tracking failed", { error: err.message }),
          );
          return result;
        }
      } catch (error: any) {
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        await ProviderRouter.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        providerErrors.push({
          name: provider.name,
          error: error.message?.slice(0, 80) || "unknown",
        });
        logger.warn(`${provider.name} failed: ${error.message}`);
      }
    } else {
      // Provider can't do the full duration → auto-split into multi-scene
      // e.g., 15s request + 5s provider = 3 scenes × 5s → concatenate
      try {
        const scenesNeeded = Math.ceil(params.duration / provider.maxDuration);
        const sceneDuration = provider.maxDuration;
        logger.info(
          `Trying ${provider.name} (${params.duration}s as ${scenesNeeded}×${sceneDuration}s multi-scene)...`,
        );

        const sceneVideos: string[] = [];
        let allScenesOk = true;

        for (let si = 0; si < scenesNeeded; si++) {
          const scenePrompt = `[Scene ${si + 1}/${scenesNeeded}] ${promptForProvider}`;
          const sceneParams = {
            ...params,
            prompt: scenePrompt,
            duration: sceneDuration,
          };

          // Only pass reference image to first scene
          if (si > 0) {
            sceneParams.referenceImage = undefined;
          }

          const sceneResult = await provider.generate(sceneParams);
          if (!sceneResult.success || !sceneResult.videoUrl) {
            logger.warn(
              `${provider.name} scene ${si + 1}/${scenesNeeded} failed: ${sceneResult.error}`,
            );
            allScenesOk = false;
            break;
          }

          // Download scene to temp file
          const scenePath = path.join(
            getVideoDir(),
            `fallback_${Date.now()}_scene_${si + 1}.mp4`,
          );
          await downloadToFile(sceneResult.videoUrl, scenePath);
          sceneVideos.push(scenePath);
        }

        if (allScenesOk && sceneVideos.length === scenesNeeded) {
          // Concatenate scenes with transitions
          const outputPath = path.join(
            getVideoDir(),
            `fallback_${Date.now()}_final.mp4`,
          );
          await VideoPostProcessing.concatenateWithTransitions(
            sceneVideos,
            outputPath,
            {
              transitionType: "fade",
              transitionDuration: 0.3,
              niche: params.niche,
            },
          );

          // Cleanup scene files
          for (const sp of sceneVideos) {
            try {
              fs.unlinkSync(sp);
            } catch {
              /* ignore */
            }
          }

          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            await CircuitBreaker.recordSuccess(provider.key).catch((err) =>
              logger.warn("Circuit breaker update failed", {
                error: err.message,
              }),
            );
            await ProviderRouter.recordSuccess(provider.key).catch((err) =>
              logger.warn("Circuit breaker update failed", {
                error: err.message,
              }),
            );
            logger.info(
              `${provider.name} succeeded via multi-scene: ${scenesNeeded}×${sceneDuration}s = ~${params.duration}s`,
            );
            trackTokens({
              provider: provider.key,
              model: provider.key,
              service: "video_gen_multiscene",
              promptTokens: 0,
              completionTokens: 0,
            }).catch((err) =>
              logger.warn("Token tracking failed", { error: err.message }),
            );
            return {
              success: true,
              videoUrl: outputPath,
              provider: provider.key,
            };
          }
        }

        // Cleanup on failure
        for (const sp of sceneVideos) {
          try {
            fs.unlinkSync(sp);
          } catch {
            /* ignore */
          }
        }
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        await ProviderRouter.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        providerErrors.push({
          name: provider.name,
          error: "multi-scene concatenation failed",
        });
        logger.warn(`${provider.name} multi-scene failed`);
      } catch (error: any) {
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        await ProviderRouter.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        providerErrors.push({
          name: provider.name,
          error: error.message?.slice(0, 80) || "unknown",
        });
        logger.warn(`${provider.name} multi-scene error: ${error.message}`);
      }
    }
  }

  const errorSummary = providerErrors
    .map((e) => `${e.name}: ${e.error}`)
    .join("; ");
  logger.error(
    `All ${providers.length} video providers failed: [${errorSummary}]`,
  );
  sendAdminAlert("critical", "All Video Providers Failed", {
    providers: providers.length,
    errors: errorSummary.slice(0, 500),
    niche: params.niche,
    duration: params.duration,
  });
  return {
    success: false,
    error: `All ${providers.length} providers failed: ${errorSummary}`,
  };

  } finally {
    if (resolvedRef && resolvedRef !== originalRefImage) {
      fs.unlink(resolvedRef, () => {});
    }
  }
}
