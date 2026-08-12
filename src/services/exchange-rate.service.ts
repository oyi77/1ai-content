/**
 * ExchangeRateService — Live USD/IDR rate via frankfurter.dev
 *
 * Priority: live cache (1h) → fresh fetch → manual DB → env fallback
 */

import axios from "axios";
import { redis } from "@/config/redis";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";

const REDIS_RATE_KEY = "live:usd_idr_rate";
const REDIS_TS_KEY = "live:usd_idr_rate:ts";
const LIVE_TTL = 3600; // 1 hour
const FRANKFURTER_URL =
  "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR";

export interface RateResult {
  rate: number;
  source: "live" | "manual" | "env";
  lastUpdated?: string; // ISO timestamp of last successful live fetch
}

export class ExchangeRateService {
  /** Fetch a fresh rate from frankfurter.dev and store in Redis. Returns null on failure. */
  static async fetchLiveRate(): Promise<number | null> {
    try {
      const res = await axios.get(FRANKFURTER_URL, { timeout: 6000 });
      const rate = Number(res.data?.rates?.IDR);
      if (rate >= 10_000 && rate <= 50_000) {
        await redis.setex(REDIS_RATE_KEY, LIVE_TTL, String(rate));
        await redis.set(REDIS_TS_KEY, new Date().toISOString());
        logger.info(`[ExchangeRate] Live rate fetched: ${rate} IDR/USD`);
        return rate;
      }
      logger.warn(
        `[ExchangeRate] Frankfurter returned out-of-range rate: ${rate}`,
      );
    } catch (err) {
      logger.warn(
        `[ExchangeRate] Live fetch failed: ${(err as Error).message}`,
      );
    }
    return null;
  }

  /**
   * Get the current USD→IDR rate.
   * 1. Redis live cache (TTL 1h)
   * 2. Fresh fetch from frankfurter.dev
   * 3. Manual admin-set DB value
   * 4. Env var USD_TO_IDR_RATE
   */
  static async getRate(): Promise<RateResult> {
    // 1. Live cache
    const [cached, ts] = await Promise.all([
      redis.get(REDIS_RATE_KEY),
      redis.get(REDIS_TS_KEY),
    ]);
    if (cached) {
      return {
        rate: Number(cached),
        source: "live",
        lastUpdated: ts ?? undefined,
      };
    }

    // 2. Fresh live fetch
    const liveRate = await ExchangeRateService.fetchLiveRate();
    if (liveRate) {
      const freshTs = await redis.get(REDIS_TS_KEY);
      return {
        rate: liveRate,
        source: "live",
        lastUpdated: freshTs ?? undefined,
      };
    }

    // 3. Manual DB override (admin-set)
    try {
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "system", key: "exchange_rate" } },
      });
      if (dbRow) {
        const rate = Number(dbRow.value);
        if (rate >= 10_000 && rate <= 50_000) {
          return { rate, source: "manual" };
        }
      }
    } catch {
      /* fall through */
    }

    // 4. Env fallback
    return { rate: getConfig().USD_TO_IDR_RATE, source: "env" };
  }

  /** Force-refresh the live cache and return the new rate. */
  static async refresh(): Promise<RateResult> {
    // Delete cached so fetchLiveRate stores fresh
    await redis.del(REDIS_RATE_KEY);
    const liveRate = await ExchangeRateService.fetchLiveRate();
    if (liveRate) {
      const ts = await redis.get(REDIS_TS_KEY);
      return { rate: liveRate, source: "live", lastUpdated: ts ?? undefined };
    }
    // If fetch fails, return whatever is available
    return ExchangeRateService.getRate();
  }
}
