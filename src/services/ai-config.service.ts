/**
 * AIConfigService — Central store for all admin-configurable AI settings.
 * Covers: system prompts, task provider/model overrides, chat model defaults.
 *
 * Persistence: PricingConfig table (category='ai_config', key=<section>)
 * Cache: Redis key 'admin:ai_config:<section>' (no TTL — DB is source of truth)
 */

import { redis } from "@/config/redis";
import { prisma } from "@/config/database";
import { ValidationError } from "@/utils/app-errors";

export type LLMProvider =
  | "groq"
  | "gemini"
  | "omniroute"
  | "builtin"
  | "custom";

export interface TaskProviderConfig {
  provider: LLMProvider;
  model: string;
  customProviderId?: string; // used when provider === 'custom'
}

export interface AITasksConfig {
  storyboard: TaskProviderConfig;
  transcript: TaskProviderConfig;
  transcriptFallback1: TaskProviderConfig; // 2nd attempt when primary fails
  transcriptFallback2: TaskProviderConfig; // 3rd attempt when fallback1 fails
  promptEnhancement: TaskProviderConfig;
  promptGeneration: TaskProviderConfig;
  caption: TaskProviderConfig;
  voNarration: TaskProviderConfig;
  qualityCheck: TaskProviderConfig;
  watermarkDetect: TaskProviderConfig;
}

export interface AIPromptsConfig {
  botPersona: string; // The full BERKAHKARYA_SYSTEM_PROMPT text
  promptOptimizer: string; // The meta-prompt template for prompt enhancement (use {rawPrompt}, {niche}, {style}, {hasReferenceImage} as placeholders)
  voNarration: string; // VO script generation prompt template (use {niche}, {duration}, {language})
  qualityCheck: string; // Quality scoring prompt for video frames
  watermarkDetect: string; // Watermark detection prompt
  captionGeneration: string; // Caption generation prompt template (use {niche}, {sceneCount})
  storyboardGeneration: string; // Storyboard generation prompt template (use {niche}, {duration}, {scenes})
  imageAnalysisPrompt: string; // Prompt for image analysis (empty = use hardcoded OMNI_IMAGE_PROMPT)
  videoAnalysisPrompt: string; // Prompt for video analysis (empty = use hardcoded OMNI_VIDEO_PROMPT)
}

export interface AIChatConfig {
  defaultModel: string; // Default model for OmniRoute chat
}

export interface AIFullConfig {
  tasks: AITasksConfig;
  prompts: AIPromptsConfig;
  chat: AIChatConfig;
}

const DEFAULT_TASKS: AITasksConfig = {
  storyboard: { provider: "builtin", model: "" },
  transcript: { provider: "gemini", model: "gemini-2.5-flash" },
  transcriptFallback1: {
    provider: "groq",
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
  },
  transcriptFallback2: {
    provider: "omniroute",
    model: "antigravity/gemini-2.5-flash",
  },
  promptEnhancement: { provider: "groq", model: "llama-3.3-70b-versatile" },
  promptGeneration: { provider: "builtin", model: "" },
  caption: { provider: "gemini", model: "gemini-2.5-flash" },
  voNarration: { provider: "groq", model: "llama-3.3-70b-versatile" },
  qualityCheck: { provider: "gemini", model: "gemini-2.0-flash" },
  watermarkDetect: { provider: "gemini", model: "gemini-2.0-flash" },
};

const DEFAULT_PROMPTS: AIPromptsConfig = {
  botPersona: "", // Empty string = use hardcoded BERKAHKARYA_SYSTEM_PROMPT
  promptOptimizer: "", // Empty = use hardcoded buildMetaPrompt()
  voNarration: "",
  qualityCheck: "",
  watermarkDetect: "",
  captionGeneration: "",
  storyboardGeneration: "",
  imageAnalysisPrompt: "", // Empty = use hardcoded OMNI_IMAGE_PROMPT
  videoAnalysisPrompt: "", // Empty = use hardcoded OMNI_VIDEO_PROMPT
};

const DEFAULT_CHAT: AIChatConfig = {
  defaultModel: "antigravity/gemini-2.5-flash",
};

const REDIS_KEY_TASKS = "admin:ai_config:tasks";
const REDIS_KEY_PROMPTS = "admin:ai_config:prompts";
const REDIS_KEY_CHAT = "admin:ai_config:chat";

const VALID_PROVIDERS: LLMProvider[] = [
  "groq",
  "gemini",
  "omniroute",
  "builtin",
  "custom",
];

function validateProviders(obj: unknown, path = ""): void {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (
        k === "provider" &&
        typeof v === "string" &&
        !VALID_PROVIDERS.includes(v as LLMProvider)
      ) {
        throw new ValidationError(
          `Invalid provider "${v}" at ${path}.${k}`,
          "provider",
        );
      }
      if (typeof v === "object") validateProviders(v, `${path}.${k}`);
    }
  }
}

export class AIConfigService {
  // Get full config (merges all 3 sections)
  static async getFullConfig(): Promise<AIFullConfig> {
    const [tasks, prompts, chat] = await Promise.all([
      AIConfigService.getTasksConfig(),
      AIConfigService.getPromptsConfig(),
      AIConfigService.getChatConfig(),
    ]);
    return { tasks, prompts, chat };
  }

