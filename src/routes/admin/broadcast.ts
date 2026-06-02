import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { addNotificationJob } from "@/config/queue";
import { validate, broadcastBodySchema } from "@/utils/validation";

export async function registerBroadcastRoutes(server: FastifyInstance) {
  server.post("/api/broadcast", { preHandler: validate({ body: broadcastBodySchema }) }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { message: string; tier?: string };

    const where: any = { isBanned: false };
    if (body.tier) {
      where.tier = body.tier;
    }

    const users = await prisma.user.findMany({
      where,
      select: { telegramId: true },
    });

    await addNotificationJob({
      type: "broadcast",
      message: body.message,
      users: users.map((u) => u.telegramId.toString()),
    });

    return { success: true, recipientCount: users.length };
  });
}
