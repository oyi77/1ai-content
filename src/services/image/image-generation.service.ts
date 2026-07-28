/**
 * Image Generation Service — Multi-Provider Smart Routing
 *
 * Routes to the right provider based on capability:
 *   - Text-to-image (no reference): full fallback chain
 *   - Image-to-image (with reference): only img2img-capable providers
 *   - IP-Adapter (avatar consistency): only IP-Adapter-capable providers
 *
 * Provider implementations live in ./providers/ (split into text2img, img2img, and registry).
 */
import { logger } from '@/utils/logger';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { trackTokens } from '@/services/token-tracker.service';
import { CircuitBreaker } from '@/services/circuit-breaker.service';
import { ContentAnalysisService } from '@/services/content-analysis.service';
import { WatermarkService } from '@/services/watermark.service';
import { PromptEngine } from '@/config/prompt-engine';
import { AIPromptOptimizer } from '@/services/ai-prompt-optimizer.service';
import { getConfig } from '@/config/env';
import { getProviders } from './providers/providers-registry';
import { isDemoMode, detectMode, getImageDimensions } from './utils';
import { DEMO_IMAGES } from './constants';
import type { ImageGenerationMode, ImageGenerationResult, ImageGenerationParams } from './types';
import type { ImageProvider } from './providers/providers-registry';

// Helper for dynamic property access on ImageGenerationParams
function asDict(p: ImageGenerationParams): Record<string, unknown> {
  return p as unknown as Record<string, unknown>;
}

/**
 * Image Generation Service — main orchestrator.
 */
export class ImageGenerationService {
  static async generateImage(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    if (isDemoMode()) {
      logger.warn('🖼️ DEMO_MODE forced — returning placeholder');
      return this.generateDemoImage(params);
    }

    const mode = detectMode(params);
    logger.info(`🖼️ Generation mode: ${mode}`);

    // ── Watermark pre-processing ──
    let cleanedRefUrl = params.referenceImageUrl;
    if (cleanedRefUrl && (mode === 'img2img' || mode === 'ip_adapter')) {
      try {
        const cleanedPath = await WatermarkService.cleanImage(cleanedRefUrl);
        if (cleanedPath) {
          params = { ...params, referenceImagePath: cleanedPath };
          logger.info('🧹 Reference image cleaned of watermarks');
        }
      } catch {
        logger.warn('🧹 Watermark pre-processing skipped');
      }
    }

    // ── Vision-based prompt enrichment ──
    let visionEnrichedPrompt = params.prompt;
    const refUrl = cleanedRefUrl || params.avatarImageUrl;

    if (refUrl && (mode === 'img2img' || mode === 'ip_adapter')) {
      try {
        logger.info('🖼️ Analysing reference image with Vision AI...');
        const analysis = await ContentAnalysisService.extractPrompt(refUrl, 'image');
        if (analysis.success && analysis.prompt) {
          visionEnrichedPrompt = analysis.prompt.length > 20
            ? `${params.prompt}. Reference subject/product appearance: ${analysis.prompt}`
            : params.prompt;
          logger.info(`🖼️ Style enrichment added (${analysis.prompt.length} chars)`);
        }
      } catch {
        logger.warn('🖼️ Vision analysis failed, continuing with original prompt');
        asDict(params)._visionAnalysisFailed = true;
      }
    }

    // ── Element selection prompt/strength adjustment ──
    params = this.applyElementSelection(params, visionEnrichedPrompt);

    // Resolve target dimensions
    const dims = getImageDimensions(params.aspectRatio, params.resolution);
    asDict(params)._targetWidth = dims.width;
    asDict(params)._targetHeight = dims.height;

    const enrichedBase = PromptEngine.enrichForImage(
      visionEnrichedPrompt,
      params.category,
      { aspectRatio: params.aspectRatio },
    );

    // AI-optimise the enriched prompt
    const optimizedFull = await AIPromptOptimizer.optimize(enrichedBase.full, {
      niche: params.category,
      style: params.style || 'commercial',
      category: params.category,
    }).catch(() => enrichedBase.full);

    const enriched = {
      ...enrichedBase,
      full: optimizedFull || enrichedBase.full,
    };

    logger.info(`🖼️ Enriched prompt (${enriched.full.length} chars): ${enriched.full.slice(0, 100)}...`);

    let providers = getProviders();

    // Handle playground/debug force provider
    if (params._forceProvider) {
      const target = providers.find((p) => p.key === params._forceProvider);
      if (target) {
        logger.info(`🛠️ [Playground] Forcing provider: ${target.name}`);
        const promptForProvider = ['geminigen', 'falai', 'siliconflow'].includes(target.key)
          ? enriched.full
          : enriched.provider_hint;
        return target.generate(promptForProvider, params);
      }
    }

    // Apply admin dynamic overrides
    providers = await this.applyProviderOverrides(providers);

    // ── Smart routing by mode ──
    if (mode === 'ip_adapter') {
      return this.routeIpAdapter(providers, enriched, params);
    } else if (mode === 'img2img') {
      return this.routeImg2Img(providers, enriched, params);
    } else {
      return this.routeText2Img(providers, enriched, params);
    }
  }

