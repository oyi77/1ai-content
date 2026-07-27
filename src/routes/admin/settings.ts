import { FastifyInstance } from "fastify";
import { redis } from "@/config/redis";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";
import { PROVIDER_CONFIG } from "@/config/providers";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const landingConfigBodySchema = zodToJsonSchema(z.object({
  headline: z.string().optional().default(""),
  subheadline: z.string().optional().default(""),
  ctaText: z.string().optional().default(""),
  heroImageUrl: z.string().url().optional().default(""),
  heroVideo: z.string().optional().default(""),
  testimonials: z.array(z.unknown()).optional().default([]),
  pricingNote: z.string().optional().default(""),
  footerText: z.string().optional().default(""),
  videoDuration: z.string().optional().default("60"),
  botUsername: z.string().optional().default("berkahkarya_saas_bot"),
  proofStats: z.array(z.unknown()).optional().default([]),
  problemCards: z.array(z.unknown()).optional().default([]),
  solutionCards: z.array(z.unknown()).optional().default([]),
}), "landingConfigBody");

export async function registerSettingsRoutes(server: FastifyInstance) {
  // ── Landing Page Config ──

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

  server.post("/api/settings/landing", {
    schema: {
      body: landingConfigBodySchema,
    },
  }, async (request, reply) => {
    const data = request.body as Record<string, unknown>;
    if (!data || typeof data !== "object") {
      return reply.status(400).send({ error: "Invalid payload" });
    }
    const config = {
      headline: data.headline || "",
      subheadline: data.subheadline || "",
      ctaText: data.ctaText || "",
      heroImageUrl: data.heroImageUrl || "",
      heroVideo: data.heroVideo || "",
      testimonials: Array.isArray(data.testimonials) ? data.testimonials : [],
      pricingNote: data.pricingNote || "",
      footerText: data.footerText || "",
      videoDuration: data.videoDuration || "60",
      botUsername:
        data.botUsername || getConfig().BOT_USERNAME || "berkahkarya_saas_bot",
      proofStats: Array.isArray(data.proofStats) ? data.proofStats : [],
      problemCards: Array.isArray(data.problemCards) ? data.problemCards : [],
      solutionCards: Array.isArray(data.solutionCards)
        ? data.solutionCards
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

  // ── Seed Pricing DB from static config ──

  server.post("/api/settings/seed-pricing", async () => {
    const { PACKAGES, SUBSCRIPTION_PLANS, UNIT_COSTS } =
      await import("../../config/pricing.js");
    let seeded = 0;

    for (const pkg of PACKAGES) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "package", key: pkg.id } },
        update: { value: JSON.parse(JSON.stringify(pkg)) },
        create: { category: "package", key: pkg.id, value: JSON.parse(JSON.stringify(pkg)) },
      });
      seeded++;
    }

    for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "subscription", key } },
        update: { value: JSON.parse(JSON.stringify(plan)) },
        create: { category: "subscription", key, value: JSON.parse(JSON.stringify(plan)) },
      });
      seeded++;
    }

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

    await prisma.pricingConfig.deleteMany({
      where: { category: "video_credit" },
    });

    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "global", key: "margin_percent" } },
      update: { value: 30 },
      create: { category: "global", key: "margin_percent", value: 30 },
    });
    seeded++;

    const { NICHE_LIST } = await import("../../config/niches.js");
    for (const niche of NICHE_LIST) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "niche", key: niche.id } },
        update: { value: JSON.parse(JSON.stringify(niche)) },
        create: { category: "niche", key: niche.id, value: JSON.parse(JSON.stringify(niche)) },
      });
      seeded++;
    }

    const videoProviders = Object.entries(PROVIDER_CONFIG.video);
    const imageProviders = Object.entries(PROVIDER_CONFIG.image);

    for (const [key, cfg] of [...videoProviders, ...imageProviders]) {
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

  // ── Referral Conversion Rates ──

  server.get("/api/settings/referral", async () => {
    const sellRate = await PaymentSettingsService.get("referral_sell_rate");
    const buyRate = await PaymentSettingsService.get("referral_buy_rate");
    return {
      sellRate: sellRate ? parseInt(sellRate) : 3000,
      buyRate: buyRate ? parseInt(buyRate) : 6000,
    };
  });

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

  // ── Profit Report ──

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

    let dailyRevenue: unknown[] = [];
    let dailyCosts: unknown[] = [];
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
    const currentRate = getConfig().USD_TO_IDR_RATE || 16000;
    const totalCostIdr = Math.round(totalCostUsd * currentRate);

    const fixedDailyCosts = dailyCosts.map((d) => {
      const dc = d as Record<string, unknown>;
      return {
        ...dc,
        cost_idr: Math.round(((dc.cost_usd as number) || 0) * currentRate),
      };
    });

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

  // ── Transfer & Cashout Logs ──

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

    const user = await prisma.user.findUnique({
      where: { telegramId: transaction.userId },
      select: { language: true },
    });
    const lang = user?.language || "id";
    const amount = Number(transaction.amountIdr).toLocaleString("id-ID");
    await UserService.sendMessage(
      transaction.userId,
      t("referral.cashout_completed", lang).replace("{amount}", amount),
      { parse_mode: "Markdown" },
    );

    return {
      success: true,
      transactionId,
      amount: Number(transaction.amountIdr),
    };
  });
}
