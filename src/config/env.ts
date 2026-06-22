/**
 * Environment Variable Validation
 * Centralized Zod-validated config — fails fast at startup with clear error messages.
 */

import { z } from "zod";

const boolStr = z
  .string()
  .transform((v) => v === "true")
  .default("false");

const envSchema = z.object({
  // ── Core (required) ──
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // ── Core (optional with defaults) ──
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3000").transform(Number),
  LOG_LEVEL: z.string().default("info"),
  FORCE_POLLING: boolStr,
  DEMO_MODE: boolStr,
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  BOT_USERNAME: z.string().optional(),
  WEB_APP_URL: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  VIDEO_DIR: z.string().default("/tmp/videos"),
  AUDIO_DIR: z.string().default("/tmp/audio"),
  EBOOK_API_URL: z.string().default("http://localhost:8765"),
  EBOOK_API_KEY: z.string().optional(),

  // ── Admin ──
  ADMIN_TELEGRAM_IDS: z.string().optional(),
  SUPER_ADMIN_IDS: z.string().optional(),
  ADMIN_ALERT_CHAT_ID: z.string().optional(),
  ADMIN_CHAT_ID: z.string().optional(),
  COMMUNITY_CHANNEL_ID: z.string().optional(),
  SUPPORT_TELEGRAM_USERNAME: z.string().optional(),

  // ── Video Providers (all optional — degrade gracefully) ──
  GEMINIGEN_API_KEY: z.string().optional(),
  GEMINIGEN_EMAIL: z.string().optional(),
  GEMINIGEN_PASSWORD: z.string().optional(),
  BYTEPLUS_API_KEY: z.string().optional(),
  AIML_API_KEY: z.string().optional(),
  FALAI_API_KEY: z.string().optional(),
  SILICONFLOW_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  LAOZHANG_API_KEY: z.string().optional(),
  EVOLINK_API_KEY: z.string().optional(),
  HYPEREAL_API_KEY: z.string().optional(),
  KIE_API_KEY: z.string().optional(),
  PIAPI_API_KEY: z.string().optional(),

  // ── New Video Providers (optional) ──
  LINGYAAI_API_KEY: z.string().optional(),
  GETGOAPI_API_KEY: z.string().optional(),
  APIYI_API_KEY: z.string().optional(),
  RUNWARE_API_KEY: z.string().optional(),
  WAVESPEED_API_KEY: z.string().optional(),
  ZAI_API_KEY: z.string().optional(),
  AGENTROUTER_API_KEY: z.string().optional(),

  // ── Image Providers (optional) ──
  NVIDIA_API_KEY: z.string().optional(),
  SEGMIND_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // ── Payment Gateways (optional — at least one should be configured) ──
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_ENVIRONMENT: z.string().default("sandbox"),
  TRIPAY_API_KEY: z.string().optional(),
  TRIPAY_PRIVATE_KEY: z.string().optional(),
  TRIPAY_MERCHANT_CODE: z.string().optional(),
  TRIPAY_ENVIRONMENT: z.string().default("sandbox"),
  DUITKU_MERCHANT_CODE: z.string().optional(),
  DUITKU_API_KEY: z.string().optional(),
  DUITKU_ENVIRONMENT: z.string().default("sandbox"),
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),

  // ── AI / Chat ──
  OMNIROUTE_URL: z.string().optional(),
  OMNIROUTE_API_KEY: z.string().optional(),
  OMNIROUTE_DEFAULT_MODEL: z.string().optional(),
  GROK_API_URL: z.string().optional(),
  GROK_API_REPO: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // ── Analytics (optional) ──
  META_PIXEL_ID: z.string().optional(),
  META_PIXEL_ACCESS_TOKEN: z.string().optional(),
  META_PIXEL_DATA_SET_ID: z.string().optional(),
  META_CAPI_TOKEN: z.string().optional(),
  META_TEST_EVENT_CODE: z.string().optional(),
  FACEBOOK_PIXEL_ID: z.string().optional(),
  GA4_MEASUREMENT_ID: z.string().optional(),
  GA4_TRACKING_ID: z.string().optional(),
  GA4_API_SECRET: z.string().optional(),
  TIKTOK_PIXEL_ID: z.string().optional(),
  TIKTOK_PIXEL_EVENT_TOKEN: z.string().optional(),

  // ── Social (optional) ──
  POSTBRIDGE_API_KEY: z.string().optional(),

  // ── Feature Flags (optional, default false) ──
  FEATURE_PAYMENT: boolStr,
  FEATURE_REFERRAL: boolStr,
  FEATURE_VIDEO_GENERATION: boolStr,

  // ── Stack Content (unified service) ──
  STACK_CONTENT_ENABLED: boolStr,
  STACK_CONTENT_URL: z.string().default("http://localhost:8770"),

  // ── Other ──
  USD_TO_IDR_RATE: z.string().default("16000").transform(Number),
});

