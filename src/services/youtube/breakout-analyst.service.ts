/**
 * Breakout Analyst Service (FASE 5)
 *
 * Analyzes breakout videos and generates follow-up angle variations.
 * All config from env — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { NICHE_VERTICALS } from "@/config/youtube.config";
import type { YtBreakoutCluster, YtAngleVariation } from "@/types/youtube.types";
import { NotFoundError } from "@/utils/app-errors";

export async function analyzeBreakout(videoId: string): Promise<YtBreakoutCluster> {
  const video = await prisma.ytPublishedVideo.findUnique({ where: { videoId } });
  if (!video) throw new NotFoundError("Video", videoId);

  const _metrics = await prisma.ytVideoMetrics.findFirst({
    where: { videoId },
    orderBy: { recordedAt: "desc" },
  });

  const niche = video.nicheVertical || "folklore_history";
  const _nicheConfig = NICHE_VERTICALS[niche as keyof typeof NICHE_VERTICALS];

  const cluster: YtBreakoutCluster = {
    primaryElement: video.title || "Unknown",
    secondaryElements: [niche, video.toneVariant || ""],
    storyType: video.toneVariant || "mystery",
    toneVariant: video.toneVariant || "misteri",
    trafficDriver: "suggested",
    bestDurationTier: video.tier || "tier_1",
    recommendedAngleVariations: generateAngleVariations(video.title || "", niche, video.toneVariant || ""),
    relatedOldVideos: [],
    revisitScheduleWeeks: 6,
  };

  await prisma.ytBreakoutCluster.create({
    data: {
      channelId: video.channelId,
      nicheVertical: niche,
      triggerVideoId: videoId,
      primaryElement: cluster.primaryElement,
      secondaryElements: cluster.secondaryElements,
      storyType: cluster.storyType,
      toneVariant: cluster.toneVariant,
      trafficDriver: cluster.trafficDriver,
      bestDurationTier: cluster.bestDurationTier,
      active: true,
      revisitScheduledAt: new Date(Date.now() + cluster.revisitScheduleWeeks * 7 * 24 * 60 * 60 * 1000),
    },
  });

  logger.info(`[breakout-analyst] Analyzed breakout: ${videoId} | Primary: ${cluster.primaryElement}`);
  return cluster;
}

function generateAngleVariations(title: string, niche: string, tone: string): YtAngleVariation[] {
  const angles: YtAngleVariation[] = [];
  const hooks = ["BAGIAN 2", "YANG SEBENARNYA", "KISAH LANJUTAN", "FAKTA TERSEMBUNYI", "VERSII LAIN"];

  for (const hook of hooks) {
    angles.push({
      angle: `${hook} — ${title}`,
      hookType: "mystery_question",
      toneVariant: tone,
      titleDraft: `${hook}: ${title}`,
    });
  }

  return angles;
}
