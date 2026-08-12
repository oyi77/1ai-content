/**
 * Metrics Service — Lightweight Redis-based operational metrics.
 *
 * Uses Redis INCR with daily-partitioned keys so counters auto-expire and
 * can be queried per day without any aggregation overhead.
 *
 * Key format: metrics:<YYYY-MM-DD>:<metric_name>
 *
 * All methods are fire-and-forget safe — failures are logged but never
 * propagate to callers, so metrics collection cannot degrade business logic.
 */

import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";

const METRICS_PREFIX = "metrics";
const DAY_TTL_SECONDS = 7 * 24 * 60 * 60; // Retain metrics for 7 days

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-03-21"
}

function makeKey(metric: string, date?: string): string {
  return `${METRICS_PREFIX}:${date || todayKey()}:${metric}`;
}

export class MetricsService {
  /**
   * Increment a simple counter by 1.
   * Key is automatically partitioned by date.
   */
  static async increment(key: string): Promise<void> {
    try {
      const redisKey = makeKey(key);
      await redis.incr(redisKey);
      await redis.expire(redisKey, DAY_TTL_SECONDS);
    } catch (err) {
      logger.error(`[Metrics] Failed to increment ${key}:`, err);
    }
  }

  /**
   * Track a generation event with provider, success/failure, and duration.
   *
   * Increments the following counters:
   *   - generation_count            (total generations today)
   *   - generation_success / generation_failure
   *   - provider:<provider>:count
   *   - provider:<provider>:success / provider:<provider>:failure
   *
   * Also maintains a running total of duration for average calculation:
   *   - provider:<provider>:duration_ms_total
   */
  static async trackGeneration(
    provider: string,
    success: boolean,
    durationMs: number,
  ): Promise<void> {
    try {
      const date = todayKey();
      const pipe = redis.pipeline();

      // Global counters
      const countKey = makeKey("generation_count", date);
      pipe.incr(countKey);
      pipe.expire(countKey, DAY_TTL_SECONDS);

      const outcomeKey = makeKey(
        success ? "generation_success" : "generation_failure",
        date,
      );
      pipe.incr(outcomeKey);
      pipe.expire(outcomeKey, DAY_TTL_SECONDS);

      // Per-provider counters
      const provCountKey = makeKey(`provider:${provider}:count`, date);
      pipe.incr(provCountKey);
      pipe.expire(provCountKey, DAY_TTL_SECONDS);

      const provOutcomeKey = makeKey(
        `provider:${provider}:${success ? "success" : "failure"}`,
        date,
      );
      pipe.incr(provOutcomeKey);
      pipe.expire(provOutcomeKey, DAY_TTL_SECONDS);

      // Duration accumulator for average calculation
      const durKey = makeKey(`provider:${provider}:duration_ms_total`, date);
      pipe.incrby(durKey, Math.round(durationMs));
      pipe.expire(durKey, DAY_TTL_SECONDS);

      await pipe.exec();
    } catch (err) {
      logger.error(
        `[Metrics] Failed to track generation for ${provider}:`,
        err,
      );
    }
  }

  /**
   * Retrieve all metrics for today (or a specified date) as a flat
   * key-value map suitable for JSON serialization.
   */
  static async getAll(date?: string): Promise<Record<string, any>> {
    try {
      const d = date || todayKey();
      const pattern = `${METRICS_PREFIX}:${d}:*`;

      const keys = await redis.keys(pattern);
      if (keys.length === 0) {
        return { date: d, metrics: {} };
      }

      const values = await redis.mget(...keys);
      const metrics: Record<string, number> = {};

      for (let i = 0; i < keys.length; i++) {
        // Strip the prefix + date portion to get readable metric names
        const shortKey = keys[i].replace(`${METRICS_PREFIX}:${d}:`, "");
        metrics[shortKey] = parseInt(values[i] || "0", 10);
      }

      return {
        date: d,
        metrics,
      };
    } catch (err) {
      logger.error("[Metrics] Failed to retrieve metrics:", err);
      return {
        date: date || todayKey(),
        metrics: {},
        error: "Failed to retrieve metrics",
      };
    }
  }
}
