/**
 * Job Heartbeat Service
 *
 * Tracks liveness of long-running video/ebook jobs in Redis so a
 * crashed worker is detectable without a DB migration.
 *
 * Key format: jobhb:<jobId> -> JSON { stage, progress, provider, retryCount, updatedAt }
 * TTL auto-expires so completed jobs don't linger; explicit clear() on finish.
 */

import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";

const HB_PREFIX = "jobhb:";
const HB_TTL_SECONDS = 30 * 60; // 30 min — matches stuck-video threshold

export interface JobHeartbeat {
  stage: string;
  progress: number;
  provider?: string;
  retryCount?: number;
  startedAt?: number;
  updatedAt: number;
  failureReason?: string;
}

export class JobHeartbeatService {
  /** Record a heartbeat for a job (fire-and-forget safe). */
  static async beat(
    jobId: string,
    partial: Partial<Omit<JobHeartbeat, "updatedAt">> & { stage: string },
  ): Promise<void> {
    try {
      const key = `${HB_PREFIX}${jobId}`;
      const raw = await redis.get(key);
      const prev: Partial<JobHeartbeat> = raw ? JSON.parse(raw) : {};
      const hb: JobHeartbeat = {
        stage: partial.stage,
        progress: partial.progress ?? (prev.progress as number) ?? 0,
        provider: partial.provider ?? (prev.provider as string | undefined),
        retryCount: partial.retryCount ?? (prev.retryCount as number) ?? 0,
        startedAt:
          partial.startedAt ?? (prev.startedAt as number) ?? Date.now(),
        updatedAt: Date.now(),
        failureReason: partial.failureReason,
      };
      await redis.set(key, JSON.stringify(hb), "EX", HB_TTL_SECONDS);
    } catch (err) {
      logger.warn(`[Heartbeat] beat failed for ${jobId}:`, err);
    }
  }

  /** Read a heartbeat; null when never-beaten or expired. */
  static async get(jobId: string): Promise<JobHeartbeat | null> {
    try {
      const raw = await redis.get(`${HB_PREFIX}${jobId}`);
      return raw ? (JSON.parse(raw) as JobHeartbeat) : null;
    } catch (err) {
      logger.warn(`[Heartbeat] get failed for ${jobId}:`, err);
      return null;
    }
  }

  /** Remove heartbeat on job completion (TTL is the backstop). */
  static async clear(jobId: string): Promise<void> {
    try {
      await redis.del(`${HB_PREFIX}${jobId}`);
    } catch (err) {
      logger.warn(`[Heartbeat] clear failed for ${jobId}:`, err);
    }
  }

  /**
   * A job is stale when it has NO heartbeat within `staleAfterMs`
   * (default 10 min) — i.e. key missing/expired, or updatedAt too old.
   * Returns age in ms (Infinity when no heartbeat at all).
   */
  static async stalenessMs(
    jobId: string,
    now: number = Date.now(),
  ): Promise<number> {
    const hb = await this.get(jobId);
    if (!hb) return Infinity;
    return now - hb.updatedAt;
  }

  static async isStale(
    jobId: string,
    staleAfterMs: number = 10 * 60 * 1000,
    now: number = Date.now(),
  ): Promise<boolean> {
    return (await this.stalenessMs(jobId, now)) > staleAfterMs;
  }
}
