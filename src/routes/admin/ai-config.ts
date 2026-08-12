import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AITaskSettingsService } from "@/services/ai-task-settings.service";
import { AIConfigService } from "@/services/ai-config.service";
import { CustomProviderService } from "@/services/custom-provider.service";
import { ProviderSettingsService } from "@/services/provider-settings.service";
import { getOmniRouteService } from "@/services/omniroute.service";
import { redis } from "@/config/redis";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { ConfigError } from "@/utils/app-errors";
import { validateBody, CustomProviderSchema } from "@/utils/validation";
import axios from "axios";
import { logger } from "@/utils/logger";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const aiTasksBodySchema = zodToJsonSchema(
  z.object({}).passthrough(),
  "aiTasksBody",
);
const aiConfigTaskBodySchema = zodToJsonSchema(
  z.object({}).passthrough(),
  "aiConfigTaskBody",
);
const aiConfigPromptBodySchema = zodToJsonSchema(
  z.object({}).passthrough(),
  "aiConfigPromptBody",
);
const aiConfigChatBodySchema = zodToJsonSchema(
  z.object({}).passthrough(),
  "aiConfigChatBody",
);
const customProviderIdParamSchema = zodToJsonSchema(
  z.object({ id: z.string().uuid() }),
  "customProviderIdParam",
);
const customProviderUpdateBodySchema = zodToJsonSchema(
  z.object({}).passthrough(),
  "customProviderUpdateBody",
);
const customProviderTestBodySchema = zodToJsonSchema(
  z.object({ model: z.string().optional() }),
  "customProviderTestBody",
);

