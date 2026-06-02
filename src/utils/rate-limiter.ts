/**
 * Rate Limiter (Per-operation)
 *
 * Separate from the global message rate limiter (middleware/rateLimit.ts).
 * This handles per-operation limits: generate, topup, create, etc.
 * Falls back to in-memory Map if Redis is unavailable.
 */

import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { AdminConfigService } from '@/services/admin-config.service';
import { ValidationError } from '@/utils/app-errors';

interface RateLimitConfig {
  /** Window in seconds */
  windowSec: number;
  /** Max operations per window */
  max: number;
  /** Human-readable label for error messages */
  label: string;
}

const PRESETS: Record<string, RateLimitConfig> = {
  generate: { windowSec: 60, max: 5, label: 'generate' },
  create:   { windowSec: 60, max: 10, label: 'create' },
  topup:    { windowSec: 300, max: 3, label: 'topup attempt' },
  referral: { windowSec: 3600, max: 5, label: 'referral action' },
  support:  { windowSec: 300, max: 3, label: 'support request' },
};

/** Load a preset from AdminConfigService with fallback to static PRESETS */
async function getPreset(operation: string): Promise<RateLimitConfig> {
  const def = PRESETS[operation];
  if (!def) return { windowSec: 60, max: 10, label: operation };
  const override = await AdminConfigService.get<{ windowSec?: number; max?: number } | null>(
    'rate_limit', `op_${operation}`, null
  );
  if (!override) return def;
  return {
    windowSec: override.windowSec ?? def.windowSec,
    max: override.max ?? def.max,
    label: def.label,
  };
}

// In-memory fallback when Redis is down
const memStore = new Map<string, { count: number; expiresAt: number }>();

function memIncr(key: string, ttlSec: number): number {
  const existing = memStore.get(key);
  if (!existing || Date.now() > existing.expiresAt) {
    memStore.set(key, { count: 1, expiresAt: Date.now() + ttlSec * 1000 });
    return 1;
  }
  existing.count++;
  return existing.count;
}

/**
 * Check and increment rate limit for a user operation.
 *
 * @returns null if allowed, or a user-friendly string if blocked
 */
export async function checkRateLimit(
  userId: number,
  operation: keyof typeof PRESETS | RateLimitConfig,
  isAdmin = false,
): Promise<string | null> {
  if (isAdmin) return null;

  const cfg: RateLimitConfig =
    typeof operation === 'string' ? await getPreset(operation) : operation;

  const key = `oplimit:${operation}:${userId}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);
    const results = await pipeline.exec();

    if (!results) throw new ValidationError('pipeline returned null', 'pipeline');

    const count = (results[0][1] as number) || 0;
    const ttl   = (results[1][1] as number) || -1;

    // Set TTL on first call
    if (ttl < 0 || ttl > cfg.windowSec) {
      await redis.expire(key, cfg.windowSec);
    }

    if (count > cfg.max) {
      const remaining = ttl > 0 ? ttl : cfg.windowSec;
      return (
        `⏳ Terlalu banyak ${cfg.label} dalam waktu singkat.\n` +
        `Coba lagi dalam *${remaining} detik*.`
      );
    }

    return null;
  } catch (err) {
    // Redis down — use in-memory fallback
    logger.warn('Rate limit Redis error, falling back to memory:', err);
    const count = memIncr(key, cfg.windowSec);
    if (count > cfg.max) {
      return `⏳ Terlalu banyak ${cfg.label}. Coba lagi dalam ${cfg.windowSec} detik.`;
    }
    return null;
  }
}

/**
 * Admin ID list from env
 */
export function getAdminIds(): number[] {
  const config = getConfig();
  return (
    config.ADMIN_TELEGRAM_IDS?.split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter(Boolean) ?? []
  );
}

export function isAdmin(userId: number): boolean {
  return getAdminIds().includes(userId);
}
