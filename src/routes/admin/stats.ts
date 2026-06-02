import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { getQueueStats } from "@/config/queue";

export async function registerStatsRoutes(server: FastifyInstance) {
  // API: Stats Overview (7-day charts)
  server.get("/api/stats/overview", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const revenueChart: { date: string; revenue: number }[] = [];
    const usersChart: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const [rev, newUsers] = await Promise.all([
        prisma.transaction.aggregate({
          where: { status: "success", createdAt: { gte: dayStart, lt: dayEnd } },
          _sum: { amountIdr: true },
        }),
        prisma.user.count({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);
      const label = dayStart.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      revenueChart.push({ date: label, revenue: Number(rev._sum.amountIdr || 0) });
      usersChart.push({ date: label, count: newUsers });
    }
    const [totalUsers, totalRevenue, todayRevenue, totalVideos, queueStats] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.aggregate({ where: { status: "success" }, _sum: { amountIdr: true } }),
      prisma.transaction.aggregate({ where: { status: "success", createdAt: { gte: today } }, _sum: { amountIdr: true } }),
      prisma.video.count(),
      getQueueStats(),
    ]);
    const usersByTier = (await prisma.$queryRaw`SELECT tier, COUNT(*)::int as count FROM users GROUP BY tier`) as { tier: string; count: number }[];
    const videosByStatus = (await prisma.$queryRaw`SELECT status, COUNT(*)::int as count FROM videos GROUP BY status`) as { status: string; count: number }[];
    const tierMap: Record<string, number> = {};
    for (const t of usersByTier) tierMap[t.tier] = t.count;
    const statusMap: Record<string, number> = {};
    for (const v of videosByStatus) statusMap[v.status] = v.count;
    return {
      users: { total: totalUsers, byTier: tierMap },
      revenue: { total: Number(totalRevenue._sum.amountIdr || 0), today: Number(todayRevenue._sum.amountIdr || 0) },
      videos: { total: totalVideos, byStatus: statusMap },
      queue: queueStats,
      charts: { revenue: revenueChart, newUsers: usersChart },
    };
  });
}