export async function registerAIConfigRoutes(
  server: FastifyInstance,
  verifyAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<boolean>,
) {
  // ── AI Task Settings ──

  server.get("/api/admin/ai-tasks/settings", async (_req, reply) => {
    const settings = await AITaskSettingsService.getSettings();
    return reply.send(settings);
  });

  server.post(
    "/api/admin/ai-tasks/settings",
    {
      schema: { body: aiTasksBodySchema },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      await AITaskSettingsService.updateSettings(
        body as Parameters<typeof AITaskSettingsService.updateSettings>[0],
      );
      return reply.send({ ok: true });
    },
  );

  // ── AI Config API ──

  server.get("/api/admin/ai-config", async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;
    const config = await AIConfigService.getFullConfig();
    return reply.send(config);
  });

  server.post(
    "/api/admin/ai-config/tasks",
    {
      schema: { body: aiConfigTaskBodySchema },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const body = request.body as Record<string, unknown>;
      await AIConfigService.updateTasksConfig(
        body as Parameters<typeof AIConfigService.updateTasksConfig>[0],
      );
      return reply.send({ ok: true });
    },
  );

  server.post(
    "/api/admin/ai-config/prompts",
    {
      schema: { body: aiConfigPromptBodySchema },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const body = request.body as Record<string, unknown>;
      await AIConfigService.updatePromptsConfig(
        body as Parameters<typeof AIConfigService.updatePromptsConfig>[0],
      );
      return reply.send({ ok: true });
    },
  );

  server.post(
    "/api/admin/ai-config/chat",
    {
      schema: { body: aiConfigChatBodySchema },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const body = request.body as Record<string, unknown>;
      await AIConfigService.updateChatConfig(
        body as Parameters<typeof AIConfigService.updateChatConfig>[0],
      );
      return reply.send({ ok: true });
    },
  );

  server.post("/api/admin/ai-config/reset", async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;
    await AIConfigService.resetTasksConfig();
    await AIConfigService.resetPromptsConfig();
    await AIConfigService.resetChatConfig();
    return reply.send({ ok: true });
  });

  // ── Custom Providers API ──

  server.get("/api/admin/custom-providers", async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;
    const providers = await CustomProviderService.getAll();
    return reply.send(providers);
  });

  server.post("/api/admin/custom-providers", async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;
    const data = await validateBody(request, reply, CustomProviderSchema);
    if (!data) return;
    const provider = await CustomProviderService.create(
      data as Parameters<typeof CustomProviderService.create>[0],
    );
    return reply.send(provider);
  });

  server.put(
    "/api/admin/custom-providers/:id",
    {
      schema: {
        params: customProviderIdParamSchema,
        body: customProviderUpdateBodySchema,
      },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const data = request.body as Record<string, unknown>;
      const provider = await CustomProviderService.update(
        id,
        data as Parameters<typeof CustomProviderService.update>[1],
      );
      return reply.send(provider);
    },
  );

  server.delete(
    "/api/admin/custom-providers/:id",
    {
      schema: {
        params: customProviderIdParamSchema,
      },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      await CustomProviderService.delete(id);
      return reply.send({ ok: true });
    },
  );

  server.post(
    "/api/admin/custom-providers/:id/fetch-models",
    {
      schema: {
        params: customProviderIdParamSchema,
      },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const models = await CustomProviderService.fetchModels(id);
      return reply.send({ ok: true, count: models.length, models });
    },
  );

  server.post(
    "/api/admin/custom-providers/:id/test",
    {
      schema: {
        params: customProviderIdParamSchema,
        body: customProviderTestBodySchema,
      },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown>) || {};
      const model = body.model as string | undefined;
      const result = await CustomProviderService.testProvider(id, model);
      return reply.send(result);
    },
  );

  server.post(
    "/api/admin/custom-providers/:id/check-balance",
    {
      schema: {
        params: customProviderIdParamSchema,
      },
    },
    async (request, reply) => {
      if (!(await verifyAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      try {
        const balance = await CustomProviderService.checkBalance(id);
        return reply.send({ success: true, balance });
      } catch (err) {
        return reply
          .status(400)
          .send({ success: false, error: (err as Error).message });
      }
    },
  );

  // ── Models Catalog (cached proxy to models.dev) ──

  server.get("/api/admin/models-catalog", async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const CACHE_KEY = "admin:models_catalog";
    const CACHE_TTL = 3600;

    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {
      /* fall through */
    }

    const response = await axios.get("https://models.dev/api.json", {
      timeout: 15000,
    });
    const raw = response.data as Record<string, any>;

    const dbRows = await prisma.pricingConfig.findMany({
      where: { category: "api_keys" },
    });
    const dbMap: Record<string, string> = {};
    for (const row of dbRows) dbMap[row.key] = String(row.value ?? "");

    const hasKey = (keyName: string) => {
      const envVal = process.env[keyName] || "";
      const dbVal = dbMap[keyName] || "";
      return !!(dbVal || envVal);
    };

    const isProviderActive = (providerId: string) => {
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
        piapi: "PIAPI_API_KEY",
        geminigen: "GEMINIGEN_API_KEY",
        lingyaai: "LINGYAAI_API_KEY",
        getgoapi: "GETGOAPI_API_KEY",
        apiyi: "APIYI_API_KEY",
        runware: "RUNWARE_API_KEY",
        wavespeed: "WAVESPEED_API_KEY",
        zai: "ZAI_API_KEY",
        zai_video: "ZAI_API_KEY",
        omniroute: "OMNIROUTE_API_KEY",
        openai: "OPENAI_API_KEY",
        gemini: "GEMINI_API_KEY",
        groq: "GROQ_API_KEY",
        together: "TOGETHER_API_KEY",
        segmind: "SEGMIND_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
      };

      const mappedKey = envVarMap[providerId];
      if (mappedKey) return hasKey(mappedKey);

      const fallbackKey =
        providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
      return hasKey(fallbackKey);
    };

    interface ModelEntry {
      id: string;
      name: string;
      provider: string;
      providerName: string;
      family: string;
      vision: boolean;
      reasoning: boolean;
      toolCall: boolean;
      openWeights: boolean;
      inputModalities: string[];
      outputModalities: string[];
      contextWindow: number | null;
      outputLimit: number | null;
      releaseDate: string | null;
    }
    const models: ModelEntry[] = [];
    for (const [providerId, providerData] of Object.entries(raw)) {
      if (!providerData || typeof providerData !== "object") continue;
      if (!isProviderActive(providerId)) continue;

      const providerRecord = providerData as Record<string, unknown>;
      const providerName = (providerRecord.name as string) || providerId;
      const providerModels = providerRecord.models as
        | Record<string, unknown>[]
        | undefined;
      if (!providerModels || typeof providerModels !== "object") continue;
      for (const [modelId, modelData] of Object.entries(providerModels)) {
        if (!modelData || typeof modelData !== "object") continue;
        const m = modelData as Record<string, unknown>;
        const modalities = m.modalities as Record<string, string[]> | undefined;
        const limits = m.limit as Record<string, number> | undefined;
        models.push({
          id: modelId,
          name: (m.name as string) || modelId,
          provider: providerId,
          providerName,
          family: (m.family as string) || "",
          vision: !!m.attachment,
          reasoning: !!m.reasoning,
          toolCall: !!m.tool_call,
          openWeights: !!m.open_weights,
          inputModalities: modalities?.input || ["text"],
          outputModalities: modalities?.output || ["text"],
          contextWindow: limits?.context || null,
          outputLimit: limits?.output || null,
          releaseDate: (m.release_date as string) || null,
        });
      }
    }

    models.sort((a: ModelEntry, b: ModelEntry) => {
      if (a.vision !== b.vision) return a.vision ? -1 : 1;
      return a.provider.localeCompare(b.provider);
    });

    const result = {
      models,
      total: models.length,
      visionCount: models.filter((m: ModelEntry) => m.vision).length,
    };
    try {
      await redis.set(CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL);
    } catch {
      /* non-fatal */
    }
    return reply.send(result);
  });

  // ── Admin AI Chat ──

  const adminChatRateMap = new Map<
    string,
    { count: number; resetAt: number }
  >();

  server.post("/api/admin/ai-chat", async (request, reply) => {
    const ip = request.ip;
    const now = Date.now();
    const limit = adminChatRateMap.get(ip);
    if (limit && limit.resetAt > now) {
      if (limit.count >= 10) {
        return reply
          .status(429)
          .send({ error: "Rate limit: 10 messages per minute" });
      }
      limit.count++;
    } else {
      adminChatRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    }

    const { message, model: requestedModel } = (request.body ?? {}) as {
      message?: string;
      model?: string;
    };
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return reply.status(400).send({ error: "Message is required" });
    }
    if (message.length > 2000) {
      return reply
        .status(400)
        .send({ error: "Message too long (max 2000 chars)" });
    }

    let systemContext = "";
    try {
      const [stats, providerOverrides, exchangeRate, profitData] =
        await Promise.all([
          prisma.user.count().then(async (userCount) => {
            const videoCount = await prisma.video.count();
            const txCount = await prisma.transaction.count({
              where: { status: "success" },
            });
            return { userCount, videoCount, txCount };
          }),
          ProviderSettingsService.getDynamicSettings(),
          redis.get("admin:exchange_rate"),
          prisma.transaction.aggregate({
            where: {
              status: "success",
              createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
            },
            _sum: { amountIdr: true },
            _count: true,
          }),
        ]);

      systemContext = `
LIVE SYSTEM CONTEXT (as of ${new Date().toISOString()}):
- Total users: ${stats.userCount}
- Total videos generated: ${stats.videoCount}
- Successful transactions: ${stats.txCount}
- Last 30d revenue: Rp ${Number(profitData._sum.amountIdr || 0).toLocaleString()} (${profitData._count} transactions)
- USD/IDR rate: ${exchangeRate || getConfig().USD_TO_IDR_RATE}
- Provider overrides: ${JSON.stringify(providerOverrides || {})}

ARCHITECTURE:
- Stack: Node.js + Telegraf + Fastify + Prisma + BullMQ + Redis
- Video pipeline: 9-tier provider fallback (BytePlus > XAI > LaoZhang > EvoLink > Hypereal > SiliconFlow > Fal.ai > Kie.ai > Remotion)
- Payment: Midtrans + Tripay + DuitKu gateways
- Pricing: Dynamic from DB (PricingConfig table), 1 Credit = 10 Units
- AI Chat: OmniRoute proxy to multiple LLM providers

You are an expert system administrator and architect for this platform. Give specific, actionable advice. Reference actual config values and stats when relevant.`;
    } catch {
      systemContext = "System context unavailable.";
    }

    const geminiModels = [
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ];
    const isDirectGemini =
      requestedModel &&
      geminiModels.some((m) =>
        requestedModel.startsWith(m.split("-").slice(0, 2).join("-")),
      );
    const fullMessage = systemContext
      ? systemContext + "\n\nADMIN QUESTION: " + message.trim()
      : message.trim();

    if (isDirectGemini) {
      try {
        const geminiKey = getConfig().GEMINI_API_KEY;
        if (!geminiKey)
          return reply
            .status(500)
            .send({ error: "GEMINI_API_KEY not configured" });
        const geminiModel = requestedModel || "gemini-2.0-flash";
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            contents: [{ role: "user", parts: [{ text: fullMessage }] }],
            systemInstruction: {
              parts: [
                {
                  text: "You are an expert system administrator for a Telegram bot SaaS platform.",
                },
              ],
            },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          },
          { timeout: 30000 },
        );
        const content =
          geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!content)
          return reply
            .status(500)
            .send({ error: "Gemini returned empty response" });
        return { reply: content, model: geminiModel };
      } catch (err) {
        return reply
          .status(500)
          .send({ error: `Gemini error: ${(err as Error).message}` });
      }
    }

    const omni = getOmniRouteService();
    const sessionId = `admin_chat_${ip}`;
    const omniRecord = omni as unknown as Record<string, unknown>;
    const history = omniRecord.conversationHistory as
      | Map<string, unknown>
      | undefined;
    const isFirstMessage = !history?.has(sessionId);
    const msgToSend = isFirstMessage ? fullMessage : message.trim();
    const result = await omni.chat(
      sessionId,
      msgToSend,
      requestedModel || undefined,
    );

    if (!result.success) {
      try {
        const geminiKey = getConfig().GEMINI_API_KEY;
        if (!geminiKey) throw new ConfigError("GEMINI_API_KEY");
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            contents: [{ role: "user", parts: [{ text: msgToSend }] }],
            systemInstruction: {
              parts: [
                {
                  text: "You are an expert system administrator for a Telegram bot SaaS platform.",
                },
              ],
            },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          },
          { timeout: 30000 },
        );
        const geminiContent =
          geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (geminiContent)
          return { reply: geminiContent, model: "gemini-2.0-flash (fallback)" };
      } catch (fallbackErr) {
        logger.warn(
          "Gemini fallback also failed:",
          (fallbackErr as Error).message,
        );
      }
      return reply.status(500).send({
        error:
          "AI is temporarily unavailable. Check OMNIROUTE_API_KEY or GEMINI_API_KEY.",
      });
    }

    return { reply: result.content, model: result.model };
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of adminChatRateMap) {
      if (val.resetAt <= now) adminChatRateMap.delete(key);
    }
  }, 300_000);
}
