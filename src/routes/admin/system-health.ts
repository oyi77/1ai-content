import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { getConfig } from "@/config/env";
import { getTokenStats } from "@/services/token-tracker.service";

export async function registerSystemHealthRoutes(server: FastifyInstance) {
  // GET /api/system/health
  server.get("/api/system/health", async () => {
    const checks: Record<string, any> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok" };
    } catch (e: any) {
      checks.database = { status: "error", message: e.message };
    }
    try {
      await redis.ping();
      checks.redis = { status: "ok" };
    } catch (e: any) {
      checks.redis = { status: "error", message: e.message };
    }
    try {
      const token = getConfig().BOT_TOKEN;
      if (token) {
        const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const data = await res.json() as { ok?: boolean; result?: { url?: string; pending_update_count?: number; last_error_message?: string } };
        checks.webhook = {
          status: data.ok ? "ok" : "error",
          url: data.result?.url,
          pendingUpdates: data.result?.pending_update_count,
          lastError: data.result?.last_error_message,
        };
      }
    } catch (e: any) {
      checks.webhook = { status: "error", message: e.message };
    }
    return {
      status: Object.values(checks).every((c: any) => c.status === "ok") ? "healthy" : "degraded",
      checks,
      environment: getConfig().NODE_ENV,
      version: "3.0.0",
      uptime: process.uptime(),
    };
  });

  // GET /api/token-stats
  server.get("/api/token-stats", async (request) => {
    const { days = "7" } = request.query as { days?: string };
    const daysCapped = Math.min(Math.max(1, parseInt(days) || 7), 90);
    return getTokenStats(daysCapped);
  });
}
