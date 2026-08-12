/**
 * Analytics API Route — Cross-platform content analytics.
 *
 * Provides endpoints for:
 * - Content performance metrics
 * - Platform breakdown
 * - Revenue tracking
 * - Engagement trends
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/analytics/overview ────────────────────────────
  app.get(
    "/api/analytics/overview",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, days = "30" } = req.query as {
          userId?: string;
          days?: string;
        };
        const daysNum = parseInt(days, 10) || 30;
        const since = new Date();
        since.setDate(since.getDate() - daysNum);

        const where = userId
          ? { userId: BigInt(userId), createdAt: { gte: since } }
          : { createdAt: { gte: since } };

        const [totalVideos, completedVideos, totalCredits] = await Promise.all([
          prisma.video.count({ where }),
          prisma.video.count({ where: { ...where, status: "completed" } }),
          prisma.video.aggregate({ where, _sum: { creditsUsed: true } }),
        ]);

        const byPlatform = await prisma.video.groupBy({
          by: ["platform"],
          where,
          _count: { id: true },
          _sum: { creditsUsed: true },
        });

        const byNiche = await prisma.video.groupBy({
          by: ["niche"],
          where,
          _count: { id: true },
        });

        const dailyTrend = (await prisma.$queryRawUnsafe(
          `
        SELECT DATE(created_at) as date, COUNT(*) as count, SUM(credits_used) as credits
        FROM videos
        WHERE created_at >= $1
        ${userId ? "AND user_id = $2" : ""}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
          ...(userId ? [since, BigInt(userId)] : [since]),
        )) as Array<{ date: string; count: bigint; credits: number }>;

        return {
          period: `${daysNum} days`,
          totals: {
            videos: totalVideos,
            completed: completedVideos,
            completion_rate:
              totalVideos > 0
                ? Math.round((completedVideos / totalVideos) * 100)
                : 0,
            credits_used: Number(totalCredits._sum.creditsUsed ?? 0),
          },
          by_platform: byPlatform.map((p) => ({
            platform: p.platform,
            count: p._count.id,
            credits: Number(p._sum.creditsUsed ?? 0),
          })),
          by_niche: byNiche.map((n) => ({
            niche: n.niche,
            count: n._count.id,
          })),
          daily_trend: dailyTrend.map((d) => ({
            date: d.date,
            count: Number(d.count),
            credits: Number(d.credits ?? 0),
          })),
        };
      } catch (err: unknown) {
        logger.error(
          `[Analytics] Overview error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return reply.status(500).send({ error: "Failed to fetch analytics" });
      }
    },
  );

  // ── GET /api/analytics/carousels ───────────────────────────
  app.get(
    "/api/analytics/carousels",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = req.query as { userId?: string };
        const where = userId ? { userId: BigInt(userId) } : {};

        // Query from Prisma client (carousel model)
        const carousels =
          (await (
            prisma as unknown as Record<
              string,
              { count: () => Promise<number> }
            >
          ).carousel?.count?.()) ?? 0;

        return {
          total_carousels: carousels,
          note: "Full carousel analytics available after carousel model is queried",
        };
      } catch (err: unknown) {
        logger.error(
          `[Analytics] Carousel error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return reply
          .status(500)
          .send({ error: "Failed to fetch carousel analytics" });
      }
    },
  );

  // ── GET /api/analytics/users ───────────────────────────────
  app.get(
    "/api/analytics/users",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const totalUsers = await prisma.user.count();
        const activeUsers = await prisma.user.count({
          where: {
            lastActivityAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });
        const byTier = await prisma.user.groupBy({
          by: ["tier"],
          _count: { id: true },
        });

        return {
          total_users: totalUsers,
          active_7d: activeUsers,
          by_tier: byTier.map((t) => ({ tier: t.tier, count: t._count.id })),
        };
      } catch (err: unknown) {
        logger.error(
          `[Analytics] Users error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return reply
          .status(500)
          .send({ error: "Failed to fetch user analytics" });
      }
    },
  );

  // ── GET /api/analytics/revenue ─────────────────────────────
  app.get(
    "/api/analytics/revenue",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { days = "30" } = req.query as { days?: string };
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days, 10));

        const transactions = await prisma.transaction.groupBy({
          by: ["type"],
          where: { createdAt: { gte: since }, status: "completed" },
          _sum: { amountIdr: true, creditsAmount: true },
          _count: { id: true },
        });

        return {
          period: `${days} days`,
          by_type: transactions.map((t) => ({
            type: t.type,
            transactions: t._count.id,
            revenue_idr: Number(t._sum.amountIdr ?? 0),
            credits: Number(t._sum.creditsAmount ?? 0),
          })),
        };
      } catch (err: unknown) {
        logger.error(
          `[Analytics] Revenue error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return reply
          .status(500)
          .send({ error: "Failed to fetch revenue analytics" });
      }
    },
  );
}
