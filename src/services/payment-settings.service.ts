/**
 * Payment Settings Service
 *
 * Manages payment gateway settings including default gateway
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { ValidationError } from '@/utils/app-errors';

export class PaymentSettingsService {
  static readonly KEYS = {
    DEFAULT_GATEWAY: "default_gateway",
    MIDTRANS_ENABLED: "midtrans_enabled",
    TRIPAY_ENABLED: "tripay_enabled",
    DUITKU_ENABLED: "duitku_enabled",
  } as const;

  static readonly GATEWAYS = {
    midtrans: "Midtrans",
    tripay: "Tripay",
    duitku: "Duitku",
  } as const;

  /**
   * Get a setting value
   */
  static async get(key: string): Promise<string | null> {
    const setting = await prisma.paymentSettings.findUnique({
      where: { key },
    });
    return setting?.value || null;
  }

  /**
   * Set a setting value
   */
  static async set(
    key: string,
    value: string,
    description?: string,
    updatedBy?: bigint,
  ): Promise<void> {
    await prisma.paymentSettings.upsert({
      where: { key },
      update: { value, description, updatedBy },
      create: { key, value, description, updatedBy },
    });
    logger.info(`Payment setting updated: ${key} = ${value}`);
  }

  /**
   * Get default gateway
   */
  static async getDefaultGateway(): Promise<string> {
    const gateway = await this.get(this.KEYS.DEFAULT_GATEWAY);
    return gateway || "midtrans";
  }

  /**
   * Set default gateway
   */
  static async setDefaultGateway(
    gateway: string,
    updatedBy?: bigint,
  ): Promise<void> {
    if (!Object.keys(this.GATEWAYS).includes(gateway)) {
      throw new ValidationError(`Invalid gateway: ${gateway}`, 'gateway');
    }
    await this.set(
      this.KEYS.DEFAULT_GATEWAY,
      gateway,
      `Default payment gateway (${this.GATEWAYS[gateway as keyof typeof this.GATEWAYS]})`,
      updatedBy,
    );
  }

  /**
   * Check if gateway is enabled
   */
  static async isGatewayEnabled(gateway: string): Promise<boolean> {
    const key = `${gateway}_enabled` as typeof this.KEYS.TRIPAY_ENABLED;
    const enabled = await this.get(key);
    return enabled !== "false";
  }

  /**
   * Enable/disable gateway
   */
  static async setGatewayEnabled(
    gateway: string,
    enabled: boolean,
    updatedBy?: bigint,
  ): Promise<void> {
    const key = `${gateway}_enabled` as typeof this.KEYS.TRIPAY_ENABLED;
    await this.set(
      key,
      enabled ? "true" : "false",
      `${gateway} enabled`,
      updatedBy,
    );
  }

  /**
   * Get all payment settings for admin display
   */
  static async getAllSettings(): Promise<Record<string, string>> {
    const settings = await prisma.paymentSettings.findMany();
    return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
  }

  /**
   * Initialize default settings
   */
  static async initializeDefaults(): Promise<void> {
    const defaultGateway = await this.get(this.KEYS.DEFAULT_GATEWAY);
    if (!defaultGateway) {
      await this.set(
        this.KEYS.DEFAULT_GATEWAY,
        "duitku",
        "Default payment gateway",
      );
    }

    const midtransEnabled = await this.get(this.KEYS.MIDTRANS_ENABLED);
    if (!midtransEnabled) {
      await this.set(this.KEYS.MIDTRANS_ENABLED, "false", "Midtrans disabled");
    }

    const tripayEnabled = await this.get(this.KEYS.TRIPAY_ENABLED);
    if (!tripayEnabled) {
      await this.set(this.KEYS.TRIPAY_ENABLED, "false", "Tripay disabled");
    }

    const duitkuEnabled = await this.get(this.KEYS.DUITKU_ENABLED);
    if (!duitkuEnabled) {
      await this.set(this.KEYS.DUITKU_ENABLED, "true", "Duitku enabled");
    }

    logger.info("Payment settings initialized");
  }

  /**
   * Get enabled gateways for user selection
   */
  static async getEnabledGateways(): Promise<
    Array<{ id: string; name: string; description: string }>
  > {
    const gateways = [];

    if (await this.isGatewayEnabled("midtrans")) {
      gateways.push({
        id: "midtrans",
        name: "💳 Midtrans",
        description: "Credit Card, GOPAY, etc",
      });
    }
    if (await this.isGatewayEnabled("duitku")) {
      gateways.push({
        id: "duitku",
        name: "🏦 Duitku (VA)",
        description: "Bank Transfer, E-Wallet",
      });
    }
    if (await this.isGatewayEnabled("tripay")) {
      gateways.push({
        id: "tripay",
        name: "🔷 Tripay",
        description: "Various Payment Methods",
      });
    }

    return gateways;
  }

  // ── Dynamic Pricing (PricingConfig table) ──

  private static pricingCache = new Map<
    string,
    { value: any; expiresAt: number }
  >();
  private static CACHE_TTL = 60000; // 60 seconds

  private static getCached(cacheKey: string): any | null {
    const entry = this.pricingCache.get(cacheKey);
    if (entry && Date.now() < entry.expiresAt) return entry.value;
    this.pricingCache.delete(cacheKey);
    return null;
  }

  private static setCache(cacheKey: string, value: any): void {
    this.pricingCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  static clearPricingCache(): void {
    this.pricingCache.clear();
  }

  static async getPricingConfig(
    category: string,
    key: string,
  ): Promise<any | null> {
    const cacheKey = `${category}:${key}`;
    const cached = this.getCached(cacheKey);
    if (cached !== null) return cached;

    const row = await prisma.pricingConfig.findUnique({
      where: { category_key: { category, key } },
    });
    const value = row?.value || null;
    if (value !== null) this.setCache(cacheKey, value);
    return value;
  }

  static async setPricingConfig(
    category: string,
    key: string,
    value: any,
    updatedBy?: bigint,
  ): Promise<void> {
    const existing = await prisma.pricingConfig.findUnique({
      where: { category_key: { category, key } },
    });

    if (existing) {
      await prisma.auditLog.create({
        data: {
          action: "pricing_update",
          entityType: "pricing_config",
          entityId: `${category}:${key}`,
          oldValue: JSON.parse(JSON.stringify(existing.value)),
          newValue: value,
          userId: updatedBy || null,
        },
      });
    }

    await prisma.pricingConfig.upsert({
      where: { category_key: { category, key } },
      update: { value, updatedBy },
      create: { category, key, value, updatedBy },
    });

    this.pricingCache.delete(`${category}:${key}`);
  }

  static async deletePricingConfig(
    category: string,
    key: string,
  ): Promise<void> {
    await prisma.pricingConfig.deleteMany({
      where: { category, key },
    });
    this.pricingCache.delete(`${category}:${key}`);
  }

  static async getAllPricingByCategory(
    category: string,
  ): Promise<Record<string, unknown>> {
    const rows = await prisma.pricingConfig.findMany({ where: { category } });
    return rows.reduce((acc: Record<string, unknown>, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});
  }

  static async getMarginPercent(): Promise<number> {
    const config = await this.getPricingConfig("global", "margin_percent");
    if (typeof config === "number") return config;
    if (config && typeof config === "object" && "value" in config) {
      return Number((config as Record<string, unknown>).value) ?? 30;
    }
    return 30;
  }

  static async getTransferFeePercent(): Promise<number> {
    const config = await this.getPricingConfig("global", "p2p_fee_percent");
    if (typeof config === "number") return config;
    if (config && typeof config === "object" && "value" in config) {
      return Number((config as Record<string, unknown>).value) ?? 0.5;
    }
    return 0.5;
  }

  static async getProviderCostUsd(providerKey: string): Promise<number> {
    const config = await this.getPricingConfig("provider_cost", providerKey);
    if (config && typeof config === "object" && "costUsd" in config) {
      return Number((config as Record<string, unknown>).costUsd) ?? 0;
    }
    return 0;
  }

  static async getImageCreditCost(provider?: string): Promise<number> {
    const config = await this.getPricingConfig("image_credit", "default");
    const configRecord = config as Record<string, unknown> | undefined;
    const baseCost = Number(configRecord?.credits) || 0.2;

    if (provider) {
      const providerCost = await this.getProviderCostUsd(provider);
      if (providerCost > 0) {
        const margin = await this.getMarginPercent();
        return Math.max(
          Number((providerCost * (1 + margin / 100)).toFixed(2)),
          0.1,
        );
      }
    }
    return baseCost;
  }

  /** Normalize any legacy {value: N} scalar wrappers to plain numbers in the DB */
  static async normalizeLegacyScalars(): Promise<void> {
    const scalars: Array<{ category: string; key: string }> = [
      { category: "global", key: "margin_percent" },
    ];
    for (const { category, key } of scalars) {
      const row = await prisma.pricingConfig.findUnique({
        where: { category_key: { category, key } },
      });
      if (!row) continue;
      const v = row.value as Record<string, unknown>;
      if (typeof v === "object" && v !== null && typeof v.value === "number") {
        await prisma.pricingConfig.update({
          where: { category_key: { category, key } },
          data: { value: v.value },
        });
        this.pricingCache.delete(`${category}:${key}`);
      }
    }
  }

  static async initializePricingDefaults(): Promise<void> {
    // Always upsert defaults from static config — ensures DB matches code on every startup
    // Admin overrides are preserved because upsert only creates if missing
    const { PACKAGES, SUBSCRIPTION_PLANS, UNIT_COSTS } =
      await import("../config/pricing.js");

    const upsert = async (category: string, key: string, value: any) => {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category, key } },
        create: { category, key, value },
        update: {}, // Don't overwrite admin changes — only create if missing
      });
    };

    // Unit costs (matching getUnitCostAsync: category='unit_cost', key=UPPERCASE)
    for (const [key, units] of Object.entries(UNIT_COSTS)) {
      await upsert("unit_cost", key, {
        units,
        credits: (units as number) / 10,
      });
    }

    // Credit packages (from static PACKAGES)
    for (const pkg of PACKAGES) {
      await upsert("package", pkg.id, pkg);
    }

    // Subscription plans
    for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      await upsert("subscription", key, plan);
    }

    // Global margin
    await upsert("global", "margin_percent", 30);

    // P2P Transfer Fee (0.5% default)
    await upsert("global", "p2p_fee_percent", 0.5);

    // Image credit default
    await upsert("image_credit", "default", { credits: 0.2 });

    // Provider costs (USD per generation)
    const providerCosts: Record<string, number> = {
      geminigen: 0.02,
      falai: 0.03,
      siliconflow: 0.01,
      nvidia: 0.01,
      gemini: 0.0,
      laozhang: 0.04,
      evolink: 0.03,
    };
    for (const [key, costUsd] of Object.entries(providerCosts)) {
      await upsert("provider_cost", key, { costUsd });
    }

    // Clean up legacy 'video_credit' category (replaced by 'unit_cost')
    await prisma.pricingConfig.deleteMany({
      where: { category: "video_credit" },
    });

    // Normalize any legacy scalar wrappers
    await this.normalizeLegacyScalars();

    this.clearPricingCache();
  }
}
