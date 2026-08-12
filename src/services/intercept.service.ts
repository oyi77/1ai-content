import { getConfig } from "@/config/env";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";
import Redis from "ioredis";

const INTERCEPT_CACHE_TTL = 60; // seconds

/**
 * Dedicated Redis client for BLPOP — must NOT share with the main `redis` client.
 * ioredis queues all commands behind a blocking BLPOP on the same connection,
 * which would hang every other Redis call (del, get, publish) while waiting.
 */
const blpopRedis = new Redis(getConfig().REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

export class InterceptService {
  /** Check if user is intercepted. Caches result in Redis for 60s. */
  static async isIntercepted(telegramId: bigint): Promise<boolean> {
    const cacheKey = `intercept-flag:${telegramId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached === "1";
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { isIntercepted: true },
    });
    const val = user?.isIntercepted ? "1" : "0";
    await redis.set(cacheKey, val, "EX", INTERCEPT_CACHE_TTL);
    return val === "1";
  }

  /** Invalidate the intercept cache for a user. */
  static async invalidateCache(telegramId: bigint): Promise<void> {
    await redis.del(`intercept-flag:${telegramId}`);
  }

  /** Log a chat event for an intercepted user and publish to SSE channel. */
  static async logEvent(
    telegramId: bigint,
    eventType: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await prisma.chatEvent.create({
        data: {
          userId: telegramId,
          eventType,
          content,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });
      // Publish to Redis pub/sub for real-time SSE
      await redis.publish(
        `chat-events:${telegramId}`,
        JSON.stringify({ eventType, content, metadata, ts: Date.now() }),
      );
    } catch (err) {
      logger.warn("Failed to log intercept event:", err);
    }
  }

  /** Wait for admin to deliver media. Returns {mediaUrl, mediaType} or null on timeout. */
  static async waitForMedia(
    jobId: string,
    timeoutSec = 1800,
  ): Promise<{ mediaUrl: string; mediaType: string } | null> {
    const key = `intercept-media:${jobId}`;
    const result = await blpopRedis.blpop(key, timeoutSec);
    if (!result) return null;
    try {
      return JSON.parse(result[1]);
    } catch {
      return null;
    }
  }

  /** Admin delivers media — pushes to Redis list to wake waiting worker. */
  static async deliverMedia(
    jobId: string,
    mediaUrl: string,
    mediaType: string,
  ): Promise<void> {
    const key = `intercept-media:${jobId}`;
    await redis.rpush(key, JSON.stringify({ mediaUrl, mediaType }));
    await redis.expire(key, 300); // cleanup after 5min
  }

  /** Get recent chat events for a user (for admin UI initial load). */
  static async getRecentEvents(telegramId: bigint, limit = 50) {
    return prisma.chatEvent.findMany({
      where: { userId: telegramId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}
