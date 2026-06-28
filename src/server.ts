/**
 * Fastify Server Setup
 *
 * Configures and initializes the Fastify HTTP server with:
 * - View engine (EJS)
 * - Security headers
 * - CORS
 * - Route registration
 * - Error handlers
 */

import Fastify from "fastify";
import path from "path";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { healthCheckRoutes } from "@/routes/health";
import { webhookRoutes } from "@/routes/webhook";
import { adminRoutes } from "@/routes/admin";
import { webRoutes } from "@/routes/web";
import { agencyRoutes } from "@/routes/agency";
import { contentApiRoutes } from "@/routes/content-api";
import { youtubeDashboardRoutes } from "@/routes/youtube/dashboard.route";
import { ecosystemRoutes } from "@/routes/ecosystem";
import { analyticsRoutes } from "@/routes/analytics-api";
import { hermesContentRoutes } from "@/routes/hermes";
import type { Telegraf } from "telegraf";

/**
 * Create and configure Fastify server
 */
export function createServer(bot: Telegraf) {
  const app = Fastify({ logger: false });
  const config = getConfig();

  // Multipart file upload support
  app.register(require("@fastify/multipart"), {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
  });

  // Static files (dashboard, service worker, images)
  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/public/",
    cacheControl: true,
    maxAge: "1h",
  });


  // View engine
  app.register(fastifyView, {
    engine: { ejs },
    root: path.join(process.cwd(), "src", "views"),
    viewExt: "ejs",
  });

  // Correlation ID
  app.addHook("onRequest", async (request, _reply) => {
    const incomingId = request.headers["x-request-id"];
    const correlationId =
      (Array.isArray(incomingId) ? incomingId[0] : incomingId) ||
      require("crypto").randomUUID();
    const reqWithCorrelation = request as unknown as Record<string, unknown>;
    reqWithCorrelation.correlationId = correlationId;
  });

  // Security headers
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
  });

  // CORS
  const corsOrigin =
    config.CORS_ORIGIN || config.WEBHOOK_URL || config.WEB_APP_URL || "";

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && corsOrigin) {
      const allowedOrigins = corsOrigin
        .split(",")
        .map((o: string) => o.trim());
      if (allowedOrigins.includes(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        reply.header("Access-Control-Allow-Credentials", "true");
        reply.header("Vary", "Origin");
      }
    }
  });

  // CORS preflight
  app.options("/*", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && corsOrigin) {
      const allowedOrigins = corsOrigin
        .split(",")
        .map((o: string) => o.trim());
      if (allowedOrigins.includes(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        reply.header("Access-Control-Allow-Credentials", "true");
        reply.header("Access-Control-Max-Age", "86400");
      }
    }
    return reply.status(204).send();
  });

  return app;
}

/**
 * Register all routes on the Fastify server
 */
export async function registerRoutes(
  app: ReturnType<typeof Fastify>,
  bot: Telegraf,
): Promise<void> {
  const config = getConfig();

  logger.info("🌐 Setting up routes...");

  // Health check (no versioning)
  await app.register(healthCheckRoutes);

  // Webhooks (no versioning — external systems call these)
  await app.register(webhookRoutes, { bot });

  // Admin dashboard (no versioning — internal UI)
  await app.register(adminRoutes);

  // Public web pages (no versioning)
  await app.register(webRoutes);

  // API v1 routes
  await app.register(agencyRoutes, { prefix: "/api/v1" });
  await app.register(contentApiRoutes, { prefix: "/api/v1" });
  await app.register(ecosystemRoutes, { prefix: "/api/v1" });

  // Backward compatibility: also register at /api/ without version
  await app.register(agencyRoutes, { prefix: "/api" });
  await app.register(contentApiRoutes, { prefix: "/api" });

  // YouTube dashboard (internal)
  await app.register(youtubeDashboardRoutes);

  // Analytics API
  await app.register(analyticsRoutes);

  // Debug: test if routes register
  app.get("/api/test-analytics", async () => ({ status: "ok", message: "analytics route works" }));

  // HERMES content API
  await app.register(hermesContentRoutes, { prefix: "/api/hermes/content" });

  if (config.NODE_ENV === "test") {
    const testRoutes = require("./routes/test").default;
    await app.register(testRoutes);
    logger.info("🧪 Test routes registered");
  }

  logger.info("✅ Routes registered");
}

/**
 * Register error handlers (404, 500)
 */
export function registerErrorHandlers(
  app: ReturnType<typeof Fastify>,
): void {
  // 404 handler
  app.setNotFoundHandler((request: { headers: { accept?: string } }, reply: { status: (code: number) => { type: (t: string) => { send: (body: string) => unknown }; send: (body: unknown) => unknown } }) => {
    const wantsHtml = request.headers.accept?.includes("text/html");
    if (wantsHtml) {
      return reply
        .status(404)
        .type("text/html")
        .send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title>' +
            '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;text-align:center}.card{background:white;border-radius:16px;padding:40px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}a{color:#2563eb;text-decoration:none;font-weight:600}</style></head>' +
            '<body><div class="card"><h1>404</h1><p>Page not found</p><p><a href="/">Home</a> | <a href="/app">Web App</a></p></div></body></html>',
        );
    }
    return reply.status(404).send({ error: "Not Found" });
  });

  // 500 handler
  app.setErrorHandler((error: Error, request: { headers: { accept?: string } }, reply: { status: (code: number) => { type: (t: string) => { send: (body: string) => unknown }; send: (body: unknown) => unknown } }) => {
    app.log.error(error);
    const wantsHtml = request.headers.accept?.includes("text/html");
    if (wantsHtml) {
      return reply
        .status(500)
        .type("text/html")
        .send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title>' +
            '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;text-align:center}.card{background:white;border-radius:16px;padding:40px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}a{color:#2563eb;text-decoration:none;font-weight:600}</style></head>' +
            '<body><div class="card"><h1>500</h1><p>Something went wrong</p><p><a href="/">Home</a> | <a href="/app">Web App</a></p></div></body></html>',
        );
    }
    return reply.status(500).send({ error: "Internal Server Error" });
  });
}
