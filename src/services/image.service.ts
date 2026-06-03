/**
 * Image Generation Service — Multi-Provider Smart Routing
 *
 * Routes to the right provider based on capability:
 *   - Text-to-image (no reference): full fallback chain
 *   - Image-to-image (with reference): only img2img-capable providers
 *   - IP-Adapter (avatar consistency): only IP-Adapter-capable providers
 *
 * Provider implementations live in ./image/providers/ (split into text2img, img2img, and registry).
 */

import { logger } from "@/utils/logger";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { trackTokens } from "@/services/token-tracker.service";
import { CircuitBreaker } from "./circuit-breaker.service";
import { ContentAnalysisService } from "./content-analysis.service";
import { WatermarkService } from "./watermark.service";
import { PromptEngine } from "@/config/prompt-engine";
import { AIPromptOptimizer } from "./ai-prompt-optimizer.service";
import { getConfig } from "@/config/env";
import { getProviders } from "./image/providers/providers-registry";

// Re-export provider types for backward compatibility
export type { ImageProvider, ProviderFn } from "./image/providers/providers-registry";
export { getProviders as getProviderList } from "./image/providers/providers-registry";

// Read dynamically so tests can toggle it
function isDemoMode(): boolean {
  return getConfig().DEMO_MODE;
}

export type ImageGenerationMode = "text2img" | "img2img" | "ip_adapter";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  provider?: string;
  mode?: ImageGenerationMode;
  metadata?: Record<string, any>;
}

export interface ImageGenerationParams {
  prompt: string;
  style?: string;
  aspectRatio?: string;
  category: string;
  referenceImageUrl?: string;
  referenceImagePath?: string;
  avatarImageUrl?: string;
  avatarImagePath?: string;
  mode?: ImageGenerationMode;
  resolution?: "standard" | "hd" | "ultra";
  elementSelection?: {
    keepProduct: boolean;
    keepCharacter: boolean;
    keepBackground: boolean;
  };
  elementAnalysis?: {
    productDesc: string;
    characterDesc: string;
    backgroundDesc: string;
  };
  _forceProvider?: string;
}

// Resolution multipliers — maps resolution tier to pixel dimension multiplier
const RESOLUTION_MULTIPLIERS: Record<string, number> = {
  standard: 1,
  hd: 2,
  ultra: 4,
};

/** Get pixel dimensions for given aspect ratio and resolution tier */
export function getImageDimensions(
  aspectRatio: string = "1:1",
  resolution: string = "standard",
): { width: number; height: number } {
  const mult = RESOLUTION_MULTIPLIERS[resolution] || 1;
  const base: Record<string, { width: number; height: number }> = {
    "9:16": { width: 576, height: 1024 },
    "16:9": { width: 1024, height: 576 },
    "1:1": { width: 1024, height: 1024 },
    "4:5": { width: 896, height: 1120 },
  };
  const dims = base[aspectRatio] || base["1:1"];
  return { width: dims.width * mult, height: dims.height * mult };
}

// Category-specific demo images — last-resort fallback
const DEMO_IMAGES: Record<string, string[]> = {
  product: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1024",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1024",
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1024",
  ],
  fnb: [
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1024",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1024",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1024",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1024",
  ],
  realestate: [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1024",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1024",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1024",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1024",
  ],
  car: [
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1024",
    "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1024",
    "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1024",
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1024",
  ],
};

// ── Mode detection ──

function detectMode(params: ImageGenerationParams): ImageGenerationMode {
  if (params.mode) return params.mode;
  if (params.avatarImageUrl || params.avatarImagePath) return "ip_adapter";
  if (params.referenceImageUrl || params.referenceImagePath) return "img2img";
  return "text2img";
}

// ── Main service ──

