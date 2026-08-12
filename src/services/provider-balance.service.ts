import axios from "axios";
import { getConfig } from "@/config/env";
import { redis } from "@/config/redis";
import { checkProviderBalance } from "@/services/balance-checker.service";
import { logger } from "@/utils/logger";

export interface BalanceResult {
  provider: string;
  balance: number | null;
  currency: string;
  status: "ok" | "error" | "not_configured" | "not_supported";
  error?: string;
}

export interface ModelResult {
  provider: string;
  models: string[];
  cached: boolean;
}

const BALANCE_CACHE_TTL = 300;
const MODELS_CACHE_TTL = 3600;

const ALL_PROVIDER_KEYS = [
  "omniroute",
  "byteplus",
  "xai",
  "laozhang",
  "evolink",
  "hypereal",
  "siliconflow",
  "falai",
  "kie",
  "piapi",
  "geminigen",
  "lingyaai",
  "getgoapi",
  "apiyi",
  "runware",
  "wavespeed",
  "zai_video",
  "together",
  "segmind",
  "nvidia",
  "gemini",
  "groq",
  "agentrouter",
];

const API_KEY_MAP: Record<string, string> = {
  omniroute: "OMNIROUTE_API_KEY",
  byteplus: "BYTEPLUS_API_KEY",
  xai: "XAI_API_KEY",
  laozhang: "LAOZHANG_API_KEY",
  evolink: "EVOLINK_API_KEY",
  hypereal: "HYPEREAL_API_KEY",
  siliconflow: "SILICONFLOW_API_KEY",
  falai: "FALAI_API_KEY",
  kie: "KIE_API_KEY",
  piapi: "PIAPI_API_KEY",
  geminigen: "GEMINIGEN_API_KEY",
  lingyaai: "LINGYAAI_API_KEY",
  getgoapi: "GETGOAPI_API_KEY",
  apiyi: "APIYI_API_KEY",
  runware: "RUNWARE_API_KEY",
  wavespeed: "WAVESPEED_API_KEY",
  zai_video: "ZAI_API_KEY",
  together: "TOGETHER_API_KEY",
  segmind: "SEGMIND_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  agentrouter: "AGENTROUTER_API_KEY",
};

const INVALID_API_KEYS = [
  "xai",
  "siliconflow",
  "together",
  "agentrouter",
  "falai",
  "piapi",
  "wavespeed",
  "zai_video",
];

