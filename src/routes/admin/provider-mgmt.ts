import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "@/config/redis";
import { getConfig } from "@/config/env";
import { ProviderSettingsService } from "@/services/provider-settings.service";
import { ProviderBalanceService } from "@/services/provider-balance.service";
import { CircuitBreaker } from "@/services/circuit-breaker.service";
import { PROVIDER_CONFIG } from "@/config/providers";
import { trackingVars } from "./shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const providerOverrideSchema = zodToJsonSchema(z.record(z.string(), z.unknown()), "providerOverride");

export async function registerProviderMgmtRoutes(
  server: FastifyInstance,
  verifyAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>,
) {
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

    const videoProviders = Object.entries(PROVIDER_CONFIG.video).map(
      ([key, cfg]) => {
        const override = overrides.video?.[key];
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
    } catch (err) {
      return { balances: [], error: (err as Error).message };
    }
  });

  /** GET /api/admin/providers/models — Fetch model lists for all providers */
  server.get("/api/admin/providers/models", async () => {
    try {
      const models = await ProviderBalanceService.fetchAllModels();
      return { models };
    } catch (err) {
      return { models: [], error: (err as Error).message };
    }
  });

  /** POST /api/admin/providers/:key/reset-cb — Reset circuit breaker for a provider */
  server.post("/api/admin/providers/:key/reset-cb", async (request, reply) => {
    const { key } = request.params as { key: string };
    try {
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
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  /** POST /api/admin/providers/:key/test — Test provider connectivity */
  server.post("/api/admin/providers/:key/test", async (request, reply) => {
    const { key } = request.params as { key: string };
    try {
      const result = await ProviderBalanceService.testProvider(key);
      return result;
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message });
    }
  });

  /** POST /api/admin/providers/reset-all-cb — Reset all circuit breakers */
  server.post("/api/admin/providers/reset-all-cb", async () => {
    await CircuitBreaker.resetAll();
    return { success: true, message: "All circuit breakers reset" };
  });

  // ── Provider Settings Override ──

  /** GET /api/admin/settings/providers — Dynamic provider overrides */
  server.get("/api/admin/settings/providers", async () => {
    const overrides = await ProviderSettingsService.getDynamicSettings();
    return { overrides };
  });

  /** POST /api/admin/settings/providers — Update dynamic provider overrides */
  server.post("/api/admin/settings/providers", {
    schema: {
      body: providerOverrideSchema,
    },
  }, async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as Record<string, unknown>;
    await ProviderSettingsService.updateSettings(body as Parameters<typeof ProviderSettingsService.updateSettings>[0]);
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
}
