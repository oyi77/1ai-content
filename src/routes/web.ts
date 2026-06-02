/**
 * Web Routes
 *
 * Landing page + Web App (SPA) + REST API for web clients
 */

import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { VideoService } from "@/services/video.service";
import { PaymentService } from "@/services/payment.service";
import { DuitkuService } from "@/services/duitku.service";
import { TripayService } from "@/services/tripay.service";
import { checkTelegramHash, checkTWAHash } from "@/utils/telegram";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  generateStoryboard,
  NICHES,
} from "@/services/video-generation.service";
import {
  getVideoCreditCostAsync,
  getImageCreditCostAsync,
  getPackagesAsync,
  getSubscriptionPlansAsync,
  getUnitCostAsync,
  SUBSCRIPTION_PLANS,
  getPlanPrice,
} from "@/config/pricing";
import type { PlanKey, BillingCycle } from "@/config/pricing";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { ImageGenerationService } from "@/services/image.service";
import { getOmniRouteService } from "@/services/omniroute.service";
import jwt from "jsonwebtoken";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import crypto from "crypto";
import { validateUrl } from "@/utils/url-validator";
import {
  paymentLimiter,
  withdrawalLimiter,
  generationLimiter,
  readLimiter,
} from "@/middleware/rateLimit";
import { tryApiKeyAuth } from "@/middleware/api-auth";
import { ProviderError } from '@/utils/app-errors';

const getJwtSecret = (): string => getConfig().JWT_SECRET!;
function getBotToken(): string {
  return getConfig().BOT_TOKEN;
}

// ─── Landing Page ───────────────────────────────────────────────────────────

// ─── Backend Routes ──────────────────────────────────────────────────────────