export class ImageGenerationService {
  static async generateImage(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    if (isDemoMode()) {
      logger.warn("🖼️ DEMO_MODE forced — returning placeholder");
      return this.generateDemoImage(params);
    }

    const mode = detectMode(params);
    logger.info(`🖼️ Generation mode: ${mode}`);

    // ── Watermark pre-processing ──
    // Clean reference images before using them (free: Gemini Vision + FFmpeg)
    const cleanedRefUrl = params.referenceImageUrl;
    if (cleanedRefUrl && (mode === "img2img" || mode === "ip_adapter")) {
      try {
        const cleanedPath = await WatermarkService.cleanImage(cleanedRefUrl);
        if (cleanedPath) {
          // Replace URL with local cleaned file path for providers that support it
          params = { ...params, referenceImagePath: cleanedPath };
          logger.info("🧹 Reference image cleaned of watermarks");
        }
      } catch (err) {
        logger.warn("🧹 Watermark pre-processing skipped");
      }
    }

    // ── Vision-based prompt enrichment ──
    // When a reference image is provided, analyse it with Gemini Vision
    // and inject the description into the prompt. This makes the reference
    // work with ALL providers, even text-only ones.
    let visionEnrichedPrompt = params.prompt;
    const refUrl = cleanedRefUrl || params.avatarImageUrl;

    if (refUrl && (mode === "img2img" || mode === "ip_adapter")) {
      try {
        logger.info("🖼️ Analysing reference image with Vision AI...");
        const analysis = await ContentAnalysisService.extractPrompt(
          refUrl,
          "image",
        );
        if (analysis.success && analysis.prompt) {
          // Merge reference image analysis with user prompt.
          // Frame as product/subject reference so AI preserves the subject identity.
          const refAnalysis = analysis.prompt;
          visionEnrichedPrompt =
            refAnalysis.length > 20
              ? `${params.prompt}. Reference subject/product appearance: ${refAnalysis}`
              : params.prompt;
          logger.info(
            `🖼️ Style enrichment added (${refAnalysis.length} chars)`,
          );
        }
      } catch (err) {
        logger.warn(
          "🖼️ Vision analysis failed, continuing with original prompt",
        );
        // Flag for downstream — callers can warn user about degraded quality
        (params as unknown as Record<string, unknown>)._visionAnalysisFailed = true;
      }
    }

    // ── Element selection prompt/strength adjustment ──
    // When the user selected which elements to keep from the reference image,
    // tailor the prompt and override the img2img strength accordingly.
    let elementStrengthOverride: number | undefined;
    if (params.elementSelection && params.elementAnalysis) {
      const sel = params.elementSelection;
      const ea = params.elementAnalysis;
      const keepCount = [sel.keepProduct, sel.keepCharacter, sel.keepBackground].filter(Boolean).length;

      if (keepCount === 0) {
        // keepNone — pure text2img, discard reference
        params = { ...params, mode: "text2img", referenceImageUrl: undefined, referenceImagePath: undefined };
        logger.info("🎯 Element selection: keepNone — switching to text2img");
      } else if (sel.keepProduct && !sel.keepCharacter && !sel.keepBackground) {
        // Most common UMKM case: preserve product, change background/scene
        // NOTE: strength ~0.55 = enough noise to follow prompt for background,
        // low enough to preserve product shape/colors from reference.
        const productRef = ea.productDesc ? ` Exact product to preserve: ${ea.productDesc}.` : '';
        visionEnrichedPrompt = `Keep the product exactly as shown in the reference image.${productRef} ${params.prompt}. Change only the background and scene as described. Do not alter the product itself.`;
        elementStrengthOverride = 0.55;
        (params as unknown as Record<string, unknown>)._negativePrompt = ((params as unknown as Record<string, unknown>)._negativePrompt || '') + ', person, human, model, hands, body';
        logger.info("🎯 Element selection: keepProduct only (strength=0.55)");
      } else if (sel.keepCharacter && !sel.keepProduct && !sel.keepBackground) {
        const charRef = ea.characterDesc ? ` Character appearance to preserve: ${ea.characterDesc}.` : '';
        visionEnrichedPrompt = `Preserve the person/character appearance from the reference.${charRef} ${params.prompt}.`;
        elementStrengthOverride = 0.65;
        logger.info("🎯 Element selection: keepCharacter only (strength=0.65)");
      } else if (sel.keepProduct && sel.keepCharacter && !sel.keepBackground) {
        const refs = [ea.productDesc && `Product: ${ea.productDesc}`, ea.characterDesc && `Character: ${ea.characterDesc}`].filter(Boolean).join('. ');
        visionEnrichedPrompt = `Keep both the product and person from the reference. ${refs}. ${params.prompt}. Change only the background.`;
        elementStrengthOverride = 0.60;
        logger.info("🎯 Element selection: keepProduct + keepCharacter (strength=0.60)");
      } else if (sel.keepBackground && !sel.keepProduct && !sel.keepCharacter) {
        const bgRef = ea.backgroundDesc ? ` Background to preserve: ${ea.backgroundDesc}.` : '';
        visionEnrichedPrompt = `Preserve the background scene from the reference.${bgRef} ${params.prompt}.`;
        elementStrengthOverride = 0.50;
        logger.info("🎯 Element selection: keepBackground only (strength=0.50)");
      } else {
        // keepAll or other combos
        elementStrengthOverride = 0.55;
        logger.info("🎯 Element selection: keepAll/multi (strength=0.55)");
      }

      // Store strength override for downstream providers
      if (elementStrengthOverride !== undefined) {
        (params as unknown as Record<string, unknown>)._elementStrengthOverride = elementStrengthOverride;
      }

      // Always add anti-UI/screenshot negative prompt for img2img to prevent
      // garbled text when user uploads screenshots instead of clean product photos
      (params as unknown as Record<string, unknown>)._negativePrompt = ((params as unknown as Record<string, unknown>)._negativePrompt || '') +
        ', text overlay, ui elements, interface, screenshot, watermark, button, icon, timestamp, chat bubble, telegram, mobile app';
    }

    // Resolve target dimensions from aspect ratio + resolution tier
    const dims = getImageDimensions(params.aspectRatio, params.resolution);
    params = {
      ...params,
      _targetWidth: dims.width,
      _targetHeight: dims.height,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic image params extension
    } as any;

    const enrichedBase = PromptEngine.enrichForImage(
      visionEnrichedPrompt,
      params.category,
      {
        aspectRatio: params.aspectRatio,
      },
    );

    // AI-optimise the enriched prompt (LLM rotation with fallback)
    const optimizedFull = await AIPromptOptimizer.optimize(enrichedBase.full, {
      niche: params.category,
      style: params.style || "commercial",
      category: params.category,
    }).catch(() => enrichedBase.full);

    const enriched = {
      ...enrichedBase,
      full: optimizedFull || enrichedBase.full,
    };

    logger.info(
      `🖼️ Enriched prompt (${enriched.full.length} chars): ${enriched.full.slice(0, 100)}...`,
    );

    let providers = getProviders();

    // Handle playground/debug force provider
    if (params._forceProvider) {
      const target = providers.find((p) => p.key === params._forceProvider);
      if (target) {
        logger.info(`🛠️ [Playground] Forcing provider: ${target.name}`);
        const promptForProvider = [
          "geminigen",
          "falai",
          "siliconflow",
        ].includes(target.key)
          ? enriched.full
          : enriched.provider_hint;
        return target.generate(promptForProvider, params);
      }
    }

    // Apply admin dynamic overrides (disable/reorder providers via dashboard)
    try {
      const { ProviderSettingsService } =
        await import("./provider-settings.service.js");
      const overrides = await ProviderSettingsService.getDynamicSettings();
      const imageOverrides = overrides?.image || {};
      if (Object.keys(imageOverrides).length > 0) {
        providers = providers
          .map((p) => {
            const ov = imageOverrides[p.key];
            if (ov?.enabled === false) return { ...p, enabled: false };
            return p;
          })
          .filter((p) => p.enabled);
      }
    } catch {
      /* ignore — use default ordering */
    }

    // ── Smart routing: try native providers first, then universal fallback ──

    if (mode === "ip_adapter") {
      const nativeProviders = providers.filter(
        (p) => p.enabled && p.supportsIPAdapter && p.generateIPAdapter,
      );
      logger.info(
        `🖼️ IP-Adapter mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(", ")}`,
      );

      if (nativeProviders.length > 0) {
        const result = await this.generateWithProviders(
          nativeProviders,
          enriched,
          params,
          "ip_adapter",
        );
        if (result.success && result.provider !== "demo") return result;
      }

      // Native failed → fall through to ALL providers with vision-enriched prompt
      logger.warn(
        "🖼️ Native IP-Adapter failed — avatar consistency may be reduced",
      );
      const allProviders = providers.filter((p) => p.enabled);
      if (allProviders.length > 0) {
        const fallbackResult = await this.generateWithProviders(
          allProviders,
          enriched,
          { ...params, mode: "text2img" },
          "text2img",
        );
        if (fallbackResult.success)
          fallbackResult.metadata = {
            ...fallbackResult.metadata,
            avatarConsistencyDegraded: true,
          };
        return fallbackResult;
      }
    } else if (mode === "img2img") {
      const nativeProviders = providers.filter(
        (p) => p.enabled && p.supportsImg2Img && p.generateImg2Img,
      );
      logger.info(
        `🖼️ Img2Img mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(", ")}`,
      );

      if (nativeProviders.length > 0) {
        const result = await this.generateWithProviders(
          nativeProviders,
          enriched,
          params,
          "img2img",
        );
        if (result.success && result.provider !== "demo") return result;
      }

      // Native failed → fall through to ALL providers with vision-enriched prompt
      logger.info(
        "🖼️ Native img2img failed — using vision-enriched prompt on all providers",
      );
      const allProviders = providers.filter((p) => p.enabled);
      if (allProviders.length > 0) {
        return this.generateWithProviders(
          allProviders,
          enriched,
          { ...params, mode: "text2img" },
          "text2img",
        );
      }
    } else {
      // Pure text2img
      const enabledProviders = providers.filter((p) => p.enabled);
      logger.info(
        `🖼️ Text2Img mode — ${enabledProviders.length} providers available: ${enabledProviders.map((p) => p.name).join(", ")}`,
      );

      if (enabledProviders.length > 0) {
        return this.generateWithProviders(
          enabledProviders,
          enriched,
          params,
          "text2img",
        );
      }
    }

    logger.warn("🖼️ No image providers configured — returning demo image");
    return this.generateDemoImage(params);
  }

