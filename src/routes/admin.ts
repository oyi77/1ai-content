/**
 * Admin Dashboard - Web Interface
 *
 * Serves a web UI for bot management.
 * Route handlers delegated to focused modules in this directory.
 */
import path from "path";
import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { getQueueStats, addNotificationJob, videoQueue } from "@/config/queue";
import { paymentQueue, notificationQueue, cleanupQueue } from "@/config/queue";
import { MetricsService } from "@/services/metrics.service";
import { PROVIDER_CONFIG } from "@/config/providers";
import { GamificationService, BADGES } from "@/services/gamification.service";
import { HOOK_VARIATIONS } from "@/services/campaign.service";
import {
  CREDIT_PACKAGES_V3, SUBSCRIPTION_PLANS_V3, UNIT_COSTS, REFERRAL_COMMISSIONS_V3,
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
import { registerDashboardRoutes } from "./admin/dashboard-api";
import { registerContentRoutes } from "./admin/content-api";
import { registerUsersApiRoutes } from "./admin/users-api";
import { registerPaymentsApiRoutes } from "./admin/payments-api";
import { trackingVars } from "./admin/shared";
import { ConfigError } from '@/utils/app-errors';
import { verifyAdmin, registerLoginRoutes, makeAdminToken } from "./admin/auth";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { timingSafeCompare } from "@/utils/crypto";

function getQueueByName(name: string) {
  const queues: Record<string, typeof videoQueue> = {
    video: videoQueue, payment: paymentQueue,
    notification: notificationQueue, cleanup: cleanupQueue,
  };
  return queues[name];
}

/**
 * Register admin routes
 */
export async function adminRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0];
    if (url === "/admin/login") return;

    const isAdminRoute =
      url === "/admin" || url === "/admin/dashboard" ||
      url === "/admin/pricing" || url === "/admin/prompts" ||
      url === "/admin/settings" || url === "/admin/users" ||
      url === "/admin/config" || url === "/admin/system" ||
      url === "/admin/playground" ||
      url.startsWith("/api/stats") || url.startsWith("/api/analytics") ||
      url.startsWith("/api/users") || url.startsWith("/api/transactions") ||
      url.startsWith("/api/videos") || url.startsWith("/api/broadcast") ||
      url.startsWith("/api/config") || url.startsWith("/api/payment-settings") ||
      url.startsWith("/api/pricing") || url.startsWith("/api/provider-costs") ||
      url.startsWith("/api/admin-prompts") || url.startsWith("/api/token-stats") ||
      url === "/admin/captions" || url === "/admin/cloak" ||
      url === "/admin/engagement" || url === "/admin/video-tools" ||
      url === "/admin/render-ad" || url === "/admin/storyboard" ||
      url === "/admin/fanpage" || url === "/admin/research" ||
      url === "/admin/analyze" || url === "/admin/tts" ||
      url === "/admin/music" || url === "/admin/looping" ||
      url === "/admin/autopilot" || url === "/admin/bookshelf" ||
      url === "/admin/comic" || url === "/admin/movie" ||
      url === "/admin/medias" || url === "/admin/calendar" ||
      url === "/admin/trending" || url === "/admin/ab-tests" ||
      url === "/admin/carousel" || url === "/admin/remeta" ||
      url === "/admin/repurpose" ||
      url.startsWith("/api/fanpages") || url.startsWith("/api/token-usage") ||
      url.startsWith("/api/profit-report") || url.startsWith("/api/settings/") ||
      url.startsWith("/api/niches") || url.startsWith("/api/personas") ||
      url === "/admin/personas" || url.startsWith("/api/admin/") ||
      url.startsWith("/api/admin-config") || url.startsWith("/api/referral/") ||
      url.startsWith("/api/books") || url.startsWith("/api/comics") ||
      url.startsWith("/api/movies") || url.startsWith("/api/queue/") ||
      url.startsWith("/api/subscriptions") ||
      url.startsWith("/api/interceptions") || url.startsWith("/api/intercept/") ||
      url === "/admin/interceptions" ||
      (url.startsWith("/api/system/") && url !== "/api/system/health") ||
      // Catch-all: any /admin/* not login or static asset.
      // SPA asset kini di /assets/ dan hook ini hanya berlaku utk rute adminRoutes,
      // jadi pengecualian `!url.startsWith("/assets/")` praktis tidak pernah match.
      (url.startsWith("/admin/") && url !== "/admin/login" && !url.startsWith("/assets/"));

    if (isAdminRoute) {
      await verifyAdmin(request, reply);
    }
  });

  // ── Delegated route modules ──
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
  await registerDashboardRoutes(server);
  await registerContentRoutes(server);
  await registerUsersApiRoutes(server);
  await registerPaymentsApiRoutes(server);

  // ── Auth / Login ──
  registerLoginRoutes(server);

  // ── Inline API routes ──
  registerAdminRedirects(server);
  registerQueueRoutes(server);
  registerInlineApiRoutes(server);

  // ── Provider costs ──
  const { registerProviderCostRoutes } = await import("./provider-costs.js");
  registerProviderCostRoutes(server);
}

