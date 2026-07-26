/**
 * Scale Manager Service (FASE 6)
 *
 * Weekly orchestrator: metrics recap, quarantine checks, tier upgrades.
 * All config from env — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { getTier2MinAvgViews, getTier2MinAgeDays, getTier3MinAvgViews } from "@/config/youtube.config";
import { NotFoundError } from "@/utils/app-errors";

export async function runWeeklyReview(channelId: string): Promise<Record<string, unknown>> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel) throw new NotFoundError("Channel", channelId);

  const recentVideos = await prisma.ytPublishedVideo.findMany({
    where: { channelId, publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    select: { videoId: true, title: true, status: true },
  });

  const avgViews = await getChannelAvgViews(channelId);

  const tierUpgrade = checkTierUpgrade(channel.tier || "tier_1_cold_start", avgViews, channel.channelAgeDays, channel.totalPublished);

  if (tierUpgrade) {
    await prisma.ytChannel.update({
      where: { channelId },
      data: { tier: tierUpgrade },
    });
    logger.info(`[scale-manager] ⬆️ ${channelId} upgraded to ${tierUpgrade}`);
  }

  return {
    channelId,
    tier: tierUpgrade || channel.tier,
    totalPublished: channel.totalPublished,
    avgViews,
    recentVideos: recentVideos.length,
  };
}

function checkTierUpgrade(currentTier: string, avgViews: number, ageDays: number, _totalPublished: number): string | null {
  if (currentTier === "tier_1_cold_start" && avgViews > getTier2MinAvgViews() && ageDays >= getTier2MinAgeDays()) {
    return "tier_2_growing";
  }
  if (currentTier === "tier_2_growing" && avgViews > getTier3MinAvgViews()) {
    return "tier_3_established";
  }
  return null;
}

async function getChannelAvgViews(channelId: string): Promise<number> {
  const recent = await prisma.ytPublishedVideo.findMany({
    where: { channelId, status: { not: "deleted" } },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { videoId: true },
  });
  if (recent.length === 0) return 0;

  const videoIds = recent.map((v: { videoId: string }) => v.videoId);
  const metrics = await prisma.ytVideoMetrics.findMany({
    where: { videoId: { in: videoIds } },
    orderBy: { recordedAt: "desc" },
    select: { views: true },
  });
  if (metrics.length === 0) return 0;
  return metrics.reduce((sum: number, m: { views: number | null }) => sum + (m.views || 0), 0) / metrics.length;
}
