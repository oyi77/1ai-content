/**
 * Dashboard API — React SPA data endpoint
 *
 * GET /api/admin/dashboard — returns AnalyticsData shape consumed by the React admin dashboard.
 * Separate from the EJS `analytics.ts` endpoint to avoid breaking existing EJS admin.
 */

import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { PROVIDER_CONFIG } from "@/config/providers";

/** Rough IDR→USD rate for dashboard display (not for accounting). Updated ~yearly. */
const IDR_TO_USD = 16500;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function yesterday(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function fiveMinutesAgo(): Date {
  return new Date(Date.now() - 5 * 60 * 1000);
}

/**
 * Map internal circuit-breaker / DB health status to the simplified three-state set
 * the React dashboard expects.
 */
function mapHealthState(cbState: string, dbStatus: string): "online" | "degraded" | "offline" {
  // Circuit breaker takes precedence — it reflects real-time liveness
  if (cbState === "closed") return "online";
  if (cbState === "half_open") return "degraded";
  if (cbState === "open") return "offline";

  // Fall back to DB status
  if (dbStatus === "healthy" || dbStatus === "online") return "online";
  if (dbStatus === "degraded") return "degraded";
  return "offline";
}

export async function registerDashboardRoutes(server: FastifyInstance) {
  server.get("/api/admin/dashboard", async () => {
    const today = startOfToday();
    const dayAgo = yesterday();

    const [
      newUsersToday,
      activeUserCount,
      txnsToday,
      revenueAgg,
      creditsAgg,
      activeUsersRows,
      topNiches,
      recentErrors,
      providerHealthRows,
    ] = await Promise.all([
      // New users registered since midnight
      prisma.user.count({ where: { createdAt: { gte: today } } }),

      // Active users in the last 24h
      prisma.user.count({ where: { lastActivityAt: { gte: dayAgo } } }),

      // Successful transactions today
      prisma.transaction.count({
        where: { status: "success", paidAt: { gte: today } },
      }),

      // Revenue from today's successful transactions
      prisma.transaction.aggregate({
        where: { status: "success", paidAt: { gte: today } },
        _sum: { amountIdr: true },
      }),

      // Credits consumed today
      prisma.video.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { creditsUsed: true },
      }),

      // Active users detail
      prisma.user.findMany({
        where: { lastActivityAt: { gte: dayAgo } },
        select: {
          uuid: true,
          username: true,
          firstName: true,
          lastName: true,
          tier: true,
          isBanned: true,
          lastActivityAt: true,
        },
        orderBy: { lastActivityAt: "desc" },
        take: 50,
      }),

      // Top niches today
      prisma.video.groupBy({
        by: ["niche"],
        where: { createdAt: { gte: today } },
        _count: { niche: true },
        orderBy: { _count: { niche: "desc" } },
        take: 10,
      }),

      // Recent errors (last 24h)
      prisma.video.findMany({
        where: {
          status: "failed",
          createdAt: { gte: dayAgo },
        },
        select: {
          jobId: true,
          errorMessage: true,
          niche: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      // Provider health from DB
      prisma.providerHealth.findMany(),
    ]);

    // Circuit breaker — real-time state per provider
    const cbStates: Record<string, string> = {};
    const providerKeys = Object.keys(PROVIDER_CONFIG.video);
    for (const key of providerKeys) {
      try {
        const raw = await redis.get(`cb:${key}`);
        if (raw) {
          cbStates[key] = JSON.parse(raw).state ?? "closed";
        } else {
          cbStates[key] = "closed";
        }
      } catch {
        cbStates[key] = "unknown";
      }
    }

    // Merge circuit breaker + DB into a single health map
    const healthMap = new Map<string, string>();
    for (const row of providerHealthRows) {
      healthMap.set(row.provider, row.status);
    }

    const providerHealth: Record<string, "online" | "degraded" | "offline"> = {};
    const allProviders = new Set([...providerKeys, ...healthMap.keys()]);
    for (const p of allProviders) {
      providerHealth[p] = mapHealthState(cbStates[p] ?? "closed", healthMap.get(p) ?? "healthy");
    }

    // Active users list with status
    const nowThreshold = fiveMinutesAgo();
    const activeUsersList = activeUsersRows.map((u) => ({
      id: u.uuid,
      username: u.username ?? u.firstName ?? `User #${u.uuid.slice(0, 8)}`,
      tier: u.tier,
      status: u.isBanned
        ? ("offline" as const)
        : (u.lastActivityAt && u.lastActivityAt >= nowThreshold ? "online" as const : "offline" as const),
      lastActivity: u.lastActivityAt?.toISOString() ?? new Date().toISOString(),
    }));

    return {
      todayMetrics: {
        newUsers: newUsersToday,
        activeUsers: activeUserCount,
        totalTransactions: txnsToday,
        revenue: (Number(revenueAgg._sum.amountIdr ?? 0) / IDR_TO_USD).toFixed(2),
        creditsUsed: Number(creditsAgg._sum.creditsUsed ?? 0),
      },
      activeUsersList,
      providerHealth,
      topNiches: topNiches.map((n) => ({
        name: n.niche,
        count: n._count.niche,
      })),
      recentErrors: recentErrors.map((e) => ({
        id: e.jobId,
        message: e.errorMessage ?? "Unknown error",
        source: e.niche,
        timestamp: e.createdAt.toISOString(),
        severity: "error" as const,
      })),
    };
  });
}