export async function webRoutes(server: FastifyInstance): Promise<void> {
  server.get("/", async (request, reply) => {
    const { redis } = require("../config/redis");
    let landingConfig: any = {};
    try {
      const data = await redis.get("admin:landing_config");
      if (data) landingConfig = JSON.parse(data);
    } catch {
      /* ignore */
    }

    const packages = await getPackagesAsync();

    // Determine language (priority: ?lang=, then Accept-Language header, then 'id' default)
    const langParam = (request.query as Record<string, string>).lang;
    const acceptLang = request.headers["accept-language"] || "";
    let currentLang = langParam || (acceptLang.startsWith("en") ? "en" : "id");
    if (!["id", "en"].includes(currentLang)) currentLang = "id";

    // Handle multi-language testimonials from config
    let testimonials = [];
    if (landingConfig.testimonials) {
      if (Array.isArray(landingConfig.testimonials)) {
        testimonials = landingConfig.testimonials;
      } else if (typeof landingConfig.testimonials === "object") {
        testimonials =
          landingConfig.testimonials[currentLang] ||
          landingConfig.testimonials["id"] ||
          [];
      }
    }

    return reply.view("web/landing.ejs", {
      landingConfig,
      testimonials,
      packages,
      currentLang,
      botUsername: getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
      siteUrl: getConfig().WEBHOOK_URL || 'https://saas.aitradepulse.com',
      fbPixelId: getConfig().FACEBOOK_PIXEL_ID || "",
      ga4Id: getConfig().GA4_TRACKING_ID || "",
      ttPixelId: getConfig().TIKTOK_PIXEL_ID || "",
      ogImageUrl: landingConfig?.heroImageUrl || landingConfig?.ogImageUrl || null,
    });
  });

  // ─── FAQ ─────────────────────────────────────────────────────────────────────
  server.get("/faq", async (_request, reply) => {
    return reply.view("web/faq.ejs", { botUsername: getConfig().BOT_TOKEN?.split(':')[0] || 'bot' });
  });

  // ─── Terms of Service ────────────────────────────────────────────────────────
  server.get("/terms", async (_request, reply) => {
    return reply.view("web/tos.ejs", {
      botUsername: getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
    });
  });

  // ─── Privacy Policy ──────────────────────────────────────────────────────────
  server.get("/privacy", async (_request, reply) => {
    return reply.view("web/privacy.ejs", {
      botUsername: getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
    });
  });

  // Facebook domain verification
  server.get(
    "/go7u73s641jq2jtd8gfh2ecbl94kmy.html",
    async (_request, reply) => {
      reply.type("text/html").send("go7u73s641jq2jtd8gfh2ecbl94kmy");
    },
  );

  // Static files (images, etc)
  // Favicon routes
  server.get("/favicon.ico", async (_request, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    const ico = fs.readFileSync(`${process.cwd()}/src/public/favicon.ico`);
    return reply.type("image/x-icon").send(ico);
  });

  server.get("/favicon.svg", async (_request, reply) => {
    const fs = require("fs");
    const svg = fs.readFileSync(
      `${process.cwd()}/src/public/favicon.svg`,
      "utf8",
    );
    return reply.type("image/svg+xml").send(svg);
  });

  server.get("/public/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const publicDir = path.resolve(process.cwd(), "src/public");
    const filePath = path.resolve(publicDir, filename);

    // Path traversal guard — reject any path that escapes the public directory
    if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
      return reply.code(400).send("Invalid filename");
    }

    if (!fs.existsSync(filePath)) {
      reply.code(404).send("File not found");
      return;
    }

    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
    };

    const mimeType = mimeTypes[ext || ""] || "application/octet-stream";
    const stream = fs.createReadStream(filePath);

    reply.type(mimeType);
    return reply.send(stream);
  });

  // Payment finish — redirect target after gateway payment
  server.get("/payment/finish", async (request, reply) => {
    const { order_id } = request.query as Record<string, string>;
    let statusMessage = "Payment is being processed";
    let statusIcon = "⏳";
    let statusClass = "pending";
    if (order_id) {
      try {
        const tx = await prisma.transaction.findFirst({
          where: { orderId: String(order_id) },
          select: { status: true },
        });
        if (tx?.status === "success") {
          statusMessage = "Payment successful! Credits added to your account.";
          statusIcon = "✅";
          statusClass = "success";
        } else if (tx?.status === "failed") {
          statusMessage =
            "Payment failed. Please try again or contact support.";
          statusIcon = "❌";
          statusClass = "failed";
        }
      } catch {
        /* ignore lookup errors */
      }
    }
    const botUsername = getConfig().BOT_USERNAME || "BKVilonaBot";
    return reply.type("text/html")
      .send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Status</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:white;border-radius:16px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}.icon{font-size:48px;margin-bottom:16px}.success{color:#16a34a}.pending{color:#d97706}.failed{color:#dc2626}.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;margin:8px;font-weight:600}.btn-primary{background:#2563eb;color:white}.btn-secondary{background:#e5e7eb;color:#374151}</style></head>
<body><div class="card"><div class="icon">${statusIcon}</div><h2 class="${statusClass}">${statusMessage}</h2><p><a class="btn btn-primary" href="https://t.me/${botUsername}">Return to Bot</a></p><p><a class="btn btn-secondary" href="/app">Open Web App</a></p></div></body></html>`);
  });

  // Web app
  server.get("/app", async (_request, reply) => {
    return reply.view("web/app.ejs", {
      botUsername: getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
    });
  });

  // ── AUTH ──
  server.post("/auth/telegram", async (request, reply) => {
    try {
      let userData = request.body as Record<string, unknown>;

      // Support Telegram Web App (Mini App) initData format
      if (userData?.initData) {
        const isValidTWA = checkTWAHash(
          userData.initData as string,
          getBotToken(),
        );
        if (!isValidTWA) {
          return reply.status(401).send({ error: "Invalid TWA initData" });
        }
        // Parse user from initData
        const params = new URLSearchParams(userData.initData as string);
        const userJson = params.get("user");
        if (!userJson)
          return reply.status(400).send({ error: "No user in initData" });
        const twaUser = JSON.parse(userJson);
        userData = {
          id: twaUser.id,
          username: twaUser.username,
          first_name: twaUser.first_name,
          last_name: twaUser.last_name,
        };
      } else {
        if (!userData || !userData.id) {
          return reply.status(400).send({ error: "Invalid user data" });
        }
        const isValid = checkTelegramHash(userData, getBotToken());
        if (!isValid) {
          return reply
            .status(401)
            .send({ error: "Auth hash verification failed" });
        }
      }

      let user = await UserService.findByTelegramId(BigInt(String(userData.id)));
      if (!user) {
        try {
          user = await UserService.create({
            telegramId: BigInt(String(userData.id)),
            username: userData.username as string | undefined,
            firstName: userData.first_name as string,
            lastName: userData.last_name as string | undefined,
          });
        } catch (err: unknown) {
          const error = err as { code?: string };
          if (error?.code === "P2002") {
            // Created concurrently — fetch the existing record
            user = await UserService.findByTelegramId(BigInt(String(userData.id)));
          } else {
            throw err;
          }
        }
      }

      if (!user) {
        return reply.status(500).send({ error: "User creation failed" });
      }

      // Check if user is banned
      if (user.isBanned) {
        return reply.status(403).send({ error: "Account suspended" });
      }

      const token = jwt.sign(
        {
          userId: user.uuid,
          telegramId: user.telegramId.toString(),
          tier: user.tier,
        },
        getJwtSecret(),
        { expiresIn: "7d" },
      );
      return {
        token,
        user: { id: user.uuid, credits: user.creditBalance, tier: user.tier },
      };
    } catch (error: unknown) {
      server.log.error({ error }, "Telegram auth error");
      return reply.status(500).send({ error: "Authentication failed" });
    }
  });

  // ── MIDDLEWARE HELPER ──
  const getUser = async (request: any, reply: any) => {
    // If a valid API key was already resolved by tryApiKeyAuth, look up the full user
    if (request.apiUser) {
      const user = await UserService.findByTelegramId(request.apiUser.telegramId);
      if (!user) {
        reply.status(404).send({ error: "User not found" });
        return null;
      }
      if (user.isBanned) {
        reply.status(403).send({ error: "Account suspended" });
        return null;
      }
      return user;
    }
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.status(401).send({ error: "Unauthorized" });
      return null;
    }
    try {
      const decoded = jwt.verify(
        authHeader.substring(7),
        getJwtSecret(),
      ) as { userId: string };
      const user = await UserService.findByUuid(decoded.userId);
      if (!user) {
        reply.status(404).send({ error: "User not found" });
        return null;
      }
      if (user.isBanned) {
        reply.status(403).send({ error: "Account suspended" });
        return null;
      }
      return user;
    } catch {
      reply.status(401).send({ error: "Invalid token" });
      return null;
    }
  };

  // ── USER ──
  server.get(
    "/api/user",
    { preHandler: [readLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      return {
        id: user.uuid,
        telegramId: user.telegramId.toString(),
        username: user.username,
        firstName: user.firstName,
        credits: user.creditBalance,
        tier: user.tier,
        referralCode: user.referralCode,
        welcomeBonusUsed: user.welcomeBonusUsed,
        dailyFreeUsed: user.dailyFreeUsed,
        dailyFreeResetAt: user.dailyFreeResetAt,
        createdAt: user.createdAt,
      };
    },
  );

  // ── ACCOUNT DELETION ──
  server.delete("/api/user", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      await prisma.user.update({
        where: { uuid: user.uuid },
        data: {
          firstName: "Deleted User",
          username: null,
          phoneNumber: null,
          referralCode: null,
        },
      });
      return { message: "Account deleted successfully" };
    } catch (error) {
      logger.error("Account deletion error:", error);
      return reply.status(500).send({ error: "Deletion failed" });
    }
  });

  // ── USER SETTINGS ──
  server.patch("/api/user/settings", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    const { language, notificationsEnabled, firstName } = request.body as {
      language?: string;
      notificationsEnabled?: boolean;
      firstName?: string;
    };
    const validLangs = ["id", "en", "ru", "zh"];
    const data: Record<string, unknown> = {};
    if (language !== undefined) {
      if (!validLangs.includes(language))
        return reply.status(400).send({ error: "Invalid language" });
      data.language = language;
    }
    if (firstName !== undefined) {
      if (typeof firstName !== "string" || firstName.trim().length === 0 || firstName.length > 64)
        return reply.status(400).send({ error: "Invalid name (1-64 chars)" });
      data.firstName = firstName.trim();
    }
    if (notificationsEnabled !== undefined) {
      data.notificationsEnabled = Boolean(notificationsEnabled);
    }
    if (Object.keys(data).length === 0)
      return reply.status(400).send({ error: "No settings to update" });
    await prisma.user.update({ where: { uuid: user.uuid }, data });
    return { ok: true };
  });

  // ── PWA MANIFEST ──
  server.get("/manifest.json", async (_request, reply) => {
    return reply.type('application/json').send({
      name: 'BerkahKarya',
      short_name: 'BerkahKarya',
      start_url: '/app',
      display: 'standalone',
      background_color: '#0a0a1a',
      theme_color: '#00d9ff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  // ── STORYBOARD PREVIEW ──
  server.post("/api/storyboard", async (request, reply) => {
    try {
      const { niche, duration: durationStr, customPrompt } = request.body as Record<string, string>;
      if (!niche || !durationStr)
        return reply.status(400).send({ error: "Niche and duration required" });
      const duration = Number(durationStr);
      const nicheConfig = (NICHES as Record<string, { styles?: string[] }>)[niche];
      const scenes = nicheConfig
        ? Math.max(3, Math.min(Math.floor(duration / 5), 8))
        : 4;
      const storyboard = generateStoryboard(
        niche,
        nicheConfig?.styles?.slice(0, 2) || ["viral"],
        duration,
        scenes,
      );
      return {
        scenes: storyboard.map((s: Record<string, unknown>, i: number) => ({
          scene: i + 1,
          duration: (s.duration as number) || Math.floor(duration / storyboard.length),
          description: customPrompt
            ? `${customPrompt} — ${s.description}`
            : s.description,
        })),
        caption: `🎬 ${niche?.toUpperCase()} video | ${duration}s | Generated by BerkahKarya AI`,
        hashtags: [`#${niche}`, "#AIVideo", "#BerkahKarya", "#ViralContent"],
      };
    } catch (error: any) {
      server.log.error({ error }, "Storyboard error");
      return reply.status(500).send({ error: "Failed to generate storyboard" });
    }
  });

  // ── VIDEO CREATE ──
  server.post(
    "/api/video/create",
    { preHandler: [generationLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      try {
        const {
          niche,
          style,
          duration,
          customPrompt,
          storyboard,
          platform = "tiktok",
          enableVO = true,
          enableSubtitles = true,
          language = "id",
          referenceImageUrl,
          noWatermark,
          subtitles,
          voiceover,
        } = request.body as Record<string, string>;
        if (!niche || !duration)
          return reply
            .status(400)
            .send({ error: "niche and duration required" });

        // Validate user-supplied URL to prevent SSRF
        if (referenceImageUrl) {
          try {
            validateUrl(referenceImageUrl);
          } catch (urlErr: any) {
            return reply.status(400).send({ error: urlErr.message });
          }
        }

        const creditCost = await getVideoCreditCostAsync(Number(duration));
        if (Number(user.creditBalance) < creditCost) {
          return reply.status(402).send({
            error: `Insufficient credits. Need ${creditCost}, have ${user.creditBalance}`,
          });
        }

        // Deduct credits — refund below if job creation or enqueue fails.
        await UserService.deductCredits(user.telegramId, creditCost);

        const jobId = `WEB-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        const scenes = Array.isArray((storyboard as unknown as Record<string, unknown>)?.scenes) ? (storyboard as unknown as Record<string, unknown>).scenes as Array<{ scene: number; duration: number; description: string }> : [];
        const sceneData =
          scenes.length > 0
            ? scenes
            : [
                {
                  scene: 1,
                  duration: Number(duration),
                  description: customPrompt || `${niche} marketing video`,
                },
              ];

        try {
          // Create DB record
          await prisma.video.create({
            data: {
              userId: user.telegramId,
              jobId,
              niche,
              platform,
              duration: Number(duration),
              scenes: Array.isArray(sceneData) ? sceneData.length : 1,
              status: "processing",
              creditsUsed: creditCost,
              storyboard: sceneData as unknown as Parameters<typeof prisma.video.create>[0]['data']['storyboard'],
              styles: style ? [style] : [],
              generationMetadata: {
                noWatermark: noWatermark === 'true',
                subtitles: subtitles !== 'false',
                voiceover: enableVO !== 'false' || voiceover !== 'false',
              },
            },
          });

          // Enqueue
          await enqueueVideoGeneration({
            jobId,
            niche,
            platform,
            duration: Number(duration),
            scenes: sceneData.length,
            storyboard: sceneData,
            customPrompt: customPrompt || undefined,
            referenceImage: referenceImageUrl || undefined,
            userId: user.telegramId.toString(),
            chatId: Number(user.telegramId),
            enableVO: enableVO === 'true',
            enableSubtitles: enableSubtitles === 'true',
            language,
          });
        } catch (jobError: any) {
          // Refund credits — job was never actually created/queued
          await UserService.refundCredits(
            user.telegramId,
            creditCost,
            jobId,
            jobError?.message || "job creation failed",
          ).catch((err) =>
            logger.error("Refund failed", { error: err.message }),
          );
          throw jobError;
        }

        return { ok: true, jobId, message: "Video generation started" };
      } catch (error: any) {
        server.log.error({ error }, "Video create error");
        return reply.status(500).send({ error: "Failed to create video" });
      }
    },
  );

  // ── VIDEO ANALYZE (for repurposing) ──
  server.post("/api/video/analyze", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { videoUrl } = request.body as Record<string, string>;
      if (!videoUrl)
        return reply.status(400).send({ error: "videoUrl is required" });

      try {
        validateUrl(videoUrl);
      } catch (urlErr: any) {
        return reply.status(400).send({ error: urlErr.message });
      }

      const { VideoAnalysisService } =
        await import("@/services/video-analysis.service.js");
      const result = await VideoAnalysisService.analyze(videoUrl);

      if (!result.success) {
        return reply
          .status(422)
          .send({ error: result.error || "Analysis failed" });
      }

      // Don't return keyFramePaths (local file paths) to web clients
      return {
        ok: true,
        niche: result.niche,
        style: result.style,
        totalDuration: result.totalDuration,
        transcript: result.transcript,
        storyboard: result.storyboard,
        hasKeyFrames: (result.keyFramePaths?.length || 0) > 0,
      };
    } catch (error: any) {
      server.log.error({ error }, "Video analyze error");
      return reply.status(500).send({ error: "Failed to analyze video" });
    }
  });

  // ── IMAGE GENERATE ──
  server.post(
    "/api/image/generate",
    { preHandler: [generationLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      try {
        const {
          prompt,
          category = "general",
          style,
          aspectRatio = "1:1",
          referenceImageUrl,
          avatarImageUrl,
        } = request.body as Record<string, string>;
        if (!prompt)
          return reply.status(400).send({ error: "prompt is required" });

        // Validate user-supplied URLs to prevent SSRF
        for (const url of [referenceImageUrl, avatarImageUrl]) {
          if (url) {
            try {
              validateUrl(url);
            } catch (urlErr: any) {
              return reply.status(400).send({ error: urlErr.message });
            }
          }
        }

        const IMAGE_CREDIT_COST = await getImageCreditCostAsync();
        if (Number(user.creditBalance) < IMAGE_CREDIT_COST) {
          return reply.status(402).send({
            error: `Insufficient credits. Need ${IMAGE_CREDIT_COST}, have ${user.creditBalance}`,
          });
        }

        await UserService.deductCredits(user.telegramId, IMAGE_CREDIT_COST);

        let result;
        try {
          result = await ImageGenerationService.generateImage({
            prompt,
            category,
            style,
            aspectRatio,
            referenceImageUrl,
            avatarImageUrl,
          });
        } catch (genError: any) {
          // Refund on exception (service crash)
          await UserService.refundCredits(
            user.telegramId,
            IMAGE_CREDIT_COST,
            `IMG-REFUND-${Date.now()}`,
            genError?.message || "exception",
          ).catch((err) =>
            logger.error("Refund failed", { error: err.message }),
          );
          throw genError;
        }

        if (!result.success) {
          // Refund on generation failure
          await UserService.refundCredits(
            user.telegramId,
            IMAGE_CREDIT_COST,
            `IMG-REFUND-${Date.now()}`,
            result.error || "Generation failed",
          );
          return reply
            .status(500)
            .send({ error: result.error || "Image generation failed" });
        }

        return {
          ok: true,
          imageUrl: result.imageUrl,
          provider: result.provider,
        };
      } catch (error: any) {
        server.log.error({ error }, "Image generate error");
        return reply.status(500).send({ error: "Failed to generate image" });
      }
    },
  );

  // ── IMAGE DESCRIBE (i2t) ──
  server.post("/api/image/describe", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { imageUrl } = request.body as Record<string, string>;
      if (!imageUrl)
        return reply.status(400).send({ error: "imageUrl is required" });

      try {
        validateUrl(imageUrl);
      } catch (urlErr: any) {
        return reply.status(400).send({ error: urlErr.message });
      }

      const { ContentAnalysisService } =
        await import("@/services/content-analysis.service.js");
      const result = await ContentAnalysisService.extractPrompt(
        imageUrl,
        "image",
      );

      if (!result.success) {
        return reply
          .status(422)
          .send({ error: result.error || "Could not analyze image" });
      }

      return {
        ok: true,
        description: result.prompt,
        style: result.style,
        elements: result.elements,
      };
    } catch (error: any) {
      server.log.error({ error }, "Image describe error");
      return reply.status(500).send({ error: "Failed to describe image" });
    }
  });

  // ── PACKAGES ──
  server.get("/api/packages", async (_request, reply) => {
    try {
      const [packages, enabledGateways, unitCostsRaw] = await Promise.all([
        getPackagesAsync(),
        PaymentSettingsService.getEnabledGateways(),
        Promise.all([
          getUnitCostAsync("VIDEO_15S"),
          getUnitCostAsync("VIDEO_30S"),
          getUnitCostAsync("VIDEO_60S"),
          getUnitCostAsync("VIDEO_120S"),
          getUnitCostAsync("IMAGE_UNIT"),
        ]),
      ]);
      const unitCosts = {
        VIDEO_15S: unitCostsRaw[0] / 10,
        VIDEO_30S: unitCostsRaw[1] / 10,
        VIDEO_60S: unitCostsRaw[2] / 10,
        VIDEO_120S: unitCostsRaw[3] / 10,
        IMAGE_UNIT: unitCostsRaw[4] / 10,
      };
      return { packages, unitCosts, enabledGateways };
    } catch (error) {
      server.log.error({ error }, "Failed to load packages");
      return reply.status(500).send({ error: "Failed to load packages" });
    }
  });

  // ── PAYMENT CREATE ──
  server.post(
    "/api/payment/create",
    { preHandler: [paymentLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      try {
        const { packageId, gateway } = request.body as Record<string, string>;
        if (!packageId || !gateway)
          return reply
            .status(400)
            .send({ error: "packageId and gateway required" });
        let result: any;
        if (gateway === "duitku") {
          result = await DuitkuService.createTransaction({
            userId: user.telegramId,
            packageId,
            username: user.username || user.firstName,
          });
        } else if (gateway === "tripay") {
          result = await TripayService.createTransaction({
            userId: user.telegramId,
            packageId,
            username: user.username || user.firstName,
          });
        } else {
          result = await PaymentService.createTransaction({
            userId: user.telegramId,
            packageId,
            username: user.username || user.firstName,
          });
        }
        return result;
      } catch (error: any) {
        server.log.error({ error }, "Payment create error");
        return reply.status(500).send({ error: "Failed to create payment" });
      }
    },
  );

  // ── TRANSACTIONS ──
  server.get("/api/my/transactions", async (request, reply) => {
    if ((request.headers as Record<string, string>)['x-api-key']) { if (!await tryApiKeyAuth(request, reply)) return; }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId: user.telegramId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return transactions;
    } catch {
      return reply.status(500).send({ error: "Failed to fetch transactions" });
    }
  });

  // ── TRANSACTION RECEIPT ──
  server.get("/api/my/transactions/:id/receipt", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    try {
      const tx = await prisma.transaction.findFirst({
        where: { id: BigInt(id), userId: user.telegramId },
      });
      if (!tx)
        return reply.status(404).send({ error: "Transaction not found" });
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt #${tx.id}</title>
<style>body{font-family:Inter,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#333}
h1{color:#00d9ff}table{width:100%;border-collapse:collapse;margin:20px 0}
td{padding:8px;border-bottom:1px solid #eee}.total{font-size:24px;font-weight:bold;color:#00d9ff}
@media print{body{margin:0}}</style></head><body>
<h1>BerkahKarya Receipt</h1>
<p><strong>Transaction ID:</strong> ${tx.id}</p>
<p><strong>Date:</strong> ${new Date(tx.createdAt).toLocaleDateString("id-ID")}</p>
<table><tr><td>Type</td><td>${tx.type}</td></tr>
<tr><td>Amount</td><td class="total">IDR ${Number(tx.amountIdr).toLocaleString("id-ID")}</td></tr>
<tr><td>Status</td><td>${tx.status}</td></tr>
<tr><td>Gateway</td><td>${tx.gateway}</td></tr></table>
<p style="color:#888;font-size:12px;margin-top:40px">Generated by BerkahKarya AI Video Studio</p>
</body></html>`;
      return reply.type("text/html").send(html);
    } catch (error) {
      return reply.status(500).send({ error: "Receipt generation failed" });
    }
  });

  // ── P2P TRANSFER ──
  server.post("/api/user/p2p-transfer", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
        const { recipientUsername, amount } = request.body as Record<string, string>;
      if (!recipientUsername || !amount || isNaN(Number(amount)) || Number(amount) < 50) {
        return reply
          .status(400)
          .send({
            error: "Invalid parameters. Minimum transfer is 50 credits.",
          });
      }

      // Find recipient by username (case insensitive)
      const recipient = await prisma.user.findFirst({
        where: {
          username: { equals: recipientUsername, mode: "insensitive" },
        },
      });

      if (!recipient) {
        return reply
          .status(404)
          .send({
            error: "Penerima tidak ditemukan. Pastikan username benar.",
          });
      }

      if (recipient.telegramId === user.telegramId) {
        return reply
          .status(400)
          .send({ error: "Tidak dapat mentransfer ke diri sendiri." });
      }

      const P2pService = require("@/services/p2p.service").P2pService;
      const { totalDeduction } = await P2pService.validateTransfer(
        user.telegramId,
        recipient.telegramId,
        amount,
      );

      // Execute the transfer exactly like the bot
      await P2pService.executeTransfer(
        user.telegramId,
        recipient.telegramId,
        amount,
      );

      return {
        success: true,
        amountSent: amount,
        recipient: recipient.username,
        totalDeduction,
      };
    } catch (error: any) {
      server.log.error(error);
      return reply
        .status(400)
        .send({ error: error.message || "Transfer failed" });
    }
  });

  // ── USER VIDEOS ──
  server.get("/api/user/videos", async (request, reply) => {
    if ((request.headers as Record<string, string>)['x-api-key']) { if (!await tryApiKeyAuth(request, reply)) return; }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const query = request.query as { limit?: string; cursor?: string };
      const limit = Math.min(Math.max(1, parseInt(query.limit || '20') || 20), 50);
      const cursor = query.cursor as string | undefined;

      const videoRows = await prisma.video.findMany({
        where: { userId: user.telegramId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { jobId: cursor }, skip: 1 } : {}),
      });

      const hasMore = videoRows.length > limit;
      if (hasMore) videoRows.pop();

      return {
        videos: videoRows,
        nextCursor: hasMore ? videoRows[videoRows.length - 1]?.jobId ?? null : null,
      };
    } catch {
      return reply.status(500).send({ error: "Failed to fetch videos" });
    }
  });

  // ── USER HISTORY ──
  server.get("/api/user/history", async (request, reply) => {
    if ((request.headers as Record<string, string>)['x-api-key']) { if (!await tryApiKeyAuth(request, reply)) return; }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const query = request.query as { limit?: string; cursor?: string };
      const limit = Math.min(Math.max(1, parseInt(query.limit || '20') || 20), 50);
      const cursor = query.cursor as string | undefined;

      const jobRows = await prisma.video.findMany({
        where: { userId: user.telegramId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { jobId: cursor }, skip: 1 } : {}),
        select: {
          jobId: true,
          status: true,
          videoUrl: true,
          thumbnailUrl: true,
          description: true,
          duration: true,
          createdAt: true,
          creditsUsed: true,
        },
      });

      const hasMore = jobRows.length > limit;
      if (hasMore) jobRows.pop();

      return {
        jobs: jobRows.map((r) => ({
          jobId: r.jobId,
          status: r.status,
          videoUrl: r.videoUrl,
          thumbnailUrl: r.thumbnailUrl,
          prompt: r.description,
          duration: r.duration,
          createdAt: r.createdAt,
          creditsUsed: r.creditsUsed,
        })),
        nextCursor: hasMore ? jobRows[jobRows.length - 1]?.jobId ?? null : null,
      };
    } catch {
      return reply.status(500).send({ error: "Failed to fetch history" });
    }
  });

  // ── VIDEO DELETE ──
  server.delete("/api/video/:jobId", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { jobId } = request.params as { jobId: string };
      const video = await VideoService.getByJobId(jobId);
      if (!video) return reply.status(404).send({ error: "Video not found" });
      if (video.userId !== user.telegramId)
        return reply.status(403).send({ error: "Access denied" });
      await VideoService.deleteVideo(jobId);
      return { ok: true };
    } catch (error: any) {
      server.log.error({ error }, "Video delete error");
      return reply.status(500).send({ error: "Failed to delete video" });
    }
  });

  // ── VIDEO STATUS ──
  server.get("/api/video/:jobId/status", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { jobId } = request.params as { jobId: string };
      const video = await VideoService.getByJobId(jobId);
      if (!video) return reply.status(404).send({ error: "Video not found" });
      if (video.userId !== user.telegramId)
        return reply.status(403).send({ error: "Access denied" });
      return {
        jobId: video.jobId,
        status: video.status,
        progress: video.progress,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        createdAt: video.createdAt,
      };
    } catch (error: any) {
      server.log.error({ error }, "Video status error");
      return reply.status(500).send({ error: "Failed to get video status" });
    }
  });

  // ── REFERRAL INFO & STATS ──
  server.get("/api/referral", async (request, reply) => {
    if ((request.headers as Record<string, string>)['x-api-key']) { if (!await tryApiKeyAuth(request, reply)) return; }
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const stats = await UserService.getStats(user.telegramId);
      const commissionAgg = await prisma.commission.aggregate({
        where: { referrerId: user.telegramId, status: "available" },
        _sum: { amount: true },
      });
      const availableCommission = Number(commissionAgg._sum.amount || 0);

      const sellRateStr =
        await PaymentSettingsService.get("referral_sell_rate");
      const sellRate = sellRateStr ? parseInt(sellRateStr) : 3000;
      const creditsIfConverted = Math.floor(availableCommission / sellRate);

      const BOT_USERNAME = getConfig().BOT_USERNAME || "berkahkarya_saas_bot";
      const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${user.referralCode}`;

      return {
        referralCode: user.referralCode,
        referralLink,
        referralCount: stats.referralCount,
        commissionEarned: stats.commissionEarned,
        availableCommission,
        creditsIfConverted,
        sellRate,
      };
    } catch (error: any) {
      server.log.error({ error }, "Referral info error");
      return reply.status(500).send({ error: "Failed to fetch referral info" });
    }
  });

  // ── REFERRAL WITHDRAW ──
  server.post(
    "/api/referral/withdraw",
    { preHandler: [withdrawalLimiter] },
    async (request, reply) => {
      const user = await getUser(request, reply);
      if (!user) return;
      try {
        const { action } = request.body as {
          action: "convert_credits" | "sell_admin";
        };
        if (action !== "convert_credits" && action !== "sell_admin") {
          return reply
            .status(400)
            .send({ error: "action must be convert_credits or sell_admin" });
        }

        const availableAgg = await prisma.commission.aggregate({
          where: { referrerId: user.telegramId, status: "available" },
          _sum: { amount: true },
        });
        const available = Number(availableAgg._sum.amount || 0);

        if (available <= 0) {
          return reply
            .status(400)
            .send({ error: "No commission available to withdraw" });
        }

        const sellRateStr =
          await PaymentSettingsService.get("referral_sell_rate");
        const SELL_RATE = sellRateStr ? parseInt(sellRateStr) : 3000;

        if (action === "convert_credits") {
          const creditsToAdd = Math.floor(available / SELL_RATE);
          if (creditsToAdd <= 0) {
            return reply
              .status(400)
              .send({ error: "Commission too low to convert to credits" });
          }
          await prisma.$transaction(async (tx) => {
            await tx.commission.updateMany({
              where: { referrerId: user.telegramId, status: "available" },
              data: { status: "withdrawn" },
            });
            await tx.user.update({
              where: { telegramId: user.telegramId },
              data: { creditBalance: { increment: creditsToAdd } },
            });
            await tx.transaction.create({
              data: {
                orderId: `REF-CONV-${Date.now()}`,
                userId: user.telegramId,
                type: "referral_conversion",
                amountIdr: available,
                creditsAmount: creditsToAdd,
                gateway: "internal",
                status: "success",
                paymentMethod: "referral_commission",
              },
            });
          });
          return {
            ok: true,
            action: "convert_credits",
            creditsAdded: creditsToAdd,
            commissionUsed: available,
          };
        }

        // sell_admin: request cashout at 50% rate
        const cashoutAmount = Math.floor(available / 2);
        if (cashoutAmount <= 0) {
          return reply
            .status(400)
            .send({ error: "Commission too low for cashout" });
        }
        await prisma.commission.updateMany({
          where: { referrerId: user.telegramId, status: "available" },
          data: { status: "pending_cashout" },
        });
        await prisma.transaction.create({
          data: {
            orderId: `REF-CASH-${Date.now()}`,
            userId: user.telegramId,
            type: "referral_cashout",
            amountIdr: cashoutAmount,
            creditsAmount: 0,
            gateway: "admin_transfer",
            status: "pending",
            paymentMethod: "admin_transfer",
          },
        });
        return {
          ok: true,
          action: "sell_admin",
          cashoutAmount,
          commissionUsed: available,
        };
      } catch (error: any) {
        server.log.error({ error }, "Referral withdraw error");
        return reply
          .status(500)
          .send({ error: "Failed to process withdrawal" });
      }
    },
  );

  // ── SUBSCRIPTION PLANS ──
  server.get("/api/subscriptions", async () => {
    return getSubscriptionPlansAsync();
  });

  // ── SUBSCRIPTION BUY ──
  server.post("/api/subscription/buy", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { plan, cycle, gateway } = request.body as {
        plan: string;
        cycle: string;
        gateway?: string;
      };

      if (
        !(plan in SUBSCRIPTION_PLANS) ||
        !["monthly", "annual"].includes(cycle)
      ) {
        return reply.status(400).send({ error: "Invalid plan or cycle" });
      }

      if (!gateway) {
        return reply
          .status(400)
          .send({ error: "No payment methods available" });
      }

      const planKey = plan as PlanKey;
      const billingCycle = cycle as BillingCycle;
      const price = getPlanPrice(planKey, billingCycle);
      // Reuse the standard payment create flow with type=subscription
      const packageId = `sub_${planKey}_${billingCycle}`;
      let result: any;
      if (gateway === "duitku") {
        try {
          result = await DuitkuService.createTransaction({
            userId: user.telegramId,
            packageId,
            username: user.username || user.firstName || "Customer",
          });
        } catch {
          result = null; // sub_ package not in packages list — fall through to direct tx creation below
        }
      } else if (gateway === "tripay") {
        try {
          result = await TripayService.createTransaction({
            userId: user.telegramId,
            packageId,
            username: user.username || user.firstName || "Customer",
          });
        } catch {
          result = null; // sub_ package not in packages list — fall through to direct tx creation below
        }
      } else {
        result = await PaymentService.createTransaction({
          userId: user.telegramId,
          packageId,
          username: user.username || user.firstName || "Customer",
        });
      }

      // If gateway doesn't natively know sub_ packages, return error instead of unpayable record
      if (!result?.paymentUrl && !result?.payment_url) {
        return reply
          .status(502)
          .send({ error: "Payment gateway unavailable. Please try again." });
      }

      return {
        ok: true,
        ...result,
        plan: planKey,
        cycle: billingCycle,
        amountIdr: price,
      };
    } catch (error: any) {
      server.log.error({ error }, "Subscription buy error");
      return reply
        .status(500)
        .send({ error: "Failed to create subscription payment" });
    }
  });

  // ── SUBSCRIPTION CANCEL ──
  server.post("/api/subscription/cancel", async (request, reply) => {
    const user = await getUser(request, reply);
    if (!user) return;
    try {
      const { SubscriptionService } =
        await import("@/services/subscription.service.js");
      await SubscriptionService.cancelSubscription(user.telegramId);
      return { ok: true };
    } catch (error: any) {
      server.log.error({ error }, "Subscription cancel error");
      return reply.status(500).send({ error: "Failed to cancel subscription" });
    }
  });

  // ── VIDEO DOWNLOAD ──
  server.get("/video/:jobId/download", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const { token } = request.query as { token?: string };
      if (!token) return reply.status(401).send({ error: "Missing token" });

      // Verify JWT (server-signed) — base64 tokens were trivially forgeable
      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch {
        return reply.status(401).send({ error: "Invalid token" });
      }
      if (payload.jobId !== jobId)
        return reply.status(403).send({ error: "Token mismatch" });

      const video = await VideoService.getByJobId(jobId);
      if (!video) return reply.status(404).send({ error: "Video not found" });
      if (video.userId.toString() !== payload.telegramId)
        return reply.status(403).send({ error: "Access denied" });

      const localPath = video.downloadUrl;

      // Serve local file if it still exists (fastest path)
      if (localPath && fs.existsSync(localPath)) {
        const filename = `berkahkarya-${jobId}.mp4`;
        const stream = fs.createReadStream(localPath);
        const stat = fs.statSync(localPath);
        reply.header("Content-Type", "video/mp4");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        reply.header("Content-Length", stat.size);
        return reply.send(stream);
      }

      // Local file gone — proxy from provider URL (never redirect to avoid exposing provider CDN URL)
      if (video.videoUrl) {
        try {
          const providerRes = await fetch(video.videoUrl);
          if (!providerRes.ok)
            throw new ProviderError("upstream", `Upstream fetch failed: ${providerRes.status}`);
          const filename = `berkahkarya-${jobId}.mp4`;
          reply.header("Content-Type", "video/mp4");
          reply.header(
            "Content-Disposition",
            `attachment; filename="${filename}"`,
          );
          const contentLength = providerRes.headers.get("content-length");
          if (contentLength) reply.header("Content-Length", contentLength);
          return reply.send(providerRes.body);
        } catch {
          // Provider unavailable — fall through to 404
        }
      }

      return reply.status(404).send({
        error:
          "Video file is no longer available. Please regenerate the video.",
      });
    } catch (error) {
      server.log.error({ error }, "Video download error");
      return reply.status(500).send({ error: "Download failed" });
    }
  });

  // ─── Landing Page Chat Widget API ──────────────────────────────────────────
  // Rate limit: in-memory tracker, 10 messages per minute per IP
  const chatRateMap = new Map<string, { count: number; resetAt: number }>();

  server.post("/api/chat/landing", async (request, reply) => {
    const ip = request.ip;

    // Rate limiting
    const now = Date.now();
    const limit = chatRateMap.get(ip);
    if (limit && limit.resetAt > now) {
      if (limit.count >= 10) {
        return reply
          .status(429)
          .send({ error: "Too many messages. Please wait a moment." });
      }
      limit.count++;
    } else {
      chatRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    }

    const { message, sessionId } = request.body as {
      message?: string;
      sessionId?: string;
    };
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return reply.status(400).send({ error: "Message is required" });
    }
    if (message.length > 1000) {
      return reply
        .status(400)
        .send({ error: "Message too long (max 1000 chars)" });
    }

    const chatSessionId = sessionId || `landing_${ip}_${Date.now()}`;
    const omni = getOmniRouteService();

    const result = await omni.chat(chatSessionId, message.trim());
    if (!result.success) {
      return reply
        .status(500)
        .send({ error: "AI is temporarily unavailable. Please try again." });
    }

    return { reply: result.content, sessionId: chatSessionId };
  });

  // Clean up stale rate limit entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of chatRateMap) {
      if (val.resetAt <= now) chatRateMap.delete(key);
    }
  }, 300_000);

  // ── API v1 aliases (forward to unversioned /api/* for backward compat) ──
  server.get("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(301).redirect(`/api/${sub}`);
  });

  server.post("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(307).redirect(`/api/${sub}`);
  });

  server.delete("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(307).redirect(`/api/${sub}`);
  });
}