export class ProviderBalanceService {
  static async fetchBalance(providerKey: string): Promise<BalanceResult> {
    const config = getConfig();
    const apiKeyEnv = API_KEY_MAP[providerKey];
    const apiKeyRaw = apiKeyEnv
      ? (config as unknown as Record<string, unknown>)[apiKeyEnv]
      : undefined;
    const apiKey = apiKeyRaw ? String(apiKeyRaw) : undefined;
    if (!apiKey)
      return {
        provider: providerKey,
        balance: null,
        currency: "",
        status: "not_configured",
      };
    if (INVALID_API_KEYS.includes(providerKey))
      return {
        provider: providerKey,
        balance: null,
        currency: "",
        status: "not_configured",
        error: "API key is invalid or blocked",
      };

    const cacheKey = `provider:balance:${providerKey}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.debug("Cache miss:", err);
    }

    const omnirouteUrl = config.OMNIROUTE_URL;

    const urlMap: Record<string, string> = {
      omniroute: `${omnirouteUrl}/v1`,
      groq: "https://api.groq.com/openai/v1",
      lingyaai: "https://api.lingyaai.cn/v1",
      getgoapi: "https://api.getgoapi.com/v1",
      apiyi: "https://api.apiyi.com/v1",
      runware: "https://api.runware.ai/v1",
      wavespeed: "https://api.wavespeed.ai/v1",
      zai_video: "https://api.zai.video/v1",
      falai: "https://fal.run",
      siliconflow: "https://api.siliconflow.cn/v1",
      laozhang: "https://api.laozhang.ai/v1",
      evolink: "https://api.evolink.ai/v1",
      piapi: "https://api.piapi.ai/v1",
      agentrouter: "https://agentrouter.org/v1",
      together: "https://api.together.xyz/v1",
      nvidia: "https://integrate.api.nvidia.com/v1",
      xai: "https://api.x.ai/v1",
      segmind: "https://api.segmind.com/v1",
      byteplus: "https://api.byteplus.com/v1",
      hypereal: "https://api.hypereal.cloud/v1",
      kie: "https://api.kie.ai",
      geminigen: "https://api.geminigen.ai/v1",
    };

    const baseUrl = urlMap[providerKey];
    if (!baseUrl)
      return {
        provider: providerKey,
        balance: null,
        currency: "",
        status: "not_supported",
      };

    try {
      const checkerResult = await checkProviderBalance(baseUrl, apiKey);

      const result: BalanceResult = {
        provider: providerKey,
        balance: checkerResult.balance ?? null,
        currency: checkerResult.currency || checkerResult.unit || "USD",
        status: checkerResult.success ? "ok" : "error",
        error: checkerResult.error,
      };

      try {
        await redis.set(
          cacheKey,
          JSON.stringify(result),
          "EX",
          BALANCE_CACHE_TTL,
        );
      } catch (err) {
        logger.debug("Cache write failed:", err);
      }
      return result;
    } catch (err) {
      return {
        provider: providerKey,
        balance: null,
        currency: "",
        status: "error",
        error: ((err as Error).message || "").slice(0, 100),
      };
    }
  }

  static async fetchAllBalances(): Promise<BalanceResult[]> {
    const settled = await Promise.allSettled(
      ALL_PROVIDER_KEYS.map((key) => this.fetchBalance(key)),
    );
    return settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            provider: ALL_PROVIDER_KEYS[i],
            balance: null,
            currency: "",
            status: "error" as const,
            error: r.reason?.message || "unknown",
          },
    );
  }

  static async fetchModels(providerKey: string): Promise<ModelResult> {
    const config = getConfig();
    const apiKeyEnv = API_KEY_MAP[providerKey];
    const apiKey = apiKeyEnv
      ? (config as unknown as Record<string, unknown>)[apiKeyEnv]
      : undefined;
    if (!apiKey) return { provider: providerKey, models: [], cached: false };

    const cacheKey = `provider:models:${providerKey}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached)
        return {
          provider: providerKey,
          models: JSON.parse(cached),
          cached: true,
        };
    } catch (err) {
      logger.debug("Cache miss:", err);
    }

    const omnirouteUrl = config.OMNIROUTE_URL;

    const urlMap: Record<string, string> = {
      omniroute: `${omnirouteUrl}/v1/models`,
      groq: "https://api.groq.com/openai/v1/models",
      lingyaai: "https://api.lingyaai.cn/v1/models",
      getgoapi: "https://api.getgoapi.com/v1/models",
      apiyi: "https://api.apiyi.com/v1/models",
      agentrouter: "https://agentrouter.org/v1/models",
      together: "https://api.together.xyz/v1/models",
      laozhang: "https://api.laozhang.ai/v1/models",
    };
    const url = urlMap[providerKey];
    if (!url) return { provider: providerKey, models: [], cached: false };

    try {
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      });
      const models = (resp.data?.data || [])
        .map((m: { id: string }) => m.id)
        .filter(Boolean);
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(models),
          "EX",
          MODELS_CACHE_TTL,
        );
      } catch (err) {
        logger.debug("Cache write failed:", err);
      }
      return { provider: providerKey, models, cached: false };
    } catch {
      return { provider: providerKey, models: [], cached: false };
    }
  }

  static async fetchAllModels(): Promise<ModelResult[]> {
    const results: ModelResult[] = [];
    for (const key of ALL_PROVIDER_KEYS) {
      results.push(await this.fetchModels(key));
    }
    return results;
  }

  static async testProvider(
    providerKey: string,
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const result = await this.fetchBalance(providerKey);
      const latencyMs = Date.now() - start;
      if (result.status === "ok" || result.status === "not_supported")
        return { success: true, latencyMs };
      if (result.status === "not_configured")
        return { success: false, latencyMs, error: "API key not configured" };
      return {
        success: false,
        latencyMs,
        error: result.error || "Unknown error",
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }
}
