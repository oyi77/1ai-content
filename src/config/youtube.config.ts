/**
 * YouTube Workflow Configuration
 *
 * All tuneable values read from environment with safe defaults.
 * Zero hardcoded values in services — everything flows through here.
 */

import { getConfig } from "./env";

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

// ── Quarantine ──

export function getQuarantineTriggerAgeDays(): number[] {
  const raw = getConfig().YT_QUARANTINE_TRIGGER_AGE_DAYS || "200,230";
  return raw.split(",").map(Number);
}

export function getTrafficDropThreshold(): number {
  return getConfig().YT_TRAFFIC_DROP_THRESHOLD || 0.4;
}

export function getRecoveryThreshold(): number {
  return getConfig().YT_RECOVERY_THRESHOLD || 0.8;
}

// ── Quality Gate — Audio ──

export function getMinSampleRate(): number {
  return getConfig().YT_MIN_SAMPLE_RATE || 44100;
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

// Channel growth tier — consumed by the script-writer service.
export type ChannelTier =
  | "tier_1_cold_start"
  | "tier_2_growing"
  | "tier_3_established";
