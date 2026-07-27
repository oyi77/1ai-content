/**
 * OpenClaw Bot - Main Entry Point
 *
 * Telegram bot + Fastify web server for BerkahKarya content platform.
 * Handles webhooks, admin dashboard, web app, and background workers.
 */

import "dotenv/config";

import { initConfig } from "@/config/env";
const appConfig = initConfig();

import { Telegraf } from "telegraf";
import Fastify from "fastify";
import path from "path";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import fastifyHttpProxy from "@fastify/http-proxy";
import fastifyCookie from "@fastify/cookie";
import { ApiError } from "@/utils/app-errors";
import { logger } from "@/utils/logger";
import { setupCommands } from "@/commands";
import { setupHandlers } from "@/handlers";
import { setupMiddleware } from "@/middleware";
import { healthCheckRoutes } from "@/routes/health";
import { webhookRoutes } from "@/routes/webhook";
import { adminRoutes } from "@/routes/admin";
import { webRoutes } from "@/routes/web";
import { agencyRoutes } from "@/routes/agency";
import { contentApiRoutes } from "@/routes/content-api";
import { youtubeDashboardRoutes } from "@/routes/youtube/dashboard.route";
import { ecosystemRoutes } from "@/routes/ecosystem";
import { PaymentService } from "@/services/payment.service";
import { initializeDatabase, prisma } from "@/config/database";
import { initializeRedis } from "@/config/redis";
import { initializeQueue } from "@/config/queue";
import { runSeeder } from "@/scripts/seed";
import { startVideoWorker } from "@/workers/video-generation.worker";
import { startAvatarTalkWorker } from "@/workers/avatar-talk.worker";
import {
  cleanupStuckVideos,
  setCleanupTelegram,
} from "@/workers/cleanup.worker";
import { startDailyReportWorker } from "@/workers/daily-report.worker";
import cron from "node-cron";
import { retentionQueue } from "@/workers/retention.worker";
import { UserService } from "@/services/user.service";
import { SubscriptionService } from "@/services/subscription.service";
import { setAlertTelegram, sendAdminAlert as sendGroupAlert } from "@/services/admin-alert.service";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { AdminConfigService } from "@/services/admin-config.service";
import axios from "axios";

// Set global axios defaults — all HTTP calls get 30s timeout by default
axios.defaults.timeout = 30_000;
axios.defaults.headers.common["User-Agent"] = "BerkahKarya-Bot/3.0";

// Initialize bot
const bot = new Telegraf(appConfig.BOT_TOKEN);
// Allow services to send proactive DMs
UserService.setBotInstance(bot);
PaymentService.setBotInstance(bot);
SubscriptionService.setBotInstance(bot);

// Global BigInt serializer patch (Prisma returns BigInt for telegramId)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BigInt JSON serialization polyfill
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

// Initialize Fastify server
export const app = Fastify({
  logger: false,
});

