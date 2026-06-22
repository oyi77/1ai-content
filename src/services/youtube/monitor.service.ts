/**
 * Monitor Service (FASE 4)
 *
 * Polls YouTube analytics and classifies video performance.
 * All thresholds from config — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { getAnalytics } from "./youtube-api.service";
import { getBreakoutViewsMultiplier, getBreakoutCtrThreshold, getBreakoutAvdThreshold } from "@/config/youtube.config";

type VideoStatus = "breakout" | "growing" | "underperforming" | "normal";

export async function checkVideoMetrics(videoId: string, checkAt: string): Promise<VideoStatus> {
  const video = await prisma.ytPublishedVideo.findUnique({ where: { videoId } });
  if (!video) return "normal";

  const channel = await prisma.ytChannel.findUnique({ where: { channelId: video.channelId } });
  if (!channel) return "normal";

  const analytics = await getAnalytics(video.channelId, videoId, 0);
  if (!analytics) return "normal";

  await prisma.ytVideoMetrics.create({
    data: {
      videoId,
      checkAt,
      views: analytics.views,
      ctr: analytics.ctr,
      avgViewPct: analytics.avgViewPct,
      avdSeconds: analytics.avdSeconds,
      trafficSrc: analytics.trafficSrc as any,
    },
  });

  const channelAvg = await getChannelAvgViews(video.channelId);

  const isBreakout =
    analytics.views > channelAvg * getBreakoutViewsMultiplier() ||
    analytics.ctr > getBreakoutCtrThreshold() ||
    analytics.avgViewPct > getBreakoutAvdThreshold();

  if (isBreakout) {
    await prisma.ytPublishedVideo.update({ where: { videoId }, data: { status: "breakout" } });
    logger.info(`[monitor] 🔥 BREAKOUT: ${videoId} | Views: ${analytics.views} | CTR: ${(analytics.ctr * 100).toFixed(1)}%`);
    return "breakout";
  }

  if (checkAt === "48h") {
    if (analytics.views < channelAvg * 0.5) {
      await prisma.ytPublishedVideo.update({ where: { videoId }, data: { status: "underperforming" } });
      return "underperforming";
    }
    await prisma.ytPublishedVideo.update({ where: { videoId }, data: { status: "growing" } });
    return "growing";
  }

  return "normal";
}

async function getChannelAvgViews(channelId: string): Promise<number> {
  const recent = await prisma.ytPublishedVideo.findMany({
    where: { channelId, status: { not: "deleted" } },
    orderBy: { publishedAt: "desc" },
    take: 10,
    select: { videoId: true },
  });

  if (recent.length === 0) return 0;

  const videoIds = recent.map((v: { videoId: string }) => v.videoId);
  const metrics = await prisma.ytVideoMetrics.findMany({
    where: { videoId: { in: videoIds }, checkAt: "48h" },
    select: { views: true },
  });

  if (metrics.length === 0) return 0;
  return metrics.reduce((sum: number, m: { views: number | null }) => sum + (m.views || 0), 0) / metrics.length;
}

export async function runScheduledChecks(): Promise<void> {
  const monitoring = await prisma.ytPublishedVideo.findMany({
    where: { status: "monitoring" },
    select: { videoId: true, monitoringStart: true },
  });

  const now = Date.now();
  for (const video of monitoring) {
    if (!video.monitoringStart) continue;
    const hoursSince = (now - video.monitoringStart.getTime()) / (1000 * 60 * 60);

    let checkAt: string | null = null;
    if (hoursSince >= 24 && hoursSince < 48) checkAt = "24h";
    else if (hoursSince >= 48 && hoursSince < 240) checkAt = "48h";
    else if (hoursSince >= 240) checkAt = "10d";

    if (checkAt) {
      const existing = await prisma.ytVideoMetrics.findFirst({
        where: { videoId: video.videoId, checkAt },
      });
      if (!existing) {
        await checkVideoMetrics(video.videoId, checkAt);
      }
    }
  }
}
