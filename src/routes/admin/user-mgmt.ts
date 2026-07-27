import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { validate, idParamSchema, tierBodySchema } from "@/utils/validation";

export async function registerUserMgmtRoutes(server: FastifyInstance) {
  // User Search
  server.get("/api/users/search", async (request: FastifyRequest) => {
    const { q, limit = "20" } = request.query as { q?: string; limit?: string };
    if (!q) return [];
    return prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" as any } },
          { firstName: { contains: q, mode: "insensitive" as any } },
        ],
      },
      take: parseInt(limit),
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        tier: true,
        creditBalance: true,
        isBanned: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });
  });

  // Change User Tier
  server.patch("/api/users/:id/tier", { preHandler: validate({ params: idParamSchema, body: tierBodySchema }) }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tier } = request.body as { tier: string };
    const validTiers = ["free", "basic", "lite", "pro", "agency"];
    if (!tier || !validTiers.includes(tier.toLowerCase()))
      return reply.status(400).send({ error: "Invalid tier" });
    try {
      const user = await prisma.user.update({
        where: { telegramId: BigInt(id) },
        data: { tier: tier.toLowerCase() },
      });
      return { success: true, tier: user.tier };
    } catch (error) {
      return reply.status(404).send({ error: "User not found or invalid ID" });
    }
  });
}
