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
import { registerPromptsRoutes } from "./admin/prompts";
import { registerAnalyticsRoutes } from "./admin/analytics";
import { registerInterceptRoutes } from "./admin/intercept";
import { registerNicheRoutes } from "./admin/niches";
import { registerFreeTrialRoutes } from "./admin/free-trial";
import { registerSystemSettingsRoutes } from "./admin/system-settings";
import { registerBroadcastRoutes } from "./admin/broadcast";
import { registerPlaygroundRoutes } from "./admin/playground";
import { registerLandingConfigRoutes } from "./admin/landing-config";
import { registerStatsRoutes } from "./admin/stats";
import { registerUserMgmtRoutes } from "./admin/user-mgmt";
import { registerSystemHealthRoutes } from "./admin/system-health";
import { registerTokenUsageRoutes } from "./admin/token-usage";
import { registerV3Routes } from "./admin/v3";
import { registerProviderMgmtRoutes } from "./admin/provider-mgmt";
import { registerAIConfigRoutes } from "./admin/ai-config";
import { registerSettingsRoutes } from "./admin/settings";
import { registerAdminConfigRoutes } from "./admin/admin-config";
import { registerPersonaRoutes } from "./admin/persona";
import { registerContentToolsRoutes } from "./admin/content-tools";
import { registerFanpageRoutes } from "./admin/fanpage";
import { trackingVars } from "./admin/shared";
import { ConfigError } from '@/utils/app-errors';

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes in seconds

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
      // Also set cookie so subsequent fetch() calls with credentials:'include' pass auth
      const token = makeAdminToken(ADMIN_PASSWORD);
      reply.setCookie("admin_token", token, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 86400,
        secure: request.protocol === "https",
      });
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
    const url = request.url.split("?")[0];
    // Exclude login page from auth
    if (url === "/admin/login") {
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
      url === "/admin/captions" ||
      url === "/admin/cloak" ||
      url === "/admin/engagement" ||
      url === "/admin/video-tools" ||
      url === "/admin/render-ad" ||
      url === "/admin/storyboard" ||
      url === "/admin/pinterest" ||
      url === "/admin/fanpage" ||
      url === "/admin/research" ||
      url === "/admin/analyze" ||
      url === "/admin/tts" ||
      url === "/admin/music" ||
      url === "/admin/looping" ||
      url === "/admin/autopilot" ||
      url === "/admin/bookshelf" ||
      url === "/admin/comic" ||
      url === "/admin/movie" ||
      url === "/admin/medias" ||
      url.startsWith("/api/fanpages") ||
      url.startsWith("/api/token-usage") ||
      url.startsWith("/api/profit-report") ||
      url.startsWith("/api/settings/") ||
      url.startsWith("/api/niches") ||
      url.startsWith("/api/personas") ||
      url === "/admin/personas" ||
      url.startsWith("/api/admin/") ||
      url.startsWith("/api/admin-config") ||
      url.startsWith("/api/referral/") ||
      url.startsWith("/api/books") ||
      url.startsWith("/api/comics") ||
      url.startsWith("/api/movies") ||
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
  await registerPromptsRoutes(server);
  await registerContentToolsRoutes(server);
  await registerAnalyticsRoutes(server);
  await registerInterceptRoutes(server, verifyAdmin);
  await registerNicheRoutes(server, verifyAdmin);
  await registerFreeTrialRoutes(server, verifyAdmin);
  await registerSystemSettingsRoutes(server, verifyAdmin);
  await registerBroadcastRoutes(server);
  await registerPlaygroundRoutes(server);
  await registerLandingConfigRoutes(server);
  await registerStatsRoutes(server);
  await registerUserMgmtRoutes(server);
  await registerSystemHealthRoutes(server);
  await registerTokenUsageRoutes(server);
  await registerV3Routes(server);
  await registerProviderMgmtRoutes(server, verifyAdmin);
  await registerAIConfigRoutes(server, verifyAdmin);
  await registerSettingsRoutes(server);
  await registerFanpageRoutes(server);
  await registerAdminConfigRoutes(server, verifyAdmin);
  await registerPersonaRoutes(server, verifyAdmin);

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

  // ── REDIRECTS ──
  // /admin/analytics -> /admin/dashboard (common mistaken path)
  server.get("/admin/analytics", async (_request, reply) => {
    return reply.redirect("/admin/dashboard");
  });
  // /admin/billing -> /admin/pricing (common mistaken path)
  server.get("/admin/billing", async (_request, reply) => {
    return reply.redirect("/admin/pricing");
  });

  // ── REGISTER PROVIDER COSTS ROUTES ──
  const { registerProviderCostRoutes } = await import("./provider-costs.js");
  registerProviderCostRoutes(server);
}
