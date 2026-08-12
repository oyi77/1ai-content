/**
 * Redis Configuration
 *
 * Redis client initialization
 */

import Redis from "ioredis";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";

// Redis client instance (general use)
export const redis = new Redis(getConfig().REDIS_URL, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Redis client for BullMQ (requires maxRetriesPerRequest: null)
export const bullmqRedis = new Redis(getConfig().REDIS_URL, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
});

// Event handlers
redis.on("connect", () => {
  logger.info("✅ Redis connected");
});

redis.on("error", (error) => {
  logger.error("❌ Redis error:", error);
});

redis.on("reconnecting", () => {
  logger.warn("🔄 Redis reconnecting...");
});

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<void> {
  try {
    // Test connection
    await redis.ping();
    logger.info("✅ Redis initialized successfully");
  } catch (error) {
    logger.error("❌ Redis initialization failed:", error);
    throw error;
  }
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info("Redis disconnected");
}
