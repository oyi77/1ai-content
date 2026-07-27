import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";

export async function registerTokenUsageRoutes(server: FastifyInstance) {
  // GET /api/token-usage
  server.get("/api/token-usage", async (request) => {
    const {
      limit = "50",
      provider,
      service,
    } = request.query as {
      limit?: string;
      provider?: string;
      service?: string;
    };
    const where: Record<string, unknown> = {};
    if (provider) where.provider = provider;
    if (service) where.service = service;
    return prisma.tokenUsage.findMany({
      where,
      take: Math.min(Math.max(1, parseInt(limit) || 50), 200),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        model: true,
        service: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costUsd: true,
        costIdr: true,
        createdAt: true,
      },
    });
  });
}
