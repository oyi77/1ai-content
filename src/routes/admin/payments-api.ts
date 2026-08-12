import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";

export async function registerPaymentsApiRoutes(
  server: FastifyInstance,
): Promise<void> {
  /** GET /api/admin/payments — list recent transactions */
  server.get("/api/admin/payments", async (_request, reply) => {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderId: true,
        userId: true,
        type: true,
        amountIdr: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    });

    const total = await prisma.transaction.count();
    const revenueAgg = await prisma.transaction.aggregate({
      _sum: { amountIdr: true },
      where: { status: { in: ["PAID", "success"] } },
    });

    return reply.send({
      transactions: transactions.map((t) => ({
        ...t,
        userId: t.userId.toString(),
        amountIdr: t.amountIdr.toString(),
      })),
      total,
      totalRevenue: (revenueAgg._sum.amountIdr ?? 0).toString(),
    });
  });
}