// ════════════════════════════════════════════════════════════
// INLINE ROUTE HELPERS
// ════════════════════════════════════════════════════════════

function registerAdminRedirects(server: FastifyInstance) {
  server.get("/admin", async (request, reply) => {
    const cookie = (request.headers.cookie || "")
      .split(";").find((c) => c.trim().startsWith("admin_token="));
    if (cookie) {
      const token = cookie.split("=")[1]?.trim();
      if (token && timingSafeCompare(token, makeAdminToken(getConfig().ADMIN_PASSWORD))) {
        return reply.redirect("/admin/dashboard");
      }
    }
    return reply.redirect("/admin/login");
  });

  server.get("/admin/analytics", async (_r, reply) => reply.redirect("/admin/dashboard"));
  server.get("/admin/billing", async (_r, reply) => reply.redirect("/admin/pricing"));
  server.get("/admin/broadcast", async (_r, reply) => reply.redirect("/admin/settings#broadcast"));
}

function registerQueueRoutes(server: FastifyInstance) {
  server.post("/api/queue/retry/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { queue: queueName } = request.query as { queue?: string };
    const queue = queueName ? getQueueByName(queueName) : videoQueue;
    if (!queue) return reply.status(400).send({ error: "Invalid queue name" });
    try {
      const job = await queue.getJob(jobId);
      if (!job) return reply.status(404).send({ error: "Job not found" });
      await job.retry();
      return { success: true, jobId, action: "retry" };
    } catch (error) {
      return reply.status(500).send({ error: `Failed to retry job: ${(error as Error).message}` });
    }
  });

  server.post("/api/queue/clean", async (request, reply) => {
    const { queue: queueName, olderThanHours = 24 } = request.body as { queue?: string; olderThanHours?: number };
    const queue = queueName ? getQueueByName(queueName) : videoQueue;
    if (!queue) return reply.status(400).send({ error: "Invalid queue name" });
    try {
      const timestamp = Date.now() - olderThanHours * 60 * 60 * 1000;
      const [cleanedCompleted, cleanedFailed] = await Promise.all([
        queue.clean(timestamp, 100, "completed"),
        queue.clean(timestamp, 100, "failed"),
      ]);
      return { success: true, cleaned: { completed: cleanedCompleted.length, failed: cleanedFailed.length }, olderThanHours, queue: queueName || "video" };
    } catch (error) {
      return reply.status(500).send({ error: `Failed to clean queue: ${(error as Error).message}` });
    }
  });
}

