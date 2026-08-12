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
  // Basic health check (public — required for load balancers)
  server.get("/health", async () => {
    return {
      status: "healthy",
      version: process.env.npm_package_version || "3.0.0", // npm_package_version is injected by npm, not in AppConfig
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
}
