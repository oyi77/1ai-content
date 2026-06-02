/**
 * Admin Dashboard - Web Interface
 *
 * Serves a web UI for bot management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { timingSafeCompare } from "@/utils/crypto";
import { prisma } from "@/config/database";
import { getQueueStats, addNotificationJob, videoQueue } from "@/config/queue";
import { paymentQueue, notificationQueue, cleanupQueue } from "@/config/queue";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { MetricsService } from "@/services/metrics.service";
import { redis } from "@/config/redis";
import { PROVIDER_CONFIG } from "@/config/providers";
import { GamificationService, BADGES } from "@/services/gamification.service";
import { retentionQueue } from "@/workers/retention.worker";
import { HOOK_VARIATIONS } from "@/services/campaign.service";
import {
  CREDIT_PACKAGES_V3,
  SUBSCRIPTION_PLANS_V3,
  UNIT_COSTS,
  REFERRAL_COMMISSIONS_V3,
} from "@/config/pricing";
import { INDUSTRY_TEMPLATES, DURATION_PRESETS } from "@/config/hpas-engine";
import { ProviderSettingsService } from "@/services/provider-settings.service";
import { AITaskSettingsService, AITaskSettings } from "@/services/ai-task-settings.service";
import { AIConfigService, AITasksConfig, AIPromptsConfig, AIChatConfig } from '@/services/ai-config.service';
import { CustomProviderService } from '@/services/custom-provider.service';
import { ProviderBalanceService } from "@/services/provider-balance.service";
import { getOmniRouteService } from "@/services/omniroute.service";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";
import { getConfig, getConfigForAdmin, initConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { validateBody, validate, PricingConfigSchema, PricingDeleteSchema, CustomProviderSchema, PromptSchema, idParamSchema, jobIdParamSchema, providerKeyParamSchema, creditsBodySchema, tierBodySchema, banBodySchema, broadcastBodySchema, cancelSubscriptionSchema, extendSubscriptionSchema, landingConfigSchema, pixelConfigSchema, referralSettingsSchema, apiKeySchema, interceptToggleSchema, interceptUploadSchema, interceptDeliverSchema, welcomeMessageSchema } from "@/utils/validation";
import { z } from "zod";
import { ImageGenerationService } from "@/services/image.service";
import { generateVideoWithFallback } from "@/services/video-fallback.service";
import { CircuitBreaker } from "@/services/circuit-breaker.service";
import { AdminConfigService } from "@/services/admin-config.service";
import { ExchangeRateService } from "@/services/exchange-rate.service";
import axios from "axios";
import { registerPricingRoutes } from "./admin/pricing";
import { registerInterceptRoutes } from "./admin/intercept";
import { registerNicheRoutes } from "./admin/niches";
import { registerFreeTrialRoutes } from "./admin/free-trial";
import { registerSystemSettingsRoutes } from "./admin/system-settings";
import { ConfigError } from '@/utils/app-errors';

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes in seconds

/** Pixel/analytics IDs passed to all EJS views */
function trackingVars() {
  const config = getConfig();
  return {
    fbPixelId: config.FACEBOOK_PIXEL_ID || "",
    ga4Id: config.GA4_TRACKING_ID || "",
    ttPixelId: config.TIKTOK_PIXEL_ID || "",
  };
}

/** HMAC-SHA256 token derived from ADMIN_PASSWORD — not trivially reversible unlike base64 */
function makeAdminToken(password: string): string {
  return crypto
    .createHmac("sha256", "openclaw-admin-v1")
    .update(password)
    .digest("hex");
}

async function verifyAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ADMIN_PASSWORD = getConfig().ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return reply.status(503).send({ error: "Admin password not configured" });
  }

  // 1) Basic auth header support (Authorization: Basic base64(admin:password))
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6).trim();
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator > -1) {
        const password = decoded.slice(separator + 1);
        if (timingSafeCompare(password, ADMIN_PASSWORD)) {
          return true;
        }
      }
    } catch {
      // Invalid base64/format -> continue to other auth methods
    }
  }

  // 2) Cookie token support (admin_token HMAC)
  const cookie = (request.headers.cookie || "")
    .split(";")
    .find((c) => c.trim().startsWith("admin_token="));
  if (cookie) {
    const token = cookie.split("=")[1]?.trim();
    if (token && timingSafeCompare(token, makeAdminToken(ADMIN_PASSWORD)))
      return true;
  }

  // 3) Query token support for integrations/debugging
  const queryToken = (request.query as { token?: string } | undefined)?.token;
  if (queryToken) {
    if (
      timingSafeCompare(queryToken, ADMIN_PASSWORD) ||
      timingSafeCompare(queryToken, makeAdminToken(ADMIN_PASSWORD))
    ) {
      return true;
    }
  }

  // Browser page loads should redirect to login; API calls get JSON 401
  const accept = request.headers.accept || "";
  if (accept.includes("text/html")) {
    reply.redirect("/admin/login");
  } else {
    reply.status(401).send({ error: "Unauthorized" });
  }
  return false;
}

function getQueueByName(name: string) {
  const queues: Record<string, typeof videoQueue> = {
    video: videoQueue,
    payment: paymentQueue,
    notification: notificationQueue,
    cleanup: cleanupQueue,
  };
  return queues[name];
}

/**
 * Register admin routes
 */