export type AppConfig = z.infer<typeof envSchema>;

let _config: AppConfig | undefined;

export function initConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  _config = result.data;
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) initConfig();
  return _config!;
}

// ── Group metadata for admin dashboard display ──

const CONFIG_GROUPS: Record<string, { keys: string[]; sensitive: string[] }> = {
  Core: {
    keys: [
      "BOT_TOKEN",
      "DATABASE_URL",
      "REDIS_URL",
      "ADMIN_PASSWORD",
      "JWT_SECRET",
      "NODE_ENV",
      "PORT",
      "LOG_LEVEL",
      "FORCE_POLLING",
      "DEMO_MODE",
      "WEBHOOK_URL",
      "WEBHOOK_SECRET",
      "BOT_USERNAME",
      "WEB_APP_URL",
      "CORS_ORIGIN",
      "VIDEO_DIR",
      "AUDIO_DIR",
    ],
    sensitive: [
      "BOT_TOKEN",
      "DATABASE_URL",
      "REDIS_URL",
      "ADMIN_PASSWORD",
      "JWT_SECRET",
      "WEBHOOK_SECRET",
    ],
  },
  Admin: {
    keys: [
      "ADMIN_TELEGRAM_IDS",
      "SUPER_ADMIN_IDS",
      "ADMIN_ALERT_CHAT_ID",
      "ADMIN_CHAT_ID",
      "COMMUNITY_CHANNEL_ID",
      "SUPPORT_TELEGRAM_USERNAME",
    ],
    sensitive: [],
  },
  "Video Providers": {
    keys: [
      "GEMINIGEN_API_KEY",
      "GEMINIGEN_EMAIL",
      "GEMINIGEN_PASSWORD",
      "BYTEPLUS_API_KEY",
      "AIML_API_KEY",
      "FALAI_API_KEY",
      "SILICONFLOW_API_KEY",
      "XAI_API_KEY",
      "LAOZHANG_API_KEY",
      "EVOLINK_API_KEY",
      "HYPEREAL_API_KEY",
      "KIE_API_KEY",
      "PIAPI_API_KEY",
      "LINGYAAI_API_KEY",
      "GETGOAPI_API_KEY",
      "APIYI_API_KEY",
      "RUNWARE_API_KEY",
      "WAVESPEED_API_KEY",
      "ZAI_API_KEY",
    ],
    sensitive: [
      "GEMINIGEN_API_KEY",
      "GEMINIGEN_PASSWORD",
      "BYTEPLUS_API_KEY",
      "AIML_API_KEY",
      "FALAI_API_KEY",
      "SILICONFLOW_API_KEY",
      "XAI_API_KEY",
      "LAOZHANG_API_KEY",
      "EVOLINK_API_KEY",
      "HYPEREAL_API_KEY",
      "KIE_API_KEY",
      "PIAPI_API_KEY",
      "LINGYAAI_API_KEY",
      "GETGOAPI_API_KEY",
      "APIYI_API_KEY",
      "RUNWARE_API_KEY",
      "WAVESPEED_API_KEY",
      "ZAI_API_KEY",
    ],
  },
  "Image Providers": {
    keys: [
      "NVIDIA_API_KEY",
      "SEGMIND_API_KEY",
      "TOGETHER_API_KEY",
      "GEMINI_API_KEY",
      "RUNWARE_API_KEY",
      "WAVESPEED_API_KEY",
      "ZAI_API_KEY",
    ],
    sensitive: [
      "NVIDIA_API_KEY",
      "SEGMIND_API_KEY",
      "TOGETHER_API_KEY",
      "GEMINI_API_KEY",
      "RUNWARE_API_KEY",
      "WAVESPEED_API_KEY",
      "ZAI_API_KEY",
    ],
  },
  "Payment Gateways": {
    keys: [
      "MIDTRANS_SERVER_KEY",
      "MIDTRANS_ENVIRONMENT",
      "TRIPAY_API_KEY",
      "TRIPAY_PRIVATE_KEY",
      "TRIPAY_MERCHANT_CODE",
      "TRIPAY_ENVIRONMENT",
      "DUITKU_MERCHANT_CODE",
      "DUITKU_API_KEY",
      "DUITKU_ENVIRONMENT",
      "NOWPAYMENTS_API_KEY",
      "NOWPAYMENTS_IPN_SECRET",
    ],
    sensitive: [
      "MIDTRANS_SERVER_KEY",
      "TRIPAY_API_KEY",
      "TRIPAY_PRIVATE_KEY",
      "DUITKU_API_KEY",
      "NOWPAYMENTS_API_KEY",
      "NOWPAYMENTS_IPN_SECRET",
    ],
  },
  "AI / Chat": {
    keys: [
      "OMNIROUTE_URL",
      "OMNIROUTE_API_KEY",
      "OMNIROUTE_DEFAULT_MODEL",
      "GROK_API_URL",
      "GROK_API_REPO",
      "GROQ_API_KEY",
      "AGENTROUTER_API_KEY",
    ],
    sensitive: ["OMNIROUTE_API_KEY", "GROQ_API_KEY", "AGENTROUTER_API_KEY"],
  },
  Analytics: {
    keys: [
      "META_PIXEL_ID",
      "META_PIXEL_ACCESS_TOKEN",
      "META_PIXEL_DATA_SET_ID",
      "META_CAPI_TOKEN",
      "META_TEST_EVENT_CODE",
      "FACEBOOK_PIXEL_ID",
      "GA4_MEASUREMENT_ID",
      "GA4_TRACKING_ID",
      "GA4_API_SECRET",
      "TIKTOK_PIXEL_ID",
      "TIKTOK_PIXEL_EVENT_TOKEN",
    ],
    sensitive: [
      "META_PIXEL_ACCESS_TOKEN",
      "META_CAPI_TOKEN",
      "GA4_API_SECRET",
      "TIKTOK_PIXEL_EVENT_TOKEN",
    ],
  },
  Social: {
    keys: ["POSTBRIDGE_API_KEY"],
    sensitive: ["POSTBRIDGE_API_KEY"],
  },
  "Feature Flags": {
    keys: ["FEATURE_PAYMENT", "FEATURE_REFERRAL", "FEATURE_VIDEO_GENERATION"],
    sensitive: [],
  },
  Other: {
    keys: ["USD_TO_IDR_RATE"],
    sensitive: [],
  },
};

export interface ConfigEntry {
  value: string;
  group: string;
  sensitive: boolean;
}

/** Returns config with secrets masked — safe for admin dashboard display */
export function getConfigForAdmin(): Record<string, ConfigEntry> {
  const c = getConfig();
  const result: Record<string, ConfigEntry> = {};

  for (const [group, info] of Object.entries(CONFIG_GROUPS)) {
    for (const key of info.keys) {
      const raw = (c as Record<string, unknown>)[key];
      const val = raw !== undefined && raw !== null ? String(raw) : "";
      const isSensitive = info.sensitive.includes(key);
      result[key] = {
        value: isSensitive
          ? val
            ? "••••" + val.slice(-4)
            : "(not set)"
          : val || "(not set)",
        group,
        sensitive: isSensitive,
      };
    }
  }

  return result;
}

/** Legacy compatibility — keep validateEnv() working for existing imports */
export function validateEnv(): void {
  initConfig();
}
