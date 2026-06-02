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
