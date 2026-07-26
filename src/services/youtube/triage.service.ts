/**
 * Triage Service (FASE 4B)
 *
 * Decides: DELETE / KEEP / TRANSFER_CANDIDATE for videos at day 10.
 * All thresholds from config — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import {
  getTriageDeadMaxViews, getTriageDeadMaxCtr, getTriageDeadMaxAvd,
  getTriageGoodMinCtr, getTriageGoodMinAvd,
} from "@/config/youtube.config";
import type { VideoTriageDecision } from "@/config/youtube.config";
import { NotFoundError } from "@/utils/app-errors";

interface TriageResult {
  videoId: string;
  decision: VideoTriageDecision;
  views10d: number;
  ctr10d: number;
  avgViewPct: number;
}

export async function triageVideo(videoId: string): Promise<TriageResult> {
  const video = await prisma.ytPublishedVideo.findUnique({ where: { videoId } });
  if (!video) throw new NotFoundError("Video", videoId);

  const metrics = await prisma.ytVideoMetrics.findFirst({
    where: { videoId, checkAt: "10d" },
    orderBy: { recordedAt: "desc" },
  });

  if (!metrics) throw new NotFoundError("10d metrics", videoId);

  const channelAvg = await getChannelAvgViews(video.channelId);

  const views = metrics.views || 0;
  const ctr = metrics.ctr || 0;
  const avd = metrics.avgViewPct || 0;

  let decision: VideoTriageDecision;

  const isDead = views < getTriageDeadMaxViews() && ctr < getTriageDeadMaxCtr() && avd < getTriageDeadMaxAvd();
  const isGood = views > channelAvg * 2 || ctr > getTriageGoodMinCtr() || avd > getTriageGoodMinAvd();

  if (isDead) {
    decision = "DELETE";
    await prisma.ytPublishedVideo.update({ where: { videoId }, data: { status: "deleted", triageDecision: "DELETE", triageAt: new Date() } });
    logger.info(`[triage] 🗑️ DELETE: ${videoId} | Views: ${views} | CTR: ${(ctr * 100).toFixed(1)}%`);
  } else if (isGood) {
    decision = "TRANSFER_CANDIDATE";
    await prisma.ytPublishedVideo.update({ where: { videoId }, data: { triageDecision: "TRANSFER_CANDIDATE", triageAt: new Date() } });
    logger.info(`[triage] ✅ TRANSFER_CANDIDATE: ${videoId} | Views: ${views} | CTR: ${(ctr * 100).toFixed(1)}%`);
  } else {
    decision = "KEEP";
    await prisma.ytPublishedVideo.update({ where: { videoId }, data: { status: "growing", triageDecision: "KEEP", triageAt: new Date() } });
    logger.info(`[triage] KEEP: ${videoId}`);
  }

  await prisma.ytQuarantineLog.create({
    data: {
      channelId: video.channelId,
      action: decision,
      channelAgeDays: null,
      trafficDropPct: null,
      recoveryPct: null,
      quarantineMonths: null,
      details: { videoId, views, ctr, avd, channelAvg },
    },
  });

  return { videoId, decision, views10d: views, ctr10d: ctr, avgViewPct: avd };
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