async function main() {
  const port = appConfig.PORT;

  try {
    const isPlaceholderToken = !appConfig.BOT_TOKEN || appConfig.BOT_TOKEN.startsWith("placeholder");
    logger.info("🚀 Starting OpenClaw Bot v3.0.0...");

    // Initialize database
    logger.info("📦 Initializing database...");
    await initializeDatabase();
    logger.info("✅ Database connected");

    // Seed pricing defaults (first run only)
    await PaymentSettingsService.initializePricingDefaults().catch(err => logger.error('Failed to initialize pricing defaults', { error: err.message }));
    await AdminConfigService.initializeDefaults().catch(err => logger.error('Failed to initialize admin config defaults', { error: err.message }));
    // Load API key DB overrides into process.env
    try {
      const apiKeyOverrides = await prisma.pricingConfig.findMany({ where: { category: 'api_keys' } });
      for (const row of apiKeyOverrides) {
        const val = String(row.value ?? '');
        if (val && val !== 'null') process.env[row.key] = val;
      }
      if (apiKeyOverrides.length) {
        initConfig(); // re-parse process.env so getConfig() picks up DB overrides
        logger.info(`[API Keys] Loaded ${apiKeyOverrides.length} DB overrides into process.env`);
      }
    } catch (e) { logger.warn('[API Keys] Could not load DB overrides:', (e as Error).message); }
    logger.info("✅ Pricing config ready");

    // Initialize Redis
    logger.info("💾 Initializing Redis...");
    await initializeRedis();
    logger.info("✅ Redis connected");

    // Run Seeder in background (non-blocking) — don't delay HTTP server startup
    runSeeder().catch(err => logger.error('[SEEDER] Background seeder failed:', err.message));

    // Initialize queue
    logger.info("📋 Initializing queue...");
    await initializeQueue();
    logger.info("✅ Queue initialized");

    // Start video generation worker
    try {
      if (isPlaceholderToken) {
        logger.warn("⚠️ Skipping video worker (placeholder BOT_TOKEN)");
      } else {
        startVideoWorker(bot);
        logger.info("✅ Video generation worker started");
      }
    } catch (workerErr) {
      logger.warn(
        "⚠️ Video worker failed to start, falling back to direct async:",
        workerErr,
      );
    }

    // Start avatar talk worker
    try {
      if (isPlaceholderToken) {
        logger.warn("⚠️ Skipping avatar talk worker (placeholder BOT_TOKEN)");
      } else {
        startAvatarTalkWorker(bot);
        logger.info("✅ Avatar talk worker started");
      }
    } catch (avatarWorkerErr) {
      logger.warn("⚠️ Avatar talk worker failed to start:", avatarWorkerErr);
    }

    // Start daily report worker (sends activity report at 00:00 WIB)
    try {
      if (isPlaceholderToken) {
        logger.warn("⚠️ Skipping daily report worker (placeholder BOT_TOKEN)");
      } else {
        startDailyReportWorker(bot);
        logger.info("✅ Daily report worker started");
      }
    } catch (reportErr) {
      logger.warn("⚠️ Daily report worker failed to start:", reportErr);
    }

    // Retention cron: push check jobs every 6 hours
    try {
      cron.schedule("0 */6 * * *", async () => {
        logger.info("⏰ Running scheduled retention check...");
        await retentionQueue.add("scheduled_check", { type: "all", triggeredBy: "cron" });
      });
      logger.info("✅ Retention cron scheduled (every 6h)");
    } catch (cronErr) {
      logger.warn("⚠️ Retention cron failed to start:", cronErr);
    }

    // Subscription renewal cron: run daily at 00:05 WIB (17:05 UTC)
    try {
      cron.schedule("5 17 * * *", async () => {
        logger.info("⏰ Running subscription renewal/expiry check...");
        const count = await SubscriptionService.checkExpiredSubscriptions();
        if (count > 0) logger.info(`✅ Processed ${count} subscription(s)`);
      });
      logger.info("✅ Subscription renewal cron scheduled (daily 00:05 WIB)");
    } catch (cronErr) {
      logger.warn("⚠️ Subscription cron failed to start:", cronErr);
    }

    // Credit expiry cron: run daily at 00:00 WIB (17:00 UTC)
    try {
      cron.schedule("0 17 * * *", async () => {
        logger.info("⏰ Running credit expiry check...");
        const count = await UserService.expireStaleCredits(bot.telegram);
        if (count > 0) logger.info(`✅ Expired credits for ${count} user(s)`);
      });
      logger.info("✅ Credit expiry cron scheduled (daily 00:00 WIB)");
    } catch (cronErr) {
      logger.warn("⚠️ Credit expiry cron failed to start:", cronErr);
    }

    // Refund retry cron: process failed refunds every 5 minutes
    try {
      cron.schedule("*/5 * * * *", async () => {
        const count = await UserService.processRefundRetries();
        if (count > 0) logger.info(`✅ Processed ${count} refund retry(s)`);
      });
      logger.info("✅ Refund retry cron scheduled (every 5 min)");
    } catch (cronErr) {
      logger.warn("⚠️ Refund retry cron failed to start:", cronErr);
    }

    // Set telegram instance for cleanup notifications, admin alerts, and run startup cleanup
    if (!isPlaceholderToken) {
      setCleanupTelegram(bot.telegram);
      setAlertTelegram(bot.telegram);
    }
    if (appConfig.ADMIN_ALERT_CHAT_ID && !isPlaceholderToken) {
      sendGroupAlert('info', 'Bot Started', { version: 'v3.0', env: appConfig.NODE_ENV });
    }
    if (!isPlaceholderToken) {
      try {
        const stuckCount = await Promise.race([
          cleanupStuckVideos(bot.telegram),
          new Promise<number>((resolve) => setTimeout(() => resolve(0), 10000)),
        ]);
        if (stuckCount > 0) {
          logger.info(`✅ Startup cleanup: resolved ${stuckCount} stuck videos`);
        }
      } catch (cleanupErr) {
        logger.warn("⚠️ Startup stuck video cleanup failed:", cleanupErr);
      }
    } else {
      logger.warn("⚠️ Skipping startup cleanup (placeholder BOT_TOKEN)");
    }

    // Setup middleware
    logger.info("🔧 Setting up middleware...");
    setupMiddleware(bot);

    // Setup commands
    logger.info("⌨️  Setting up commands...");
    setupCommands(bot);

    // Setup handlers
    logger.info("👋 Setting up handlers...");
    setupHandlers(bot);

    // Multipart file upload support
    await app.register(require('@fastify/multipart'), {
      limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
    });

    // Setup routes
    logger.info("🌟 Setting up view engine...");
    await app.register(fastifyView, {
      engine: { ejs },
      root: path.join(process.cwd(), "src", "views"),
      viewExt: "ejs",
    });

    // Cookie parsing/setting support (for admin auth)
    await app.register(fastifyCookie);

    // ── Correlation ID — attach to request for downstream logging ──
    app.addHook('onRequest', async (request, _reply) => {
      const incomingId = request.headers['x-request-id'];
      const correlationId =
        (Array.isArray(incomingId) ? incomingId[0] : incomingId) ||
        require('crypto').randomUUID();
      const reqWithCorrelation = request as unknown as Record<string, unknown>;
      reqWithCorrelation.correlationId = correlationId;
    });

    // ── Security headers (onRequest so they're set before any response) ──
    app.addHook('onRequest', async (_request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
    });

    // ── CORS (onRequest to avoid conflicts with SSE/raw responses) ──
    const corsOrigin = appConfig.CORS_ORIGIN || appConfig.WEBHOOK_URL || appConfig.WEB_APP_URL || '';
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && corsOrigin) {
        const allowedOrigins = corsOrigin
          .split(",")
          .map((o: string) => o.trim());
        if (allowedOrigins.includes(origin)) {
          reply.header('Access-Control-Allow-Origin', origin);
          reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          reply.header('Access-Control-Allow-Credentials', 'true');
          reply.header('Vary', 'Origin');
        }
      }
    });

    // Handle CORS preflight
    app.options("/*", async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && corsOrigin) {
        const allowedOrigins = corsOrigin
          .split(",")
          .map((o: string) => o.trim());
        if (allowedOrigins.includes(origin)) {
          reply.header('Access-Control-Allow-Origin', origin);
          reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          reply.header('Access-Control-Allow-Credentials', 'true');
          reply.header('Access-Control-Max-Age', '86400');
        }
      }
      return reply.status(204).send();
    });

    // Reverse proxy /api/py/* to Python FastAPI server on port 8767
    await app.register(fastifyHttpProxy, {
      upstream: 'http://127.0.0.1:8767',
      prefix: '/api/py',
      rewritePrefix: '/',
      http: {},             // Force HTTP/1.1 (Node.js native) — undici's bodyTimeout kills SSE streams
      preHandler(request, _reply, done) {
        (request as any).raw.setTimeout(180_000);
        done();
      },
    });
    logger.info("🔄 /api/py reverse proxy registered");
    logger.info("🌐 Setting up routes...");
    await app.register(healthCheckRoutes);
    await app.register(webhookRoutes, { bot });
    await app.register(adminRoutes);
    await app.register(webRoutes);

    // React admin SPA static files (registered FIRST so sendFile decorator ties to this root)
    await app.register((await import('@fastify/static')).default, {
      root: path.join(process.cwd(), 'admin-ui', 'dist'),
      prefix: '/admin/react/',
      cacheControl: true,
      maxAge: '1h',
      wildcard: false,
    });

    // Static files (dashboard, sw.js, images) — decorateReply: false since sendFile already taken
    await app.register((await import('@fastify/static')).default, {
      root: path.join(process.cwd(), 'public'),
      prefix: '/public/',
      cacheControl: true,
      maxAge: '1h',
      decorateReply: false,
    });
    await app.register(agencyRoutes, { prefix: '/api' });
    await app.register(contentApiRoutes);
    await app.register(youtubeDashboardRoutes);
    await app.register(ecosystemRoutes);
    await app.register((await import('./routes/analytics-api.js')).analyticsRoutes);

    if (appConfig.NODE_ENV === 'test') {
      const testRoutes = require('./routes/test').default;
      await app.register(testRoutes);
      logger.info("🧪 Test routes registered");
    }

    logger.info("✅ Routes registered");

    // React admin SPA catch-all — serves index.html for SPA routes, actual files for assets
    const adminUiDist = path.join(process.cwd(), 'admin-ui', 'dist');
    app.get('/admin/react', async (_req, reply) => {
      return reply.sendFile('index.html');
    });
    app.get('/admin/react/*', async (request, reply) => {
      const relPath = (new URL(request.url, 'http://localhost').pathname).replace('/admin/react/', '');
      if (/\.[a-z0-9]+(\?|$)/i.test(relPath)) {
        return reply.sendFile(relPath, adminUiDist);
      }
      return reply.sendFile('index.html');
    });

    // 404 handler
    app.setNotFoundHandler((request, reply) => {
      const wantsHtml = request.headers.accept?.includes('text/html');
      if (wantsHtml) {
        return reply.status(404).type('text/html').send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title>' +
          '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;text-align:center}.card{background:white;border-radius:16px;padding:40px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}a{color:#2563eb;text-decoration:none;font-weight:600}</style></head>' +
          '<body><div class="card"><h1>404</h1><p>Page not found</p><p><a href="/">Home</a> | <a href="/app">Web App</a></p></div></body></html>'
        );
      }
      return reply.status(404).send({ error: 'Not Found' });
    });

    // 500 handler
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof ApiError) {
        return reply.status(error.statusCode).send({
          error: (error as {code: string}).code,
          message: (error as Error).message,
        });
      }
      app.log.error(error);
      const wantsHtml = request.headers.accept?.includes('text/html');
      if (wantsHtml) {
        return reply.status(500).type('text/html').send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title>' +
          '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;text-align:center}.card{background:white;border-radius:16px;padding:40px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}a{color:#2563eb;text-decoration:none;font-weight:600}</style></head>' +
          '<body><div class="card"><h1>500</h1><p>Something went wrong</p><p><a href="/">Home</a> | <a href="/app">Web App</a></p></div></body></html>'
        );
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    })

    // Start Fastify server FIRST (non-blocking)
    logger.info(`🌐 Starting HTTP server on port ${port}...`);
    app
      .listen({ port, host: "0.0.0.0" })
      .then(() => {
        logger.info(`✅ HTTP server listening on http://0.0.0.0:${port}`);
      })
      .catch((err) => {
        logger.error("❌ Failed to start HTTP server:", err);
      });

    // Start bot
    const webhookUrl = appConfig.WEBHOOK_URL;
    const forcePolling = appConfig.FORCE_POLLING;

    if (isPlaceholderToken) {
      logger.warn("⚠️ BOT_TOKEN is placeholder — skipping Telegram bot initialization (HTTP server will still start)");
    } else if (!forcePolling && appConfig.NODE_ENV === "production" && webhookUrl) {
      // In production, set Telegram webhook to point at our Fastify route
      try {
        const webhookSecret = appConfig.WEBHOOK_SECRET || "";
        const fullUrl = `${webhookUrl}/webhook/telegram`;
        await Promise.race([
          bot.telegram.setWebhook(fullUrl, { secret_token: webhookSecret }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("setWebhook timeout 10s")), 10000)),
        ]);
        logger.info(`🤖 Bot webhook set: ${fullUrl}`);
      } catch (webhookErr) {
        logger.warn(`⚠️ Failed to set Telegram webhook (${(webhookErr as Error).message}) — continuing without webhook`);
      }
    } else {
      if (forcePolling) {
        logger.info("🤖 FORCE_POLLING enabled - starting with polling mode...");
      } else {
        logger.info("🤖 Starting bot with polling...");
      }

      try {
        // Delete any existing webhook first
        await Promise.race([
          bot.telegram.deleteWebhook({ drop_pending_updates: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("deleteWebhook timeout 5s")), 5000)),
        ]).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await bot.launch();
        logger.info("✅ Bot polling started successfully");
      } catch (error) {
        logger.error("❌ Bot launch failed:", error);
        logger.warn(
          "Bot will continue without polling - check Telegram API conflicts",
        );
      }
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try { await bot.stop(signal); } catch (_) { /* ignore stop errors */ }
      try { await app.close(); } catch (_) { /* ignore close errors */ }
      logger.info("👋 Goodbye!");
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    // Admin alert for unhandled errors
    const adminIds =
      appConfig.ADMIN_TELEGRAM_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) || [];
    const sendAdminAlert = async (msg: string) => {
      for (const adminId of adminIds) {
        try {
          await bot.telegram.sendMessage(
            adminId,
            `🚨 *Bot Error Alert*\n\n${msg}`,
            { parse_mode: "Markdown" },
          );
        } catch (_) {
          /* silent */
        }
      }
    };

    process.on("unhandledRejection", (reason: unknown) => {
      const msg = (reason as { message?: string })?.message || String(reason);
      logger.error("unhandledRejection:", msg);
      if (!msg.includes("Bot is not running") && !msg.includes("SIGTERM")) {
        sendAdminAlert(`Unhandled rejection:\n\`${msg.slice(0, 300)}\``);
        sendGroupAlert('critical', 'Unhandled Rejection', { error: msg.slice(0, 300) });
      }
    });

    process.on("uncaughtException", (err) => {
      logger.error("uncaughtException:", err);
      sendAdminAlert(`Uncaught exception:\n\`${err.message.slice(0, 300)}\``);
      sendGroupAlert('critical', 'Uncaught Exception', { error: err.message.slice(0, 300) });
    });
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();