  // Get tasks section (Redis → DB → default)
  static async getTasksConfig(): Promise<AITasksConfig> {
    try {
      const cached = await redis.get(REDIS_KEY_TASKS);
      if (cached) {
        return { ...DEFAULT_TASKS, ...JSON.parse(cached) };
      }
    } catch {
      // Fall through to DB
    }
    try {
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "ai_config", key: "tasks" } },
      });
      if (dbRow) {
        const settings = dbRow.value as Partial<AITasksConfig>;
        await redis.set(REDIS_KEY_TASKS, JSON.stringify(settings), "EX", 900);
        return { ...DEFAULT_TASKS, ...settings };
      }
    } catch {
      // Return defaults if both Redis and DB fail
    }
    return { ...DEFAULT_TASKS };
  }

  // Get prompts section (Redis → DB → default)
  static async getPromptsConfig(): Promise<AIPromptsConfig> {
    try {
      const cached = await redis.get(REDIS_KEY_PROMPTS);
      if (cached) {
        return { ...DEFAULT_PROMPTS, ...JSON.parse(cached) };
      }
    } catch {
      // Fall through to DB
    }
    try {
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "ai_config", key: "prompts" } },
      });
      if (dbRow) {
        const settings = dbRow.value as Partial<AIPromptsConfig>;
        await redis.set(REDIS_KEY_PROMPTS, JSON.stringify(settings), "EX", 900);
        return { ...DEFAULT_PROMPTS, ...settings };
      }
    } catch {
      // Return defaults if both Redis and DB fail
    }
    return { ...DEFAULT_PROMPTS };
  }

  // Get chat section (Redis → DB → default)
  static async getChatConfig(): Promise<AIChatConfig> {
    try {
      const cached = await redis.get(REDIS_KEY_CHAT);
      if (cached) {
        return { ...DEFAULT_CHAT, ...JSON.parse(cached) };
      }
    } catch {
      // Fall through to DB
    }
    try {
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "ai_config", key: "chat" } },
      });
      if (dbRow) {
        const settings = dbRow.value as Partial<AIChatConfig>;
        await redis.set(REDIS_KEY_CHAT, JSON.stringify(settings), "EX", 900);
        return { ...DEFAULT_CHAT, ...settings };
      }
    } catch {
      // Return defaults if both Redis and DB fail
    }
    return { ...DEFAULT_CHAT };
  }

  // Update tasks section (saves to Redis + DB, merges with current)
  static async updateTasksConfig(tasks: Partial<AITasksConfig>): Promise<void> {
    validateProviders(tasks);
    const current = await AIConfigService.getTasksConfig();
    const merged = { ...current, ...tasks };
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "tasks" } },
      create: {
        category: "ai_config",
        key: "tasks",
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_TASKS, JSON.stringify(merged));
  }

  // Update prompts section (saves to Redis + DB, merges with current)
  static async updatePromptsConfig(
    prompts: Partial<AIPromptsConfig>,
  ): Promise<void> {
    const current = await AIConfigService.getPromptsConfig();
    const merged = { ...current, ...prompts };
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "prompts" } },
      create: {
        category: "ai_config",
        key: "prompts",
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_PROMPTS, JSON.stringify(merged));
  }

  // Update chat section (saves to Redis + DB, merges with current)
  static async updateChatConfig(chat: Partial<AIChatConfig>): Promise<void> {
    const current = await AIConfigService.getChatConfig();
    const merged = { ...current, ...chat };
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "chat" } },
      create: {
        category: "ai_config",
        key: "chat",
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(merged)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_CHAT, JSON.stringify(merged));
  }

  // Reset tasks section to factory defaults (Redis + DB)
  static async resetTasksConfig(): Promise<void> {
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "tasks" } },
      create: {
        category: "ai_config",
        key: "tasks",
        value: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_TASKS, JSON.stringify(DEFAULT_TASKS));
  }

  // Reset prompts section to defaults (Redis + DB)
  static async resetPromptsConfig(): Promise<void> {
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "prompts" } },
      create: {
        category: "ai_config",
        key: "prompts",
        value: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_PROMPTS, JSON.stringify(DEFAULT_PROMPTS));
  }

  // Reset chat section to defaults (Redis + DB)
  static async resetChatConfig(): Promise<void> {
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "ai_config", key: "chat" } },
      create: {
        category: "ai_config",
        key: "chat",
        value: JSON.parse(JSON.stringify(DEFAULT_CHAT)),
        updatedBy: BigInt(0),
      },
      update: {
        value: JSON.parse(JSON.stringify(DEFAULT_CHAT)),
        updatedBy: BigInt(0),
      },
    });
    await redis.set(REDIS_KEY_CHAT, JSON.stringify(DEFAULT_CHAT));
  }

  // Helper: get a single task's provider config
  static async getTaskConfig(
    task: keyof AITasksConfig,
  ): Promise<TaskProviderConfig> {
    const tasks = await AIConfigService.getTasksConfig();
    return tasks[task];
  }
}
