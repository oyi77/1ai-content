/**
 * Rate Limit Middleware
 *
 * Implements rate limiting for both Telegram bot and web API endpoints.
 * Uses Redis-backed sliding window algorithm for distributed rate limiting.
 */

import { Middleware } from "telegraf";
import { FastifyRequest, FastifyReply } from "fastify";
import { BotContext } from "@/types";
import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { secureRandomString } from "@/utils/crypto";

// ─── Telegram Bot Rate Limiter ─────────────────────────────────────────────────

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds
const RATE_LIMIT_MAX = 30; // Max 30 messages per minute
const RATE_LIMIT_PREFIX = "ratelimit:";

/**
 * Rate limit middleware for Telegram bot
 */
export const rateLimitMiddleware: Middleware<BotContext> = async (
  ctx,
  next,
) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return next();
  }

  // Skip rate limiting for admin users
  const config = getConfig();
  const adminIds =
    config.ADMIN_TELEGRAM_IDS?.split(",").map((id) => parseInt(id.trim())) ||
    [];
  if (adminIds.includes(userId)) {
    return next();
  }

  try {
    const key = `${RATE_LIMIT_PREFIX}${userId}`;

    // Get current count
    const current = await redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= RATE_LIMIT_MAX) {
      logger.warn("Rate limit exceeded:", { userId, count });

      await ctx.reply(
        "⏳ Whoa there! You're sending messages too fast.\n\n" +
          "Please slow down and try again in a moment.",
      );

      return;
    }

    // Increment counter
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, RATE_LIMIT_WINDOW);
    await pipeline.exec();
  } catch (error) {
    logger.error("Rate limit error:", error);
    // Continue even if rate limiting fails
  }

  return next();
};

// ─── Web API Rate Limiters ─────────────────────────────────────────────────────

/**
 * Rate limiter configuration for web API
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;
  /** Redis key prefix (default: 'ratelimit') */
  keyPrefix?: string;
  /** Optional key generator function */
  keyGenerator?: (request: FastifyRequest) => string;
}

/**
 * Creates a Redis-backed sliding window rate limiter for Fastify
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { max, windowMs, keyPrefix = "ratelimit", keyGenerator } = config;

  return async function rateLimiterHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Generate unique key for this client
    const baseKey = keyGenerator
      ? keyGenerator(request)
      : request.ip || "unknown";
    const key = `${keyPrefix}:${baseKey}`;

    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use Redis transaction for atomic operations
      const pipeline = redis.pipeline();

      // Remove expired entries (outside the sliding window)
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      pipeline.zcard(key);

      // Add current request with timestamp as score
      pipeline.zadd(key, now, `${now}-${secureRandomString(6).toLowerCase()}`);

      // Set expiry on the key
      pipeline.pexpire(key, windowMs);

      const results = await pipeline.exec();

      if (!results) {
        logger.error("Rate limiter Redis pipeline returned null");
        return;
      }

      // Get the count BEFORE adding current request
      const currentCount = (results[1][1] as number) || 0;

      const allowed = currentCount < max;
      const remaining = Math.max(0, max - currentCount - 1);
      const resetAt = now + windowMs;

      // Set rate limit headers
      reply.header("X-RateLimit-Limit", max.toString());
      reply.header(
        "X-RateLimit-Remaining",
        allowed ? remaining.toString() : "0",
      );
      reply.header("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());

      if (!allowed) {
        // Calculate retry-after based on oldest request in window
        const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
        const oldestTimestamp =
          oldest.length >= 2 ? parseInt(oldest[1] as string) : now;
        const retryAfterMs = Math.max(0, oldestTimestamp + windowMs - now);
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        reply.header("Retry-After", retryAfterSec.toString());

        logger.warn(
          "Rate limit exceeded: %s %s (count=%d, limit=%d)",
          request.ip,
          request.url,
          currentCount,
          max,
        );

        reply.status(429).send({
          error: "Too many requests. Please try again later.",
          retryAfter: retryAfterSec,
        });
        return;
      }
    } catch (error) {
      logger.error("Rate limiter error", { error, ip: request.ip });
      // Fail open - allow the request but log the error
    }
  };
}

/**
 * Pre-built rate limiters for web API
 */

// Payment operations: 10 requests per minute
export const paymentLimiter = createRateLimiter({
  max: 10,
  windowMs: 60_000,
  keyPrefix: "ratelimit:payment",
  keyGenerator: (request) => {
    const user = (request as unknown as Record<string, unknown>).user as Record<string, unknown> | undefined;
    const identifier = user?.telegramId || user?.id || request.ip || "unknown";
    return `${identifier}`;
  },
});

// Withdrawal operations: 10 requests per minute
export const withdrawalLimiter = createRateLimiter({
  max: 10,
  windowMs: 60_000,
  keyPrefix: "ratelimit:withdraw",
  keyGenerator: (request) => {
    const user = (request as unknown as Record<string, unknown>).user as Record<string, unknown> | undefined;
    const identifier = user?.telegramId || user?.id || request.ip || "unknown";
    return `${identifier}`;
  },
});

// Video/image generation: 30 requests per minute
export const generationLimiter = createRateLimiter({
  max: 30,
  windowMs: 60_000,
  keyPrefix: "ratelimit:generation",
  keyGenerator: (request) => {
    const user = (request as unknown as Record<string, unknown>).user as Record<string, unknown> | undefined;
    const identifier = user?.telegramId || user?.id || request.ip || "unknown";
    return `${identifier}`;
  },
});

// Read operations: 60 requests per minute
export const readLimiter = createRateLimiter({
  max: 60,
  windowMs: 60_000,
  keyPrefix: "ratelimit:read",
  keyGenerator: (request) => {
    const user = (request as unknown as Record<string, unknown>).user as Record<string, unknown> | undefined;
    const identifier = user?.telegramId || user?.id || request.ip || "unknown";
    return `${identifier}`;
  },
});
