import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { getConfig } from "@/config/env";
import { GamificationService, BADGES } from "@/services/gamification.service";
import { retentionQueue } from "@/workers/retention.worker";
import { HOOK_VARIATIONS } from "@/services/campaign.service";
import { CREDIT_PACKAGES_V3, SUBSCRIPTION_PLANS_V3, UNIT_COSTS, COMMISSIONS } from "@/config/packages";
import { INDUSTRY_TEMPLATES, DURATION_PRESETS } from "@/config/hpas-engine";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const retentionTriggerSchema = zodToJsonSchema(z.object({
  type: z.enum(["dormancy", "reengagement", "winback", "upgrade"]),
}), "retentionTrigger");

export async function registerV3Routes(server: FastifyInstance) {
  // ── v3.0 Gamification ──

  /** GET /api/v3/gamification/leaderboard */
  server.get("/api/v3/gamification/leaderboard", async () => {
    const leaderboard = await GamificationService.getWeeklyLeaderboard();
    return {
      leaderboard,
      formattedMessage:
        GamificationService.formatLeaderboardMessage(leaderboard),
    };
  });

  /** GET /api/v3/gamification/badges */
  server.get("/api/v3/gamification/badges", async () => {
    const badgeCounts = await prisma.userBadge.groupBy({
      by: ["badgeId"],
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
    });
    return {
      badges: Object.values(BADGES),
      stats: badgeCounts,
    };
  });

  // ── v3.0 Retention ──

  /** GET /api/v3/retention/stats */
  server.get("/api/v3/retention/stats", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stats = await prisma.retentionLog.groupBy({
      by: ["triggerType"],
      _count: { id: true },
      where: { sentAt: { gte: sevenDaysAgo } },
      orderBy: { _count: { id: "desc" } },
    });
    const total = await prisma.retentionLog.count({
      where: { sentAt: { gte: sevenDaysAgo } },
    });
    return { stats, total, period: "7d" };
  });

  /** POST /api/v3/retention/trigger — Manual trigger for testing */
  server.post("/api/v3/retention/trigger", {
    schema: { body: retentionTriggerSchema },
  }, async (request, reply) => {
    const { type } = request.body as { type: string };
    try {
      await retentionQueue.add("run_checks", { type });
      return { queued: true, type };
    } catch (error: any) {
      return reply
        .status(500)
        .send({ error: "Failed to queue retention check" });
    }
  });

  // ── v3.0 User Gamification ──

  /** GET /api/v3/users/:id/gamification */
  server.get("/api/v3/users/:id/gamification", async (request: any, reply) => {
    try {
      const userId = BigInt(request.params.id);
      const [summary, streak, badges] = await Promise.all([
        GamificationService.getUserGamificationSummary(userId),
        prisma.userStreak.findUnique({ where: { userId } }),
        prisma.userBadge.findMany({ where: { userId } }),
      ]);
      return { summary, streak, badges };
    } catch (error: any) {
      return reply.status(404).send({ error: "User not found or invalid ID" });
    }
  });

  // ── v3.0 Campaign & Pricing ──

  /** GET /api/v3/campaign/hooks — List available hook variations */
  server.get("/api/v3/campaign/hooks", async () => {
    return { hooks: HOOK_VARIATIONS };
  });

  /** GET /api/v3/pricing — v3 pricing info */
  server.get("/api/v3/pricing", async () => {
    return {
      packages: CREDIT_PACKAGES_V3,
      subscriptions: SUBSCRIPTION_PLANS_V3,
      unitCosts: UNIT_COSTS,
      referralRates: COMMISSIONS,
    };
  });

  // ── v3.0 HPAS ──

  /** GET /api/v3/hpas/industries — List HPAS industry templates */
  server.get("/api/v3/hpas/industries", async () => {
    return {
      industries: Object.keys(INDUSTRY_TEMPLATES),
      presets: Object.values(DURATION_PRESETS).map((p) => ({
        id: p.id,
        name: p.name,
        totalSeconds: p.totalSeconds,
        creditCost: p.creditCost,
        scenesIncluded: p.scenesIncluded,
      })),
    };
  });

  // ── v3.0 Real-time SSE Stream ──

  /** GET /api/admin/sse — Real-time event stream */
  server.get("/api/admin/sse", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    try {
      const Redis = (await import("ioredis")).default;
      const subscriber = new Redis(getConfig().REDIS_URL, {
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });

      reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      subscriber.subscribe("admin_events", (err) => {
        if (err) {
          reply.raw.write(
            `data: ${JSON.stringify({ type: "error", message: "Subscribe failed" })}\n\n`,
          );
        }
      });

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          reply.raw.write(`data: ${message}\n\n`);
        } catch { /* client disconnected */ }
      });

      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat\n\n`);
        } catch { /* client disconnected */ }
      }, 30000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        try {
          subscriber.disconnect();
        } catch { /* already disconnected */ }
      });
    } catch (error: any) {
      reply.raw.write(
        `data: ${JSON.stringify({ type: "error", message: "SSE connection failed" })}\n\n`,
      );
      reply.raw.end();
    }
  });
}
