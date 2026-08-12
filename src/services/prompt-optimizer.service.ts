/**
 * Prompt Optimizer Service
 *
 * Optimizes prompts per provider using style modifiers and provider quirks.
 * Caches results in the prompt_cache DB table.
 */

import { prisma } from "@/config/database";
import { createHash } from "crypto";
import { logger } from "@/utils/logger";
import { PROVIDER_CONFIG } from "@/config/providers";
import { STYLE_PRESETS } from "@/config/styles";
import { NICHE_CONFIG } from "@/config/niches";

export class PromptOptimizer {
  /**
   * Optimize a prompt for a specific provider, niche, and style combination
   */
  static async optimizeForProvider(
    rawPrompt: string,
    providerKey: string,
    niche?: string,
    styleKeys?: string[],
  ): Promise<string> {
    const provider = PROVIDER_CONFIG.video[providerKey];
    if (!provider) return rawPrompt;

    const cacheKey = this.buildCacheKey(rawPrompt, providerKey, styleKeys);

    // Check cache
    const cached = await this.getFromCache(cacheKey);
    if (cached) return cached;

    // Build optimized prompt
    let optimized = rawPrompt;

    // Apply style modifiers
    if (styleKeys && styleKeys.length > 0) {
      const prefixes: string[] = [];
      const suffixes: string[] = [];

      for (const sk of styleKeys) {
        const style = STYLE_PRESETS[sk];
        if (style) {
          prefixes.push(style.promptModifiers.prefix);
          suffixes.push(style.promptModifiers.suffix);
        }
      }

      if (prefixes.length > 0) {
        optimized = `${prefixes.join(", ")}, ${optimized}`;
      }
      if (suffixes.length > 0) {
        optimized = `${optimized}, ${suffixes.join(", ")}`;
      }
    }

    // Apply niche keywords
    if (niche && NICHE_CONFIG[niche]) {
      const nicheConfig = NICHE_CONFIG[niche];
      const keywords = nicheConfig.keywords.slice(0, 3).join(", ");
      optimized = `${optimized}, ${keywords}`;
    }

    // Apply provider quirks
    if (provider.quirks) {
      optimized = `${optimized}, ${provider.quirks}`;
    }

    // Truncate to provider token limit (rough estimate: 1 token ~ 4 chars)
    const charLimit = provider.tokenLimit * 4;
    if (optimized.length > charLimit) {
      optimized = optimized.substring(0, charLimit - 3) + "...";
    }

    // Cache result
    await this.saveToCache(
      cacheKey,
      rawPrompt,
      providerKey,
      styleKeys,
      optimized,
    );

    return optimized;
  }

  /**
   * Check if a provider should be avoided for given styles
   */
  static shouldAvoidProvider(
    providerKey: string,
    styleKeys: string[],
  ): boolean {
    const provider = PROVIDER_CONFIG.video[providerKey];
    if (!provider || !provider.avoid || provider.avoid.length === 0)
      return false;

    for (const sk of styleKeys) {
      if (provider.avoid.includes(sk)) return true;
    }
    return false;
  }

  /**
   * Build a cache key hash
   */
  private static buildCacheKey(
    rawPrompt: string,
    provider: string,
    styleKeys?: string[],
  ): string {
    const input = `${rawPrompt}|${provider}|${(styleKeys || []).sort().join(",")}`;
    return createHash("md5").update(input).digest("hex");
  }

  /**
   * Get optimized prompt from cache
   */
  private static async getFromCache(hash: string): Promise<string | null> {
    try {
      const cached = await prisma.promptCache.findUnique({
        where: { promptHash: hash },
      });
      if (cached && cached.expiresAt && cached.expiresAt > new Date()) {
        await prisma.promptCache.update({
          where: { promptHash: hash },
          data: { hitCount: { increment: 1 } },
        });
        return cached.optimizedPrompt;
      }
    } catch (err) {
      logger.debug("Prompt cache miss or error:", err);
    }
    return null;
  }

  /**
   * Save optimized prompt to cache (24h TTL)
   */
  private static async saveToCache(
    hash: string,
    rawPrompt: string,
    provider: string,
    styleKeys: string[] | undefined,
    optimized: string,
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tokenEstimate = Math.ceil(optimized.length / 4);

      await prisma.promptCache.upsert({
        where: { promptHash: hash },
        update: { optimizedPrompt: optimized, tokenEstimate, expiresAt },
        create: {
          promptHash: hash,
          rawPrompt,
          provider,
          styleKey: styleKeys ? styleKeys.join(",") : null,
          optimizedPrompt: optimized,
          tokenEstimate,
          expiresAt,
        },
      });
    } catch (err) {
      logger.debug("Failed to cache prompt:", err);
    }
  }
}
