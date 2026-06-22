/**
 * Publisher Service (FASE 3)
 *
 * Uploads video packages to YouTube. Quarantine-aware.
 * All config from env — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { uploadVideo } from "./youtube-api.service";
import { getMaxUploadsPerDay, getUsUploadTime, getIdUploadTime } from "@/config/youtube.config";
import { runQualityGate } from "./quality-gate.service";
import type { YtVideoPackage } from "@/types/youtube.types";

interface PublishResult {
  success: boolean;
  videoId?: string;
  error?: string;
}

export async function publishVideo(pkg: YtVideoPackage): Promise<PublishResult> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId: pkg.channelId } });
  if (!channel) return { success: false, error: `Channel ${pkg.channelId} not found` };

  const todayCount = await prisma.ytPublishedVideo.count({
    where: {
      channelId: pkg.channelId,
      publishedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });

  const maxPerDay = getMaxUploadsPerDay();
  if (todayCount >= maxPerDay) {
    return { success: false, error: `Daily upload limit reached (${todayCount}/${maxPerDay})` };
  }

  const quality = await runQualityGate(pkg);
  if (!quality.passed) {
    return { success: false, error: `Quality gate failed: ${quality.blockingFailures.join(", ")}` };
  }

  const _uploadTime = channel.targetCountry === "US" ? getUsUploadTime() : getIdUploadTime();

  const uploadResult = await uploadVideo({
    channelId: pkg.channelId,
    title: pkg.seoPackage.title,
    description: pkg.seoPackage.description,
    tags: pkg.seoPackage.tags,
    videoPath: pkg.finalVideoPath,
    thumbnailPath: pkg.thumbnailPath,
    privacyStatus: "private",
  });

  if (!uploadResult.success || !uploadResult.videoId) {
    return { success: false, error: uploadResult.error };
  }

  await prisma.ytPublishedVideo.create({
    data: {
      videoId: uploadResult.videoId,
      channelId: pkg.channelId,
      ideaId: pkg.ideaId,
      nicheVertical: pkg.nicheVertical,
      productionFormat: pkg.productionFormat,
      title: pkg.seoPackage.title,
      tier: channel.tier || "tier_1_cold_start",
      publishedAt: new Date(),
      monitoringStart: new Date(),
      status: "monitoring",
    },
  });

  await prisma.ytChannel.update({
    where: { channelId: pkg.channelId },
    data: { totalPublished: { increment: 1 } },
  });

  logger.info(`[publisher] Published ${uploadResult.videoId} to channel ${pkg.channelId}`);
  return { success: true, videoId: uploadResult.videoId };
}
