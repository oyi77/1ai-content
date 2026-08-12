/**
 * AdminConfigService
 *
 * Unified runtime configuration service backed by the PricingConfig table.
 * Provides typed get/set with 60s in-memory cache, category listing,
 * default seeding, and typed convenience helpers.
 */

import { prisma } from "@/config/database";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { logger } from "@/utils/logger";
import { PROVIDER_CONFIG } from "@/config/providers";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class AdminConfigService {
  private static cache = new Map<string, CacheEntry>();

  // ── Core CRUD ──────────────────────────────────────────────────────────────

  static async get<T>(
    category: string,
    key: string,
    defaultValue: T,
  ): Promise<T> {
    const cacheKey = `${category}:${key}`;
    const cached = AdminConfigService.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    try {
      const row = await prisma.pricingConfig.findUnique({
        where: { category_key: { category, key } },
      });
      const value = row != null ? (row.value as T) : defaultValue;
      AdminConfigService.cache.set(cacheKey, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return value;
    } catch (err) {
      logger.warn(`AdminConfigService.get failed for ${cacheKey}:`, err);
      return defaultValue;
    }
  }

  static async set(
    category: string,
    key: string,
    value: unknown,
    updatedBy?: bigint,
  ): Promise<void> {
    await prisma.pricingConfig.upsert({
      where: { category_key: { category, key } },
      update: { value: value as InputJsonValue, updatedBy: updatedBy ?? null },
      create: {
        category,
        key,
        value: value as InputJsonValue,
        updatedBy: updatedBy ?? null,
      },
    });
    const cacheKey = `${category}:${key}`;
    AdminConfigService.cache.delete(cacheKey);
    logger.info(`AdminConfig updated: ${cacheKey}`);
  }

  static async reset(category: string, key: string): Promise<void> {
    await prisma.pricingConfig.deleteMany({ where: { category, key } });
    AdminConfigService.cache.delete(`${category}:${key}`);
    logger.info(`AdminConfig reset to default: ${category}:${key}`);
  }

  static async getCategory(category: string): Promise<Record<string, any>> {
    try {
      const rows = await prisma.pricingConfig.findMany({
        where: { category },
      });
      const result: Record<string, any> = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    } catch (err) {
      logger.warn(
        `AdminConfigService.getCategory failed for ${category}:`,
        err,
      );
      return {};
    }
  }

  static clearCache(): void {
    AdminConfigService.cache.clear();
  }

  // ── Default seeding ────────────────────────────────────────────────────────

  static async initializeDefaults(): Promise<void> {
    const defaults: Array<{ category: string; key: string; value: unknown }> =
      [];

    // Provider config — seed from static PROVIDER_CONFIG
    for (const [name, cfg] of Object.entries(PROVIDER_CONFIG.video)) {
      defaults.push({
        category: "provider",
        key: `video_${name}`,
        value: {
          priority: cfg.priority,
          timeout: cfg.timeout,
          failureThreshold: cfg.failureThreshold,
          recoveryTimeout: cfg.recoveryTimeout,
        },
      });
    }
    for (const [name, cfg] of Object.entries(PROVIDER_CONFIG.image)) {
      defaults.push({
        category: "provider",
        key: `image_${name}`,
        value: {
          priority: cfg.priority,
          timeout: cfg.timeout,
          failureThreshold: cfg.failureThreshold,
          recoveryTimeout: cfg.recoveryTimeout,
        },
      });
    }

    // AI params
    const aiParams: Record<string, number> = {
      falai_img2img_strength: 0.65,
      falai_inference_steps: 28,
      falai_guidance_scale: 3.5,
      falai_ip_adapter_scale: 0.7,
      siliconflow_inference_steps: 20,
      hpas_temperature: 0.9,
      hpas_max_output_tokens: 1500,
      voiceover_temperature: 0.7,
      voiceover_max_tokens: 512,
    };
    for (const [key, value] of Object.entries(aiParams)) {
      defaults.push({ category: "ai_param", key, value });
    }

    // Timeouts
    const timeouts: Record<string, number> = {
      falai_img2img_ms: 90000,
      falai_ip_adapter_ms: 90000,
      hpas_llm_ms: 30000,
      gemini_llm_ms: 30000,
      global_http_ms: 30000,
      video_progress_notify_ms: 30000,
      geminigen_poll_interval_ms: 3000,
    };
    for (const [key, value] of Object.entries(timeouts)) {
      defaults.push({ category: "timeout", key, value });
    }

    // Retry/poll
    const retries: Record<string, number> = {
      geminigen_poll_max: 30,
      video_fallback_poll_max: 60,
      video_fallback_poll_interval_ms: 5000,
      wget_timeout_seconds: 60,
      wget_retry_count: 2,
      video_min_file_size_bytes: 1000,
    };
    for (const [key, value] of Object.entries(retries)) {
      defaults.push({ category: "retry", key, value });
    }

    // Queue
    const queue: Record<string, any> = {
      video_attempts: 3,
      video_backoff_delay_ms: 5000,
      payment_attempts: 5,
      payment_backoff_delay_ms: 10000,
      notification_attempts: 3,
      notification_backoff_delay_ms: 1000,
      billing_interval_ms: 3600000,
      cleanup_cron: "0 3 * * *",
    };
    for (const [key, value] of Object.entries(queue)) {
      defaults.push({ category: "queue", key, value });
    }

    // Retention
    const retention: Record<string, any> = {
      max_per_category_3days: 1,
      max_per_day: 2,
      send_hour_start: 8,
      send_hour_end: 20,
      stop_after_churn_days: 60,
      type1_trigger_hours: [2, 24, 72, 168],
      type2_trigger_hours: [1, 24, 72, 168],
      batch_size_standard: 50,
      batch_size_active: 100,
      batch_size_churned: 30,
    };
    for (const [key, value] of Object.entries(retention)) {
      defaults.push({ category: "retention", key, value });
    }

    // Rate limits
    const rateLimits: Record<string, any> = {
      telegram_window_seconds: 60,
      telegram_max_messages: 30,
      api_payment_per_minute: 10,
      api_generation_per_minute: 30,
      api_read_per_minute: 60,
      // Per-operation bot rate limits (windowSec + max)
      op_generate: { windowSec: 60, max: 5 },
      op_create: { windowSec: 60, max: 10 },
      op_topup: { windowSec: 300, max: 3 },
      op_referral: { windowSec: 3600, max: 5 },
      op_support: { windowSec: 300, max: 3 },
    };
    for (const [key, value] of Object.entries(rateLimits)) {
      defaults.push({ category: "rate_limit", key, value });
    }

    // HPAS durations
    const hpas: Record<string, number> = {
      quick_duration_s: 15,
      standard_duration_s: 30,
      extended_duration_s: 60,
      custom_min_s: 6,
      custom_max_s: 3600,
      max_scenes: 50,
      prompt_max_chars: 800,
    };
    for (const [key, value] of Object.entries(hpas)) {
      defaults.push({ category: "hpas", key, value });
    }

    // Upsert all defaults without overwriting existing admin-set values
    let seeded = 0;
    for (const { category, key, value } of defaults) {
      try {
        await prisma.pricingConfig.upsert({
          where: { category_key: { category, key } },
          update: {}, // never overwrite existing
          create: { category, key, value: value as InputJsonValue },
        });
        seeded++;
      } catch (err) {
        logger.warn(
          `AdminConfigService: failed to seed ${category}:${key}`,
          err,
        );
      }
    }
    logger.info(`AdminConfigService: seeded ${seeded} default config entries`);
  }

  // ── Typed convenience helpers ──────────────────────────────────────────────

  static async getProviderOverride(
    type: "video" | "image",
    name: string,
  ): Promise<{
    priority?: number;
    timeout?: number;
    failureThreshold?: number;
    recoveryTimeout?: number;
  } | null> {
    const row = await prisma.pricingConfig.findUnique({
      where: { category_key: { category: "provider", key: `${type}_${name}` } },
    });
    if (!row) return null;
    const v = row.value as Record<string, any>;
    if (typeof v !== "object" || v === null) return null;
    return {
      priority: typeof v.priority === "number" ? v.priority : undefined,
      timeout: typeof v.timeout === "number" ? v.timeout : undefined,
      failureThreshold:
        typeof v.failureThreshold === "number" ? v.failureThreshold : undefined,
      recoveryTimeout:
        typeof v.recoveryTimeout === "number" ? v.recoveryTimeout : undefined,
    };
  }

  static async getAiParam(key: string, defaultValue: number): Promise<number> {
    return AdminConfigService.get("ai_param", key, defaultValue);
  }

  static async getTimeout(key: string, defaultValue: number): Promise<number> {
    return AdminConfigService.get("timeout", key, defaultValue);
  }

  static async getRetentionConfig(): Promise<{
    maxPerCategoryPer3Days: number;
    maxPerDay: number;
    sendHourStart: number;
    sendHourEnd: number;
    stopAfterChurnDays: number;
  }> {
    const [
      maxPerCategoryPer3Days,
      maxPerDay,
      sendHourStart,
      sendHourEnd,
      stopAfterChurnDays,
    ] = await Promise.all([
      AdminConfigService.get("retention", "max_per_category_3days", 1),
      AdminConfigService.get("retention", "max_per_day", 2),
      AdminConfigService.get("retention", "send_hour_start", 8),
      AdminConfigService.get("retention", "send_hour_end", 20),
      AdminConfigService.get("retention", "stop_after_churn_days", 60),
    ]);
    return {
      maxPerCategoryPer3Days,
      maxPerDay,
      sendHourStart,
      sendHourEnd,
      stopAfterChurnDays,
    };
  }

  static async getRateLimit(
    key: string,
    defaultValue: number,
  ): Promise<number> {
    return AdminConfigService.get("rate_limit", key, defaultValue);
  }

  static async getHpasConfig(): Promise<{
    quickDuration: number;
    standardDuration: number;
    extendedDuration: number;
    customMin: number;
    customMax: number;
    maxScenes: number;
    promptMaxChars: number;
  }> {
    const [
      quickDuration,
      standardDuration,
      extendedDuration,
      customMin,
      customMax,
      maxScenes,
      promptMaxChars,
    ] = await Promise.all([
      AdminConfigService.get("hpas", "quick_duration_s", 15),
      AdminConfigService.get("hpas", "standard_duration_s", 30),
      AdminConfigService.get("hpas", "extended_duration_s", 60),
      AdminConfigService.get("hpas", "custom_min_s", 6),
      AdminConfigService.get("hpas", "custom_max_s", 3600),
      AdminConfigService.get("hpas", "max_scenes", 50),
      AdminConfigService.get("hpas", "prompt_max_chars", 800),
    ]);
    return {
      quickDuration,
      standardDuration,
      extendedDuration,
      customMin,
      customMax,
      maxScenes,
      promptMaxChars,
    };
  }
}