function registerInlineApiRoutes(server: FastifyInstance) {
  // Stats
  server.get("/api/stats", async () => {
    const [users, transactions, videos, queueStats] = await Promise.all([
      prisma.user.count(), prisma.transaction.count(), prisma.video.count(), getQueueStats(),
    ]);
    const revenue = await prisma.transaction.aggregate({
      where: { status: "success" }, _sum: { amountIdr: true },
    });
    const metricsToday = await MetricsService.getAll();
    const trialDaily = metricsToday.metrics?.generation_trial_daily || 0;
    const trialWelcome = metricsToday.metrics?.generation_trial_welcome || 0;
    return { users, transactions, videos, revenue: Number(revenue._sum.amountIdr || 0), queue: queueStats, trialStats: { daily: trialDaily, welcome: trialWelcome, total: trialDaily + trialWelcome } };
  });

  // Config
  server.get("/api/config", async (_request, reply) => reply.send(getConfigForAdmin()));

  // Payment settings
  server.get("/api/payment-settings", async () => {
    const flat = await PaymentSettingsService.getAllSettings();
    const defaultGateway = await PaymentSettingsService.getDefaultGateway();
    const settings: Record<string, { enabled: boolean }> = {};
    for (const gw of ["midtrans", "tripay", "duitku"]) {
      settings[gw] = { enabled: flat[`${gw}_enabled`] !== "false" };
    }
    return { settings, defaultGateway };
  });

  server.post("/api/payment-settings", async (request, reply) => {
    const body = request.body as { action: string; gateway?: string; value?: string };
    try {
      if (body.action === "set_default") { await PaymentSettingsService.setDefaultGateway(body.gateway!); return { success: true }; }
      if (body.action === "toggle_gateway") {
        const isEnabled = await PaymentSettingsService.isGatewayEnabled(body.gateway!);
        await PaymentSettingsService.setGatewayEnabled(body.gateway!, !isEnabled);
        return { success: true, enabled: !isEnabled };
      }
      return { error: "Unknown action" };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  // Videos list
  server.get("/api/videos", async (request, _reply) => {
    const query = request.query as { status?: string; limit?: string };
    const limit = Math.min(Math.max(1, parseInt(query.limit || "50") || 50), 200);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    const videos = await prisma.video.findMany({
      where, take: limit, orderBy: { createdAt: "desc" },
      include: { user: { select: { telegramId: true, username: true, firstName: true } } },
    });
    return videos.map(v => ({
      id: Number(v.id), jobId: v.jobId, title: v.title, niche: v.niche,
      platform: v.platform, duration: v.duration, status: v.status,
      progress: v.progress, errorMessage: v.errorMessage,
      creditsUsed: v.creditsUsed ? Number(v.creditsUsed) : 0,
      thumbnailUrl: v.thumbnailUrl || null, videoUrl: v.videoUrl || null,
      downloadUrl: v.downloadUrl || null, finalProvider: v.finalProvider || null,
      providerChain: v.providerChain || [], storyboard: v.storyboard || null,
      createdAt: v.createdAt, completedAt: v.completedAt,
      user: v.user ? { telegramId: v.user.telegramId?.toString(), username: v.user.username, firstName: v.user.firstName } : null,
    }));
  });

  // Transactions
  server.get("/api/transactions", async (request, _reply) => {
    const query = request.query as { status?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(1, parseInt(query.limit || "50") || 50), 200);
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where, orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        include: { user: { select: { username: true, firstName: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);
    return { transactions, total, offset, limit };
  });

  // Users list
  server.get("/api/users", async (request, _reply) => {
    const query = request.query as { limit?: string; offset?: string; isBanned?: string; tier?: string };
    const limit = Math.min(Math.max(1, parseInt(query.limit || "50") || 50), 200);
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);
    const where: Record<string, unknown> = {};
    if (query.isBanned === "true") where.isBanned = true;
    else if (query.isBanned === "false") where.isBanned = false;
    if (query.tier) where.tier = query.tier.toLowerCase();
    return prisma.user.findMany({
      where, take: limit, skip: offset, orderBy: { createdAt: "desc" },
      select: { telegramId: true, username: true, firstName: true, tier: true, creditBalance: true, isBanned: true, createdAt: true, lastActivityAt: true },
    });
  });

  // User by ID
  server.get("/api/users/:id", async (request, reply) => {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt((request.params as { id: string }).id) },
        include: { transactions: { take: 10, orderBy: { createdAt: "desc" } }, videos: { take: 10, orderBy: { createdAt: "desc" } } },
      });
      if (!user) return reply.status(404).send({ error: "User not found" });
      return user;
    } catch { return reply.status(400).send({ error: "Invalid user ID" }); }
  });

  // Grant credits
  server.post("/api/users/:id/credits", { preHandler: validate({ params: idParamSchema, body: creditsBodySchema }) }, async (request, reply) => {
    try {
      const telegramId = BigInt((request.params as { id: string }).id);
      const body = request.body as { amount: number; reason: string };
      const user = await prisma.user.update({
        where: { telegramId }, data: { creditBalance: { increment: body.amount } },
      });
      await prisma.transaction.create({
        data: {
          userId: user.telegramId, orderId: `ADMIN-GRANT-${Date.now()}`, type: "admin_grant",
          gateway: "admin", packageName: "admin_grant", amountIdr: 0,
          creditsAmount: body.amount, status: "success",
          metadata: { reason: body.reason || "Admin grant via dashboard", grantedBy: "admin_dashboard" },
        },
      }).catch(err => server.log.warn({ err }, "Failed to create admin grant transaction record"));
      return { success: true, newBalance: user.creditBalance };
    } catch { return reply.status(404).send({ error: "User not found or invalid ID" }); }
  });

  // Ban/Unban user
  server.post("/api/users/:id/ban", { preHandler: validate({ params: idParamSchema, body: z.object({ banned: z.boolean(), reason: z.string().min(1).max(500), durationDays: z.number().int().min(0).max(3650).optional() }) }) }, async (request, reply) => {
    try {
      const telegramId = BigInt((request.params as { id: string }).id);
      const body = request.body as { banned: boolean; reason?: string };
      const user = await prisma.user.update({
        where: { telegramId },
        data: { isBanned: body.banned, banReason: body.reason, bannedAt: body.banned ? new Date() : null },
      });
      try {
        const { InterceptService } = await import("../services/intercept.service.js");
        await InterceptService.invalidateCache(telegramId);
      } catch (err) { request.log.warn({ err, telegramId: telegramId.toString() }, "Failed to invalidate intercept cache after ban toggle"); }
      return { success: true, isBanned: user.isBanned };
    } catch { return reply.status(404).send({ error: "User not found or invalid ID" }); }
  });

  // Subscriptions
  server.get("/api/subscriptions/active", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(1, parseInt(query.limit || "50") || 50), 200);
    const offset = Math.max(0, parseInt(query.offset || "0") || 0);
    const subs = await prisma.subscription.findMany({
      where: { status: "active" }, take: limit, skip: offset, orderBy: { createdAt: "desc" },
      include: { user: { select: { telegramId: true, username: true, firstName: true, tier: true } } },
    });
    return subs.map(s => ({
      id: s.id, userId: s.userId, userTelegramId: s.user.telegramId.toString(),
      userUsername: s.user.username, userFirstName: s.user.firstName, userTier: s.user.tier,
      plan: s.plan, billingCycle: s.billingCycle, status: s.status,
      currentPeriodStart: s.currentPeriodStart, currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd, createdAt: s.createdAt,
    }));
  });

  server.post("/api/subscriptions/:id/cancel", { preHandler: validate({ params: idParamSchema, body: cancelSubscriptionSchema }) }, async (request, reply) => {
    const id = BigInt((request.params as { id: string }).id);
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return reply.status(404).send({ error: "Subscription not found" });
    if (sub.status !== "active") return reply.status(400).send({ error: "Subscription is not active" });
    await prisma.subscription.update({ where: { id }, data: { cancelAtPeriodEnd: true, cancelledAt: new Date() } });
    return { success: true, message: "Subscription will be cancelled at period end" };
  });

  server.post("/api/subscriptions/:id/extend", { preHandler: validate({ params: idParamSchema, body: extendSubscriptionSchema }) }, async (request, reply) => {
    const id = BigInt((request.params as { id: string }).id);
    const days = Math.min(Math.max(1, (request.body as { days?: number }).days || 30), 365);
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return reply.status(404).send({ error: "Subscription not found" });
    if (sub.status !== "active") return reply.status(400).send({ error: "Subscription is not active" });
    const newEnd = new Date(sub.currentPeriodEnd);
    newEnd.setDate(newEnd.getDate() + days);
    await prisma.subscription.update({ where: { id }, data: { currentPeriodEnd: newEnd } });
    return { success: true, newPeriodEnd: newEnd.toISOString() };
  });

  // React Admin SPA catch-all
  const adminUiDist = path.join(process.cwd(), "admin-ui", "dist");
  server.get("/admin/*", async (request, reply) => {
    const rawPath = new URL(request.url, "http://localhost").pathname.replace("/admin/", "");
    const decoded = decodeURIComponent(rawPath);
    const normalized = path.posix.normalize(decoded);
    if (normalized.startsWith("..") || normalized.startsWith("/")) return reply.callNotFound();
    if (/\.[a-z0-9]+(\?|$)/i.test(rawPath)) return reply.sendFile(rawPath, adminUiDist);
    return reply.sendFile("index.html");
  });
}
