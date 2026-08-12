/**
 * AI Task Settings Service
 *
 * Stores and reads admin-configured provider/model for each AI task.
 * Uses the same Redis+DB pattern as ProviderSettingsService:
 *   - Redis key: 'admin:ai_task_settings'
 *   - DB: PricingConfig table { category: 'ai_tasks', key: 'settings' }
 */

import { redis } from "@/config/redis";
import { prisma } from "@/config/database";

const AI_TASK_KEY = "admin:ai_task_settings";

export interface AITaskProvider {
  provider: "groq" | "gemini" | "omniroute" | "builtin";
  model: string;
}

export interface AITaskSettings {
  storyboard: AITaskProvider;
  transcript: AITaskProvider;
  promptEnhancement: AITaskProvider;
  promptGeneration: AITaskProvider;
}

const DEFAULTS: AITaskSettings = {
  storyboard: { provider: "builtin", model: "" },
  transcript: { provider: "gemini", model: "gemini-2.5-flash" },
  promptEnhancement: { provider: "groq", model: "llama-3.3-70b-versatile" },
  promptGeneration: { provider: "builtin", model: "" },
};

export class AITaskSettingsService {
  static async getSettings(): Promise<AITaskSettings> {
    try {
      const cached = await redis.get(AI_TASK_KEY);
      if (cached) {
        return { ...DEFAULTS, ...JSON.parse(cached) };
      }
    } catch {
      // Fall through to DB
    }
    try {
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "ai_tasks", key: "settings" } },
      });
      if (dbRow) {
        const settings = dbRow.value as Partial<AITaskSettings>;
        await redis.set(AI_TASK_KEY, JSON.stringify(settings));
        return { ...DEFAULTS, ...settings };
      }
    } catch {
      // Return defaults if both Redis and DB fail
    }
    return { ...DEFAULTS };
  }

  static async updateSettings(
    settings: Partial<AITaskSettings>,
  ): Promise<void> {
    // Merge with current settings to allow partial updates
    const current = await AITaskSettingsService.getSettings();
    const merged = { ...current, ...settings };

    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_tasks", key: "settings" } },
      create: {
        category: "ai_tasks",
        key: "settings",
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(AI_TASK_KEY, JSON.stringify(merged));
  }
}