  private static async generateWithProviders(
    providers: import("./image/providers/providers-registry").ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
    mode: ImageGenerationMode,
  ): Promise<ImageGenerationResult> {
    // Dynamic reordering: move providers with recent failures to the end
    const reordered = [...providers];
    try {
      const { redis } = await import("../config/redis.js");
      const failScores = await Promise.all(
        reordered.map(async (p) => {
          const raw = await redis.get(`cb:${p.key}`).catch(() => null);
          if (!raw) return 0;
          const state = JSON.parse(raw);
          // Penalize providers that failed recently (within 60s)
          if (
            state.failureCount > 0 &&
            state.lastFailure &&
            Date.now() - state.lastFailure < 60000
          ) {
            return state.failureCount;
          }
          return 0;
        }),
      );
      reordered.sort((a, b) => {
        const scoreA = failScores[providers.indexOf(a)] || 0;
        const scoreB = failScores[providers.indexOf(b)] || 0;
        return scoreA - scoreB;
      });
      if (failScores.some((s) => s > 0)) {
        logger.info(
          `🖼️ Reordered providers by health: ${reordered.map((p) => p.name).join(", ")}`,
        );
      }
    } catch {
      /* Redis unavailable, use original order */
    }

    for (const provider of reordered) {
      const canExecute = await CircuitBreaker.canExecute(provider.key).catch(
        () => true,
      );
      if (!canExecute) {
        logger.info(`🖼️ Circuit breaker OPEN for ${provider.name} — skipping`);
        continue;
      }

      try {
        logger.info(`🖼️ Trying ${provider.name} (${mode})...`);
        const promptForProvider = [
          "geminigen",
          "falai",
          "siliconflow",
        ].includes(provider.key)
          ? enriched.full
          : enriched.provider_hint;

        let result: ImageGenerationResult;

        if (mode === "ip_adapter" && provider.generateIPAdapter) {
          result = await provider.generateIPAdapter(promptForProvider, params);
        } else if (mode === "img2img" && provider.generateImg2Img) {
          result = await provider.generateImg2Img(promptForProvider, params);
        } else {
          result = await provider.generate(promptForProvider, params);
        }

        if (result.success) {
          await CircuitBreaker.recordSuccess(provider.key).catch((err) =>
            logger.warn("Circuit breaker update failed", {
              error: err.message,
            }),
          );
          logger.info(`🖼️ ${provider.name} succeeded (${mode})`);
          // Track image generation (use fixed token estimate — not token-based billing)
          trackTokens({
            provider: provider.key,
            model: provider.key,
            service: "image_gen",
            promptTokens: 0,
            completionTokens: 0,
          }).catch((err) =>
            logger.warn("Image provider tracking failed", {
              error: err.message,
            }),
          );
          return result;
        }
      } catch (error: any) {
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        logger.warn(`🖼️ ${provider.name} failed (${mode}): ${error.message}`);
      }
    }

    logger.error(
      `🖼️ All ${providers.length} providers failed (${mode}) — demo fallback`,
    );
    sendAdminAlert("critical", "All Image Providers Failed", {
      mode,
      providers: providers.length,
      category: params.category,
    });
    return this.generateDemoImage(params);
  }

