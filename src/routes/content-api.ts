/**
 * Content API Routes
 *
 * REST API for 1ai-content platform — video, image, ebook, and social media operations.
 * Supports both JWT session auth and API key auth (agency tier).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { ImageGenerationService } from "@/services/image.service";
import { ebookService } from "@/services/ebook.service";
import { getOmniRouteService } from "@/services/omniroute.service";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  generateStoryboard,
  NICHES,
} from "@/services/video-generation.service";
import {
  getVideoCreditCostAsync,
  getImageCreditCostAsync,
} from "@/config/pricing";
import { tryApiKeyAuth } from "@/middleware/api-auth";
import jwt from "jsonwebtoken";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

const getJwtSecret = (): string => getConfig().JWT_SECRET!;

async function getUser(request: FastifyRequest, reply: FastifyReply) {
  if ((request.headers as Record<string, string>)["x-api-key"]) {
    if (await tryApiKeyAuth(request, reply)) {
      return (request as unknown as Record<string, unknown>).apiUser as {
        telegramId: bigint;
        tier: string;
      };
    }
    return null;
  }
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as {
      userId: string;
    };
    const user = await UserService.findByUuid(decoded.userId);
    if (!user) {
      reply.status(404).send({ error: "User not found" });
      return null;
    }
    if (user.isBanned) {
      reply.status(403).send({ error: "Account suspended" });
      return null;
    }
    return user;
  } catch {
    reply.status(401).send({ error: "Invalid token" });
    return null;
  }
}

export async function contentApiRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/content/health", async () => {
    const ebookHealthy = await ebookService.healthCheck();
    return {
      status: "ok",
      version: "3.0.0",
      services: { video: true, image: true, ebook: ebookHealthy, social: true },
      timestamp: new Date().toISOString(),
    };
  });

  server.get("/api/content/videos", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const videos = await prisma.video.findMany({
      where: { userId: user.telegramId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        jobId: true,
        niche: true,
        duration: true,
        status: true,
        videoUrl: true,
        thumbnailUrl: true,
        title: true,
        createdAt: true,
      },
    });

    return { videos };
  });

  server.post("/api/content/video/create", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const {
      niche,
      duration,
      customPrompt,
      platform = "tiktok",
      enableVO = true,
      enableSubtitles = true,
      language = "id",
    } = (request.body ?? {}) as Record<string, string>;

    if (!niche || !duration) {
      return reply.status(400).send({ error: "niche and duration required" });
    }

    const durationNum = Number(duration);
    const creditCost = await getVideoCreditCostAsync(durationNum);

    const fullUser = await UserService.findByTelegramId(user.telegramId);
    if (!fullUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    const balance = Number(fullUser.creditBalance || 0);

    if (balance < creditCost) {
      return reply
        .status(402)
        .send({ error: "Insufficient credits", required: creditCost, balance });
    }

    const nicheConfig = (NICHES as Record<string, unknown>)[niche];
    if (!nicheConfig) {
      return reply.status(400).send({ error: "Invalid niche" });
    }

    const jobId = uuidv4();
    const scenes = Math.max(3, Math.min(Math.floor(durationNum / 5), 8));
    const storyboard = generateStoryboard(
      niche,
      (nicheConfig as { styles?: string[] }).styles?.slice(0, 2) || ["viral"],
      durationNum,
      scenes,
    );

    await enqueueVideoGeneration({
      userId: user.telegramId.toString(),
      jobId,
      niche,
      platform,
      duration: durationNum,
      scenes,
      storyboard: storyboard.map((s, i) => ({
        scene: i + 1,
        duration: s.duration || Math.floor(durationNum / scenes),
        description: s.description,
      })),
      customPrompt: customPrompt || "",
      enableVO: enableVO === true || enableVO === "true",
      enableSubtitles: enableSubtitles === true || enableSubtitles === "true",
      language,
      chatId: 0,
      creditCost,
    });

    await UserService.deductCredits(user.telegramId, creditCost);

    return {
      jobId,
      status: "queued",
      creditCost,
      message: "Video generation started",
    };
  });

  server.get("/api/content/video/:jobId/status", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const { jobId } = request.params as { jobId: string };
    const video = await prisma.video.findFirst({
      where: { jobId, userId: user.telegramId },
    });

    if (!video) {
      return reply.status(404).send({ error: "Video not found" });
    }

    return {
      jobId: video.jobId,
      status: video.status,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
      createdAt: video.createdAt,
    };
  });

  server.post("/api/content/image/generate", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const {
      prompt,
      category = "general",
      aspectRatio = "1:1",
    } = (request.body ?? {}) as Record<string, string>;

    if (!prompt) {
      return reply.status(400).send({ error: "prompt required" });
    }

    const creditCost = await getImageCreditCostAsync();

    const fullUser = await UserService.findByTelegramId(user.telegramId);
    if (!fullUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    const balance = Number(fullUser.creditBalance || 0);

    if (balance < creditCost) {
      return reply
        .status(402)
        .send({ error: "Insufficient credits", required: creditCost, balance });
    }

    try {
      const result = await ImageGenerationService.generateImage({
        prompt,
        category,
        aspectRatio,
      });

      if (result.success) {
        await UserService.deductCredits(user.telegramId, creditCost);
        return {
          success: true,
          url: result.imageUrl,
          thumbnailUrl: result.thumbnailUrl,
          creditCost,
        };
      } else {
        return reply
          .status(500)
          .send({ error: result.error || "Generation failed" });
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("Image generation error:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  server.get("/api/content/ebooks", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    try {
      const projects = await ebookService.listProjects(
        20,
        Number(user.telegramId),
      );
      return { ebooks: projects };
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message });
    }
  });

  server.post("/api/content/ebook/create", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const {
      idea,
      title,
      chapterCount = 10,
      targetLanguage = "id",
      productMode = "paid_ebook",
    } = (request.body ?? {}) as Record<string, string>;

    if (!idea) {
      return reply.status(400).send({ error: "idea required" });
    }

    try {
      const project = await ebookService.createProject(
        {
          idea,
          title,
          chapter_count: Number(chapterCount),
          target_language: targetLanguage,
          product_mode: productMode,
        },
        Number(user.telegramId),
      );

      await ebookService.generate(project.id, Number(user.telegramId));

      return {
        projectId: project.id,
        status: "generating",
        message: "Ebook generation started. Poll /api/content/ebook/:id/status",
      };
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message });
    }
  });

  server.get("/api/content/ebook/:id/status", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    try {
      const status = await ebookService.getStatus(
        Number(id),
        Number(user.telegramId),
      );
      return status;
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message });
    }
  });

  server.get(
    "/api/content/ebook/:id/download/:format",
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;

      const { id, format } = request.params as { id: string; format: string };

      if (!["pdf", "docx", "epub"].includes(format)) {
        return reply
          .status(400)
          .send({ error: "Invalid format. Use pdf, docx, or epub" });
      }

      try {
        const file = await ebookService.download(
          Number(id),
          format as "pdf" | "docx" | "epub",
          Number(user.telegramId),
        );
        reply.header("Content-Type", file.contentType);
        reply.header(
          "Content-Disposition",
          `attachment; filename="${file.filename}"`,
        );
        return reply.send(file.buffer);
      } catch (err: unknown) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  server.post("/api/content/chat", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const { message } = (request.body ?? {}) as { message: string };

    if (!message) {
      return reply.status(400).send({ error: "message required" });
    }

    try {
      const ai = getOmniRouteService();
      const response = await ai.chat(user.telegramId.toString(), message);

      return {
        success: true,
        response: response.content,
        model: response.model,
      };
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message });
    }
  });

  server.get("/api/content/user", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const fullUser = await UserService.findByTelegramId(user.telegramId);
    if (!fullUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    return {
      telegramId: fullUser.telegramId.toString(),
      tier: fullUser.tier,
      creditBalance: fullUser.creditBalance,
      language: fullUser.language,
      createdAt: fullUser.createdAt,
    };
  });

  server.get("/api/content/user/credits", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const fullUser = await UserService.findByTelegramId(user.telegramId);
    if (!fullUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { balance: fullUser.creditBalance, tier: fullUser.tier };
  });

  // ── Re-Metadata (video re-render) ──────────────────────────
  server.post("/api/content/remeta", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const { contentFactoryService } =
      await import("@/services/content-factory.service.js");

    try {
      const result = await contentFactoryService.remetaVideo({
        source: String(body.source ?? ""),
        overlay: body.overlay ? String(body.overlay) : undefined,
        watermark: body.watermark ? String(body.watermark) : undefined,
        position: body.position ? String(body.position) : undefined,
        niche: body.niche ? String(body.niche) : undefined,
        platform: body.platform ? String(body.platform) : undefined,
        language: body.language ? String(body.language) : undefined,
      });
      return result;
    } catch (err: unknown) {
      logger.error(
        `[ContentAPI] Remeta error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return reply.status(500).send({ error: "Re-metadata failed" });
    }
  });

  // ── Repurpose (multi-source remix) ──────────────────────────
  server.post("/api/content/repurpose", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const { contentFactoryService } =
      await import("@/services/content-factory.service.js");

    try {
      const sources = body.sources as string[];
      if (!Array.isArray(sources) || sources.length < 2) {
        return reply
          .status(400)
          .send({ error: "Minimum 2 source URLs required" });
      }

      const result = await contentFactoryService.repurposeVideo({
        sources,
        targetDuration: body.targetDuration
          ? Number(body.targetDuration)
          : undefined,
        platform: body.platform ? String(body.platform) : undefined,
        niche: body.niche ? String(body.niche) : undefined,
        style: body.style ? String(body.style) : undefined,
        language: body.language ? String(body.language) : undefined,
        colorPreset: body.colorPreset ? String(body.colorPreset) : undefined,
        transitionStyle: body.transitionStyle
          ? String(body.transitionStyle)
          : undefined,
        overlayText: body.overlayText ? String(body.overlayText) : undefined,
        watermarkText: body.watermarkText
          ? String(body.watermarkText)
          : undefined,
        addSubtitles: body.addSubtitles !== false,
        subtitleStyle: body.subtitleStyle
          ? String(body.subtitleStyle)
          : undefined,
      });
      return result;
    } catch (err: unknown) {
      logger.error(
        `[ContentAPI] Repurpose error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return reply.status(500).send({ error: "Repurpose failed" });
    }
  });

  // ── Upload Video ────────────────────────────────────────────
  server.post("/api/content/upload/video", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;

    try {
      const data = await (
        request as unknown as {
          file: () => Promise<{
            filename: string;
            mimetype: string;
            file: NodeJS.ReadableStream;
          }>;
        }
      ).file();
      if (!data) return reply.status(400).send({ error: "No file uploaded" });

      const uploadDir = "/tmp/content_uploads";
      const fs = await import("fs");
      const path = await import("path");
      fs.mkdirSync(uploadDir, { recursive: true });

      const ext = path.extname(data.filename || ".mp4").toLowerCase();
      const allowedExts = new Set([
        ".mp4",
        ".mov",
        ".avi",
        ".mkv",
        ".webm",
        ".m4v",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".mp3",
        ".wav",
        ".m4a",
        ".ogg",
        ".pdf",
        ".txt",
        ".srt",
        ".vtt",
      ]);
      if (!allowedExts.has(ext)) {
        return reply
          .status(400)
          .send({ error: `File extension "${ext}" not allowed` });
      }
      const safeBase = path
        .basename(data.filename || `video${ext}`)
        .replace(/[^\w.-]/g, "_");
      const filename = `${Date.now()}_${safeBase}`;
      const filePath = path.join(uploadDir, filename);

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fs.writeFileSync(filePath, Buffer.concat(chunks));

      return { success: true, path: filePath, filename };
    } catch (err: unknown) {
      logger.error(
        `[ContentAPI] Upload error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return reply.status(500).send({ error: "Upload failed" });
    }
  });
}
