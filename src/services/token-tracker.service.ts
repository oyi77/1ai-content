/**
 * Token Usage Tracker
 * Tracks LLM token usage and cost across all providers
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { ExchangeRateService } from "@/services/exchange-rate.service";

// Cost per 1K tokens in USD (input / output)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Gemini
  "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  // GPT
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-5": { input: 0.005, output: 0.02 },
  // Claude
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku": { input: 0.0008, output: 0.004 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-sonnet": { input: 0.003, output: 0.015 },
  "claude-haiku": { input: 0.0008, output: 0.004 },
  // Grok / xAI
  grok: { input: 0.002, output: 0.01 },
  // Mistral
  mistral: { input: 0.0007, output: 0.002 },
  // DeepSeek
  deepseek: { input: 0.00014, output: 0.00028 },
  // Default fallback
  default: { input: 0.001, output: 0.003 },
};

// Per-request cost for generation providers (USD) — not token-based
const GENERATION_COSTS: Record<string, number> = {
  geminigen: 0.05,
  falai: 0.03,
  falai_img2img: 0.04,
  falai_ip_adapter: 0.04,
  siliconflow: 0.02,
  nvidia: 0.02,
  laozhang: 0.03,
  evolink: 0.04,
  hypereal: 0.05,
  byteplus: 0.08,
  xai: 0.06,
  kie: 0.04,
  piapi: 0.03,
  piapi_flux: 0.03,
  piapi_img2img: 0.04,
  remotion: 0.01,
  default_gen: 0.03,
};

const USD_TO_IDR = async (): Promise<number> => {
  const result = await ExchangeRateService.getRate().catch(() => null);
  if (result) return result.rate;
  return getConfig().USD_TO_IDR_RATE;
};

export async function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<{ usd: number; idr: number }> {
  const modelLower = model.toLowerCase();
  const modelKey =
    Object.keys(MODEL_COSTS).find(
      (k) => k !== "default" && modelLower.includes(k),
    ) || "default";
  const rates = MODEL_COSTS[modelKey];
  const usd =
    (promptTokens / 1000) * rates.input +
    (completionTokens / 1000) * rates.output;
  return { usd, idr: usd * (await USD_TO_IDR()) };
}

export interface TrackTokensInput {
  userId?: string | bigint | null;
  provider: string;
  model: string;
  service: string;
  promptTokens: number;
  completionTokens: number;
}

export async function trackTokens(input: TrackTokensInput): Promise<void> {
  try {
    const totalTokens = input.promptTokens + input.completionTokens;
    const cost = await estimateCost(
      input.model,
      input.promptTokens,
      input.completionTokens,
    );

    // For generation providers (image/video), use per-request cost
    const isGeneration =
      input.service.includes("_gen") ||
      input.service === "image_gen" ||
      input.service === "video_gen";
    let finalCost = cost;
    if (
      isGeneration &&
      input.promptTokens === 0 &&
      input.completionTokens === 0
    ) {
      const genCostUsd =
        GENERATION_COSTS[input.provider] || GENERATION_COSTS.default_gen;
      finalCost = { usd: genCostUsd, idr: genCostUsd * (await USD_TO_IDR()) };
    }

    await prisma.tokenUsage.create({
      data: {
        userId: input.userId ? BigInt(input.userId.toString()) : null,
        provider: input.provider,
        model: input.model,
        service: input.service,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens,
        costUsd: finalCost.usd,
        costIdr: finalCost.idr,
      },
    });
  } catch (e) {
    // Non-fatal — never break main flow
    logger.warn("TokenTracker: failed to save usage:", (e as Error).message);
  }
}

export async function getTokenStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [byProvider, byModel, byService, daily, grand] = await Promise.all([
    prisma.$queryRaw`
      SELECT provider,
             SUM(total_tokens)::bigint  AS tokens,
             SUM(cost_usd)::float       AS cost_usd,
             SUM(cost_idr)::float       AS cost_idr,
             COUNT(*)::int              AS requests
      FROM token_usage
      WHERE created_at >= ${since}
      GROUP BY provider
      ORDER BY cost_usd DESC
    ` as Promise<any[]>,

    prisma.$queryRaw`
      SELECT model,
             SUM(total_tokens)::bigint  AS tokens,
             SUM(cost_usd)::float       AS cost_usd,
             COUNT(*)::int              AS requests
      FROM token_usage
      WHERE created_at >= ${since}
      GROUP BY model
      ORDER BY cost_usd DESC
      LIMIT 10
    ` as Promise<any[]>,

    prisma.$queryRaw`
      SELECT service,
             SUM(total_tokens)::bigint  AS tokens,
             SUM(cost_usd)::float       AS cost_usd,
             COUNT(*)::int              AS requests
      FROM token_usage
      WHERE created_at >= ${since}
      GROUP BY service
      ORDER BY tokens DESC
    ` as Promise<any[]>,

    prisma.$queryRaw`
      SELECT DATE(created_at)           AS date,
             SUM(total_tokens)::bigint  AS tokens,
             SUM(cost_usd)::float       AS cost_usd,
             COUNT(*)::int              AS requests
      FROM token_usage
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    ` as Promise<any[]>,

    prisma.tokenUsage.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { totalTokens: true, costUsd: true, costIdr: true },
      _count: { id: true },
    }),
  ]);

  return {
    period: `${days}d`,
    summary: {
      totalRequests: grand._count.id,
      totalTokens: grand._sum.totalTokens ?? 0,
      totalCostUsd: grand._sum.costUsd ?? 0,
      totalCostIdr: grand._sum.costIdr ?? 0,
    },
    byProvider,
    byModel,
    byService,
    daily,
  };
}
