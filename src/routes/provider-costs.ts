/**
 * Provider Cost Admin Routes
 *
 * Admin endpoints for monitoring and managing provider costs in real-time
 */

import { FastifyInstance } from "fastify";
import { ProviderCostTrackerService } from "@/services/provider-cost-tracker.service";
import { DynamicPricingService } from "@/services/dynamic-pricing.service";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";

export function registerProviderCostRoutes(server: FastifyInstance): void {
  // GET /api/admin/provider-costs — Get all provider costs with metadata
  server.get("/api/admin/provider-costs", async (_request, reply) => {
    try {
      const costs = await ProviderCostTrackerService.getAllProviderCosts();

      // Add last update time from DB
      const dbCosts = await prisma.pricingConfig.findMany({
        where: { category: 'provider_cost' },
        orderBy: { updatedAt: 'desc' },
      });

      const costsWithTimestamp = costs.map(cost => {
        const dbCost = dbCosts.find((c: any) => c.key === cost.providerKey);
        return {
          ...cost,
          lastUpdated: dbCost?.updatedAt || null,
          sourcePriority: cost.source === 'api' ? 1 : cost.source === 'manual' ? 2 : 3,
        };
      });

      // Sort by source priority (API first, then manual, then static)
      costsWithTimestamp.sort((a, b) => a.sourcePriority - b.sourcePriority);

      return reply.send({
        costs: costsWithTimestamp,
        summary: {
          total: costs.length,
          apiTracked: costs.filter(c => c.source === 'api').length,
          manual: costs.filter(c => c.source === 'manual').length,
          static: costs.filter(c => c.source === 'static').length,
        },
      });
    } catch (error: any) {
      logger.error("Failed to fetch provider costs:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/admin/provider-costs/:key/refresh — Manually refresh a provider's cost
  server.post<{ Params: { key: string } }>("/api/admin/provider-costs/:key/refresh", async (request, reply) => {
    try {
      const { key } = request.params;

      // For now, this would trigger an API call to the provider to fetch current pricing
      // Most providers don't have pricing APIs, so this is mostly for manual input
      // DEFERRED: Provider-specific pricing APIs not universally available.
      // Most providers (Gemini, OpenAI) don't expose pricing endpoints.
      // Using manual admin input + static config as fallback. See ProviderCostTrackerService.

      // For now, just re-sync from static config
      const cost = await ProviderCostTrackerService.getProviderCost(key);

      if (!cost) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      return reply.send({
        success: true,
        provider: key,
        cost,
        message: `Cost refreshed for ${key}`,
      });
    } catch (error: any) {
      logger.error(`Failed to refresh provider cost ${request.params.key}:`, error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // PUT /api/admin/provider-costs/:key — Manually set provider cost
  server.put<{ Params: { key: string } }>("/api/admin/provider-costs/:key", async (request, reply) => {
    const { key } = request.params;
    try {
      const { costUsd, metadata } = request.body as {
        costUsd: number;
        metadata?: Record<string, any>;
      };

      if (typeof costUsd !== 'number' || costUsd < 0) {
        return reply.status(400).send({ error: "Invalid costUsd value" });
      }

      await ProviderCostTrackerService.setManualCost(key, costUsd, metadata);

      return reply.send({
        success: true,
        provider: key,
        cost: costUsd,
        message: `Provider cost updated for ${key}`,
      });
    } catch (error: any) {
      logger.error(`Failed to set provider cost ${key}:`, error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/admin/provider-costs/:key/history — Get cost history for a provider
  server.get<{ Params: { key: string } }>("/api/admin/provider-costs/:key/history", async (request, reply) => {
    const { key } = request.params;
    try {
      const history = await ProviderCostTrackerService.getCostHistory(key);

      return reply.send({
        provider: key,
        history,
        summary: {
          total: history.length,
          latest: history[history.length - 1],
          oldest: history[0],
        },
      });
    } catch (error: any) {
      logger.error(`Failed to fetch cost history for ${key}:`, error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/admin/provider-costs/sync — Sync all provider costs from config
  server.post("/api/admin/provider-costs/sync", async (_request, reply) => {
    try {
      const synced = await ProviderCostTrackerService.syncFromConfig();

      return reply.send({
        success: true,
        synced,
        message: `Synced ${synced} provider costs from config`,
      });
    } catch (error: any) {
      logger.error("Failed to sync provider costs:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/admin/dynamic-pricing/recommendations — Get dynamic pricing recommendations
  server.get("/api/admin/dynamic-pricing/recommendations", async (_request, reply) => {
    try {
      const recommendations = await DynamicPricingService.getRecommendedUnitCosts();

      // Get current unit costs for comparison
      const currentCosts = await prisma.pricingConfig.findMany({
        where: { category: 'unit_cost' },
      });

      const currentCostsMap = Object.fromEntries(
        currentCosts.map((c: any) => [c.key, c.value])
      );

      const withComparison = Object.entries(recommendations).map(([key, rec]) => ({
        ...rec,
        key,
        currentUnits: (currentCostsMap[key]?.units || 0),
        difference: rec.units - (currentCostsMap[key]?.units || 0),
        needsUpdate: rec.units !== (currentCostsMap[key]?.units || 0),
      }));

      return reply.send({
        recommendations: withComparison,
        summary: {
          total: Object.keys(recommendations).length,
          needsUpdate: withComparison.filter(r => r.needsUpdate).length,
        },
      });
    } catch (error: any) {
      logger.error("Failed to calculate pricing recommendations:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/admin/dynamic-pricing/recalculate — Recalculate all prices based on current costs
  server.post("/api/admin/dynamic-pricing/recalculate", async (_request, reply) => {
    try {
      const result = await DynamicPricingService.recalculateAllPrices();

      return reply.send({
        success: true,
        ...result,
        message: `Recalculated ${result.updated} unit costs`,
      });
    } catch (error: any) {
      logger.error("Failed to recalculate prices:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/admin/dynamic-pricing/drift — Check for price drift
  server.get("/api/admin/dynamic-pricing/drift", async (request, reply) => {
    try {
      const threshold = Number((request.query as Record<string, string>).threshold || 10);
      const drift = await DynamicPricingService.checkPriceDrift(threshold);

      return reply.send({
        ...drift,
        threshold,
        message: drift.needsUpdate
          ? `${drift.driftedProviders.length} providers have significant cost changes`
          : "All provider costs are within threshold",
      });
    } catch (error: any) {
      logger.error("Failed to check price drift:", error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/admin/dynamic-pricing/simulation — Simulate price for a scenario
  server.get("/api/admin/dynamic-pricing/simulation", async (request, reply) => {
    try {
      const { providerKey, units } = request.query as {
        providerKey?: string;
        units?: string;
      };

      if (!providerKey || !units) {
        return reply.status(400).send({
          error: "Missing required parameters: providerKey and units"
        });
      }

      const calculation = await DynamicPricingService.calculatePrice({
        providerKey,
        units: parseInt(units),
      });

      return reply.send({
        ...calculation,
        input: { providerKey, units: parseInt(units) },
      });
    } catch (error: any) {
      logger.error("Failed to simulate pricing:", error);
      return reply.status(500).send({ error: error.message });
    }
  });
}
