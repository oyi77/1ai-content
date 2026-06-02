/**
 * CustomProviderService — manages user-configured OpenAI-compatible LLM providers.
 * Persists to PricingConfig table (category='custom_provider', key=<id>).
 * Redis cache key: 'admin:custom_providers' (no TTL — DB is source of truth).
 */

import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { NotFoundError, ProviderError } from '@/utils/app-errors';
import { checkProviderBalance } from '@/services/balance-checker.service';
export { BalanceResult } from '@/services/balance-checker.service';

export interface CustomProviderModel {
  id: string;
  name: string;
  vision: boolean;
  reasoning: boolean;
  toolCall: boolean;
  contextWindow: number | null;
  family: string;
}

export interface CustomProviderBalance {
  balance?: number;
  currency?: string;
  unit?: string;
  checkedAt: string;
  error?: string;
  strategyUsed?: string;
}

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: CustomProviderModel[];
  lastFetched: string | null;
  lastBalance: CustomProviderBalance | null;
  createdAt: string;
}

const REDIS_KEY = 'admin:custom_providers';

function applyModelHeuristics(modelId: string): Pick<CustomProviderModel, 'vision' | 'reasoning' | 'toolCall'> {
  const id = modelId.toLowerCase();
  const vision = /vision|vl|4o|4v|llava|intern|gemini|claude|gpt-4/.test(id);
  const reasoning = /thinking|reasoning|r1|o1|o3|qwq/.test(id);
  const toolCall = /gpt-4|claude|gemini|qwen/.test(id);
  return { vision, reasoning, toolCall };
}

async function invalidateCache(): Promise<void> {
  try {
    await redis.del(REDIS_KEY);
  } catch {
    // Non-fatal
  }
}

async function saveToCache(providers: CustomProvider[]): Promise<void> {
  try {
    await redis.set(REDIS_KEY, JSON.stringify(providers));
  } catch {
    // Non-fatal
  }
}

export class CustomProviderService {
  static async getAll(): Promise<CustomProvider[]> {
    // Try Redis cache
    try {
      const cached = await redis.get(REDIS_KEY);
      if (cached) return JSON.parse(cached) as CustomProvider[];
    } catch {
      // Fall through to DB
    }

    // Query DB
    try {
      const rows = await prisma.pricingConfig.findMany({
        where: { category: 'custom_provider' },
      });
      const providers = rows.map((row) => row.value as unknown as CustomProvider);
      await saveToCache(providers);
      return providers;
    } catch {
      return [];
    }
  }

  static async getById(id: string): Promise<CustomProvider | null> {
    try {
      const row = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: 'custom_provider', key: id } },
      });
      if (!row) return null;
      return row.value as unknown as CustomProvider;
    } catch {
      return null;
    }
  }

  static async create(data: Pick<CustomProvider, 'name' | 'baseUrl' | 'apiKey'>): Promise<CustomProvider> {
    const provider: CustomProvider = {
      id: randomUUID(),
      name: data.name,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      enabled: true,
      models: [],
      lastFetched: null,
      lastBalance: null,
      createdAt: new Date().toISOString(),
    };

    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'custom_provider', key: provider.id } },
      create: { category: 'custom_provider', key: provider.id, value: JSON.parse(JSON.stringify(provider)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(provider)), updatedBy: BigInt(0) },
    });

    await invalidateCache();
    return provider;
  }

  static async update(
    id: string,
    data: Partial<Pick<CustomProvider, 'name' | 'baseUrl' | 'apiKey' | 'enabled'>>,
  ): Promise<CustomProvider> {
    const existing = await CustomProviderService.getById(id);
    if (!existing) throw new NotFoundError('CustomProvider', String(id));

    const updated: CustomProvider = { ...existing, ...data };

    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'custom_provider', key: id } },
      create: { category: 'custom_provider', key: id, value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
    });

    await invalidateCache();
    return updated;
  }

  static async delete(id: string): Promise<void> {
    await prisma.pricingConfig.deleteMany({
      where: { category: 'custom_provider', key: id },
    });
    await invalidateCache();
  }

  static async fetchModels(id: string): Promise<CustomProviderModel[]> {
    const provider = await CustomProviderService.getById(id);
    if (!provider) throw new NotFoundError('CustomProvider', String(id));

    const response = await axios.get(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      timeout: 10000,
    });

    const raw: any[] = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.data)
        ? response.data.data
        : [];

    const models: CustomProviderModel[] = raw.map((m: any) => {
      const modelId: string = m.id || m.name || String(m);
      const heuristics = applyModelHeuristics(modelId);
      return {
        id: modelId,
        name: m.name || modelId,
        ...heuristics,
        contextWindow: m.context_window ?? m.contextWindow ?? null,
        family: m.owned_by || m.family || '',
      };
    });

    const updated: CustomProvider = {
      ...provider,
      models,
      lastFetched: new Date().toISOString(),
    };

    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'custom_provider', key: id } },
      create: { category: 'custom_provider', key: id, value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
    });

    await invalidateCache();
    return models;
  }

  static async testProvider(
    id: string,
    model?: string,
  ): Promise<{ success: boolean; model: string; response: string; latencyMs: number }> {
    const provider = await CustomProviderService.getById(id);
    if (!provider) throw new NotFoundError('CustomProvider', String(id));

    const modelToUse = model || provider.models[0]?.id || 'gpt-4o-mini';
    const start = Date.now();

    const axiosResponse = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model: modelToUse,
        messages: [{ role: 'user', content: 'Reply with: OK' }],
        max_tokens: 5,
      },
      {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        timeout: 10000,
      },
    );

    const latencyMs = Date.now() - start;
    const content: string =
      axiosResponse.data?.choices?.[0]?.message?.content ?? '';

    return { success: true, model: modelToUse, response: content, latencyMs };
  }

  static async makeRequest(
    id: string,
    model: string,
    messages: any[],
    options?: { maxTokens?: number; temperature?: number; systemPrompt?: string },
  ): Promise<string> {
    const provider = await CustomProviderService.getById(id);
    if (!provider) throw new NotFoundError('CustomProvider', String(id));

    const allMessages = options?.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

    const response = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model,
        messages: allMessages,
        ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
      },
      {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        timeout: 30000,
      },
    );

    const content: string = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('CustomProvider', 'Empty response from custom provider');
    return content;
  }

  /**
   * Check the provider's account balance.
   * Uses auto-detected strategy from BalanceCheckerService.
   * Result is persisted back to the provider record (lastBalance field).
   */
  static async checkBalance(id: string): Promise<CustomProviderBalance> {
    const provider = await CustomProviderService.getById(id);
    if (!provider) throw new NotFoundError('CustomProvider', String(id));

    const result = await checkProviderBalance(provider.baseUrl, provider.apiKey);

    const lastBalance: CustomProviderBalance = {
      balance: result.balance,
      currency: result.currency,
      unit: result.unit,
      checkedAt: new Date().toISOString(),
      error: result.error,
      strategyUsed: result.strategyUsed,
    };

    // Persist the balance result back to the provider record
    const updated: CustomProvider = { ...provider, lastBalance };
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'custom_provider', key: id } },
      create: { category: 'custom_provider', key: id, value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(updated)), updatedBy: BigInt(0) },
    });
    await invalidateCache();

    return lastBalance;
  }
}
