/**
 * YouTube Dashboard Routes (Fastify)
 *
 * GET /youtube/dashboard — overview
 * GET /youtube/channels/:id — channel detail
 * GET /youtube/videos — video list
 * GET /youtube/reports — weekly report
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";

export async function youtubeDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/youtube/dashboard", async (_req: FastifyRequest, reply: FastifyReply) => {
    const channels = await prisma.ytChannel.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        channelId: true, nicheVertical: true, productionFormat: true,
        tier: true, trafficStatus: true, totalPublished: true,
        channelAgeDays: true, trafficScore: true, createdAt: true,
      },
    });

    const totalVideos = await prisma.ytPublishedVideo.count();
    const quarantined = await prisma.ytChannel.count({ where: { trafficStatus: "quarantine" } });

    return reply.view("youtube/dashboard", {
      title: "YouTube Dashboard",
      channels,
      totalVideos,
      quarantined,
    });
  });

  app.get<{ Params: { id: string } }>("/youtube/channels/:id", async (req, reply) => {
    const channel = await prisma.ytChannel.findUnique({
      where: { channelId: req.params.id },
    });

    if (!channel) return reply.status(404).send({ error: "Channel not found" });

    const recentVideos = await prisma.ytPublishedVideo.findMany({
      where: { channelId: req.params.id },
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: { videoId: true, title: true, status: true, publishedAt: true, durationMinutes: true },
    });

    return reply.send({ channel, recentVideos });
  });

  app.get("/youtube/videos", async (_req: FastifyRequest, reply: FastifyReply) => {
    const videos = await prisma.ytPublishedVideo.findMany({
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        videoId: true, channelId: true, title: true, status: true,
        publishedAt: true, durationMinutes: true, nicheVertical: true,
      },
    });

    return reply.send({ videos });
  });

  app.get("/youtube/reports", async (_req: FastifyRequest, reply: FastifyReply) => {
    const channels = await prisma.ytChannel.findMany({
      select: { channelId: true, nicheVertical: true, tier: true, totalPublished: true, trafficStatus: true },
    });

    const totalPublished = channels.reduce((sum: number, ch: { totalPublished: number }) => sum + ch.totalPublished, 0);
    const totalChannels = channels.length;

    return reply.send({ totalChannels, totalPublished, channels });
  });
}
