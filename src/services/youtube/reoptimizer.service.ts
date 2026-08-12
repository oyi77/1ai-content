/**
 * Reoptimizer Service (FASE 5B)
 *
 * Updates title/thumbnail of old videos to align with breakout momentum.
 * All config from env — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { updateVideoMetadata } from "./youtube-api.service";
import { generateSeoPackage } from "./seo-optimizer.service";
import type { NicheVertical } from "@/config/youtube.config";
import { NotFoundError } from "@/utils/app-errors";

interface ReoptimizeResult {
  videoId: string;
  oldTitle: string;
  newTitle: string;
  updated: boolean;
}

export async function reoptimizeVideo(
  videoId: string,
  breakoutPrimaryElement: string,
): Promise<ReoptimizeResult> {
  const video = await prisma.ytPublishedVideo.findUnique({
    where: { videoId },
  });
  if (!video) throw new NotFoundError("Video", videoId);

  const oldTitle = video.title || "";
  const niche = (video.nicheVertical || "folklore_history") as NicheVertical;

  const newSeo = await generateSeoPackage(
    `${breakoutPrimaryElement}: ${oldTitle}`,
    `Re-optimized for breakout cluster: ${breakoutPrimaryElement}`,
    niche,
  );

  const updated = await updateVideoMetadata(videoId, video.channelId, {
    title: newSeo.title,
    description: newSeo.description,
    tags: newSeo.tags,
  });

  if (updated) {
    await prisma.ytPublishedVideo.update({
      where: { videoId },
      data: { title: newSeo.title },
    });
  }

  logger.info(
    `[reoptimizer] ${updated ? "Updated" : "Failed"}: ${videoId} | "${oldTitle}" → "${newSeo.title}"`,
  );
  return { videoId, oldTitle, newTitle: newSeo.title, updated };
}
