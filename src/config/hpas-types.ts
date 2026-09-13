// HPAS engine shared types (split from hpas-engine.ts — re-exported there).

// ── Types ────────────────────────────────────────────────────────────────────

export type SceneId =
  | "hook"
  | "problem"
  | "agitate"
  | "discovery"
  | "interaction"
  | "result"
  | "cta";
export type DurationPreset = "quick" | "standard" | "extended" | "custom";
export type IndustryId =
  | "beauty"
  | "food"
  | "fashion"
  | "tech"
  | "fitness"
  | "general";

export interface SceneConfig {
  id: SceneId;
  name: string;
  nameId: string; // Indonesian name
  order: number;
  durationRange: { min: number; max: number }; // in seconds
  emotionTarget: string;
  description: string;
  cinematographyTips: string[];
  aiPromptHints: string[];
}

export interface DurationPresetConfig {
  id: DurationPreset | string;
  name: string;
  totalSeconds: number;
  scenesIncluded: SceneId[];
  sceneDurations: Partial<Record<SceneId, number>>; // seconds per scene
  creditCost: number; // in units — DEPRECATED: use getUnitCostAsync() for billing; kept for legacy ratio calculations
  description: string;
}

export interface IndustryScenePrompt {
  sceneId: SceneId;
  promptId: string;
  promptEn: string;
  promptId_lang: string; // Indonesian
  visualStyle: string;
  lighting: string;
  mood: string;
}

export interface IndustryTemplate {
  id: IndustryId;
  name: string;
  nameId: string;
  description: string;
  colorPalette: string[];
  scenes: IndustryScenePrompt[];
}
