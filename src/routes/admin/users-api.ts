import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";

export async function registerUsersApiRoutes(
  server: FastifyInstance,
): Promise<void> {
  /** GET /api/admin/users — list users with pagination */
  server.get("/api/admin/users", async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        uuid: true,
        firstName: true,
        lastName: true,
        username: true,
        tier: true,
        isBanned: true,
        lastActivityAt: true,
        createdAt: true,
      },
    });

    const total = await prisma.user.count();

    return reply.send({ users, total });
  });
}
