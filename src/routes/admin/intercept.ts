/**
 * Admin Intercept Routes
 *
 * Extracted from routes/admin.ts to reduce the god file.
 * Handles: toggle intercept on user, get events, SSE stream, file upload/deliver.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { validate, interceptToggleSchema, interceptUploadSchema, interceptDeliverSchema } from "@/utils/validation";

type AdminVerifier = (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;

export function registerInterceptRoutes(server: FastifyInstance, verifyAdmin: AdminVerifier) {
  // Toggle intercept on a user
  server.post("/api/intercept/toggle", { preHandler: validate({ body: interceptToggleSchema }) }, async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { telegramId, enabled } = request.body as { telegramId: string; enabled: boolean };
    if (!telegramId) return reply.status(400).send({ error: "telegramId required" });
    const { InterceptService } = await import("../../services/intercept.service.js");
    try {
      await prisma.user.update({
        where: { telegramId: BigInt(telegramId) },
        data: { isIntercepted: enabled },
      });
      await InterceptService.invalidateCache(BigInt(telegramId));
      return { success: true };
    } catch (error) {
      if ((error as {code: string}).code === 'P2025') {
        return reply.status(404).send({ error: "User not found" });
      }
      if (error instanceof SyntaxError) {
        return reply.status(400).send({ error: "Invalid Telegram ID format" });
      }
      logger.error('Failed to toggle intercept:', error);
      return reply.status(500).send({ error: "An unexpected error occurred" });
    }
  });

  // Get recent chat events for a user
  server.get("/api/intercept/events/:telegramId", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { telegramId } = request.params as { telegramId: string };

    try {
      const { InterceptService } = await import("../../services/intercept.service.js");
      const events = await InterceptService.getRecentEvents(BigInt(telegramId), 100);
      return events.map(e => ({ ...e, id: e.id.toString(), userId: e.userId.toString() }));
    } catch (error) {
      logger.error('Failed to get intercept events:', error);
      return reply.status(500).send({ error: "Failed to retrieve events" });
    }
  });

  // SSE stream of real-time chat events for a user
  server.get("/api/intercept/stream/:telegramId", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { telegramId } = request.params as { telegramId: string };

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write('data: {"type":"connected"}\n\n');

    const channel = `chat-events:${telegramId}`;
    const Redis = (await import("ioredis")).default;
    const subClient = new Redis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    await subClient.subscribe(channel);
    subClient.on("message", (_ch: string, message: string) => {
      reply.raw.write(`data: ${message}\n\n`);
    });

    const ping = setInterval(() => {
      reply.raw.write(": ping\n\n");
    }, 20000);

    request.raw.on("close", async () => {
      clearInterval(ping);
      await subClient.unsubscribe(channel).catch(() => {});
      subClient.disconnect();
    });

    await new Promise<void>(resolve => request.raw.on("close", resolve));
  });

  // Serve uploaded intercept files
  server.get("/admin/uploads/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (filename.includes('/') || filename.includes('..')) {
      return reply.status(400).send({ error: "Invalid filename" });
    }
    const uploadDir = '/tmp/intercept-uploads';
    const filePath = `${uploadDir}/${filename}`;
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: "Not found" });
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mime = ['mp4','mov','avi','webm'].includes(ext) ? `video/${ext === 'mov' ? 'quicktime' : ext}`
      : ['jpg','jpeg'].includes(ext) ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : 'application/octet-stream';
    reply.header('Content-Type', mime);
    return reply.send(fs.createReadStream(filePath));
  });

  // Upload a media file and get back a URL for deliver
  server.post("/api/intercept/upload", { preHandler: validate({ body: interceptUploadSchema }) }, async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');
    const uploadDir = '/tmp/intercept-uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    try {
      const reqWithFile = request as unknown as { file: () => Promise<{ filename: string; file: NodeJS.ReadableStream }> };
      const data = await reqWithFile.file();
      if (!data) return reply.status(400).send({ error: "No file uploaded" });

      const ext = path.extname(data.filename).toLowerCase() || '.mp4';
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const filePath = `${uploadDir}/${filename}`;

      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.file.pipe(writeStream);
        data.file.on('end', resolve);
        data.file.on('error', reject);
      });

      const baseUrl = getConfig().WEBHOOK_URL.replace(/\/webhook.*$/, '');
      const publicUrl = `${baseUrl}/admin/uploads/${filename}`;

      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const mediaType = imageExts.includes(ext) ? 'image' : 'video';

      return { success: true, url: publicUrl, mediaType, filename };
    } catch (err) {
      logger.error('Upload error:', err);
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Admin delivers media to waiting job
  server.post("/api/intercept/deliver", { preHandler: validate({ body: interceptDeliverSchema }) }, async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { jobId, mediaUrl, mediaType } = request.body as {
      jobId: string; mediaUrl: string; mediaType: string;
    };
    if (!jobId || !mediaUrl) return reply.status(400).send({ error: "jobId and mediaUrl required" });

    try {
      const { InterceptService } = await import("../../services/intercept.service.js");
      await InterceptService.deliverMedia(jobId, mediaUrl, mediaType || "video");
      return { success: true };
    } catch (error) {
      logger.error('Failed to deliver media:', error);
      return reply.status(500).send({ error: "Failed to deliver media" });
    }
  });

  server.get("/api/intercept/users", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const users = await prisma.user.findMany({
      where: { isIntercepted: true },
      select: { telegramId: true, firstName: true, username: true, tier: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return users.map(u => ({ ...u, telegramId: u.telegramId.toString() }));
  });
}
