/**
 * Health Check Routes
 *
 * API endpoints for health monitoring, provider status, and metrics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { getQueueStats } from "@/config/queue";
import { PROVIDER_CONFIG } from "@/config/providers";
import { MetricsService } from "@/services/metrics.service";
import { JobHeartbeatService } from "@/services/job-heartbeat.service";
import { getConfig } from "@/config/env";
import { timingSafeCompare } from "@/utils/crypto";
import { makeAdminToken } from "@/routes/admin/auth";

const adminCheck = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const provided =
    request.headers.authorization?.replace("Bearer ", "") ||
    (request.query as Record<string, string>).token;
  const expected = makeAdminToken(getConfig().ADMIN_PASSWORD);
  if (!provided || !timingSafeCompare(provided, expected)) {
    reply.status(401).send({ error: "Unauthorized" });
  }
};

/**
 * Register health check routes
 */
export async function healthCheckRoutes(
  server: FastifyInstance,
): Promise<void> {
  // ── Kubernetes-style liveness/readiness probes (public, no auth) ──
  // /livez: process is alive — always 200 if the event loop responds
  server.get("/livez", async (_req, reply) => {
    reply.type("text/plain").send("Ok");
  });

  // /healthz: liveness alias (Docker/k8s convention)
  server.get("/healthz", async (_req, reply) => {
    reply.type("text/plain").send("Ok");
  });

  // /readyz: dependencies ready — 200 if DB+Redis up, 503 if degraded
  server.get("/readyz", async (_req, reply) => {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    const ready =
      checks[0].status === "fulfilled" && checks[1].status === "fulfilled";
    reply
      .code(ready ? 200 : 503)
      .type("text/plain")
      .send(ready ? "Ok" : "Not ready");
  });

  // Basic health check (public — backward compat for load balancers)
  server.get("/health", async () => {
    return {
      status: "healthy",
      version: process.env.npm_package_version || "3.0.0",
      timestamp: new Date().toISOString(),
      environment: getConfig().NODE_ENV,
    };
  });

  // Database health check
  server.get("/health/db", { preHandler: [adminCheck] }, async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "healthy",
        service: "database",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      server.log.error(
        "Database health check failed: %s",
        (error as Error)?.message || error,
      );
      return {
        status: "unhealthy",
        service: "database",
        error: "Database connection failed",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Redis health check
  server.get("/health/redis", { preHandler: [adminCheck] }, async () => {
    try {
      await redis.ping();
      return {
        status: "healthy",
        service: "redis",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      server.log.error(
        "Redis health check failed: %s",
        (error as Error)?.message || error,
      );
      return {
        status: "unhealthy",
        service: "redis",
        error: "Redis connection failed",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Queue health check
  server.get("/health/queue", { preHandler: [adminCheck] }, async () => {
    try {
      const stats = await getQueueStats();
      return {
        status: "healthy",
        service: "queue",
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      server.log.error(
        "Queue health check failed: %s",
        (error as Error)?.message || error,
      );
      return {
        status: "unhealthy",
        service: "queue",
        error: "Queue check failed",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Comprehensive health check
  server.get("/health/all", { preHandler: [adminCheck] }, async () => {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
      getQueueStats(),
    ]);

    const [dbCheck, redisCheck, queueCheck] = checks;

    const allHealthy =
      dbCheck.status === "fulfilled" &&
      redisCheck.status === "fulfilled" &&
      queueCheck.status === "fulfilled";

    return {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: dbCheck.status === "fulfilled" ? "healthy" : "unhealthy",
        },
        redis: {
          status: redisCheck.status === "fulfilled" ? "healthy" : "unhealthy",
        },
        queue: {
          status: queueCheck.status === "fulfilled" ? "healthy" : "unhealthy",
          stats: queueCheck.status === "fulfilled" ? queueCheck.value : null,
        },
      },
    };
  });

  // ── Provider circuit breaker status ──
  server.get("/health/providers", { preHandler: [adminCheck] }, async () => {
    const CB_PREFIX = "cb:";

    const providerStatus = async (
      _type: "video" | "image",
      providers: Record<
        string,
        {
          name: string;
          priority: number;
          failureThreshold: number;
          recoveryTimeout: number;
        }
      >,
    ) => {
      const results: Record<string, any> = {};
      for (const [key, config] of Object.entries(providers)) {
        try {
          const raw = await redis.get(`${CB_PREFIX}${key}`);
          const state = raw
            ? JSON.parse(raw)
            : {
                state: "closed",
                failureCount: 0,
                lastFailure: null,
                lastSuccess: null,
              };

          results[key] = {
            name: config.name,
            priority: config.priority,
            circuitBreaker: {
              state: state.state,
              failureCount: state.failureCount,
              failureThreshold: config.failureThreshold,
              lastFailure: state.lastFailure
                ? new Date(state.lastFailure).toISOString()
                : null,
              lastSuccess: state.lastSuccess
                ? new Date(state.lastSuccess).toISOString()
                : null,
            },
          };
        } catch {
          results[key] = {
            name: config.name,
            priority: config.priority,
            circuitBreaker: { state: "unknown", error: "Failed to read state" },
          };
        }
      }
      return results;
    };

    const [videoProviders, imageProviders] = await Promise.all([
      providerStatus("video", PROVIDER_CONFIG.video),
      providerStatus("image", PROVIDER_CONFIG.image),
    ]);

    return {
      timestamp: new Date().toISOString(),
      video: videoProviders,
      image: imageProviders,
    };
  });

  // ── Metrics endpoint ──
  server.get("/metrics", { preHandler: [adminCheck] }, async (request) => {
    const query = request.query as Record<string, string>;
    const date = query.date || undefined;
    const metrics = await MetricsService.getAll(date);

    return {
      timestamp: new Date().toISOString(),
      ...metrics,
    };
  });

  // ── Stale-job detector ──
  // Flags "processing" videos whose worker heartbeat is missing/old.
  // Query params: staleAfterMin (default 10), limit (default 50).
  server.get("/health/jobs", { preHandler: [adminCheck] }, async (request) => {
    const query = request.query as Record<string, string>;
    const staleAfterMs =
      (parseInt(query.staleAfterMin || "10", 10) || 10) * 60 * 1000;
    const limit = Math.min(parseInt(query.limit || "50", 10) || 50, 200);
    const now = Date.now();

    const processing = await prisma.video.findMany({
      where: { status: "processing" },
      select: { jobId: true, progress: true, createdAt: true, userId: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const jobs = await Promise.all(
      processing.map(async (v) => {
        const hb = await JobHeartbeatService.get(v.jobId);
        const ageMs = hb ? now - hb.updatedAt : Infinity;
        return {
          jobId: v.jobId,
          progress: v.progress,
          stage: hb?.stage ?? null,
          provider: hb?.provider ?? null,
          retryCount: hb?.retryCount ?? 0,
          startedAt: hb?.startedAt
            ? new Date(hb.startedAt).toISOString()
            : v.createdAt.toISOString(),
          lastHeartbeat: hb ? new Date(hb.updatedAt).toISOString() : null,
          ageMs: ageMs === Infinity ? null : ageMs,
          stale: ageMs > staleAfterMs,
          failureReason: hb?.failureReason ?? null,
        };
      }),
    );

    const stale = jobs.filter((j) => j.stale);
    return {
      timestamp: new Date().toISOString(),
      staleAfterMin: staleAfterMs / 60000,
      processing: jobs.length,
      staleCount: stale.length,
      staleJobs: stale,
      jobs,
    };
  });
}