export async function adminRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    const url = request.url;
    // Exclude login page and login POST from auth
    if (url === "/admin/login" || url.startsWith("/admin/login?")) {
      return;
    }
    const isAdminRoute =
      url === "/admin" ||
      url === "/admin/dashboard" ||
      url === "/admin/pricing" ||
      url === "/admin/prompts" ||
      url === "/admin/settings" ||
      url === "/admin/users" ||
      url === "/admin/config" ||
      url === "/admin/system" ||
      url === "/admin/playground" ||
      url.startsWith("/api/stats") ||
      url.startsWith("/api/analytics") ||
      url.startsWith("/api/users") ||
      url.startsWith("/api/transactions") ||
      url.startsWith("/api/videos") ||
      url.startsWith("/api/broadcast") ||
      url.startsWith("/api/config") ||
      url.startsWith("/api/payment-settings") ||
      url.startsWith("/api/pricing") ||
      url.startsWith("/api/provider-costs") ||
      url.startsWith("/api/admin-prompts") ||
      url.startsWith("/api/token-stats") ||
      url.startsWith("/api/token-usage") ||
      url.startsWith("/api/profit-report") ||
      url.startsWith("/api/settings/") ||
      url.startsWith("/api/niches") ||
      url.startsWith("/api/personas") ||
      url === "/admin/personas" ||
      url.startsWith("/api/admin/") ||
      url.startsWith("/api/admin-config") ||
      url.startsWith("/api/referral/") ||
      url.startsWith("/api/queue/") ||
      url.startsWith("/api/subscriptions") ||
      url.startsWith("/api/interceptions") ||
      url.startsWith("/api/intercept/") ||
      url === "/admin/interceptions" ||
      (url.startsWith("/api/system/") && url !== "/api/system/health");
    if (isAdminRoute) {
      await verifyAdmin(request, reply);
    }
  });

  await registerPricingRoutes(server);
  await registerInterceptRoutes(server, verifyAdmin);
  await registerNicheRoutes(server, verifyAdmin);
  await registerFreeTrialRoutes(server, verifyAdmin);
  await registerSystemSettingsRoutes(server, verifyAdmin);

  // Login page (no auth required)
  server.get("/admin/login", async (_request, reply) => {
    return reply.view("admin/login.ejs");
  });

  // Admin dashboard (with auth) - redirect to dashboard if already logged in
  server.get("/admin", async (request, reply) => {
    const cookie = (request.headers.cookie || "")
      .split(";")
      .find((c) => c.trim().startsWith("admin_token="));
    if (cookie) {
      const token = cookie.split("=")[1]?.trim();
      if (
        token &&
        timingSafeCompare(token, makeAdminToken(getConfig().ADMIN_PASSWORD))
      ) {
        return reply.redirect("/admin/dashboard");
      }
    }
    return reply.redirect("/admin/login");
  });

  // Login POST endpoint (no auth required)
  server.post("/admin/login", async (request, reply) => {

    // IP-based brute-force rate limiting (5 attempts per 15 min)
    const ip = (
      (request.headers["x-forwarded-for"] as string) ||
      request.ip ||
      "unknown"
    )
      .split(",")[0]
      .trim();
    const rateLimitKey = `admin_login:${ip}`;
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts) >= LOGIN_RATE_LIMIT_MAX) {
      return reply
        .status(429)
        .send({ error: "Too many login attempts. Try again in 15 minutes." });
    }

    const ADMIN_PASSWORD = getConfig().ADMIN_PASSWORD;
    const { password } = request.body as { password: string };
    if (password && timingSafeCompare(password, ADMIN_PASSWORD)) {
      await redis.del(rateLimitKey);
      const token = makeAdminToken(ADMIN_PASSWORD);
      const secureSuffix =
        getConfig().NODE_ENV === "production" ? "; Secure" : "";
      return reply
        .header(
          "Set-Cookie",
          `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secureSuffix}`,
        )
        .send({ success: true });
    }

    // Record failed attempt
    const pipe = redis.pipeline();
    pipe.incr(rateLimitKey);
    pipe.expire(rateLimitKey, LOGIN_RATE_LIMIT_WINDOW);
    await pipe.exec();

    return reply.status(401).send({ error: "Wrong password" });
  });

  // API: Queue Management - Retry failed job
  server.post("/api/queue/retry/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { queue: queueName } = request.query as { queue?: string };
    const queue = queueName ? getQueueByName(queueName) : videoQueue;

    if (!queue) {
      return reply.status(400).send({ error: "Invalid queue name" });
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return reply.status(404).send({ error: "Job not found" });
      }

      await job.retry();
      return { success: true, jobId, action: "retry" };
    } catch (error: any) {
      return reply
        .status(500)
        .send({ error: `Failed to retry job: ${error.message}` });
    }
  });

  // API: Queue Management - Clean completed/failed jobs older than 24h
  server.post("/api/queue/clean", async (request, reply) => {
    const { queue: queueName, olderThanHours = 24 } = request.body as {
      queue?: string;
      olderThanHours?: number;
    };
    const queue = queueName ? getQueueByName(queueName) : videoQueue;

    if (!queue) {
      return reply.status(400).send({ error: "Invalid queue name" });
    }

    try {
      const timestamp = Date.now() - olderThanHours * 60 * 60 * 1000;
      const [cleanedCompleted, cleanedFailed] = await Promise.all([
        queue.clean(timestamp, 100, "completed"),
        queue.clean(timestamp, 100, "failed"),
      ]);
      return {
        success: true,
        cleaned: {
          completed: cleanedCompleted.length,
          failed: cleanedFailed.length,
        },
        olderThanHours,
        queue: queueName || "video",
      };
    } catch (error: any) {
      return reply
        .status(500)
        .send({ error: `Failed to clean queue: ${error.message}` });
    }
  });

  // API: Get stats
  server.get("/api/stats", async () => {
    const [users, transactions, videos, queueStats] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.count(),
      prisma.video.count(),
      getQueueStats(),
    ]);

    const revenue = await prisma.transaction.aggregate({
      where: { status: "success" },
      _sum: { amountIdr: true },
    });

    const metricsToday = await MetricsService.getAll();
    const trialDaily = metricsToday.metrics?.generation_trial_daily || 0;
    const trialWelcome = metricsToday.metrics?.generation_trial_welcome || 0;

    return {
      users,
      transactions,
      videos,
      revenue: Number(revenue._sum.amountIdr || 0),
      queue: queueStats,
      trialStats: {
        daily: trialDaily,
        welcome: trialWelcome,
        total: trialDaily + trialWelcome,
      },
    };
  });

  // API: List users
  server.get("/api/users", async (request, _reply) => {
    const query = request.query as {
      limit?: string;
      offset?: string;
      isBanned?: string;
      tier?: string;
    };
    const limit = Math.min(
      Math.max(1, parseInt(query.limit || "50") || 50),
      200,
    );
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);

    const where: any = {};
    if (query.isBanned === "true") where.isBanned = true;
    else if (query.isBanned === "false") where.isBanned = false;
    if (query.tier) where.tier = query.tier.toLowerCase();

    const users = await prisma.user.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        tier: true,
        creditBalance: true,
        isBanned: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });

    return users;
  });

  // API: Get user by ID
  server.get("/api/users/:id", async (request, reply) => {
    const params = request.params as { id: string };
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(params.id) },
        include: {
          transactions: { take: 10, orderBy: { createdAt: "desc" } },
          videos: { take: 10, orderBy: { createdAt: "desc" } },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return user;
    } catch (error: any) {
      return reply.status(400).send({ error: "Invalid user ID" });
    }
  });

  // API: Grant credits
  server.post("/api/users/:id/credits", { preHandler: validate({ params: idParamSchema, body: creditsBodySchema }) }, async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { amount: number; reason: string };

    try {
      const telegramId = BigInt(params.id);
      const user = await prisma.user.update({
        where: { telegramId },
        data: { creditBalance: { increment: body.amount } },
      });

      // Create audit trail — Transaction record for admin grants
      await prisma.transaction
        .create({
          data: {
            userId: user.telegramId,
            orderId: `ADMIN-GRANT-${Date.now()}`,
            type: "admin_grant",
            gateway: "admin",
            packageName: "admin_grant",
            amountIdr: 0,
            creditsAmount: body.amount,
            status: "success",
            metadata: {
              reason: body.reason || "Admin grant via dashboard",
              grantedBy: "admin_dashboard",
            },
          },
        })
        .catch((err: any) =>
          server.log.warn(
            { err },
            "Failed to create admin grant transaction record",
          ),
        );

      return { success: true, newBalance: user.creditBalance };
    } catch (error: any) {
      return reply.status(404).send({ error: "User not found or invalid ID" });
    }
  });

  // API: Ban/Unban user
  server.post("/api/users/:id/ban", { preHandler: validate({ params: idParamSchema, body: z.object({ banned: z.boolean(), reason: z.string().min(1).max(500), durationDays: z.number().int().min(0).max(3650).optional() }) }) }, async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { banned: boolean; reason?: string };

    try {
      const telegramId = BigInt(params.id);
      const user = await prisma.user.update({
        where: { telegramId },
        data: {
          isBanned: body.banned,
          banReason: body.reason,
          bannedAt: body.banned ? new Date() : null,
        },
      });

      // Keep intercept reads coherent immediately after ban/unban changes.
      try {
        const { InterceptService } = await import("../services/intercept.service.js");
        await InterceptService.invalidateCache(telegramId);
      } catch (err: any) {
        request.log.warn(
          { err, telegramId: telegramId.toString() },
          "Failed to invalidate intercept cache after ban toggle",
        );
      }

      return { success: true, isBanned: user.isBanned };
    } catch (error: any) {
      return reply.status(404).send({ error: "User not found or invalid ID" });
    }
  });

  // API: List transactions
  server.get("/api/transactions", async (request, _reply) => {
    const query = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(
      Math.max(1, parseInt(query.limit || "50") || 50),
      200,
    );
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { username: true, firstName: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total, offset, limit };
  });

  // API: List active subscriptions
  server.get("/api/subscriptions/active", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(
      Math.max(1, parseInt(query.limit || "50") || 50),
      200,
    );
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);

    const subscriptions = await prisma.subscription.findMany({
      where: { status: "active" },
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            telegramId: true,
            username: true,
            firstName: true,
            tier: true,
          },
        },
      },
    });

    return subscriptions.map((sub) => ({
      id: sub.id,
      userId: sub.userId,
      userTelegramId: sub.user.telegramId.toString(),
      userUsername: sub.user.username,
      userFirstName: sub.user.firstName,
      userTier: sub.user.tier,
      plan: sub.plan,
      billingCycle: sub.billingCycle,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      createdAt: sub.createdAt,
    }));
  });

  // API: Cancel subscription
  server.post("/api/subscriptions/:id/cancel", { preHandler: validate({ params: idParamSchema, body: cancelSubscriptionSchema }) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const subId = BigInt(id);

    const subscription = await prisma.subscription.findUnique({
      where: { id: subId },
    });

    if (!subscription) {
      return reply.status(404).send({ error: "Subscription not found" });
    }

    if (subscription.status !== "active") {
      return reply.status(400).send({ error: "Subscription is not active" });
    }

    await prisma.subscription.update({
      where: { id: subId },
      data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
    });

    return {
      success: true,
      message: "Subscription will be cancelled at period end",
    };
  });

  // API: Extend subscription
  server.post("/api/subscriptions/:id/extend", { preHandler: validate({ params: idParamSchema, body: extendSubscriptionSchema }) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { days?: number };
    const subId = BigInt(id);
    const days = Math.min(Math.max(1, body.days || 30), 365);

    const subscription = await prisma.subscription.findUnique({
      where: { id: subId },
    });

    if (!subscription) {
      return reply.status(404).send({ error: "Subscription not found" });
    }

    if (subscription.status !== "active") {
      return reply.status(400).send({ error: "Subscription is not active" });
    }

    const newPeriodEnd = new Date(subscription.currentPeriodEnd);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + days);

    await prisma.subscription.update({
      where: { id: subId },
      data: { currentPeriodEnd: newPeriodEnd },
    });

    return { success: true, newPeriodEnd: newPeriodEnd.toISOString() };
  });

  // API: List videos
  server.get("/api/videos", async (request, _reply) => {
    const query = request.query as { status?: string; limit?: string };
    const limit = Math.min(
      Math.max(1, parseInt(query.limit || "50") || 50),
      200,
    );

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const videos = await prisma.video.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { telegramId: true, username: true, firstName: true },
        },
      },
    });

    return videos.map((v: any) => ({
      id: Number(v.id),
      jobId: v.jobId,
      title: v.title,
      niche: v.niche,
      platform: v.platform,
      duration: v.duration,
      status: v.status,
      progress: v.progress,
      errorMessage: v.errorMessage,
      creditsUsed: v.creditsUsed ? Number(v.creditsUsed) : 0,
      thumbnailUrl: v.thumbnailUrl || null,
      videoUrl: v.videoUrl || null,
      downloadUrl: v.downloadUrl || null,
      finalProvider: v.finalProvider || null,
      providerChain: v.providerChain || [],
      storyboard: v.storyboard || null,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      user: v.user ? {
        telegramId: v.user.telegramId?.toString(),
        username: v.user.username,
        firstName: v.user.firstName,
      } : null,
    }));
  });

  // API: Broadcast message
  server.post("/api/broadcast", { preHandler: validate({ body: broadcastBodySchema }) }, async (request, reply) => {
    const body = request.body as { message: string; tier?: string };

    const where: any = { isBanned: false };
    if (body.tier) {
      where.tier = body.tier;
    }

    const users = await prisma.user.findMany({
      where,
      select: { telegramId: true },
    });

    await addNotificationJob({
      type: "broadcast",
      message: body.message,
      users: users.map((u) => u.telegramId.toString()),
    });

    return { success: true, recipientCount: users.length };
  });

  // API: Get config — returns all env vars grouped by concern with secrets masked
  server.get("/api/config", async (_request, reply) => {
    return reply.send(getConfigForAdmin());
  });

  // Admin config view page
  server.get("/admin/config", async (_request, reply) => {
    return reply.redirect("/admin/settings#runtime");
  });

  // Admin playground view page
  server.get("/admin/playground", async (_request, reply) => {
    const omni = getOmniRouteService();
    const models = await omni.listModels().catch(() => []);
    return reply.view("admin/playground.ejs", {
      ...trackingVars(),
      activePage: 'playground',
      title: 'Model Playground',
      omniModels: models,
      videoProviders: Object.keys(PROVIDER_CONFIG.video),
      imageProviders: Object.keys(PROVIDER_CONFIG.image),
    }, { layout: 'admin/layout.ejs' });
  });

  // API: Playground — Text/Chat
  server.post("/api/admin/playground/text", async (request, reply) => {
    const { prompt, model } = request.body as {
      prompt: string;
      model?: string;
    };
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });
    const omni = getOmniRouteService();
    const result = await omni.chat("admin_playground", prompt, model);
    return result;
  });

  // API: Playground — Image Generation
  server.post("/api/admin/playground/image", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const prompt = body.prompt as string;
    const provider = body.provider as string | undefined;
    const aspectRatio = (body.aspectRatio as string) || "1:1";
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });

    // ImageGenerationService imported statically above
    const result = await ImageGenerationService.generateImage({
      prompt,
      category: "product",
      aspectRatio,
      // We bypass routing and force a specific provider for playground
      _forceProvider: provider,
    });

    return result;
  });

  // API: Playground — Video Generation
  server.post("/api/admin/playground/video", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const prompt = body.prompt as string;
    const provider = body.provider as string | undefined;
    const duration = (body.duration as number) || 5;
    const niche = (body.niche as string) || "fnb";
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });

    // generateVideoWithFallback imported statically above
    const result = await generateVideoWithFallback({
      prompt,
      duration,
      niche,
      aspectRatio: "9:16",
      // We bypass routing and force a specific provider for playground
      _forceProvider: provider,
    });

    return result;
  });

  // API: Get Landing Page Config
  server.get("/api/landing-config", async (_request, _reply) => {
    try {
      const data = await redis.get("admin:landing_config");
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  // API: Update Landing Page Config
  server.post("/api/landing-config", { preHandler: validate({ body: landingConfigSchema }) }, async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      await redis.set("admin:landing_config", JSON.stringify(body));
      return { success: true };
    } catch (error: any) {
      server.log.error({ error }, "Failed to update landing config");
      return reply.status(500).send({ error: "Failed to update config" });
    }
  });

  // API: Get payment settings
  server.get("/api/payment-settings", async () => {
    const flat = await PaymentSettingsService.getAllSettings();
    const defaultGateway = await PaymentSettingsService.getDefaultGateway();
    // Return structured settings: { midtrans: { enabled: true }, tripay: { enabled: true }, ... }
    const gateways = ["midtrans", "tripay", "duitku"];
    const settings: Record<string, { enabled: boolean }> = {};
    for (const gw of gateways) {
      settings[gw] = { enabled: flat[`${gw}_enabled`] !== "false" };
    }
    return { settings, defaultGateway };
  });

  // API: Update payment settings
  server.post("/api/payment-settings", async (request, reply) => {
    const body = request.body as {
      action: string;
      gateway?: string;
      value?: string;
    };

    try {
      if (body.action === "set_default") {
        await PaymentSettingsService.setDefaultGateway(body.gateway!);
        return { success: true };
      }

      if (body.action === "toggle_gateway") {
        const isEnabled = await PaymentSettingsService.isGatewayEnabled(
          body.gateway!,
        );
        await PaymentSettingsService.setGatewayEnabled(
          body.gateway!,
          !isEnabled,
        );
        return { success: true, enabled: !isEnabled };
      }

      return { error: "Unknown action" };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ── Pricing Management APIs ──

  server.get("/api/pricing/:category", async (request) => {
    const { category } = request.params as { category: string };
    // Return array format for frontend table rendering
    return prisma.pricingConfig.findMany({
      where: { category },
      orderBy: { key: "asc" },
    });
  });

  // ── Pricing Recommendation (admin tool) ──
  // Calculates minimum credit price per action based on actual API costs + target margin
  server.get("/api/pricing-recommendation", async () => {
    const USD_TO_IDR = getConfig().USD_TO_IDR_RATE;
    const margin = await PaymentSettingsService.getMarginPercent();
    const providerCosts =
      await PaymentSettingsService.getAllPricingByCategory("provider_cost");
    const unitCosts =
      await PaymentSettingsService.getAllPricingByCategory("unit_cost");

    // Average video provider cost per scene (across all enabled providers)
    const videoCosts = Object.values(providerCosts)
      .map((v: any) => v?.costUsd || v || 0)
      .filter((c: number) => c > 0);
    const avgVideoSceneCostUsd =
      videoCosts.length > 0
        ? videoCosts.reduce((a: number, b: number) => a + b, 0) /
          videoCosts.length
        : 0.04;
    const maxVideoSceneCostUsd =
      videoCosts.length > 0 ? Math.max(...videoCosts) : 0.08;

    // Vision/optimization overhead per generation
    const visionOverheadUsd = 0.006; // Gemini Vision analysis
    const optimizerOverheadUsd = 0.001; // Prompt optimizer per scene
    const voOverheadUsd = 0.001; // VO script generation

    // Calculate min price per action (in units, at target margin)
    const calcMinUnits = (totalCostUsd: number) => {
      const costIdr = totalCostUsd * USD_TO_IDR;
      // 1 unit = (cheapest package price / total units) = ~880 IDR/unit (at 499k/85 credits * 10)
      const idrPerUnit = 880;
      const minUnits = Math.ceil(costIdr / idrPerUnit / (1 - margin / 100));
      return minUnits;
    };

    const recommendations = {
      VIDEO_15S: {
        current: (unitCosts as Record<string, unknown>)?.VIDEO_15S as number || UNIT_COSTS.VIDEO_15S,
        apiCostUsd:
          5 * avgVideoSceneCostUsd + optimizerOverheadUsd * 5 + voOverheadUsd,
        apiCostUsdMax:
          5 * maxVideoSceneCostUsd + optimizerOverheadUsd * 5 + voOverheadUsd,
        minUnits: calcMinUnits(
          5 * maxVideoSceneCostUsd + optimizerOverheadUsd * 5 + voOverheadUsd,
        ),
        description: "15s video (5 scenes)",
      },
      VIDEO_30S: {
        current: (unitCosts as Record<string, unknown>)?.VIDEO_30S as number || UNIT_COSTS.VIDEO_30S,
        apiCostUsd:
          7 * avgVideoSceneCostUsd + optimizerOverheadUsd * 7 + voOverheadUsd,
        apiCostUsdMax:
          7 * maxVideoSceneCostUsd + optimizerOverheadUsd * 7 + voOverheadUsd,
        minUnits: calcMinUnits(
          7 * maxVideoSceneCostUsd + optimizerOverheadUsd * 7 + voOverheadUsd,
        ),
        description: "30s video (7 scenes)",
      },
      VIDEO_60S: {
        current: (unitCosts as Record<string, unknown>)?.VIDEO_60S as number || UNIT_COSTS.VIDEO_60S,
        apiCostUsd:
          7 * avgVideoSceneCostUsd * 2 +
          optimizerOverheadUsd * 7 +
          voOverheadUsd,
        apiCostUsdMax:
          7 * maxVideoSceneCostUsd * 2 +
          optimizerOverheadUsd * 7 +
          voOverheadUsd,
        minUnits: calcMinUnits(
          7 * maxVideoSceneCostUsd * 2 +
            optimizerOverheadUsd * 7 +
            voOverheadUsd,
        ),
        description: "60s video (7 scenes, 2x duration)",
      },
      IMAGE_UNIT: {
        current: (unitCosts as Record<string, unknown>)?.IMAGE_UNIT as number || UNIT_COSTS.IMAGE_UNIT,
        apiCostUsd: 0.003 + optimizerOverheadUsd,
        apiCostUsdMax: 0.04 + visionOverheadUsd + optimizerOverheadUsd,
        minUnits: calcMinUnits(0.04 + visionOverheadUsd + optimizerOverheadUsd),
        description: "Single image (worst case: img2img + vision)",
      },
      CLONE_STYLE: {
        current: (unitCosts as Record<string, unknown>)?.CLONE_STYLE as number || UNIT_COSTS.CLONE_STYLE,
        apiCostUsd:
          visionOverheadUsd + 7 * avgVideoSceneCostUsd + voOverheadUsd,
        apiCostUsdMax:
          visionOverheadUsd + 7 * maxVideoSceneCostUsd + voOverheadUsd,
        minUnits: calcMinUnits(
          visionOverheadUsd + 7 * maxVideoSceneCostUsd + voOverheadUsd,
        ),
        description: "Clone style (vision + 7-scene video)",
      },
      CAMPAIGN_5_VIDEO: {
        current:
          (unitCosts as Record<string, unknown>)?.CAMPAIGN_5_VIDEO as number || UNIT_COSTS.CAMPAIGN_5_VIDEO,
        apiCostUsd: 5 * (7 * avgVideoSceneCostUsd + voOverheadUsd),
        apiCostUsdMax: 5 * (7 * maxVideoSceneCostUsd + voOverheadUsd),
        minUnits: calcMinUnits(5 * (7 * maxVideoSceneCostUsd + voOverheadUsd)),
        description: "Campaign 5 scenes",
      },
    };

    return {
      usdToIdr: USD_TO_IDR,
      targetMarginPercent: margin,
      recommendations,
    };
  });

  // ── Pricing Dashboard ──

  server.get("/admin/pricing", async (_request, reply) => {
    return reply.view("admin/pricing.ejs", trackingVars());
  });

  // ── Prompt Management Dashboard ──

  server.get("/admin/prompts", async (_request, reply) => {
    return reply.view("admin/prompts.ejs", { ...trackingVars(), activePage: 'prompts', title: 'Prompt Management' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/settings", async (_request, reply) => {
    return reply.view("admin/settings.ejs", { ...trackingVars(), activePage: 'settings', title: 'Settings' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/interceptions", async (_request, reply) => {
    return reply.view("admin/interceptions.ejs", { ...trackingVars(), activePage: 'interceptions', title: 'Live Interceptions' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/users", async (_request, reply) => {
    return reply.redirect("/admin/dashboard#users");
  });

  // API: Get all admin prompts (global, visible to all users)
  server.get("/api/admin-prompts", async (request: FastifyRequest, _reply: FastifyReply) => {
    const niche = (request.query as Record<string, string>).niche;
    const prompts = await prisma.savedPrompt.findMany({
      where: {
        userId: BigInt(0), // userId=0 means admin/global prompt
        ...(niche ? { niche } : {}),
      },
      orderBy: [
        { niche: "asc" },
        { usageCount: "desc" },
        { createdAt: "desc" },
      ],
    });
    return prompts.map((p: any) => ({
      id: p.id,
      niche: p.niche,
      title: p.title,
      prompt: p.prompt,
      successRate: p.usageCount,
      createdAt: p.createdAt,
    }));
  });

  // API: Create admin prompt
  server.post("/api/admin-prompts", async (request: FastifyRequest, reply: FastifyReply) => {
    const { niche, title, prompt } = request.body as Record<string, string>;
    if (!niche || !title || !prompt) {
      return reply.status(400).send({ error: "niche, title, prompt required" });
    }
    const created = await prisma.savedPrompt.create({
      data: {
        userId: BigInt(0),
        niche: niche.toLowerCase(),
        title: title.slice(0, 100),
        prompt,
        source: "admin",
      },
    });
    return { ok: true, id: Number(created.id) };
  });

  // API: Update admin prompt
  server.put("/api/admin-prompts/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = parseInt((request.params as Record<string, string>).id);
    if (!Number.isInteger(id) || id <= 0)
      return reply.status(400).send({ error: "Invalid id" });
    const { title, prompt, niche } = request.body as Record<string, string>;
    try {
      await prisma.savedPrompt.update({
        where: { id },
        data: {
          ...(title ? { title } : {}),
          ...(prompt ? { prompt } : {}),
          ...(niche ? { niche } : {}),
        },
      });
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
  });

  // API: Delete admin prompt
  server.delete("/api/admin-prompts/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = parseInt((request.params as Record<string, string>).id);
    if (!Number.isInteger(id) || id <= 0)
      return reply.status(400).send({ error: "Invalid id" });
    try {
      await prisma.savedPrompt.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
  });

  // ── Stats Overview (7-day charts) ──

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
          where: {
            status: "success",
            createdAt: { gte: dayStart, lt: dayEnd },
          },
          _sum: { amountIdr: true },
        }),
        prisma.user.count({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);
      const label = dayStart.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
      });
      revenueChart.push({
        date: label,
        revenue: Number(rev._sum.amountIdr || 0),
      });
      usersChart.push({ date: label, count: newUsers });
    }
    const [totalUsers, totalRevenue, todayRevenue, totalVideos, queueStats] =
      await Promise.all([
        prisma.user.count(),
        prisma.transaction.aggregate({
          where: { status: "success" },
          _sum: { amountIdr: true },
        }),
        prisma.transaction.aggregate({
          where: { status: "success", createdAt: { gte: today } },
          _sum: { amountIdr: true },
        }),
        prisma.video.count(),
        getQueueStats(),
      ]);
    const usersByTier =
      (await prisma.$queryRaw`SELECT tier, COUNT(*)::int as count FROM users GROUP BY tier`) as { tier: string; count: number }[];
    const videosByStatus =
      (await prisma.$queryRaw`SELECT status, COUNT(*)::int as count FROM videos GROUP BY status`) as { status: string; count: number }[];
    const tierMap: Record<string, number> = {};
    for (const t of usersByTier) tierMap[t.tier] = t.count;
    const statusMap: Record<string, number> = {};
    for (const v of videosByStatus) statusMap[v.status] = v.count;
    return {
      users: { total: totalUsers, byTier: tierMap },
      revenue: {
        total: Number(totalRevenue._sum.amountIdr || 0),
        today: Number(todayRevenue._sum.amountIdr || 0),
      },
      videos: { total: totalVideos, byStatus: statusMap },
      queue: queueStats,
      charts: { revenue: revenueChart, newUsers: usersChart },
    };
  });

  // ── User Search ──

  server.get("/api/users/search", async (request) => {
    const { q, limit = "20" } = request.query as { q?: string; limit?: string };
    if (!q) return [];
    return prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: parseInt(limit),
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        tier: true,
        creditBalance: true,
        isBanned: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });
  });

  // ── Change User Tier ──

  server.patch("/api/users/:id/tier", { preHandler: validate({ params: idParamSchema, body: tierBodySchema }) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tier } = request.body as { tier: string };
    const validTiers = ["free", "basic", "lite", "pro", "agency"];
    if (!tier || !validTiers.includes(tier.toLowerCase()))
      return reply.status(400).send({ error: "Invalid tier" });
    try {
      const user = await prisma.user.update({
        where: { telegramId: BigInt(id) },
        data: { tier: tier.toLowerCase() },
      });
      return { success: true, tier: user.tier };
    } catch (error: any) {
      return reply.status(404).send({ error: "User not found or invalid ID" });
    }
  });

  // ── System Health ──

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
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getWebhookInfo`,
        );
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
      status: Object.values(checks).every((c: any) => c.status === "ok")
        ? "healthy"
        : "degraded",
      checks,
      environment: getConfig().NODE_ENV,
      version: "3.0.0",
      uptime: process.uptime(),
    };
  });

  // ── Token Usage Stats ──

  server.get("/api/token-stats", async (request) => {
    const { days = "7" } = request.query as { days?: string };
    const daysCapped = Math.min(Math.max(1, parseInt(days) || 7), 90);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getTokenStats } = require("../services/token-tracker.service");
    return getTokenStats(daysCapped);
  });

  server.get("/api/token-usage", async (request) => {
    const {
      limit = "50",
      provider,
      service,
    } = request.query as {
      limit?: string;
      provider?: string;
      service?: string;
    };
    const where: any = {};
    if (provider) where.provider = provider;
    if (service) where.service = service;
    return prisma.tokenUsage.findMany({
      where,
      take: Math.min(Math.max(1, parseInt(limit) || 50), 200),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        model: true,
        service: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costUsd: true,
        costIdr: true,
        createdAt: true,
      },
    });
  });

  // ── Analytics Dashboard ──

  server.get("/admin/dashboard", async (_request, reply) => {
    return reply.view("admin/analytics.ejs", { ...trackingVars(), activePage: 'dashboard', title: 'Dashboard' }, { layout: 'admin/layout.ejs' });
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
  // ── v3.0 Admin API Endpoints ───────────────────────────────────────────────

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
  server.post("/api/v3/retention/trigger", async (request: any, reply) => {
    const { type } = request.body as { type: string };
    if (!type) return reply.status(400).send({ error: "type required" });
    try {
      await retentionQueue.add("run_checks", { type });
      return { queued: true, type };
    } catch (error: any) {
      return reply
        .status(500)
        .send({ error: "Failed to queue retention check" });
    }
  });

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
      referralRates: REFERRAL_COMMISSIONS_V3,
    };
  });

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

  // ── v3.0 Real-time & Management ───────────────────────────────────────────

  /** GET /api/admin/sse — Real-time event stream */
  server.get("/api/admin/sse", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    try {
      // ioredis: create a new subscriber instance (duplicate() is node-redis v4, not ioredis)
      const Redis = (await import("ioredis")).default;
      const subscriber = new Redis(getConfig().REDIS_URL, {
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });

      // Send initial ping
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

      // Heartbeat every 30s to keep connection alive
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

  /** GET /api/admin/settings/providers — Dynamic provider overrides */
  server.get("/api/admin/settings/providers", async () => {
    const overrides = await ProviderSettingsService.getDynamicSettings();
    return { overrides };
  });

  /** POST /api/admin/settings/providers — Update dynamic provider overrides */
  server.post("/api/admin/settings/providers", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "Invalid settings object" });
    }

    await ProviderSettingsService.updateSettings(body as Parameters<typeof ProviderSettingsService.updateSettings>[0]);

    // Log the event for the SSE stream
    await redis.publish(
      "admin_events",
      JSON.stringify({
        type: "settings_updated",
        category: "providers",
        timestamp: new Date().toISOString(),
      }),
    );

    return { success: true };
  });

  // ── Provider Management ────────────────────────────────────────────────

  /** GET /admin/medias — Media Gallery page */
  server.get("/admin/medias", async (_request, reply) => {
    return reply.view("admin/medias.ejs", { ...trackingVars(), activePage: 'medias', title: 'Media Gallery' }, { layout: 'admin/layout.ejs' });
  });

  /** GET /admin/providers — Render providers management page */
  server.get("/admin/providers", async (_request, reply) => {
    return reply.view("admin/providers.ejs", { ...trackingVars(), activePage: 'providers', title: 'Provider Management' }, { layout: 'admin/layout.ejs' });
  });

  /** GET /admin/ai-config — AI Configuration page */
  server.get('/admin/ai-config', async (_request, reply) => {
    return reply.view('admin/ai-config.ejs', {
      ...trackingVars(),
      activePage: 'ai-config',
      title: 'AI Configuration',
    }, { layout: 'admin/layout.ejs' });
  });

  /** GET /api/admin/providers/all — Full provider list with health + overrides + env status */
  server.get("/api/admin/providers/all", async () => {
    const overrides = await ProviderSettingsService.getDynamicSettings();
    const config = getConfig();
    const _cbPrefix = "cb:";

    // Build video provider list
    const videoProviders = Object.entries(PROVIDER_CONFIG.video).map(
      ([key, cfg]) => {
        const override = overrides.video?.[key];
        const _apiKeyVar = key.toUpperCase().replace(/ /g, "_") + "_API_KEY";
        // Map provider key to env var name
        const envVarMap: Record<string, string> = {
          byteplus: "BYTEPLUS_API_KEY",
          xai: "XAI_API_KEY",
          laozhang: "LAOZHANG_API_KEY",
          evolink: "EVOLINK_API_KEY",
          hypereal: "HYPEREAL_API_KEY",
          siliconflow: "SILICONFLOW_API_KEY",
          falai_video: "FALAI_API_KEY",
          falai: "FALAI_API_KEY",
          kie: "KIE_API_KEY",
          remotion: "NONE",
          piapi: "PIAPI_API_KEY",
          geminigen: "GEMINIGEN_API_KEY",
          lingyaai: "LINGYAAI_API_KEY",
          getgoapi: "GETGOAPI_API_KEY",
          apiyi: "APIYI_API_KEY",
          runware: "RUNWARE_API_KEY",
          wavespeed: "WAVESPEED_API_KEY",
          zai_video: "ZAI_API_KEY",
          omniroute: "OMNIROUTE_API_KEY",
        };
        const envKey = envVarMap[key] || "";
        const configRecord = config as Record<string, unknown>;
        const hasKey = envKey === "NONE" ? true : !!configRecord[envKey];
        return {
          key,
          type: "video",
          name: cfg.name,
          priority: override?.priority ?? cfg.priority,
          enabled: override?.enabled ?? true,
          hasApiKey: hasKey,
          strengths: cfg.strengths,
          quirks: cfg.quirks,
          avoid: cfg.avoid,
          maxDuration: cfg.maxDuration,
          supportsRefImage: cfg.supportsImg2Video,
        };
      },
    );

    // Build image provider list
    const imageProviders = Object.entries(PROVIDER_CONFIG.image).map(
      ([key, cfg]) => {
        const override = overrides.image?.[key];
        const envVarMap: Record<string, string> = {
          together: "TOGETHER_API_KEY",
          piapi: "PIAPI_API_KEY",
          segmind: "SEGMIND_API_KEY",
          geminigen: "GEMINIGEN_API_KEY",
          falai: "FALAI_API_KEY",
          laozhang: "LAOZHANG_API_KEY",
          siliconflow: "SILICONFLOW_API_KEY",
          evolink: "EVOLINK_API_KEY",
          nvidia: "NVIDIA_API_KEY",
          gemini: "GEMINI_API_KEY",
          replicate: "NONE",
          huggingface: "NONE",
          runware: "RUNWARE_API_KEY",
          wavespeed: "WAVESPEED_API_KEY",
          zai: "ZAI_API_KEY",
          omniroute: "OMNIROUTE_API_KEY",
        };
        const envKey = envVarMap[key] || "";
        const configRecord = config as Record<string, unknown>;
        const hasKey = envKey === "NONE" ? true : !!configRecord[envKey];
        return {
          key,
          type: "image",
          name: cfg.name,
          priority: override?.priority ?? cfg.priority,
          enabled: override?.enabled ?? true,
          hasApiKey: hasKey,
          strengths: cfg.strengths,
          quirks: cfg.quirks,
          costPerGenerationUsd: cfg.costPerGenerationUsd,
          supportsImg2Img: cfg.supportsImg2Img,
          supportsIPAdapter: cfg.supportsIPAdapter,
        };
      },
    );

    return { video: videoProviders, image: imageProviders };
  });

  /** GET /api/admin/providers/balances — Fetch balances for all providers */
  server.get("/api/admin/providers/balances", async () => {
    try {
      const balances = await ProviderBalanceService.fetchAllBalances();
      return { balances };
    } catch (err: any) {
      return { balances: [], error: err.message };
    }
  });

  /** GET /api/admin/providers/models — Fetch model lists for all providers */
  server.get("/api/admin/providers/models", async () => {
    try {
      const models = await ProviderBalanceService.fetchAllModels();
      return { models };
    } catch (err: any) {
      return { models: [], error: err.message };
    }
  });

  /** POST /api/admin/providers/:key/reset-cb — Reset circuit breaker for a provider */
  server.post("/api/admin/providers/:key/reset-cb", async (request, reply) => {
    const { key } = request.params as { key: string };
    try {
      // Atomic multi-delete avoids partial reset under concurrent admin actions.
      await redis
        .multi()
        .del(`cb:${key}`)
        .del(`provider:history:${key}:success`)
        .del(`provider:history:${key}:failure`)
        .exec();

      await redis.publish(
        "admin_events",
        JSON.stringify({
          type: "provider_cb_reset",
          provider: key,
          timestamp: new Date().toISOString(),
        }),
      );

      return { success: true, message: `Circuit breaker for ${key} reset` };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** POST /api/admin/providers/:key/test — Test provider connectivity */
  server.post("/api/admin/providers/:key/test", async (request, reply) => {
    const { key } = request.params as { key: string };
    try {
      const result = await ProviderBalanceService.testProvider(key);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /** POST /api/admin/providers/reset-all-cb — Reset all circuit breakers */
  server.post("/api/admin/providers/reset-all-cb", async () => {
    // CircuitBreaker imported statically above
    await CircuitBreaker.resetAll();
    return { success: true, message: "All circuit breakers reset" };
  });

  // ── AI Task Settings ───────────────────────────────────────────────────────

  /** GET /api/admin/ai-tasks/settings */
  server.get("/api/admin/ai-tasks/settings", async (_req, reply) => {
    const settings = await AITaskSettingsService.getSettings();
    return reply.send(settings);
  });

  /** POST /api/admin/ai-tasks/settings */
  server.post("/api/admin/ai-tasks/settings", async (request, reply) => {
    const body = request.body as Partial<AITaskSettings>;
    await AITaskSettingsService.updateSettings(body);
    return reply.send({ ok: true });
  });

  // ── AI Config API ──────────────────────────────────────────────────────────
  // GET /api/admin/ai-config
  server.get('/api/admin/ai-config', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const config = await AIConfigService.getFullConfig();
    return reply.send(config);
  });

  // POST /api/admin/ai-config/tasks
  server.post('/api/admin/ai-config/tasks', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as Partial<AITasksConfig>;
    await AIConfigService.updateTasksConfig(body);
    return reply.send({ ok: true });
  });

  // POST /api/admin/ai-config/prompts
  server.post('/api/admin/ai-config/prompts', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as Partial<AIPromptsConfig>;
    await AIConfigService.updatePromptsConfig(body);
    return reply.send({ ok: true });
  });

  // POST /api/admin/ai-config/chat
  server.post('/api/admin/ai-config/chat', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as Partial<AIChatConfig>;
    await AIConfigService.updateChatConfig(body);
    return reply.send({ ok: true });
  });

  // POST /api/admin/ai-config/reset (reset all to defaults)
  server.post('/api/admin/ai-config/reset', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    await AIConfigService.updateTasksConfig({});
    await AIConfigService.updatePromptsConfig({});
    await AIConfigService.updateChatConfig({});
    return reply.send({ ok: true });
  });

  // ── Custom Providers API ──────────────────────────────────────────────────
  // GET /api/admin/custom-providers
  server.get('/api/admin/custom-providers', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const providers = await CustomProviderService.getAll();
    return reply.send(providers);
  });

  // POST /api/admin/custom-providers
  server.post('/api/admin/custom-providers', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const data = await validateBody(request, reply, CustomProviderSchema);
    if (!data) return;
    const provider = await CustomProviderService.create(data);
    return reply.send(provider);
  });

  // PUT /api/admin/custom-providers/:id
  server.put('/api/admin/custom-providers/:id', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const data = request.body as Record<string, unknown>;
    const provider = await CustomProviderService.update(id, data as Parameters<typeof CustomProviderService.update>[1]);
    return reply.send(provider);
  });

  // DELETE /api/admin/custom-providers/:id
  server.delete('/api/admin/custom-providers/:id', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    await CustomProviderService.delete(id);
    return reply.send({ ok: true });
  });

  // POST /api/admin/custom-providers/:id/fetch-models
  server.post('/api/admin/custom-providers/:id/fetch-models', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const models = await CustomProviderService.fetchModels(id);
    return reply.send({ ok: true, count: models.length, models });
  });

  // POST /api/admin/custom-providers/:id/test
  server.post('/api/admin/custom-providers/:id/test', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) || {};
    const model = body.model as string | undefined;
    const result = await CustomProviderService.testProvider(id, model);
    return reply.send(result);
  });

  // POST /api/admin/custom-providers/:id/check-balance
  server.post('/api/admin/custom-providers/:id/check-balance', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const balance = await CustomProviderService.checkBalance(id);
      return reply.send({ success: true, balance });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // GET /api/admin/models-catalog
  // Proxies models.dev/api.json, shapes it into a flat array, caches 1h in Redis
  server.get('/api/admin/models-catalog', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;

    const CACHE_KEY = 'admin:models_catalog';
    const CACHE_TTL = 3600;

    // Try Redis cache first
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* fall through */ }

    // Fetch from models.dev
    const response = await axios.get('https://models.dev/api.json', { timeout: 15000 });
    const raw = response.data as Record<string, any>;

    // Fetch active API keys to filter
    const dbRows = await prisma.pricingConfig.findMany({ where: { category: 'api_keys' } });
    const dbMap: Record<string, string> = {};
    for (const row of dbRows) dbMap[row.key] = String(row.value ?? '');

    const hasKey = (keyName: string) => {
      const envVal = process.env[keyName] || '';
      const dbVal = dbMap[keyName] || '';
      return !!(dbVal || envVal);
    };

    const isProviderActive = (providerId: string) => {
      // Special cases based on the existing environment mappings
      const envVarMap: Record<string, string> = {
        byteplus: "BYTEPLUS_API_KEY",
        xai: "XAI_API_KEY",
        laozhang: "LAOZHANG_API_KEY",
        evolink: "EVOLINK_API_KEY",
        hypereal: "HYPEREAL_API_KEY",
        siliconflow: "SILICONFLOW_API_KEY",
        falai_video: "FALAI_API_KEY",
        falai: "FALAI_API_KEY",
        kie: "KIE_API_KEY",
        piapi: "PIAPI_API_KEY",
        geminigen: "GEMINIGEN_API_KEY",
        lingyaai: "LINGYAAI_API_KEY",
        getgoapi: "GETGOAPI_API_KEY",
        apiyi: "APIYI_API_KEY",
        runware: "RUNWARE_API_KEY",
        wavespeed: "WAVESPEED_API_KEY",
        zai: "ZAI_API_KEY",
        zai_video: "ZAI_API_KEY",
        omniroute: "OMNIROUTE_API_KEY",
        openai: "OPENAI_API_KEY",
        gemini: "GEMINI_API_KEY",
        groq: "GROQ_API_KEY",
        together: "TOGETHER_API_KEY",
        segmind: "SEGMIND_API_KEY",
        anthropic: "ANTHROPIC_API_KEY", // assuming standard mapping if added
      };

      const mappedKey = envVarMap[providerId];
      if (mappedKey) return hasKey(mappedKey);

      // Generic fallback: provider -> PROVIDER_API_KEY
      const fallbackKey = providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY';
      return hasKey(fallbackKey);
    };

    // Flatten into array
    const models: any[] = [];
    for (const [providerId, providerData] of Object.entries(raw)) {
      if (!providerData || typeof providerData !== 'object') continue;
      
      // Filter out providers we don't have configured API keys for
      if (!isProviderActive(providerId)) continue;

      const providerRecord = providerData as Record<string, unknown>;
      const providerName = (providerRecord.name as string) || providerId;
      const providerModels = providerRecord.models as Record<string, unknown>[] | undefined;
      if (!providerModels || typeof providerModels !== 'object') continue;
      for (const [modelId, modelData] of Object.entries(providerModels)) {
        if (!modelData || typeof modelData !== 'object') continue;
        const m = modelData as Record<string, unknown>;
        const modalities = m.modalities as Record<string, string[]> | undefined;
        const limits = m.limit as Record<string, number> | undefined;
        models.push({
          id: modelId,
          name: m.name || modelId,
          provider: providerId,
          providerName,
          family: m.family || '',
          vision: !!m.attachment,
          reasoning: !!m.reasoning,
          toolCall: !!m.tool_call,
          openWeights: !!m.open_weights,
          inputModalities: modalities?.input || ['text'],
          outputModalities: modalities?.output || ['text'],
          contextWindow: limits?.context || null,
          outputLimit: limits?.output || null,
          releaseDate: m.release_date || null,
        });
      }
    }

    // Sort: vision first, then by provider
    models.sort((a, b) => {
      if (a.vision !== b.vision) return a.vision ? -1 : 1;
      return a.provider.localeCompare(b.provider);
    });

    const result = { models, total: models.length, visionCount: models.filter(m => m.vision).length };

    try { await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL); } catch { /* non-fatal */ }

    return reply.send(result);
  });

  // ── Admin AI Chat ──────────────────────────────────────────────────────────
  const adminChatRateMap = new Map<
    string,
    { count: number; resetAt: number }
  >();

  server.post("/api/admin/ai-chat", async (request, reply) => {
    const ip = request.ip;
    const now = Date.now();
    const limit = adminChatRateMap.get(ip);
    if (limit && limit.resetAt > now) {
      if (limit.count >= 10) {
        return reply
          .status(429)
          .send({ error: "Rate limit: 10 messages per minute" });
      }
      limit.count++;
    } else {
      adminChatRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    }

    const { message, model: requestedModel } = request.body as { message?: string; model?: string };
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return reply.status(400).send({ error: "Message is required" });
    }
    if (message.length > 2000) {
      return reply
        .status(400)
        .send({ error: "Message too long (max 2000 chars)" });
    }

    // Gather live system context for the AI
    let systemContext = "";
    try {
      const [stats, providerOverrides, exchangeRate, profitData] =
        await Promise.all([
          prisma.user.count().then(async (userCount) => {
            const videoCount = await prisma.video.count();
            const txCount = await prisma.transaction.count({
              where: { status: "success" },
            });
            return { userCount, videoCount, txCount };
          }),
          ProviderSettingsService.getDynamicSettings(),
          redis.get("admin:exchange_rate"),
          prisma.transaction.aggregate({
            where: {
              status: "success",
              createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
            },
            _sum: { amountIdr: true },
            _count: true,
          }),
        ]);

      systemContext = `
LIVE SYSTEM CONTEXT (as of ${new Date().toISOString()}):
- Total users: ${stats.userCount}
- Total videos generated: ${stats.videoCount}
- Successful transactions: ${stats.txCount}
- Last 30d revenue: Rp ${Number(profitData._sum.amountIdr || 0).toLocaleString()} (${profitData._count} transactions)
- USD/IDR rate: ${exchangeRate || getConfig().USD_TO_IDR_RATE}
- Provider overrides: ${JSON.stringify(providerOverrides || {})}

ARCHITECTURE:
- Stack: Node.js + Telegraf + Fastify + Prisma + BullMQ + Redis
- Video pipeline: 9-tier provider fallback (BytePlus > XAI > LaoZhang > EvoLink > Hypereal > SiliconFlow > Fal.ai > Kie.ai > Remotion)
- Payment: Midtrans + Tripay + DuitKu gateways
- Pricing: Dynamic from DB (PricingConfig table), 1 Credit = 10 Units
- AI Chat: OmniRoute proxy to multiple LLM providers

You are an expert system administrator and architect for this platform. Give specific, actionable advice. Reference actual config values and stats when relevant.`;
    } catch {
      systemContext = "System context unavailable.";
    }

    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    const isDirectGemini = requestedModel && geminiModels.some(m => requestedModel.startsWith(m.split('-').slice(0,2).join('-')));
    const fullMessage = systemContext
      ? systemContext + "\n\nADMIN QUESTION: " + message.trim()
      : message.trim();

    // Direct Gemini call if user selected a Gemini model
    if (isDirectGemini) {
      try {
        const geminiKey = getConfig().GEMINI_API_KEY;
        if (!geminiKey) return reply.status(500).send({ error: "GEMINI_API_KEY not configured" });
        const geminiModel = requestedModel || 'gemini-2.0-flash';
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          { contents: [{ role: 'user', parts: [{ text: fullMessage }] }],
            systemInstruction: { parts: [{ text: 'You are an expert system administrator for a Telegram bot SaaS platform.' }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } },
          { timeout: 30000 }
        );
        const content = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!content) return reply.status(500).send({ error: "Gemini returned empty response" });
        return { reply: content, model: geminiModel };
      } catch (err: any) {
        return reply.status(500).send({ error: `Gemini error: ${err.message}` });
      }
    }

    const omni = getOmniRouteService();
    const sessionId = `admin_chat_${ip}`;
    const omniRecord = omni as unknown as Record<string, unknown>;
    const history = omniRecord.conversationHistory as Map<string, unknown> | undefined;
    const isFirstMessage = !history?.has(sessionId);
    const msgToSend = isFirstMessage ? fullMessage : message.trim();
    const result = await omni.chat(sessionId, msgToSend, requestedModel || undefined);

    if (!result.success) {
      // Auto-fallback to Gemini 2.0 Flash
      try {
        const geminiKey = getConfig().GEMINI_API_KEY;
        if (!geminiKey) throw new ConfigError('GEMINI_API_KEY');
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          { contents: [{ role: 'user', parts: [{ text: msgToSend }] }],
            systemInstruction: { parts: [{ text: 'You are an expert system administrator for a Telegram bot SaaS platform.' }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } },
          { timeout: 30000 }
        );
        const geminiContent = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (geminiContent) return { reply: geminiContent, model: 'gemini-2.0-flash (fallback)' };
      } catch (fallbackErr: any) {
        logger.warn('Gemini fallback also failed:', fallbackErr.message);
      }
      return reply.status(500).send({ error: "AI is temporarily unavailable. Check OMNIROUTE_API_KEY or GEMINI_API_KEY." });
    }

    return { reply: result.content, model: result.model };
  });

  // Clean up admin chat rate limits
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of adminChatRateMap) {
      if (val.resetAt <= now) adminChatRateMap.delete(key);
    }
  }, 300_000);

  /** GET /api/settings/landing — Landing page config */
  server.get("/api/settings/landing", async () => {
    const data = await redis.get("admin:landing_config");
    const base = data ? JSON.parse(data) : {};
    return {
      headline: base.headline || "",
      subheadline: base.subheadline || "",
      ctaText: base.ctaText || "",
      heroImageUrl: base.heroImageUrl || "",
      heroVideo: base.heroVideo || "",
      testimonials: base.testimonials || [],
      pricingNote: base.pricingNote || "",
      footerText: base.footerText || "",
      videoDuration: base.videoDuration || "60",
      botUsername:
        base.botUsername || getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
      proofStats: base.proofStats || [],
      problemCards: base.problemCards || [],
      solutionCards: base.solutionCards || [],
    };
  });

  /** POST /api/settings/landing — Update landing page config */
  server.post("/api/settings/landing", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "Invalid payload" });
    }
    const config = {
      headline: body.headline || "",
      subheadline: body.subheadline || "",
      ctaText: body.ctaText || "",
      heroImageUrl: body.heroImageUrl || "",
      heroVideo: body.heroVideo || "",
      testimonials: Array.isArray(body.testimonials) ? body.testimonials : [],
      pricingNote: body.pricingNote || "",
      footerText: body.footerText || "",
      videoDuration: body.videoDuration || "60",
      botUsername:
        body.botUsername || getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
      proofStats: Array.isArray(body.proofStats) ? body.proofStats : [],
      problemCards: Array.isArray(body.problemCards) ? body.problemCards : [],
      solutionCards: Array.isArray(body.solutionCards)
        ? body.solutionCards
        : [],
      updatedAt: new Date().toISOString(),
    };
    await redis.set("admin:landing_config", JSON.stringify(config));
    await redis.publish(
      "admin_events",
      JSON.stringify({
        type: "settings_updated",
        category: "landing",
        timestamp: new Date().toISOString(),
      }),
    );
    return { success: true };
  });

  /** POST /api/settings/seed-pricing — Seed pricing DB from static config (always updates to match code) */
  server.post("/api/settings/seed-pricing", async () => {
    const { PACKAGES, SUBSCRIPTION_PLANS, UNIT_COSTS } =
      await import("../config/pricing.js");
    let seeded = 0;

    // Seed credit packages — always update to match static config
    for (const pkg of PACKAGES) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "package", key: pkg.id } },
        update: { value: JSON.parse(JSON.stringify(pkg)) },
        create: { category: "package", key: pkg.id, value: JSON.parse(JSON.stringify(pkg)) },
      });
      seeded++;
    }

    // Seed subscription plans
    for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "subscription", key } },
        update: { value: JSON.parse(JSON.stringify(plan)) },
        create: { category: "subscription", key, value: JSON.parse(JSON.stringify(plan)) },
      });
      seeded++;
    }

    // Seed unit costs — use 'unit_cost' category with UPPERCASE keys (matches getUnitCostAsync)
    for (const [key, units] of Object.entries(UNIT_COSTS)) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "unit_cost", key } },
        update: { value: JSON.parse(JSON.stringify({ units, credits: (units as number) / 10 })) },
        create: {
          category: "unit_cost",
          key,
          value: JSON.parse(JSON.stringify({ units, credits: (units as number) / 10 })),
        },
      });
      seeded++;
    }

    // Clean up old 'video_credit' category entries (legacy wrong category)
    await prisma.pricingConfig.deleteMany({
      where: { category: "video_credit" },
    });

    // Seed global margin
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "global", key: "margin_percent" } },
      update: { value: 30 },
      create: { category: "global", key: "margin_percent", value: 30 },
    });
    seeded++;

    // Seed niches from static config
    const { NICHE_LIST } = await import("../config/niches.js");
    for (const niche of NICHE_LIST) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "niche", key: niche.id } },
        update: { value: JSON.parse(JSON.stringify(niche)) },
        create: { category: "niche", key: niche.id, value: JSON.parse(JSON.stringify(niche)) },
      });
      seeded++;
    }

    // Seed provider costs from PROVIDER_CONFIG (sync with code)
    const videoProviders = Object.entries(PROVIDER_CONFIG.video);
    const imageProviders = Object.entries(PROVIDER_CONFIG.image);

    for (const [key, cfg] of [...videoProviders, ...imageProviders]) {
      // Check if provider has costPerGenerationUsd defined
      const cfgRecord = cfg as unknown as Record<string, unknown>;
      const costUsd = cfgRecord.costPerGenerationUsd;
      if (costUsd !== undefined) {
        await prisma.pricingConfig.upsert({
          where: { category_key: { category: "provider_cost", key } },
          update: { value: JSON.parse(JSON.stringify({ costUsd })) },
          create: { category: "provider_cost", key, value: JSON.parse(JSON.stringify({ costUsd })) },
        });
        seeded++;
      }
    }

    PaymentSettingsService.clearPricingCache();
    return { success: true, seeded };
  });

  /** GET /api/settings/referral — Referral conversion rates */
  server.get("/api/settings/referral", async () => {
    const sellRate = await PaymentSettingsService.get("referral_sell_rate");
    const buyRate = await PaymentSettingsService.get("referral_buy_rate");
    return {
      sellRate: sellRate ? parseInt(sellRate) : 3000,
      buyRate: buyRate ? parseInt(buyRate) : 6000,
    };
  });

  /** POST /api/settings/referral — Update referral conversion rates */
  server.post("/api/settings/referral", async (request, reply) => {
    const body = request.body as { sellRate?: number; buyRate?: number };
    if (!body || (body.sellRate === undefined && body.buyRate === undefined)) {
      return reply.status(400).send({ error: "sellRate or buyRate required" });
    }
    if (body.sellRate !== undefined) {
      if (body.sellRate <= 0)
        return reply.status(400).send({ error: "sellRate must be positive" });
      await PaymentSettingsService.set(
        "referral_sell_rate",
        String(body.sellRate),
        "Referral commission → credits conversion rate (IDR/credit)",
      );
    }
    if (body.buyRate !== undefined) {
      if (body.buyRate <= 0)
        return reply.status(400).send({ error: "buyRate must be positive" });
      await PaymentSettingsService.set(
        "referral_buy_rate",
        String(body.buyRate),
        "Average credit buy rate used for referral calculations (IDR/credit)",
      );
    }
    return { success: true };
  });

  /** GET /api/profit-report — Revenue, costs, and profit breakdown */
  server.get("/api/profit-report", async (request) => {
    const { period = "30" } = request.query as Record<string, string>;
    const days = Math.min(Math.max(1, parseInt(period as string) || 30), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [revenue, costs] = await Promise.all([
      prisma.transaction.aggregate({
        where: { status: "success", createdAt: { gte: since } },
        _sum: { amountIdr: true },
        _count: true,
      }),
      prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { costUsd: true, costIdr: true },
        _count: true,
      }),
    ]);

    let dailyRevenue: any[] = [];
    let dailyCosts: any[] = [];
    try {
      dailyRevenue = await prisma.$queryRaw`
        SELECT DATE(created_at) as date,
               COALESCE(SUM(amount_idr), 0)::float as revenue_idr,
               COUNT(*)::int as transactions
        FROM transactions
        WHERE status = 'success' AND created_at >= ${since}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      dailyCosts = await prisma.$queryRaw`
        SELECT DATE(created_at) as date,
               COALESCE(SUM(cost_idr), 0)::float as cost_idr,
               COALESCE(SUM(cost_usd), 0)::float as cost_usd,
               COUNT(*)::int as api_calls
        FROM token_usage
        WHERE created_at >= ${since}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;
    } catch {
      /* raw queries may fail on some DB configs */
    }

    const totalRevenueIdr = Number(revenue._sum.amountIdr || 0);
    const totalCostUsd = Number(costs._sum.costUsd || 0);
    // Always derive IDR from USD × current exchange rate (cost_idr in DB may be stale/wrong)
    const currentRate = getConfig().USD_TO_IDR_RATE || 16000;
    const totalCostIdr = Math.round(totalCostUsd * currentRate);

    // Also fix daily costs — recalculate cost_idr from cost_usd
    const fixedDailyCosts = dailyCosts.map((d: any) => ({
      ...d,
      cost_idr: Math.round((d.cost_usd || 0) * currentRate),
    }));

    return {
      period: days,
      revenue: { totalIdr: totalRevenueIdr, transactions: revenue._count },
      costs: {
        totalUsd: totalCostUsd,
        totalIdr: totalCostIdr,
        apiCalls: costs._count,
      },
      profit: {
        totalIdr: totalRevenueIdr - totalCostIdr,
        marginPercent:
          totalRevenueIdr > 0
            ? Math.round(
                ((totalRevenueIdr - totalCostIdr) / totalRevenueIdr) * 100,
              )
            : 0,
      },
      daily: { revenue: dailyRevenue, costs: fixedDailyCosts },
      exchangeRate: currentRate,
    };
  });

  /** GET /api/transactions/transfers — P2P Transfer logs */
  server.get("/api/transactions/transfers", async () => {
    return prisma.transaction.findMany({
      where: { type: "transfer" },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true, firstName: true } },
      },
    });
  });

  /** GET /api/referral/pending-cashouts — List all pending cashout transactions for admin */
  server.get("/api/referral/pending-cashouts", async () => {
    return prisma.transaction.findMany({
      where: { type: "referral_cashout", status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            telegramId: true,
            username: true,
            firstName: true,
          },
        },
      },
    });
  });

  /** POST /api/referral/complete-cashout — Mark a pending cashout as completed and notify the user */
  server.post("/api/referral/complete-cashout", async (request, reply) => {
    const { transactionId } = request.body as { transactionId: string };
    if (!transactionId) {
      return reply.status(400).send({ error: "transactionId is required" });
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        orderId: transactionId,
        type: "referral_cashout",
        status: "pending",
      },
    });

    if (!transaction) {
      return reply
        .status(404)
        .send({ error: "Pending cashout transaction not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { orderId: transactionId },
        data: { status: "success", paidAt: new Date() },
      });

      await tx.commission.updateMany({
        where: { referrerId: transaction.userId, status: "pending_cashout" },
        data: { status: "withdrawn" },
      });
    });

    // Notify the user via Telegram DM
    const user = await prisma.user.findUnique({
      where: { telegramId: transaction.userId },
      select: { language: true },
    });
    const lang = user?.language || "id";
    const amount = Number(transaction.amountIdr).toLocaleString("id-ID");
    await UserService.sendMessage(
      transaction.userId,
      t("referral.cashout_completed", lang, { amount }),
      { parse_mode: "Markdown" },
    );

    return {
      success: true,
      transactionId,
      amount: Number(transaction.amountIdr),
    };
  });

  // ── ADMIN CONFIG (runtime configurable values) ──

  // GET /api/admin-config — get all runtime config by category
  server.get("/api/admin-config", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const categories = ['provider', 'ai_param', 'timeout', 'retry', 'queue', 'retention', 'rate_limit', 'hpas'];
    const result: Record<string, Record<string, any>> = {};
    for (const cat of categories) {
      result[cat] = await AdminConfigService.getCategory(cat);
    }
    return result;
  });

  // PUT /api/admin-config/:category/:key
  server.put("/api/admin-config/:category/:key", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { category, key } = request.params as { category: string; key: string };
    const { value } = request.body as { value: any };
    const allowedCategories = ['provider', 'ai_param', 'timeout', 'retry', 'queue', 'retention', 'rate_limit', 'hpas'];
    if (!allowedCategories.includes(category)) {
      return reply.status(400).send({ error: 'Invalid category' });
    }
    await AdminConfigService.set(category, key, value);
    return { ok: true };
  });

  // DELETE /api/admin-config/:category/:key — reset to default
  server.delete("/api/admin-config/:category/:key", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { category, key } = request.params as { category: string; key: string };
    await AdminConfigService.reset(category, key);
    return { ok: true };
  });

  // ── API KEY MANAGEMENT ────────────────────────────────────────────────────

  const API_KEY_REGISTRY: Record<string, string> = {
    BOT_TOKEN: 'Telegram Bot Token', ADMIN_PASSWORD: 'Admin Password',
    DATABASE_URL: 'Database URL', REDIS_URL: 'Redis URL',
    WEBHOOK_URL: 'Webhook URL', WEBHOOK_SECRET: 'Webhook Secret',
    OMNIROUTE_API_KEY: 'OmniRoute', OMNIROUTE_URL: 'OmniRoute URL',
    GEMINI_API_KEY: 'Google Gemini', OPENAI_API_KEY: 'OpenAI',
    XAI_API_KEY: 'xAI (Grok)', GROQ_API_KEY: 'Groq', AGENTROUTER_API_KEY: 'AgentRouter',
    BYTEPLUS_API_KEY: 'BytePlus', LAOZHANG_API_KEY: 'LaoZhang',
    EVOLINK_API_KEY: 'EvoLink', HYPEREAL_API_KEY: 'Hypereal',
    SILICONFLOW_API_KEY: 'SiliconFlow', FALAI_API_KEY: 'Fal.ai',
    KIE_API_KEY: 'Kie.ai', PIAPI_API_KEY: 'PiAPI', GEMINIGEN_API_KEY: 'GeminiGen',
    LINGYAAI_API_KEY: 'LingyaAI', GETGOAPI_API_KEY: 'GetGoAPI', APIYI_API_KEY: 'APIyi',
    ZAI_API_KEY: 'Z.ai', DID_API_KEY: 'D-ID', RUNWARE_API_KEY: 'Runware',
    WAVESPEED_API_KEY: 'WaveSpeed', TOGETHER_API_KEY: 'Together AI',
    SEGMIND_API_KEY: 'Segmind', NVIDIA_API_KEY: 'NVIDIA',
    MIDTRANS_SERVER_KEY: 'Midtrans Server', MIDTRANS_CLIENT_KEY: 'Midtrans Client',
    TRIPAY_API_KEY: 'Tripay', TRIPAY_PRIVATE_KEY: 'Tripay Private',
    DUITKU_MERCHANT_CODE: 'DuitKu Merchant', DUITKU_API_KEY: 'DuitKu',
    NOWPAYMENTS_API_KEY: 'NOWPayments',
    AWS_ACCESS_KEY_ID: 'AWS Access Key', AWS_SECRET_ACCESS_KEY: 'AWS Secret',
    AWS_S3_BUCKET: 'AWS S3 Bucket', R2_ACCESS_KEY_ID: 'R2 Access Key',
    R2_SECRET_ACCESS_KEY: 'R2 Secret', R2_BUCKET_NAME: 'R2 Bucket', R2_ENDPOINT: 'R2 Endpoint',
    USD_TO_IDR_RATE: 'USD→IDR Rate',
  };

  function maskKey(v: string): string {
    if (!v) return '';
    if (v.length <= 10) return '***';
    return v.slice(0, 6) + '***' + v.slice(-4);
  }

  server.get('/api/admin/api-keys', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const dbRows = await prisma.pricingConfig.findMany({ where: { category: 'api_keys' } });
    const dbMap: Record<string, string> = {};
    for (const row of dbRows) dbMap[row.key] = String(row.value ?? '');
    return Object.entries(API_KEY_REGISTRY).map(([k, label]) => {
      const envVal = process.env[k] || '';
      const dbVal = dbMap[k] || '';
      const effective = dbVal || envVal;
      return { key: k, label, masked: maskKey(effective), hasValue: !!effective, source: dbVal ? 'db' : (envVal ? 'env' : 'none') };
    });
  });

  server.put('/api/admin/api-keys/:name', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { name } = request.params as { name: string };
    const { value } = request.body as { value?: string };
    if (!API_KEY_REGISTRY[name]) return reply.status(400).send({ error: 'Unknown key' });
    if (!value?.trim()) return reply.status(400).send({ error: 'Value required' });
    const trimmed = value.trim();
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'api_keys', key: name } },
      create: { category: 'api_keys', key: name, value: trimmed },
      update: { value: trimmed },
    });
    process.env[name] = trimmed;
    initConfig(); // refresh cached config so getConfig() picks up new value immediately
    return { ok: true };
  });

  server.delete('/api/admin/api-keys/:name', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { name } = request.params as { name: string };
    if (!API_KEY_REGISTRY[name]) return reply.status(400).send({ error: 'Unknown key' });
    await prisma.pricingConfig.deleteMany({ where: { category: 'api_keys', key: name } });
    return { ok: true };
  });

  // GET /admin/system — redirect to consolidated settings page
  server.get("/admin/system", async (_request, reply) => {
    return reply.redirect('/admin/settings');
  });

  // ── Persona Management ──
  server.get('/api/personas', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { getPersonasAsync } = await import('../config/personas.js');
    return getPersonasAsync();
  });

  server.post('/api/personas', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as {
      id: string;
      allowedNiches?: string[] | string;
      allowedPresets?: string[];
      priceMultiplier?: number;
    };
    if (!body.id) return reply.status(400).send({ error: 'id required' });
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'persona', key: body.id } },
      create: { category: 'persona', key: body.id, value: JSON.parse(JSON.stringify(body)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(body)), updatedBy: BigInt(0) },
    });
    return { success: true };
  });

  server.get('/admin/personas', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { getPersonasAsync } = await import('../config/personas.js');
    const { NICHE_IDS } = await import('../config/niches.js');
    const personas = await getPersonasAsync();
    return reply.view('admin/personas', { personas, nicheIds: NICHE_IDS, ...trackingVars(), activePage: 'personas', title: 'Persona Management' }, { layout: 'admin/layout.ejs' });
  });

  // ── WELCOME MESSAGE OVERRIDE ──
  server.post("/api/admin/welcome-message", { preHandler: validate({ body: welcomeMessageSchema }) }, async (request, reply) => {
    await verifyAdmin(request, reply);
    const { message } = request.body as { message?: string };
    if (!message) return reply.status(400).send({ error: "Message required" });
    await PaymentSettingsService.setPricingConfig(
      "system",
      "welcome_message",
      message,
    );
    return { success: true };
  });

  // ── DYNAMIC PRICING PAGE ──
  server.get("/admin/dynamic-pricing", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    return reply.view("admin/dynamic-pricing", { ...trackingVars(), activePage: "dynamic-pricing", title: 'Dynamic Pricing' }, { layout: 'admin/layout.ejs' });
  });

  // ── REGISTER PROVIDER COSTS ROUTES ──
  const { registerProviderCostRoutes } = await import("./provider-costs.js");
  registerProviderCostRoutes(server);

  // ── INTERCEPTION MANAGEMENT ──



  // List intercepted users
  server.get("/api/intercept/users", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const users = await prisma.user.findMany({
      where: { isIntercepted: true },
      select: { telegramId: true, firstName: true, username: true, tier: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return users.map(u => ({ ...u, telegramId: u.telegramId.toString() }));
  });

}
