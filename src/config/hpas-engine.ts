/**
 * HPAS Engine Configuration
 * Hook → Problem → Agitate → Solution (+ Discovery, Interaction, CTA)
 *
 * 7-scene framework for high-converting video ads
 * Used by OpenClaw SaaS v3.0
 *
 * Barrel: types live in hpas-types, scene data in hpas-scenes,
 * presets in hpas-presets, industry templates in hpas-industries,
 * logic in hpas-helpers. Re-exported here so every existing
 * `@/config/hpas-engine` import keeps working.
 */

export * from "./hpas-types";
export * from "./hpas-scenes";
export * from "./hpas-presets";
export * from "./hpas-industries";
export * from "./hpas-helpers";
import { HPAS_SCENES } from "./hpas-scenes";
import { DURATION_PRESETS } from "./hpas-presets";
import { INDUSTRY_TEMPLATES } from "./hpas-industries";
import {
  buildScenePrompt,
  detectIndustry,
  generateScenePromptsWithAI,
  generateVideoScenePrompts,
  getIndustryTemplate,
  getSceneDurations,
  getScenePrompt,
  getScenesForPreset,
} from "./hpas-helpers";

export default {
  scenes: HPAS_SCENES,
  presets: DURATION_PRESETS,
  industries: INDUSTRY_TEMPLATES,
  helpers: {
    getSceneDurations,
    getScenesForPreset,
    getIndustryTemplate,
    getScenePrompt,
    buildScenePrompt,
    generateVideoScenePrompts,
    generateScenePromptsWithAI,
    detectIndustry,
  },
};