  // ── Mode-specific routing ──

  private static async routeIpAdapter(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    const nativeProviders = providers.filter(
      (p) => p.enabled && p.supportsIPAdapter && p.generateIPAdapter,
    );
    logger.info(`🖼️ IP-Adapter mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(', ')}`);

    if (nativeProviders.length > 0) {
      const result = await this.generateWithProviders(nativeProviders, enriched, params, 'ip_adapter');
      if (result.success && result.provider !== 'demo') return result;
    }

    logger.warn('🖼️ Native IP-Adapter failed — avatar consistency may be reduced');
    return this.generateWithAllFallback(providers, enriched, params, 'ip_adapter');
  }

  private static async routeImg2Img(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    const nativeProviders = providers.filter(
      (p) => p.enabled && p.supportsImg2Img && p.generateImg2Img,
    );
    logger.info(`🖼️ Img2Img mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(', ')}`);

    if (nativeProviders.length > 0) {
      const result = await this.generateWithProviders(nativeProviders, enriched, params, 'img2img');
      if (result.success && result.provider !== 'demo') return result;
    }

    logger.info('🖼️ Native img2img failed — using vision-enriched prompt on all providers');
    return this.generateWithAllFallback(providers, enriched, params, 'img2img');
  }

  private static async routeText2Img(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    const enabledProviders = providers.filter((p) => p.enabled);
    logger.info(`🖼️ Text2Img mode — ${enabledProviders.length} providers: ${enabledProviders.map((p) => p.name).join(', ')}`);

    if (enabledProviders.length > 0) {
      return this.generateWithProviders(enabledProviders, enriched, params, 'text2img');
    }

    logger.warn('🖼️ No image providers configured — returning demo image');
    return this.generateDemoImage(params);
  }

  private static async generateWithAllFallback(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
    originalMode: ImageGenerationMode,
  ): Promise<ImageGenerationResult> {
    const allEnabled = providers.filter((p) => p.enabled);
    if (allEnabled.length > 0) {
      const fallbackResult = await this.generateWithProviders(
        allEnabled,
        enriched,
        { ...params, mode: 'text2img' },
        'text2img',
      );
      if (fallbackResult.success && originalMode === 'ip_adapter') {
        fallbackResult.metadata = {
          ...fallbackResult.metadata,
          avatarConsistencyDegraded: true,
        };
      }
      return fallbackResult;
    }
    return this.generateDemoImage(params);
  }

  // ── Provider iteration ──

