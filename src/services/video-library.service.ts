/**
 * Video Library Service
 *
 * Handles user's video library operations (favorites, trash, listing)
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { Video } from "@prisma/client";

export class VideoLibraryService {
  /**
   * Toggle favorite status
   */
  static async toggleFavorite(jobId: string): Promise<boolean> {
    const video = await prisma.video.findUnique({
      where: { jobId },
      select: { favorited: true },
    });
    if (!video) return false;

    const updated = await prisma.video.update({
      where: { jobId },
      data: { favorited: !video.favorited },
    });

    return updated.favorited;
  }

  /**
   * Get user's favorite videos
   */
  static async getUserFavorites(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, favorited: true, status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get user's trash (soft-deleted videos)
   */
  static async getUserTrash(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, status: "deleted" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get user's videos (all active videos)
   */
  static async getUserVideos(
    userId: bigint,
    limit = 10,
    offset = 0,
  ): Promise<Video[]> {
    return prisma.video.findMany({
      where: {
        userId,
        status: { not: "deleted" },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }
}
