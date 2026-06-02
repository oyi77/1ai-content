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
  server.post("/api/settings/exchange-rate", async (request, reply) => {
    const { rate } = request.body as Record<string, string>;
    if (!rate || isNaN(Number(rate)) || Number(rate) < 10_000 || Number(rate) > 50_000) {
      return reply.status(400).send({ error: "Invalid rate (must be between 10,000 and 50,000 IDR/USD)" });
    }
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
  server.post("/api/settings/pixels", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "Invalid payload" });
    }
    const PIXEL_ID_REGEX = /^[a-zA-Z0-9_-]*$/;
    for (const [key, val] of Object.entries({
      fbPixelId: body.fbPixelId,
      ga4Id: body.ga4Id,
      ttPixelId: body.ttPixelId,
    })) {
      if (val && typeof val === "string" && !PIXEL_ID_REGEX.test(val)) {
        return reply.status(400).send({
          error: `Invalid ${key}: only alphanumeric characters, hyphens, and underscores are allowed`,
        });
      }
    }
    const config = {
      fbPixelId: body.fbPixelId || "",
      ga4Id: body.ga4Id || "",
      ttPixelId: body.ttPixelId || "",
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