  private static async generateWithProviders(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
    mode: ImageGenerationMode,
  ): Promise<ImageGenerationResult> {
    const reordered = await this.reorderByHealth([...providers]);

    for (const provider of reordered) {
      const canExecute = await CircuitBreaker.canExecute(provider.key).catch(() => true);
      if (!canExecute) {
        logger.info(`🖼️ Circuit breaker OPEN for ${provider.name} — skipping`);
        continue;
      }

      try {
        logger.info(`🖼️ Trying ${provider.name} (${mode})...`);
        const promptForProvider = ['geminigen', 'falai', 'siliconflow'].includes(provider.key)
          ? enriched.full
          : enriched.provider_hint;

        let result: ImageGenerationResult;

        if (mode === 'ip_adapter' && provider.generateIPAdapter) {
          result = await provider.generateIPAdapter(promptForProvider, params);
        } else if (mode === 'img2img' && provider.generateImg2Img) {
          result = await provider.generateImg2Img(promptForProvider, params);
        } else {
          result = await provider.generate(promptForProvider, params);
        }

        if (result.success) {
          await CircuitBreaker.recordSuccess(provider.key).catch((err) =>
            logger.warn('Circuit breaker update failed', { error: err.message }),
          );
          logger.info(`🖼️ ${provider.name} succeeded (${mode})`);
          trackTokens({
            provider: provider.key,
            model: provider.key,
            service: 'image_gen',
            promptTokens: 0,
            completionTokens: 0,
          }).catch((err) => logger.warn('Image provider tracking failed', { error: err.message }));
          return result;
        }
      } catch (error) {
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn('Circuit breaker update failed', { error: err.message }),
        );
        logger.warn(`🖼️ ${provider.name} failed (${mode}): ${(error as Error).message}`);
      }
    }