  private static generateDemoImage(
    params: ImageGenerationParams,
  ): ImageGenerationResult {
    const categoryImages = DEMO_IMAGES[params.category] || DEMO_IMAGES.product;
    const demoImage =
      categoryImages[Math.floor(Math.random() * categoryImages.length)];

    // Match requested aspect ratio for demo images
    const aspectSizes: Record<string, string> = {
      "9:16": "w=576&h=1024",
      "16:9": "w=1024&h=576",
      "4:5": "w=820&h=1024",
      "1:1": "w=1024&h=1024",
    };
    const sizeParams = aspectSizes[params.aspectRatio || "1:1"] || "w=1024";
    const sizedUrl = demoImage.replace("w=1024", sizeParams);

    return {
      success: true,
      imageUrl: sizedUrl,
      thumbnailUrl: sizedUrl.replace(sizeParams, "w=256"),
      provider: "demo",
    };
  }

  // ── Convenience methods ──

  static async generateProductImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "product",
      aspectRatio: "1:1",
      style: "commercial",
      referenceImageUrl,
    });
  }

  static async generateFoodImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "fnb",
      aspectRatio: "4:5",
      style: "food photography",
      referenceImageUrl,
    });
  }

  static async generateRealEstateImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "realestate",
      aspectRatio: "16:9",
      style: "architectural",
      referenceImageUrl,
    });
  }

  static async generateCarImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "car",
      aspectRatio: "16:9",
      style: "automotive",
      referenceImageUrl,
    });
  }

  /** Generate image with avatar consistency (IP-Adapter) */
  static async generateWithAvatar(
    description: string,
    avatarImageUrl: string,
    category: string = "product",
    aspectRatio: string = "1:1",
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category,
      aspectRatio,
      style: "commercial",
      avatarImageUrl,
      mode: "ip_adapter",
    });
  }
}
