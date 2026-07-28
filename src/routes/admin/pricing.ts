import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { UNIT_COSTS } from "@/config/packages";
import { validateBody, PricingConfigSchema, PricingDeleteSchema } from "@/utils/validation";
import { trackingVars } from "./shared";

export async function registerPricingRoutes(server: FastifyInstance) {
  server.get("/api/pricing/:category", async (request) => {
    const { category } = request.params as { category: string };
    return prisma.pricingConfig.findMany({
      where: { category },
      orderBy: { key: "asc" },
    });
  });

  server.post("/api/pricing", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await validateBody(request, reply, PricingConfigSchema);
    if (!data) return;
    await PaymentSettingsService.setPricingConfig(data.category, data.key, data.value);
    PaymentSettingsService.clearPricingCache();
    return { success: true };
  });

  server.delete("/api/pricing", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await validateBody(request, reply, PricingDeleteSchema);
    if (!data) return;
    await PaymentSettingsService.deletePricingConfig(data.category, data.key);
    PaymentSettingsService.clearPricingCache();
    return { success: true };
  });

  server.get("/api/pricing-overview", async () => {
    const [
      packages,
      subscriptions,
      videoCosts,
      imageCosts,
      providerCosts,
      global,
      unitCosts,
    ] = await Promise.all([
      PaymentSettingsService.getAllPricingByCategory("package"),
      PaymentSettingsService.getAllPricingByCategory("subscription"),
      PaymentSettingsService.getAllPricingByCategory("video_credit"),
      PaymentSettingsService.getAllPricingByCategory("image_credit"),
      PaymentSettingsService.getAllPricingByCategory("provider_cost"),
      PaymentSettingsService.getAllPricingByCategory("global"),
      PaymentSettingsService.getAllPricingByCategory("unit_cost"),
    ]);
    return {
      packages,
      subscriptions,
      videoCosts,
      imageCosts,
      providerCosts,
      global,
      unitCosts,
    };
  });

  server.get("/api/pricing-recommendation", async () => {
    const USD_TO_IDR = getConfig().USD_TO_IDR_RATE;
    const margin = await PaymentSettingsService.getMarginPercent();
    const providerCosts =
      await PaymentSettingsService.getAllPricingByCategory("provider_cost");
    const unitCosts =
      await PaymentSettingsService.getAllPricingByCategory("unit_cost");

    const videoCosts = Object.values(providerCosts)
      .map(v => (v as { costUsd?: number })?.costUsd || Number(v) || 0)
      .filter((c: number) => c > 0);
    const avgVideoSceneCostUsd =
      videoCosts.length > 0
        ? videoCosts.reduce((a: number, b: number) => a + b, 0) /
          videoCosts.length
        : 0.04;
    const maxVideoSceneCostUsd =
      videoCosts.length > 0 ? Math.max(...videoCosts) : 0.08;

    const visionOverheadUsd = 0.006;
    const optimizerOverheadUsd = 0.001;
    const voOverheadUsd = 0.001;

    const calcMinUnits = (totalCostUsd: number) => {
      const costIdr = totalCostUsd * USD_TO_IDR;
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

}