    logger.error(`🖼️ All ${providers.length} providers failed (${mode}) — demo fallback`);
    sendAdminAlert('critical', 'All Image Providers Failed', {
      mode,
      providers: providers.length,
      category: params.category,
    });
    return this.generateDemoImage(params);
  }

  /** Reorder providers by recent failure count from Redis */
  private static async reorderByHealth(
    providers: ImageProvider[],
  ): Promise<ImageProvider[]> {
    try {
      const { redis } = await import('../../config/redis.js');
      const failScores = await Promise.all(
        providers.map(async (p) => {
          const raw = await redis.get(`cb:${p.key}`).catch(() => null);
          if (!raw) return 0;
          const state = JSON.parse(raw);
          if (state.failureCount > 0 && state.lastFailure && Date.now() - state.lastFailure < 60000) {
            return state.failureCount;
          }
          return 0;
        }),
      );

      if (failScores.some((s) => s > 0)) {
        const sorted = [...providers].sort((a, b) => {
          const scoreA = failScores[providers.indexOf(a)] || 0;
          const scoreB = failScores[providers.indexOf(b)] || 0;
          return scoreA - scoreB;
        });
        logger.info(`🖼️ Reordered providers by health: ${sorted.map((p) => p.name).join(', ')}`);
        return sorted;
      }
    } catch {
      /* Redis unavailable, use original order */
    }
    return providers;
  }

  /** Apply admin dynamic overrides from ProviderSettingsService */
  private static async applyProviderOverrides(
    providers: ImageProvider[],
  ): Promise<ImageProvider[]> {
    try {
      const { ProviderSettingsService } = await import('../provider-settings.service.js');
      const overrides = await ProviderSettingsService.getDynamicSettings();
      const imageOverrides = overrides?.image || {};
      if (Object.keys(imageOverrides).length > 0) {
        return providers
          .map((p) => {
            const ov = imageOverrides[p.key];
            if (ov?.enabled === false) return { ...p, enabled: false } as ImageProvider;
            return p;
          })
          .filter((p) => p.enabled);
      }
    } catch {
      /* ignore — use default ordering */
    }
    return providers;
  }

  // ── Element selection ──

  private static applyElementSelection(
    params: ImageGenerationParams,
    prompt: string,
  ): ImageGenerationParams {
    if (!params.elementSelection || !params.elementAnalysis) return params;

    const sel = params.elementSelection;
    const ea = params.elementAnalysis;
    const keepCount = [sel.keepProduct, sel.keepCharacter, sel.keepBackground].filter(Boolean).length;

    if (keepCount === 0) {
      // keepNone — pure text2img, discard reference
      logger.info('🎯 Element selection: keepNone — switching to text2img');
      return {
        ...params,
        mode: 'text2img',
        referenceImageUrl: undefined,
        referenceImagePath: undefined,
      };
    }

    let enrichedPrompt = prompt;
    let elementStrengthOverride: number | undefined;

    if (sel.keepProduct && !sel.keepCharacter && !sel.keepBackground) {
      const productRef = ea.productDesc ? ` Exact product to preserve: ${ea.productDesc}.` : '';
      enrichedPrompt = `Keep the product exactly as shown in the reference image.${productRef} ${params.prompt}. Change only the background and scene as described. Do not alter the product itself.`;
      elementStrengthOverride = 0.55;
      (asDict(params))._negativePrompt = ((asDict(params))._negativePrompt || '') + ', person, human, model, hands, body';
      logger.info('🎯 Element selection: keepProduct only (strength=0.55)');
    } else if (sel.keepCharacter && !sel.keepProduct && !sel.keepBackground) {
      const charRef = ea.characterDesc ? ` Character appearance to preserve: ${ea.characterDesc}.` : '';
      enrichedPrompt = `Preserve the person/character appearance from the reference.${charRef} ${params.prompt}.`;
      elementStrengthOverride = 0.65;
      logger.info('🎯 Element selection: keepCharacter only (strength=0.65)');
    } else if (sel.keepProduct && sel.keepCharacter && !sel.keepBackground) {
      const refs = [ea.productDesc && `Product: ${ea.productDesc}`, ea.characterDesc && `Character: ${ea.characterDesc}`].filter(Boolean).join('. ');
      enrichedPrompt = `Keep both the product and person from the reference. ${refs}. ${params.prompt}. Change only the background.`;
      elementStrengthOverride = 0.60;
      logger.info('🎯 Element selection: keepProduct + keepCharacter (strength=0.60)');
    } else if (sel.keepBackground && !sel.keepProduct && !sel.keepCharacter) {
      const bgRef = ea.backgroundDesc ? ` Background to preserve: ${ea.backgroundDesc}.` : '';
      enrichedPrompt = `Preserve the background scene from the reference.${bgRef} ${params.prompt}.`;
      elementStrengthOverride = 0.50;
      logger.info('🎯 Element selection: keepBackground only (strength=0.50)');
    } else {
      elementStrengthOverride = 0.55;
      logger.info('🎯 Element selection: keepAll/multi (strength=0.55)');
    }

    // Always add anti-UI/screenshot negative prompt
    asDict(params)._negativePrompt = (asDict(params)._negativePrompt || '') +
      ', text overlay, ui elements, interface, screenshot, watermark, button, icon, timestamp, chat bubble, telegram, mobile app';

    const result = {
      ...params,
      prompt: enrichedPrompt,
      ...(elementStrengthOverride !== undefined ? { _elementStrengthOverride: elementStrengthOverride } : {}),
    };

    return result;
  }

  // ── Demo fallback ──

  private static generateDemoImage(
    params: ImageGenerationParams,
  ): ImageGenerationResult {
    const categoryImages = DEMO_IMAGES[params.category] || DEMO_IMAGES.product;
    const demoImage = categoryImages[Math.floor(Math.random() * categoryImages.length)];

    const aspectSizes: Record<string, string> = {
      '9:16': 'w=576&h=1024',
      '16:9': 'w=1024&h=576',
      '4:5': 'w=820&h=1024',
      '1:1': 'w=1024&h=1024',
    };
    const sizeParams = aspectSizes[params.aspectRatio || '1:1'] || 'w=1024';
    const sizedUrl = demoImage.replace('w=1024', sizeParams);

    return {
      success: true,
      imageUrl: sizedUrl,
      thumbnailUrl: sizedUrl.replace(sizeParams, 'w=256'),
      provider: 'demo',
    };
  }

  // ── Convenience methods ──

  static async generateProductImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: 'product',
      aspectRatio: '1:1',
      style: 'commercial',
      referenceImageUrl,
    });
  }

  static async generateFoodImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: 'fnb',
      aspectRatio: '4:5',
      style: 'food photography',
      referenceImageUrl,
    });
  }

  static async generateRealEstateImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: 'realestate',
      aspectRatio: '16:9',
      style: 'architectural',
      referenceImageUrl,
    });
  }

  static async generateCarImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: 'car',
      aspectRatio: '16:9',
      style: 'automotive',
      referenceImageUrl,
    });
  }

  static async generateWithAvatar(
    description: string,
    avatarImageUrl: string,
    category: string = 'product',
    aspectRatio: string = '1:1',
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category,
      aspectRatio,
      style: 'commercial',
      avatarImageUrl,
      mode: 'ip_adapter',
    });
  }
}
