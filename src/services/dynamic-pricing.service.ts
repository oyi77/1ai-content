/**
 * Dynamic Pricing Service
 *
 * Calculates user-facing prices based on real-time provider costs + margin.
 * Ensures prices automatically adjust when provider costs change.
 */

import { ProviderCostTrackerService } from './provider-cost-tracker.service';
import { PaymentSettingsService } from './payment-settings.service';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';

interface DynamicPriceConfig {
  providerKey: string;
  units: number;
  marginPercent?: number;
  minPrice?: number; // Minimum price floor (IDR)
}

interface PriceCalculation {
  credits: number;
  priceIdr: number;
  costUsd: number;
  marginPercent: number;
  marginAmount: number;
  providerCost: number;
  breakdown: {
    providerCostUsd: number;
    providerCostIdr: number;
    marginPercent: number;
    marginAmountIdr: number;
    totalPriceIdr: number;
    unitsPerCredit: number;
    idrPerUnit: number;
  };
}

export class DynamicPricingService {
  private static readonly MIN_PRICE_FLOOR = 100; // 100 IDR minimum
  private static readonly DEFAULT_UNITS_PER_CREDIT = 10;

  /**
   * Calculate dynamic price for an action
   */
  static async calculatePrice(config: DynamicPriceConfig): Promise<PriceCalculation> {
    const {
      providerKey,
      units,
      marginPercent,
      minPrice = this.MIN_PRICE_FLOOR,
    } = config;

    // Get current provider cost
    const providerCost = await ProviderCostTrackerService.getProviderCost(providerKey);
    const costUsd = providerCost?.costUsd || 0;

    // Get margin and exchange rate
    const margin = marginPercent ?? await PaymentSettingsService.getMarginPercent();

    // Get USD to IDR exchange rate from database
    const exchangeRateConfig = await prisma.pricingConfig.findUnique({
      where: { category_key: { category: 'global', key: 'exchange_rate' } },
    });
    const usdToIdr = Number((exchangeRateConfig?.value as Record<string, unknown>)?.rate) || getConfig().USD_TO_IDR_RATE || 16000;

    // Calculate cost in IDR
    const providerCostIdr = costUsd * usdToIdr;

    // Apply margin
    const marginAmountIdr = providerCostIdr * (margin / 100);
    const totalPriceIdr = providerCostIdr + marginAmountIdr;

    // Calculate price per unit
    const idrPerUnit = totalPriceIdr / units;

    // Calculate credits (1 credit = 10 units)
    const credits = Math.ceil(units / this.DEFAULT_UNITS_PER_CREDIT);
    const pricePerCredit = idrPerUnit * this.DEFAULT_UNITS_PER_CREDIT;

    // Apply minimum price floor
    const finalPricePerCredit = Math.max(pricePerCredit, minPrice);
    const totalPriceIdrWithFloor = finalPricePerCredit * credits;

    return {
      credits,
      priceIdr: Math.ceil(totalPriceIdrWithFloor),
      costUsd,
      marginPercent: margin,
      marginAmount: marginAmountIdr,
      providerCost: costUsd,
      breakdown: {
        providerCostUsd: costUsd,
        providerCostIdr,
        marginPercent: margin,
        marginAmountIdr,
        totalPriceIdr: totalPriceIdrWithFloor,
        unitsPerCredit: this.DEFAULT_UNITS_PER_CREDIT,
        idrPerUnit: idrPerUnit,
      },
    };
  }

