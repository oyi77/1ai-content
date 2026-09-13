// HPAS duration presets (split from hpas-engine.ts — re-exported there).

import type { DurationPresetConfig, SceneId } from "./hpas-types";

// ── Duration Presets ──────────────────────────────────────────────────────────

export const DURATION_PRESETS: Record<string, DurationPresetConfig> = {
  quick: {
    id: "quick",
    name: "Quick",
    totalSeconds: 15,
    scenesIncluded: ["hook", "problem", "discovery", "result", "cta"],
    sceneDurations: { hook: 3, problem: 3, discovery: 3, result: 3, cta: 3 },
    creditCost: 8, // 0.8 credits (aligned with UNIT_COSTS.VIDEO_15S)
    description: "15s — 5 scenes, fast format. Best for TikTok paid ads.",
  },
  standard: {
    id: "standard",
    name: "Standard",
    totalSeconds: 30,
    scenesIncluded: [
      "hook",
      "problem",
      "agitate",
      "discovery",
      "interaction",
      "result",
      "cta",
    ],
    sceneDurations: {
      hook: 4,
      problem: 4,
      agitate: 4,
      discovery: 5,
      interaction: 5,
      result: 4,
      cta: 4,
    },
    creditCost: 15, // 1.5 credits (aligned with UNIT_COSTS.VIDEO_30S)
    description: "30s — 7 scenes full HPAS. Most versatile, all platforms.",
  },
  extended: {
    id: "extended",
    name: "Extended",
    totalSeconds: 60,
    scenesIncluded: [
      "hook",
      "problem",
      "agitate",
      "discovery",
      "interaction",
      "result",
      "cta",
    ],
    sceneDurations: {
      hook: 8,
      problem: 8,
      agitate: 8,
      discovery: 10,
      interaction: 10,
      result: 8,
      cta: 8,
    },
    creditCost: 30, // 3.0 credits (aligned with UNIT_COSTS.VIDEO_60S)
    description:
      "60s — 7 scenes extended. Rich storytelling, YouTube/Facebook.",
  },
};

/**
 * Build a custom duration preset config for arbitrary durations (6-3600s).
 * Cycles through 7 HPAS scenes. Max 50 scenes.
 */
export function buildCustomPresetConfig(
  durationSeconds: number,
): DurationPresetConfig {
  const clamped = Math.max(6, Math.min(3600, durationSeconds));
  const FULL_CYCLE: SceneId[] = [
    "hook",
    "problem",
    "agitate",
    "discovery",
    "interaction",
    "result",
    "cta",
  ];

  // Calculate scene count: ~5-8s per scene, cycle through HPAS
  const targetSceneDuration = clamped <= 60 ? 5 : clamped <= 300 ? 6 : 7;
  let sceneCount = Math.max(3, Math.ceil(clamped / targetSceneDuration));
  sceneCount = Math.min(sceneCount, 50); // hard cap

  // Build scene list by cycling through HPAS
  const scenesIncluded: SceneId[] = [];
  for (let i = 0; i < sceneCount; i++) {
    scenesIncluded.push(FULL_CYCLE[i % FULL_CYCLE.length]);
  }

  // Distribute duration proportionally (standard ratios)
  const ratios: Record<SceneId, number> = {
    hook: 4,
    problem: 4,
    agitate: 4,
    discovery: 5,
    interaction: 5,
    result: 4,
    cta: 4,
  };
  const totalRatio = scenesIncluded.reduce((s, id) => s + ratios[id], 0);
  const sceneDurations: Partial<Record<SceneId, number>> = {};
  let assigned = 0;
  scenesIncluded.forEach((id, i) => {
    if (i === scenesIncluded.length - 1) {
      sceneDurations[id] = clamped - assigned; // last scene gets remainder
    } else {
      const dur = Math.max(2, Math.round((ratios[id] / totalRatio) * clamped));
      sceneDurations[id] = dur;
      assigned += dur;
    }
  });

  // Tiered pricing: 0.035/s first 60s, 0.030/s 61-300s, 0.025/s 300+s
  let creditCost = 0;
  if (clamped <= 60) {
    creditCost = clamped * 0.035;
  } else if (clamped <= 300) {
    creditCost = 60 * 0.035 + (clamped - 60) * 0.03;
  } else {
    creditCost = 60 * 0.035 + 240 * 0.03 + (clamped - 300) * 0.025;
  }
  creditCost = Math.max(0.5, Math.round(creditCost * 10) / 10); // min 0.5, round to 0.1

  const minutes = Math.floor(clamped / 60);
  const secs = clamped % 60;
  const durLabel =
    minutes > 0 ? `${minutes}m${secs > 0 ? `${secs}s` : ""}` : `${secs}s`;

  return {
    id: "custom",
    name: `Custom ${durLabel}`,
    totalSeconds: clamped,
    scenesIncluded,
    sceneDurations,
    creditCost,
    description: `${durLabel} — ${sceneCount} scenes, custom duration.`,
  };
}
