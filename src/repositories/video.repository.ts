/**
 * Video Repository
 *
 * Thin wrapper around Prisma video operations. Decouples business logic
 * from the ORM, enables easier mocking in tests, and provides a single
 * point of truth for Video database operations.
 *
 * NOTE: This is a proof-of-concept. The existing VideoService methods
 * still work via the facade pattern. New code should prefer this
 * repository directly.
 */

import { prisma } from "@/config/database";
import { Video, Prisma } from "@prisma/client";

export class VideoRepository {
  /** Create a new video record */
  static async create(data: Prisma.VideoCreateInput): Promise<Video> {
    return prisma.video.create({ data });
  }

  /** Find video by job ID */
  static async findByJobId(jobId: string): Promise<Video | null> {
    return prisma.video.findUnique({ where: { jobId } });
  }

  /** Update video progress */
  static async updateProgress(
    jobId: string,
    progress: number,
    status?: string,
  ): Promise<Video> {
    return prisma.video.update({
      where: { jobId },
      data: {
        progress,
        status: status || undefined,
        completedAt: status === "completed" ? new Date() : undefined,
      },
    });
  }

  /** Set video output URLs and mark as completed */
  static async setOutput(
    jobId: string,
    urls: { thumbnailUrl?: string; videoUrl?: string; downloadUrl?: string },
  ): Promise<Video> {
    return prisma.video.update({
      where: { jobId },
      data: { ...urls, status: "completed", progress: 100, completedAt: new Date() },
    });
  }

  /** Update video status */
  static async updateStatus(
    jobId: string,
    status: string,
    errorMessage?: string,
  ): Promise<Video> {
    return prisma.video.update({
      where: { jobId },
      data: {
        status,
        errorMessage,
        ...(status === "completed" ? { completedAt: new Date(), progress: 100 } : {}),
      },
    });
  }

  /** Soft-delete a video */
  static async softDelete(jobId: string): Promise<void> {
    await prisma.video.update({ where: { jobId }, data: { status: "deleted" } });
  }

  /** Restore a soft-deleted video */
  static async restore(jobId: string): Promise<void> {
    await prisma.video.update({ where: { jobId }, data: { status: "completed" } });
  }

  /** Permanently delete a video */
  static async permanentlyDelete(jobId: string): Promise<void> {
    await prisma.video.delete({ where: { jobId } });
  }

  /** Toggle favorite status */
  static async toggleFavorite(jobId: string): Promise<boolean> {
    const video = await prisma.video.findUnique({
      where: { jobId },
      select: { favorited: true },
    });
    if (!video) return false;
    const newState = !video.favorited;
    await prisma.video.update({ where: { jobId }, data: { favorited: newState } });
    return newState;
  }

  /** Find user's favorited videos */
  static async findUserFavorites(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, favorited: true, status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** Find user's trashed videos */
  static async findUserTrash(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, status: "deleted" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** Find user's active videos (not deleted) */
  static async findUserVideos(
    userId: bigint,
    limit = 10,
    offset = 0,
  ): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /** Count user's daily video generations */
  static async countDailyGenerations(userId: bigint, startOfDay: Date): Promise<number> {
    return prisma.video.count({
      where: { userId, createdAt: { gte: startOfDay } },
    });
  }

  /** Upsert video record for admin interception */
  static async upsertForInterception(
    jobId: string,
    userId: bigint,
    mediaUrl: string,
  ): Promise<Video> {
    return prisma.video.upsert({
      where: { jobId },
      create: {
        userId,
        jobId,
        niche: "marketing",
        platform: "tiktok",
        duration: 15,
        scenes: 1,
        title: "Marketing Override",
        status: "completed",
        progress: 100,
        videoUrl: mediaUrl,
        creditsUsed: 0,
        completedAt: new Date(),
      },
      update: {
        status: "completed",
        progress: 100,
        videoUrl: mediaUrl,
        completedAt: new Date(),
      },
    });
  }
}
