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
  WEBHOOK_URL: z.string().default("http://localhost:3000"),
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
  PEXELS_API_KEYS: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  // ── YouTube Workflow (all optional — sensible defaults) ──
  YT_MONITOR_CHECK_24H: z.string().default('24').transform(Number),
  YT_MONITOR_CHECK_48H: z.string().default('48').transform(Number),
  YT_MONITOR_CHECK_10D: z.string().default('240').transform(Number),
  YT_QUARANTINE_EARLY_MIN_AGE: z.string().default('150').transform(Number),
  YT_US_UPLOAD_TIME_WIB: z.string().default('15:00'),
  YT_ID_UPLOAD_TIME_WIB: z.string().default('20:00'),
  YT_MAX_UPLOADS_PER_DAY: z.string().default('2').transform(Number),
  YT_TIER1_DURATION_MIN: z.string().default('15').transform(Number),
  YT_TIER2_DURATION_MIN: z.string().default('30').transform(Number),
  YT_TIER3_DURATION_MIN: z.string().default('60').transform(Number),
  YT_TIER2_MIN_AVG_VIEWS: z.string().default('500').transform(Number),
  YT_TIER2_MIN_AGE_DAYS: z.string().default('30').transform(Number),
  YT_TIER3_MIN_AVG_VIEWS: z.string().default('2000').transform(Number),
  YT_QUARANTINE_TRIGGER_AGE_DAYS: z.string().default('200,230'),
  YT_TRAFFIC_DROP_THRESHOLD: z.string().default('0.40').transform(Number),
  YT_RECOVERY_THRESHOLD: z.string().default('0.80').transform(Number),
  YT_QUARANTINE_FAILED_MONTHS: z.string().default('3').transform(Number),
  YT_BREAKOUT_VIEWS_MULTIPLIER: z.string().default('5').transform(Number),
  YT_BREAKOUT_CTR_THRESHOLD: z.string().default('0.08').transform(Number),
  YT_BREAKOUT_AVD_THRESHOLD: z.string().default('0.50').transform(Number),
  YT_TRIAGE_DEAD_MAX_VIEWS: z.string().default('100').transform(Number),
  YT_TRIAGE_DEAD_MAX_CTR: z.string().default('0.02').transform(Number),
  YT_TRIAGE_DEAD_MAX_AVD: z.string().default('0.20').transform(Number),
  YT_TRIAGE_GOOD_MIN_CTR: z.string().default('0.05').transform(Number),
  YT_TRIAGE_GOOD_MIN_AVD: z.string().default('0.40').transform(Number),
  YT_PROVEN_THEME_RATIO: z.string().default('0.70').transform(Number),
  YT_DAILY_API_QUOTA: z.string().default('10000').transform(Number),
  YT_UPLOAD_API_COST: z.string().default('1600').transform(Number),
  YT_UPDATE_API_COST: z.string().default('50').transform(Number),
  YT_READ_API_COST: z.string().default('1').transform(Number),
  YT_MIN_SAMPLE_RATE: z.string().default('44100').transform(Number),
  YT_TARGET_LUFS: z.string().default('-14').transform(Number),
  YT_MIN_VIDEO_WIDTH: z.string().default('1920').transform(Number),
  YT_MIN_VIDEO_HEIGHT: z.string().default('1080').transform(Number),
  YT_MAX_VIDEO_FILE_SIZE_MB: z.string().default('2048').transform(Number),
  YT_MIN_THUMB_WIDTH: z.string().default('1280').transform(Number),
  YT_MIN_THUMB_HEIGHT: z.string().default('720').transform(Number),
  YT_MAX_TITLE_LENGTH: z.string().default('100').transform(Number),
  YT_MIN_TAGS: z.string().default('15').transform(Number),
  YT_MAX_TAGS: z.string().default('30').transform(Number),
  YT_MAX_SIMILARITY_SCORE: z.string().default('0.70').transform(Number),
  YT_AUDIO_DURATION_TOLERANCE_PCT: z.string().default('0.10').transform(Number),
  YT_VIDEO_DURATION_TOLERANCE_SEC: z.string().default('2').transform(Number),
  YT_MIN_DESCRIPTION_LENGTH: z.string().default('200').transform(Number),
  SUNO_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  YT_IDEATION_BATCH_SIZE: z.string().default('15').transform(Number),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  YT_CLIENT_ID: z.string().optional(),
  YT_CLIENT_SECRET: z.string().optional(),
  CLOAKBROWSER_URL: z.string().default("http://localhost:8090"),
  CONTENT_FACTORY_URL: z.string().default("http://localhost:8767"),
  SOCIAL_WEBHOOK_URL: z.string().default("http://localhost:8200/api/webhooks/content"),
  SOCIAL_API_URL: z.string().default("http://localhost:8200"),
  CONTENT_WEBHOOK_SECRET: z.string().optional(),
  YT_CB_VOICE_RESET_MS: z.string().default('1800000').transform(Number),
  YT_CB_IMAGE_THRESHOLD: z.string().default('10').transform(Number),
  YT_CB_IMAGE_RESET_MS: z.string().default('3600000').transform(Number),
  YT_CB_VIDEO_THRESHOLD: z.string().default('3').transform(Number),
  YT_CB_VIDEO_RESET_MS: z.string().default('7200000').transform(Number),
  YT_CB_MUSIC_THRESHOLD: z.string().default('5').transform(Number),
  YT_CB_MUSIC_RESET_MS: z.string().default('1800000').transform(Number),
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
  '1AI_PAYMENT_URL': z.string().default("http://localhost:3103"),
  '1AI_PAYMENT_API_KEY': z.string().optional(),
  '1AI_PAYMENT_WEBHOOK_SECRET': z.string().optional(),

  // ── AI / Chat ──
  OMNIROUTE_URL: z.string().default("http://localhost:20128/v1"),
  OMNIROUTE_API_KEY: z.string().optional(),
  OMNIROUTE_DEFAULT_MODEL: z.string().optional(),
  GROK_API_URL: z.string().default("http://localhost:6969"),
  GROK_API_REPO: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROK_NIM_URL: z.string().default("http://localhost:30000/v1"),
  
  // ── Video Providers (4K / 60fps) ──
  VEO_API_KEY: z.string().optional(),
  VEO_API_URL: z.string().default("https://generativelanguage.googleapis.com/v1beta"),
  VEO_MODEL: z.string().default("veo-3.1"),
  VEO_MAX_DURATION: z.string().default("60").transform(Number),
  VEO_SUPPORTS_4K: z.string().default("true").transform((v) => v === "true"),
  
  KLING_API_KEY: z.string().optional(),
  KLING_API_URL: z.string().default("https://api.klingai.com/v1"),
  KLING_MODEL: z.string().default("kling-3.0"),
  KLING_MAX_DURATION: z.string().default("120").transform(Number),
  KLING_SUPPORTS_60FPS: z.string().default("true").transform((v) => v === "true"),
  
  // ── Audio Generation ──
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_API_URL: z.string().default("https://api.elevenlabs.io/v1"),
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  AUDIO_GENERATION_ENABLED: z.string().default("false").transform((v) => v === "true"),
  
  AI_PIPELINE_DIRECT_URL: z.string().default("http://localhost:20128/v1"),
  AI_PIPELINE_DIRECT_API_KEY: z.string().optional(),
  AI_PIPELINE_HUB_URL: z.string().optional(),
  AI_PIPELINE_HUB_API_KEY: z.string().optional(),
  AI_PIPELINE_MODE: z.string().default("direct"),
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
  SOCIAL_SERVICE_URL: z.string().default("http://localhost:8200"),
  SOCIAL_SERVICE_KEY: z.string().optional(),

  // ── Feature Flags (optional, default false) ──
  FEATURE_PAYMENT: boolStr,
  FEATURE_REFERRAL: boolStr,
  FEATURE_VIDEO_GENERATION: boolStr,


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
      "EBOOK_API_URL",
      "CONTENT_FACTORY_URL",
      "SOCIAL_WEBHOOK_URL",
      "SOCIAL_API_URL",
      "CLOAKBROWSER_URL",
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
      "VEO_API_KEY",
      "VEO_API_URL",
      "VEO_MODEL",
      "VEO_MAX_DURATION",
      "VEO_SUPPORTS_4K",
      "KLING_API_KEY",
      "KLING_API_URL",
      "KLING_MODEL",
      "KLING_MAX_DURATION",
      "KLING_SUPPORTS_60FPS",
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
      "VEO_API_KEY",
      "KLING_API_KEY",
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
  "Audio Generation": {
    keys: [
      "ELEVENLABS_API_KEY",
      "ELEVENLABS_API_URL",
      "ELEVENLABS_VOICE_ID",
      "AUDIO_GENERATION_ENABLED",
    ],
    sensitive: [
      "ELEVENLABS_API_KEY",
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
      "1AI_PAYMENT_URL",
      "1AI_PAYMENT_API_KEY",
      "1AI_PAYMENT_WEBHOOK_SECRET",
    ],
    sensitive: [
      "MIDTRANS_SERVER_KEY",
      "TRIPAY_API_KEY",
      "TRIPAY_PRIVATE_KEY",
      "DUITKU_API_KEY",
      "NOWPAYMENTS_API_KEY",
      "NOWPAYMENTS_IPN_SECRET",
      "1AI_PAYMENT_API_KEY",
      "1AI_PAYMENT_WEBHOOK_SECRET",
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
      "GROK_NIM_URL",
      "AI_PIPELINE_DIRECT_URL",
      "AI_PIPELINE_DIRECT_API_KEY",
      "AI_PIPELINE_HUB_URL",
      "AI_PIPELINE_HUB_API_KEY",
      "AI_PIPELINE_MODE",
      "AGENTROUTER_API_KEY",
    ],
    sensitive: ["OMNIROUTE_API_KEY", "GROQ_API_KEY", "AI_PIPELINE_DIRECT_API_KEY", "AI_PIPELINE_HUB_API_KEY", "AGENTROUTER_API_KEY"],
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
