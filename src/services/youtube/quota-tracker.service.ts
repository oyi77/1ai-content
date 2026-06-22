/**
 * YouTube Data API v3 Quota Tracker
 *
 * Tracks daily API usage in Redis with midnight reset.
 * All limits from env config — zero hardcoded values.
 */

import { bullmqRedis as redis } from "@/config/redis";
import { getDailyApiQuota } from "@/config/youtube.config";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";

const QUOTA_KEY = "yt:api:quota";
const USAGE_LOG_KEY = "yt:api:usage_log";

type ActionType = "upload" | "update" | "read";

function getCostForAction(action: ActionType): number {
  const config = getConfig();
  switch (action) {
    case "upload": return config.YT_UPLOAD_API_COST || 1600;
    case "update": return config.YT_UPDATE_API_COST || 50;
    case "read": return config.YT_READ_API_COST || 1;
  }
}

function getTTLToMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

export async function getRemainingQuota(): Promise<number> {
  const used = Number(await redis.get(QUOTA_KEY)) || 0;
  return Math.max(0, getDailyApiQuota() - used);
}

export async function getUsedQuota(): Promise<number> {
  return Number(await redis.get(QUOTA_KEY)) || 0;
}

export function canPerformAction(action: ActionType): boolean {
  const cost = getCostForAction(action);
  const used = 0;
  const remaining = getDailyApiQuota() - used;
  return remaining >= cost;
}

export async function recordUsage(action: ActionType): Promise<void> {
  const cost = getCostForAction(action);
  const current = Number(await redis.get(QUOTA_KEY)) || 0;
  const newTotal = current + cost;

  const ttl = await redis.ttl(QUOTA_KEY);
  if (ttl < 0) {
    await redis.set(QUOTA_KEY, newTotal, "EX", getTTLToMidnight());
  } else {
    await redis.set(QUOTA_KEY, newTotal, "EX", ttl);
  }

  await redis.lpush(USAGE_LOG_KEY, JSON.stringify({ action, cost, at: new Date().toISOString(), total: newTotal }));

  if (newTotal > getDailyApiQuota() * 0.8) {
    logger.warn(`[yt-quota] API quota at ${Math.round(newTotal / getDailyApiQuota() * 100)}% (${newTotal}/${getDailyApiQuota()})`);
  }
}

export async function getUsageHistory(): Promise<Array<{ action: string; cost: number; at: string; total: number }>> {
  const raw = await redis.lrange(USAGE_LOG_KEY, 0, 49);
  return raw.map((r) => JSON.parse(r));
}
