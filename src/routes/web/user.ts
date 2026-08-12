/**
 * Web Routes — User API
 *
 * /api/user (GET, DELETE, PATCH)
 * /api/user/videos, /api/user/history
 * /api/video/:jobId (DELETE), /api/video/:jobId/status
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { VideoService } from "@/services/video.service";
import { NICHE_CONFIG, resolveNicheKey } from "@/config/niches";
import { PERSONA_IDS } from "@/config/personas";
import { logger } from "@/utils/logger";
import { readLimiter } from "@/middleware/rateLimit";
import { tryApiKeyAuth } from "@/middleware/api-auth";
import { getUser } from "./middleware";

export async function userRoutes(server: FastifyInstance): Promise<void> {
  // ── GET /api/user ──
  server.get(
    "/api/user",
    { preHandler: [readLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      return {
        id: user.uuid,
        telegramId: user.telegramId.toString(),
        username: user.username,
        firstName: user.firstName,
        credits: user.creditBalance,
        tier: user.tier,
        referralCode: user.referralCode,
        email: user.email,
        emailVerified: user.emailVerifiedAt != null,
        dailyFreeUsed: user.dailyFreeUsed,
        dailyFreeResetAt: user.dailyFreeResetAt,
        selectedNiche: user.selectedNiche ?? null,
        userMode: user.userMode ?? null,
        welcomeBonusUsed: user.welcomeBonusUsed ?? false,
        createdAt: user.createdAt,
      };
    },
  );

  // ── DELETE /api/user ──
  server.delete("/api/user", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      await prisma.user.update({
        where: { uuid: user.uuid },
        data: {
          firstName: "Deleted User",
          username: null,
          phoneNumber: null,
          referralCode: null,
        },
      });
      return { message: "Account deleted successfully" };
    } catch (error) {
      logger.error("Account deletion error:", error);
      return reply.status(500).send({ error: "Deletion failed" });
    }
  });

  // ── PATCH /api/user/settings ──
  server.patch("/api/user/settings", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    const {
      language,
      notificationsEnabled,
      firstName,
      selectedNiche,
      userMode,
    } = (request.body ?? {}) as {
      language?: string;
      notificationsEnabled?: boolean;
      firstName?: string;
      selectedNiche?: string;
      userMode?: string;
    };
    const validLangs = ["id", "en", "ru", "zh"];
    const data: Record<string, unknown> = {};
    if (language !== undefined) {
      if (!validLangs.includes(language))
        return reply.status(400).send({ error: "Invalid language" });
      data.language = language;
    }
    if (firstName !== undefined) {
      if (
        typeof firstName !== "string" ||
        firstName.trim().length === 0 ||
        firstName.length > 64
      )
        return reply.status(400).send({ error: "Invalid name (1-64 chars)" });
      data.firstName = firstName.trim();
    }
    if (notificationsEnabled !== undefined) {
      data.notificationsEnabled = Boolean(notificationsEnabled);
    }
    if (selectedNiche !== undefined) {
      if (typeof selectedNiche !== "string" || selectedNiche.length > 64)
        return reply.status(400).send({ error: "Invalid niche" });
      const canonical = resolveNicheKey(selectedNiche);
      if (!NICHE_CONFIG[canonical as keyof typeof NICHE_CONFIG])
        return reply.status(400).send({ error: "Invalid niche" });
      data.selectedNiche = canonical;
    }
    if (userMode !== undefined) {
      const modes = PERSONA_IDS as readonly string[];
      if (typeof userMode !== "string" || !modes.includes(userMode))
        return reply.status(400).send({ error: "Invalid user mode" });
      data.userMode = userMode;
    }
    if (Object.keys(data).length === 0)
      return reply.status(400).send({ error: "No settings to update" });
    await prisma.user.update({ where: { uuid: user.uuid }, data });
    return { ok: true };
  });

  // ── POST /api/user/bonus/welcome ──
  server.post("/api/user/bonus/welcome", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const granted = await UserService.grantWelcomeBonus(user.telegramId);
      const fresh = await prisma.user.findUnique({
        where: { uuid: user.uuid },
        select: { creditBalance: true },
      });
      return {
        granted,
        creditBalance: fresh?.creditBalance ?? user.creditBalance,
      };
    } catch (error) {
      logger.error("Welcome bonus error:", error);
      return reply.status(500).send({ error: "Failed to claim welcome bonus" });
    }
  });

  // ── GET /api/user/videos ──
  server.get("/api/user/videos", async (request, reply) => {
    if ((request.headers as Record<string, string>)["x-api-key"]) {
      if (!(await tryApiKeyAuth(request, reply))) return;
    }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const query = request.query as { limit?: string; cursor?: string };
      const limit = Math.min(
        Math.max(1, parseInt(query.limit || "20") || 20),
        50,
      );
      const cursor = query.cursor as string | undefined;

      const videoRows = await prisma.video.findMany({
        where: { userId: user.telegramId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { jobId: cursor }, skip: 1 } : {}),
      });

      const hasMore = videoRows.length > limit;
      if (hasMore) videoRows.pop();

      return {
        videos: videoRows,
        nextCursor: hasMore
          ? (videoRows[videoRows.length - 1]?.jobId ?? null)
          : null,
      };
    } catch {
      return reply.status(500).send({ error: "Failed to fetch videos" });
    }
  });

  // ── GET /api/user/history ──
  server.get("/api/user/history", async (request, reply) => {
    if ((request.headers as Record<string, string>)["x-api-key"]) {
      if (!(await tryApiKeyAuth(request, reply))) return;
    }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const query = request.query as { limit?: string; cursor?: string };
      const limit = Math.min(
        Math.max(1, parseInt(query.limit || "20") || 20),
        50,
      );
      const cursor = query.cursor as string | undefined;

      const jobRows = await prisma.video.findMany({
        where: { userId: user.telegramId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { jobId: cursor }, skip: 1 } : {}),
        select: {
          jobId: true,
          status: true,
          videoUrl: true,
          thumbnailUrl: true,
          description: true,
          duration: true,
          createdAt: true,
          creditsUsed: true,
        },
      });

      const hasMore = jobRows.length > limit;
      if (hasMore) jobRows.pop();

      return {
        jobs: jobRows.map((r) => ({
          jobId: r.jobId,
          status: r.status,
          videoUrl: r.videoUrl,
          thumbnailUrl: r.thumbnailUrl,
          prompt: r.description,
          duration: r.duration,
          createdAt: r.createdAt,
          creditsUsed: r.creditsUsed,
        })),
        nextCursor: hasMore
          ? (jobRows[jobRows.length - 1]?.jobId ?? null)
          : null,
      };
    } catch {
      return reply.status(500).send({ error: "Failed to fetch history" });
    }
  });

  // ── DELETE /api/video/:jobId ──
  server.delete("/api/video/:jobId", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { jobId } = request.params as { jobId: string };
      const video = await VideoService.getByJobId(jobId);
      if (!video) return reply.status(404).send({ error: "Video not found" });
      if (video.userId !== user.telegramId)
        return reply.status(403).send({ error: "Access denied" });
      await VideoService.deleteVideo(jobId);
      return { ok: true };
    } catch (error) {
      server.log.error({ error }, "Video delete error");
      return reply.status(500).send({ error: "Failed to delete video" });
    }
  });

  // ── GET /api/video/:jobId/status ──
  server.get("/api/video/:jobId/status", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { jobId } = request.params as { jobId: string };
      const video = await VideoService.getByJobId(jobId);
      if (!video) return reply.status(404).send({ error: "Video not found" });
      if (video.userId !== user.telegramId)
        return reply.status(403).send({ error: "Access denied" });
      return {
        jobId: video.jobId,
        status: video.status,
        progress: video.progress,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        createdAt: video.createdAt,
      };
    } catch (error) {
      server.log.error({ error }, "Video status error");
      return reply.status(500).send({ error: "Failed to get video status" });
    }
  });
}
