/**
 * Admin System Settings Routes
 *
 * Extracted from routes/admin.ts as part of the Phase 3.2 refactor
 * (REFACTORING_AUDIT.md §3.2). Handles system-level config:
 * exchange rate, pixel tracking IDs.
 */
import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { redis } from "@/config/redis";
import { getConfig } from "@/config/env";
import { ExchangeRateService } from "@/services/exchange-rate.service";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const exchangeRateBodySchema = zodToJsonSchema(z.object({
  rate: z.string().refine((v) => {
    const n = Number(v);
    return !isNaN(n) && n >= 10_000 && n <= 50_000;
  }, { message: "Rate must be a number between 10,000 and 50,000 IDR/USD" }),
}), "exchangeRateBody");

const pixelConfigBodySchema = zodToJsonSchema(z.object({
  fbPixelId: z.string().regex(/^[a-zA-Z0-9_-]*$/).optional().default(""),
  ga4Id: z.string().regex(/^[a-zA-Z0-9_-]*$/).optional().default(""),
  ttPixelId: z.string().regex(/^[a-zA-Z0-9_-]*$/).optional().default(""),
}), "pixelConfigBody");

type AdminVerifier = (request: any, reply: any) => Promise<boolean>;

export async function registerSystemSettingsRoutes(server: FastifyInstance, verifyAdmin: AdminVerifier) {
  // GET /api/settings/exchange-rate
  server.get("/api/settings/exchange-rate", async () => {
    return ExchangeRateService.getRate();
  });

  // POST /api/settings/exchange-rate/refresh
  server.post("/api/settings/exchange-rate/refresh", async () => {
    return ExchangeRateService.refresh();
  });

  // POST /api/settings/exchange-rate
  server.post("/api/settings/exchange-rate", {
    schema: { body: exchangeRateBodySchema },
  }, async (request, reply) => {
    const { rate } = request.body as { rate: string };
    const numRate = Number(rate);
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "system", key: "exchange_rate" } },
      create: {
        category: "system",
        key: "exchange_rate",
        value: numRate,
        updatedBy: BigInt(0),
      },
      update: { value: numRate, updatedBy: BigInt(0) },
    });
    await redis.set("admin:exchange_rate", String(numRate));
    return { success: true, rate: numRate };
  });

  // GET /api/settings/pixels
  server.get("/api/settings/pixels", async () => {
    const cached = await redis.get("admin:pixel_config");
    if (cached) return JSON.parse(cached);
    const dbRow = await prisma.pricingConfig.findUnique({
      where: { category_key: { category: "system", key: "pixel_config" } },
    });
    if (dbRow) {
      const parsed = dbRow.value as {
        fbPixelId: string;
        ga4Id: string;
        ttPixelId: string;
      };
      await redis.set("admin:pixel_config", JSON.stringify(parsed));
      return parsed;
    }
    const cfg = getConfig();
    return {
      fbPixelId: cfg.FACEBOOK_PIXEL_ID || "",
      ga4Id: cfg.GA4_TRACKING_ID || "",
      ttPixelId: cfg.TIKTOK_PIXEL_ID || "",
    };
  });

  // POST /api/settings/pixels
  server.post("/api/settings/pixels", {
    schema: { body: pixelConfigBodySchema },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const config = {
      fbPixelId: (body.fbPixelId as string) || "",
      ga4Id: (body.ga4Id as string) || "",
      ttPixelId: (body.ttPixelId as string) || "",
    };
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "system", key: "pixel_config" } },
      create: {
        category: "system",
        key: "pixel_config",
        value: config,
        updatedBy: BigInt(0),
      },
      update: { value: config, updatedBy: BigInt(0) },
    });
    await redis.set("admin:pixel_config", JSON.stringify(config));
    return { success: true };
  });
}
