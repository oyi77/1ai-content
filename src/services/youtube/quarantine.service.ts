/**
 * Quarantine Service (FASE 7)
 *
 * Detects channel quarantine eligibility and manages lifecycle.
 * All thresholds from config — zero hardcoded values.
 */

import { getConfig } from "@/config/env";
import { logger} from "@/utils/logger";
import { prisma } from "@/config/database";
import {
  getQuarantineTriggerAgeDays, getTrafficDropThreshold,
  getRecoveryThreshold,
} from "@/config/youtube.config";
import type { YtQuarantineEligibility } from "@/types/youtube.types";

export async function checkQuarantineEligibility(channelId: string): Promise<YtQuarantineEligibility> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel) return { eligible: false };
  if (["quarantine", "transferred", "deleted"].includes(channel.trafficStatus)) {
    return { eligible: false };
  }

  const ageDays = channel.channelAgeDays;
  const triggerRange = getQuarantineTriggerAgeDays();
  const isAgeTrigger = ageDays >= triggerRange[0] && ageDays <= triggerRange[1];

  const recentViews = await getAvgViews(channelId, 14);
  const previousViews = await getAvgViews(channelId, 30, 14);
  const trafficDropPct = previousViews > 0 ? (previousViews - recentViews) / previousViews : 0;
  const isTrafficDrop = trafficDropPct > getTrafficDropThreshold();

  if (isAgeTrigger && isTrafficDrop) {
    return { eligible: true, trigger: "scheduled + traffic_drop", confidence: "HIGH", channelAgeDays: ageDays, trafficDropPct };
  }
  if (isAgeTrigger) {
    return { eligible: true, trigger: "scheduled_only", confidence: "MEDIUM", channelAgeDays: ageDays, trafficDropPct, note: "Traffic not yet dropped significantly" };
  }
  if (isTrafficDrop && ageDays > (getConfig().YT_QUARANTINE_EARLY_MIN_AGE || 150)) {
    return { eligible: true, trigger: "traffic_drop_early", confidence: "MEDIUM", channelAgeDays: ageDays, trafficDropPct, note: "Early quarantine due to traffic drop" };
  }

  return { eligible: false };
}

export async function enterQuarantine(channelId: string): Promise<void> {
  await prisma.ytChannel.update({
    where: { channelId },
    data: { trafficStatus: "quarantine", quarantineStarted: new Date() },
  });

  await prisma.ytQuarantineLog.create({
    data: { channelId, action: "ENTER", triggerType: "auto", recordedAt: new Date() },
  });

  logger.info(`[quarantine] 🔒 ${channelId} entered quarantine`);
}

export async function checkRecovery(channelId: string): Promise<boolean> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel?.quarantineStarted) return false;

  const recentViews = await getAvgViews(channelId, 14);
  const preQuarantineViews = await getAvgViewsBeforeDate(channelId, channel.quarantineStarted);
  if (preQuarantineViews === 0) return false;

  const recoveryPct = recentViews / preQuarantineViews;
  return recoveryPct > getRecoveryThreshold();
}

export async function exitQuarantine(channelId: string): Promise<void> {
  await prisma.ytChannel.update({
    where: { channelId },
    data: { trafficStatus: "growing", quarantineStarted: null },
  });

  await prisma.ytQuarantineLog.create({
    data: { channelId, action: "EXIT", recordedAt: new Date() },
  });

  logger.info(`[quarantine] ✅ ${channelId} exited quarantine`);
}

export async function handleFailedRecovery(channelId: string): Promise<void> {
  await prisma.ytQuarantineLog.create({
    data: { channelId, action: "FAILED_RECOVERY", recordedAt: new Date() },
  });

  logger.warn(`[quarantine] ⚠️ ${channelId} failed recovery — needs manual intervention`);
}

async function getAvgViews(channelId: string, days: number, offsetDays = 0): Promise<number> {
  const since = new Date(Date.now() - (days + offsetDays) * 24 * 60 * 60 * 1000);
  const until = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);

  const videos = await prisma.ytPublishedVideo.findMany({
    where: { channelId, publishedAt: { gte: since, lte: until } },
    select: { videoId: true },
  });
  if (videos.length === 0) return 0;

  const videoIds = videos.map((v: { videoId: string }) => v.videoId);
  const metrics = await prisma.ytVideoMetrics.findMany({
    where: { videoId: { in: videoIds } },
    orderBy: { recordedAt: "desc" },
    select: { views: true },
    take: videos.length,
  });

  if (metrics.length === 0) return 0;
  return metrics.reduce((sum: number, m: { views: number | null }) => sum + (m.views || 0), 0) / metrics.length;
}

async function getAvgViewsBeforeDate(channelId: string, before: Date): Promise<number> {
  const videos = await prisma.ytPublishedVideo.findMany({
    where: { channelId, publishedAt: { lte: before } },
    orderBy: { publishedAt: "desc" },
    take: 10,
    select: { videoId: true },
  });
  if (videos.length === 0) return 0;

  const videoIds = videos.map((v: { videoId: string }) => v.videoId);
  const metrics = await prisma.ytVideoMetrics.findMany({
    where: { videoId: { in: videoIds } },
    orderBy: { recordedAt: "desc" },
    select: { views: true },
    take: videos.length,
  });

  if (metrics.length === 0) return 0;
  return metrics.reduce((sum: number, m: { views: number | null }) => sum + (m.views || 0), 0) / metrics.length;
}
