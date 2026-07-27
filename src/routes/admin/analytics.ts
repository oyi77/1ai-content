import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { MetricsService } from "@/services/metrics.service";
import { PROVIDER_CONFIG } from "@/config/providers";
import { getQueueStats } from "@/config/queue";
import { trackingVars } from "./shared";

export async function registerAnalyticsRoutes(server: FastifyInstance) {
  server.get("/admin/dashboard", async (_request, reply) => {
    return reply.redirect("/admin/react/dashboard");
  });

  // Calendar page
  server.get("/admin/calendar", async (_request, reply) => {
    return reply.view("admin/calendar.ejs", { ...trackingVars(), activePage: 'calendar', title: 'Content Calendar' }, { layout: 'admin/layout.ejs' });
  });

  // Trending scanner page
  server.get("/admin/trending", async (_request, reply) => {
    return reply.view("admin/trending.ejs", { ...trackingVars(), activePage: 'trending', title: 'Trending Scanner' }, { layout: 'admin/layout.ejs' });
  });

  // A/B Tests page
  server.get("/admin/ab-tests", async (_request, reply) => {
    return reply.view("admin/ab-tests.ejs", { ...trackingVars(), activePage: 'ab-tests', title: 'A/B Tests' }, { layout: 'admin/layout.ejs' });
  });

  // Carousel page
  server.get("/admin/carousel", async (_request, reply) => {
    return reply.view("admin/carousel.ejs", { ...trackingVars(), activePage: 'carousel', title: 'Carousel Generator' }, { layout: 'admin/layout.ejs' });
  });

  // Re-Metadata page
  server.get("/admin/remeta", async (_request, reply) => {
    return reply.view("admin/remeta.ejs", { ...trackingVars(), activePage: 'remeta', title: 'Re-Metadata Engine' }, { layout: 'admin/layout.ejs' });
  });

  // Repurpose page
  server.get("/admin/repurpose", async (_request, reply) => {
    return reply.view("admin/repurpose.ejs", { ...trackingVars(), activePage: 'repurpose', title: 'Content Repurpose' }, { layout: 'admin/layout.ejs' });
  });

  // Research page
  server.get("/admin/research", async (_request, reply) => {
    return reply.view("admin/research.ejs", { ...trackingVars(), activePage: 'research', title: 'Book Research' }, { layout: 'admin/layout.ejs' });
  });



  // API: Analytics data (today's metrics, active users, provider health, top niches, recent errors)
  server.get("/api/analytics", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      metricsData,
      todayGenerations,
      todaySuccessful,
      todayRevenue,
      activeUsers24h,
      topNiches,
      recentErrors,
      providerHealthRows,
      queueStats,
    ] = await Promise.all([
      MetricsService.getAll(),
      prisma.video.count({ where: { createdAt: { gte: today } } }),
      prisma.video.count({
        where: { createdAt: { gte: today }, status: "completed" },
      }),
      prisma.transaction.aggregate({
        where: { status: "success", createdAt: { gte: today } },
        _sum: { amountIdr: true },
      }),
      prisma.user.count({
        where: {
          lastActivityAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.video.groupBy({
        by: ["niche"],
        _count: { niche: true },
        where: { createdAt: { gte: today } },
        orderBy: { _count: { niche: "desc" } },
        take: 10,
      }),
      prisma.video.findMany({
        where: {
          status: "failed",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: {
          jobId: true,
          errorMessage: true,
          niche: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.providerHealth.findMany(),
      getQueueStats(),
    ]);

    // Build circuit breaker states from Redis
    const cbStates: Record<string, any> = {};
    const providerKeys = Object.keys(PROVIDER_CONFIG.video);
    for (const key of providerKeys) {
      try {
        const raw = await redis.get(`cb:${key}`);
        if (raw) {
          cbStates[key] = JSON.parse(raw);
        } else {
          cbStates[key] = { state: "closed", failureCount: 0 };
        }
      } catch (_) {
        cbStates[key] = { state: "unknown", failureCount: 0 };
      }
    }

    const successRate =
      todayGenerations > 0
        ? Math.round((todaySuccessful / todayGenerations) * 100)
        : 0;

    return {
      today: {
        generations: todayGenerations,
        successful: todaySuccessful,
        successRate,
        revenue: Number(todayRevenue._sum.amountIdr || 0),
      },
      activeUsers24h,
      topNiches: topNiches.map((n) => ({
        niche: n.niche,
        count: n._count.niche,
      })),
      providerHealth: cbStates,
      providerHealthDB: providerHealthRows,
      recentErrors,
      metrics: metricsData,
      queue: queueStats,
    };
  });
}