  /**
   * Get recommended unit costs based on current provider costs
   */
  static async getRecommendedUnitCosts(): Promise<Record<string, {
    units: number;
    credits: number;
    priceIdr: number;
    providerKey: string;
    costUsd: number;
  }>> {
    const recommendations: Record<string, any> = {};

    // Video costs (by duration)
    const videoDurations = [15, 30, 60, 120];
    const scenesMap: Record<number, number> = { 15: 5, 30: 7, 60: 7, 120: 14 };

    for (const duration of videoDurations) {
      const scenes = scenesMap[duration];
      const key = `VIDEO_${duration}S`;

      // Use average video provider cost
      const calculation = await this.calculatePrice({
        providerKey: 'omniroute', // Will route to cheapest
        units: scenes,
      });

      recommendations[key] = {
        units: scenes * 10, // Store in units (10 units = 1 credit)
        credits: calculation.credits,
        priceIdr: calculation.priceIdr,
        providerKey: 'omniroute',
        costUsd: calculation.costUsd,
      };
    }

    // Image costs
    const imageCalculation = await this.calculatePrice({
      providerKey: 'omniroute',
      units: 10,
    });

    recommendations['IMAGE_UNIT'] = {
      units: 10,
      credits: 1,
      priceIdr: imageCalculation.priceIdr,
      providerKey: 'omniroute',
      costUsd: imageCalculation.costUsd,
    };

    // Image set (7 scenes)
    const imageSetCalculation = await this.calculatePrice({
      providerKey: 'omniroute',
      units: 70,
    });

    recommendations['IMAGE_SET_7_SCENE'] = {
      units: 70,
      credits: 7,
      priceIdr: imageSetCalculation.priceIdr,
      providerKey: 'omniroute',
      costUsd: imageSetCalculation.costUsd * 7,
    };

    return recommendations;
  }

  /**
   * Check if prices need updating (provider cost changed significantly)
   */
  static async checkPriceDrift(thresholdPercent: number = 10): Promise<{
    needsUpdate: boolean;
    driftedProviders: Array<{
      providerKey: string;
      oldCost: number;
      newCost: number;
      driftPercent: number;
    }>;
  }> {
    const driftedProviders: Array<{
      providerKey: string;
      oldCost: number;
      newCost: number;
      driftPercent: number;
    }> = [];

    // Get current tracked costs
    const currentCosts = await ProviderCostTrackerService.getAllProviderCosts();

    // Get database costs
    const dbCosts = await prisma.pricingConfig.findMany({
      where: { category: 'provider_cost' },
    });

    for (const current of currentCosts) {
      const dbCost = dbCosts.find(c => c.key === current.providerKey);
      if (!dbCost) continue;

      const dbCostValue = dbCost.value as Record<string, unknown>;
      const oldCost = Number(dbCostValue.costUsd) || 0;
      const newCost = current.costUsd;

      if (oldCost > 0) {
        const driftPercent = Math.abs((newCost - oldCost) / oldCost) * 100;

        if (driftPercent >= thresholdPercent) {
          driftedProviders.push({
            providerKey: current.providerKey,
            oldCost,
            newCost,
            driftPercent,
          });
        }
      }
    }

    return {
      needsUpdate: driftedProviders.length > 0,
      driftedProviders,
    };
  }

  /**
   * Recalculate and update all unit costs based on current provider costs
   */
  static async recalculateAllPrices(): Promise<{
    updated: number;
    changes: Array<{
      key: string;
      oldUnits: number;
      newUnits: number;
      oldPrice: number;
      newPrice: number;
    }>;
  }> {
    const recommendations = await this.getRecommendedUnitCosts();
    const changes: Array<any> = [];
    let updated = 0;

    for (const [key, recommendation] of Object.entries(recommendations)) {
      // Get current unit cost
      const current = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: 'unit_cost', key } },
      });

      if (current) {
        const currentValue = current.value as Record<string, unknown>;
        const oldUnits = currentValue.units || 0;
        const newUnits = recommendation.units;

        if (oldUnits !== newUnits) {
          changes.push({
            key,
            oldUnits,
            newUnits,
            oldPrice: Math.ceil((Number(oldUnits) / 10) * (Number(oldUnits) / 10)), // Rough estimate
            newPrice: recommendation.priceIdr,
          });

          // Update in database
          await prisma.pricingConfig.update({
            where: { category_key: { category: 'unit_cost', key } },
            data: {
              value: {
                units: newUnits,
                credits: newUnits / 10,
              },
            },
          });

          updated++;
        }
      }
    }

    // Clear pricing cache
    PaymentSettingsService.clearPricingCache();

    logger.info(`Recalculated ${updated} unit costs`, { changes });

    return { updated, changes };
  }
}
