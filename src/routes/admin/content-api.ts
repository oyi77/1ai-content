import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";

export async function registerContentRoutes(server: FastifyInstance): Promise<void> {
  /** GET /api/admin/content — list videos with pagination */
  server.get("/api/admin/content", async (_request, reply) => {
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        niche: true,
        creditsUsed: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    const total = await prisma.video.count();

    return reply.send({
      videos: videos.map((v) => ({
        ...v,
        creditsUsed: v.creditsUsed ? Number(v.creditsUsed) : null,
      })),
      total,
    });
  });
}
