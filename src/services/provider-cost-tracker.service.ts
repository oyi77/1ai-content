/**
 * Provider Cost Tracker Service
 *
 * Tracks real-time provider costs from actual API usage and manual input.
 * Stores historical cost data for dynamic pricing calculations.
 *
 * Most AI providers don't expose pricing APIs, so we track costs through:
 * 1. Actual API response headers/usage data (when available)
 * 2. Manual admin input from pricing pages
 * 3. Periodic sync from static config (fallback)
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { PROVIDER_CONFIG } from '@/config/providers';
import { PaymentSettingsService } from './payment-settings.service';

interface ProviderCost {
  providerKey: string;
  costUsd: number;
  source: 'api' | 'manual' | 'static';
  fetchedAt: Date;
  metadata?: {
    model?: string;
    region?: string;
    currency?: string;
    [key: string]: unknown;
  };
}

interface CostHistory {
  providerKey: string;
  costUsd: number;
  recordedAt: Date;
  source: 'api' | 'manual' | 'static';
}

export class ProviderCostTrackerService {
  private static readonly CACHE_TTL = 3600; // 1 hour
  private static readonly HISTORY_DAYS = 90; // Keep 90 days of history

  /**
   * Get current cost for a provider (with cache)
   */
  static async getProviderCost(providerKey: string): Promise<ProviderCost | null> {
    const cacheKey = `provider_cost:${providerKey}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ProviderCost;
    }

    // Fetch from database
    const config = await PaymentSettingsService.getProviderCostUsd(providerKey);
    if (config > 0) {
      const cost: ProviderCost = {
        providerKey,
        costUsd: config,
        source: 'static',
        fetchedAt: new Date(),
      };

      await redis.set(cacheKey, JSON.stringify(cost), 'EX', this.CACHE_TTL);
      return cost;
    }

    // Fallback to PROVIDER_CONFIG
    const [type, key] = this.findProviderInConfig(providerKey);
    if (type && key) {
      const cfg = PROVIDER_CONFIG[type][key] as unknown as Record<string, unknown>;
      if (cfg.costPerGenerationUsd !== undefined) {
        const cost: ProviderCost = {
          providerKey,
          costUsd: cfg.costPerGenerationUsd as number,
          source: 'static',
          fetchedAt: new Date(),
        };

        // Cache and return
        await redis.set(cacheKey, JSON.stringify(cost), 'EX', this.CACHE_TTL);
        return cost;
      }
    }

    return null;
  }

  /**
   * Record cost from actual API usage (called after generation)
   */
  static async recordCostFromUsage(
    providerKey: string,
    costUsd: number,
    metadata?: ProviderCost['metadata']
  ): Promise<void> {
    const cost: ProviderCost = {
      providerKey,
      costUsd,
      source: 'api',
      fetchedAt: new Date(),
      metadata,
    };

    // Update database
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'provider_cost', key: providerKey } },
      update: {
        value: JSON.parse(JSON.stringify({
          costUsd,
          source: 'api',
          lastFetched: new Date().toISOString(),
          metadata
        }))
      },
      create: {
        category: 'provider_cost',
        key: providerKey,
        value: JSON.parse(JSON.stringify({
          costUsd,
          source: 'api',
          lastFetched: new Date().toISOString(),
          metadata
        }))
      },
    });

    // Add to history
    await this.addCostHistory(providerKey, costUsd, 'api');

    // Update cache
    const cacheKey = `provider_cost:${providerKey}`;
    await redis.set(cacheKey, JSON.stringify(cost), 'EX', this.CACHE_TTL);

    // Clear pricing cache
    PaymentSettingsService.clearPricingCache();

    logger.info(`Recorded provider cost from API usage: ${providerKey} = $${costUsd}`);
  }

  /**
   * Manually set provider cost (admin override)
   */
  static async setManualCost(
    providerKey: string,
    costUsd: number,
    metadata?: ProviderCost['metadata']
  ): Promise<void> {
    const cost: ProviderCost = {
      providerKey,
      costUsd,
      source: 'manual',
      fetchedAt: new Date(),
      metadata,
    };

    // Update database
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'provider_cost', key: providerKey } },
      update: {
        value: JSON.parse(JSON.stringify({
          costUsd,
          source: 'manual',
          lastFetched: new Date().toISOString(),
          metadata
        }))
      },
      create: {
        category: 'provider_cost',
        key: providerKey,
        value: JSON.parse(JSON.stringify({
          costUsd,
          source: 'manual',
          lastFetched: new Date().toISOString(),
          metadata
        }))
      },
    });

    // Add to history
    await this.addCostHistory(providerKey, costUsd, 'manual');

    // Update cache
    const cacheKey = `provider_cost:${providerKey}`;
    await redis.set(cacheKey, JSON.stringify(cost), 'EX', this.CACHE_TTL);

    // Clear pricing cache
    PaymentSettingsService.clearPricingCache();

    logger.info(`Manually set provider cost: ${providerKey} = $${costUsd}`);
  }

  /**
   * Get all provider costs with metadata
   */
  static async getAllProviderCosts(): Promise<ProviderCost[]> {
    const costs: ProviderCost[] = [];

    // Get from PROVIDER_CONFIG first
    const providers = {
      ...PROVIDER_CONFIG.video,
      ...PROVIDER_CONFIG.image,
    };

    for (const [key, cfg] of Object.entries(providers)) {
      const cfgTyped = cfg as unknown as Record<string, unknown>;
      const costUsd = cfgTyped.costPerGenerationUsd;
      if (costUsd !== undefined) {
        costs.push({
          providerKey: key,
          costUsd: costUsd as number,
          source: 'static',
          fetchedAt: new Date(),
        });
      }
    }

    // Override with database values (manual/API tracked)
    const dbCosts = await prisma.pricingConfig.findMany({
      where: { category: 'provider_cost' },
    });

    for (const dbCost of dbCosts) {
      const value = dbCost.value as Record<string, unknown>;
      const existingIdx = costs.findIndex(c => c.providerKey === dbCost.key);

      if (existingIdx >= 0) {
        // Override with more recent source
        const cost: ProviderCost = {
          providerKey: dbCost.key,
          costUsd: value.costUsd as number,
          source: (value.source as string || 'manual') as ProviderCost['source'],
          fetchedAt: value.lastFetched ? new Date(value.lastFetched as string) : new Date(),
          metadata: value.metadata as ProviderCost['metadata'],
        };

        // API/Manual sources always override static
        if (cost.source === 'api' || cost.source === 'manual') {
          costs[existingIdx] = cost;
        }
      } else {
        costs.push({
          providerKey: dbCost.key,
          costUsd: value.costUsd as number,
          source: (value.source as string || 'manual') as ProviderCost['source'],
          fetchedAt: value.lastFetched ? new Date(value.lastFetched as string) : new Date(),
          metadata: value.metadata as ProviderCost['metadata'],
        });
      }
    }

    return costs;
  }

  /**
   * Get cost history for a provider
   */
  static async getCostHistory(providerKey: string): Promise<CostHistory[]> {
    const cacheKey = `provider_cost_history:${providerKey}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as CostHistory[];
    }

    // For now, return empty history - would need separate history table
    // DEFERRED: Cost history table requires Prisma migration (ProviderCostHistory model).
    // Currently using Redis with TTL as interim solution. See docs/07-modularity-recommendations.md
    return [];
  }

  /**
   * Calculate dynamic price based on provider cost + margin
   */
  static async calculateDynamicPrice(
    providerKey: string,
    units: number,
    marginPercent?: number
  ): Promise<{ price: number; costUsd: number; margin: number; breakdown: Record<string, unknown> }> {
    const cost = await this.getProviderCost(providerKey);
    const costUsd = cost?.costUsd || 0;
    const margin = marginPercent ?? await PaymentSettingsService.getMarginPercent();

    // Get USD to IDR exchange rate from database
    const exchangeRateConfig = await prisma.pricingConfig.findUnique({
      where: { category_key: { category: 'global', key: 'exchange_rate' } },
    });
    const exchangeValue = exchangeRateConfig?.value as Record<string, unknown> | undefined;
    const usdToIdr = (exchangeValue?.rate as number) || 16000;

    const totalCostIdr = costUsd * usdToIdr;
    const priceWithMargin = totalCostIdr * (1 + margin / 100);

    // Convert to credits (1 credit = 10 units)
    const idrPerUnit = priceWithMargin / units;
    const idrPerCredit = idrPerUnit * 10;

    return {
      price: Math.ceil(idrPerCredit),
      costUsd,
      margin,
      breakdown: {
        providerCost: cost,
        costUsd,
        usdToIdr,
        totalCostIdr,
        marginPercent: margin,
        marginAmount: totalCostIdr * margin / 100,
        finalPrice: Math.ceil(idrPerCredit),
      },
    };
  }

  /**
   * Sync all provider costs from static config (called on startup)
   */
  static async syncFromConfig(): Promise<number> {
    let synced = 0;

    const providers = {
      ...PROVIDER_CONFIG.video,
      ...PROVIDER_CONFIG.image,
    };

    for (const [key, cfg] of Object.entries(providers)) {
      const costUsd = (cfg as unknown as Record<string, unknown>).costPerGenerationUsd;
      if (costUsd !== undefined) {
        // Only insert if not exists (don't override manual/API sources)
        const existing = await prisma.pricingConfig.findUnique({
          where: { category_key: { category: 'provider_cost', key } },
        });

        if (!existing) {
          await prisma.pricingConfig.create({
            data: {
              category: 'provider_cost',
              key,
              value: {
                costUsd,
                source: 'static',
                lastFetched: new Date().toISOString(),
              },
            },
          });
          synced++;
        }
      }
    }

    logger.info(`Synced ${synced} provider costs from config`);
    return synced;
  }

  /**
   * Find provider in PROVIDER_CONFIG by key
   */
  private static findProviderInConfig(providerKey: string): ['video' | 'image', string] | [] {
    if (PROVIDER_CONFIG.video[providerKey]) {
      return ['video', providerKey];
    }
    if (PROVIDER_CONFIG.image[providerKey]) {
      return ['image', providerKey];
    }
    return [];
  }

  /**
   * Add cost history entry
   */
  private static async addCostHistory(
    providerKey: string,
    costUsd: number,
    source: 'api' | 'manual' | 'static'
  ): Promise<void> {
    // DEFERRED: Blocked on ProviderCostHistory Prisma model.
    // Interim: storing in Redis with 30-day TTL.
    // For now, we could store in Redis with a TTL
    const historyKey = `provider_cost_history:${providerKey}`;
    const history: CostHistory = {
      providerKey,
      costUsd,
      recordedAt: new Date(),
      source,
    };

    // Store in Redis list (last 100 entries)
    await redis.lpush(historyKey, JSON.stringify(history));
    await redis.ltrim(historyKey, 0, 99);
    await redis.expire(historyKey, this.HISTORY_DAYS * 86400);
  }
}
