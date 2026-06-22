/**
 * YouTube Workflow Configuration
 *
 * All tuneable values read from environment with safe defaults.
 * Zero hardcoded values in services — everything flows through here.
 */

import { getConfig } from "./env";

// ── Upload Slots ──

export function getUsUploadTime(): string {
  return getConfig().YT_US_UPLOAD_TIME_WIB || "15:00";
}

export function getIdUploadTime(): string {
  return getConfig().YT_ID_UPLOAD_TIME_WIB || "20:00";
}

export function getMaxUploadsPerDay(): number {
  return getConfig().YT_MAX_UPLOADS_PER_DAY || 2;
}

// ── Duration Tiers ──

export function getTier1Duration(): number {
  return getConfig().YT_TIER1_DURATION_MIN || 15;
}

export function getTier2Duration(): number {
  return getConfig().YT_TIER2_DURATION_MIN || 30;
}

export function getTier3Duration(): number {
  return getConfig().YT_TIER3_DURATION_MIN || 60;
}

// ── Tier Upgrade Thresholds ──

export function getTier2MinAvgViews(): number {
  return getConfig().YT_TIER2_MIN_AVG_VIEWS || 500;
}

export function getTier2MinAgeDays(): number {
  return getConfig().YT_TIER2_MIN_AGE_DAYS || 30;
}

export function getTier3MinAvgViews(): number {
  return getConfig().YT_TIER3_MIN_AVG_VIEWS || 2000;
}

// ── Quarantine ──

export function getQuarantineTriggerAgeDays(): number[] {
  const raw = getConfig().YT_QUARANTINE_TRIGGER_AGE_DAYS || "200,230";
  return raw.split(",").map(Number);
}

export function getTrafficDropThreshold(): number {
  return getConfig().YT_TRAFFIC_DROP_THRESHOLD || 0.40;
}

export function getRecoveryThreshold(): number {
  return getConfig().YT_RECOVERY_THRESHOLD || 0.80;
}

export function getQuarantineFailedMonths(): number {
  return getConfig().YT_QUARANTINE_FAILED_MONTHS || 3;
}

// ── Breakout Detection ──

export function getBreakoutViewsMultiplier(): number {
  return getConfig().YT_BREAKOUT_VIEWS_MULTIPLIER || 5;
}

export function getBreakoutCtrThreshold(): number {
  return getConfig().YT_BREAKOUT_CTR_THRESHOLD || 0.08;
}

export function getBreakoutAvdThreshold(): number {
  return getConfig().YT_BREAKOUT_AVD_THRESHOLD || 0.50;
}

// ── Triage ──

export function getTriageDeadMaxViews(): number {
  return getConfig().YT_TRIAGE_DEAD_MAX_VIEWS || 100;
}

export function getTriageDeadMaxCtr(): number {
  return getConfig().YT_TRIAGE_DEAD_MAX_CTR || 0.02;
}

export function getTriageDeadMaxAvd(): number {
  return getConfig().YT_TRIAGE_DEAD_MAX_AVD || 0.20;
}

export function getTriageGoodMinCtr(): number {
  return getConfig().YT_TRIAGE_GOOD_MIN_CTR || 0.05;
}

export function getTriageGoodMinAvd(): number {
  return getConfig().YT_TRIAGE_GOOD_MIN_AVD || 0.40;
}

// ── Content Ratio ──

export function getProvenThemeRatio(): number {
  return getConfig().YT_PROVEN_THEME_RATIO || 0.70;
}

// ── Ideation ──

export function getIdeationBatchSize(): number {
  return getConfig().YT_IDEATION_BATCH_SIZE || 10;
}

// ── API Quota ──

export function getDailyApiQuota(): number {
  return getConfig().YT_DAILY_API_QUOTA || 10_000;
}

export function getUploadApiCost(): number {
  return getConfig().YT_UPLOAD_API_COST || 1_600;
}

// ── Quality Gate — Audio ──

export function getMinSampleRate(): number {
  return getConfig().YT_MIN_SAMPLE_RATE || 44100;
}

export function getTargetLufs(): number {
  return getConfig().YT_TARGET_LUFS || -14;
}

// ── Quality Gate — Video ──

export function getMinVideoWidth(): number {
  return getConfig().YT_MIN_VIDEO_WIDTH || 1920;
}

export function getMinVideoHeight(): number {
  return getConfig().YT_MIN_VIDEO_HEIGHT || 1080;
}

export function getMaxVideoFileSizeMb(): number {
  return getConfig().YT_MAX_VIDEO_FILE_SIZE_MB || 2048;
}

// ── Quality Gate — Thumbnail ──

export function getMinThumbWidth(): number {
  return getConfig().YT_MIN_THUMB_WIDTH || 1280;
}

export function getMinThumbHeight(): number {
  return getConfig().YT_MIN_THUMB_HEIGHT || 720;
}

// ── Quality Gate — SEO ──

export function getMaxTitleLength(): number {
  return getConfig().YT_MAX_TITLE_LENGTH || 100;
}

export function getMinTags(): number {
  return getConfig().YT_MIN_TAGS || 15;
}

export function getMaxTags(): number {
  return getConfig().YT_MAX_TAGS || 30;
}

// ── Quality Gate — Content ──

export function getMaxSimilarityScore(): number {
  return getConfig().YT_MAX_SIMILARITY_SCORE || 0.70;
}

// ── Circuit Breaker ──

export function getCircuitBreakerThreshold(provider: "voice" | "image" | "video" | "music"): number {
  const key = `YT_CB_${provider.toUpperCase()}_THRESHOLD` as keyof ReturnType<typeof getConfig>;
  return (getConfig()[key] as number) || { voice: 5, image: 10, video: 3, music: 5 }[provider];
}

export function getCircuitBreakerResetMs(provider: "voice" | "image" | "video" | "music"): number {
  const key = `YT_CB_${provider.toUpperCase()}_RESET_MS` as keyof ReturnType<typeof getConfig>;
  return (getConfig()[key] as number) || { voice: 1800000, image: 3600000, video: 7200000, music: 1800000 }[provider];
}

// ── Niche Verticals (domain data — stable, not tuneable) ──

export const NICHE_VERTICALS = {
  folklore_history: {
    name: "Folklore & Sejarah",
    productionFormat: "narrated_slideshow" as const,
    toneVariants: ["horror", "heroik", "misteri", "romansa_tragis"],
  },
  music: {
    name: "Music & Lagu",
    productionFormat: "music_visualizer" as const,
    toneVariants: ["chill", "energetic", "romantic", "melancholic"],
  },
  true_crime: {
    name: "True Crime & Misteri",
    productionFormat: "narrated_slideshow" as const,
    toneVariants: ["suspense", "investigative", "documentary", "dramatic"],
  },
  science_nature: {
    name: "Sains & Alam",
    productionFormat: "narrated_slideshow" as const,
    toneVariants: ["wonder", "educational", "dramatic", "mystery"],
  },
  educational: {
    name: "Edukatif & Explainer",
    productionFormat: "narrated_slideshow" as const,
    toneVariants: ["informative", "engaging", "dramatic", "simplified"],
  },
} as const;

export type NicheVertical = keyof typeof NICHE_VERTICALS;
export type ProductionFormat = "narrated_slideshow" | "music_visualizer";
export type ChannelTier = "tier_1_cold_start" | "tier_2_growing" | "tier_3_established";
export type TrafficStatus = "unproven" | "growing" | "established" | "quarantine" | "transferred" | "deleted";
export type VideoTriageDecision = "DELETE" | "KEEP" | "TRANSFER_CANDIDATE";
