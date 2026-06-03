/**
 * Session Management Utility
 *
 * Direct Redis session operations that bypass Telegraf middleware.
 * Used for atomic session updates with locking to prevent corruption.
 */

import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";

export const SESSION_TTL = 86400; // 24h in seconds

/**
 * Write session data directly to Redis without going through middleware.
 * Uses a short-lived lock to prevent concurrent updates from corrupting the session.
 */
export async function updateSessionDirectly(
  userId: number,
  updater: (session: { state?: string; stateData?: Record<string, unknown>; [key: string]: unknown }) => void,
): Promise<void> {
  const key = `session:${userId}`;
  const lockKey = `session-lock:${userId}`;
  // Try to acquire lock (expires in 2s to prevent deadlock)
  const locked = await redis.set(lockKey, "1", "EX", 2, "NX");
  if (!locked) {
    // Lock held by concurrent request — skip this update to avoid corruption
    logger.warn(`Session update skipped for user ${userId}: lock held by concurrent request`);
    return;
  }
  try {
    const raw = await redis.get(key);
    const session = raw
      ? JSON.parse(raw)
      : { state: "DASHBOARD", stateData: {}, lastActivity: new Date() };
    updater(session);
    await redis.setex(key, SESSION_TTL, JSON.stringify(session));
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
