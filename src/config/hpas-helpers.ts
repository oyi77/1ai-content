// HPAS helper functions (split from hpas-engine.ts — re-exported there).

import { getConfig } from "@/config/env";
import axios from "axios";
import { logger } from "@/utils/logger";
import { ConfigError, ProviderError } from "@/utils/app-errors";
import type {
  DurationPreset,
  IndustryId,
  IndustryScenePrompt,
  IndustryTemplate,
  SceneConfig,
  SceneId,
} from "./hpas-types";
import { HPAS_SCENES } from "./hpas-scenes";
import { DURATION_PRESETS } from "./hpas-presets";
import { INDUSTRY_TEMPLATES } from "./hpas-industries";

// ── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Get scene durations for a given preset
 */
export function getSceneDurations(
  preset: DurationPreset,
): Partial<Record<SceneId, number>> {
  return DURATION_PRESETS[preset].sceneDurations;
}

/**
 * Get scenes included in a preset
 */
export function getScenesForPreset(preset: DurationPreset): SceneConfig[] {
  const presetConfig = DURATION_PRESETS[preset];
  return presetConfig.scenesIncluded.map((id) => HPAS_SCENES[id]);
}

/**
 * Get industry template
 */
export function getIndustryTemplate(industry: IndustryId): IndustryTemplate {
  return INDUSTRY_TEMPLATES[industry];
}

/**
 * Get scene prompt for a specific industry and scene
 */
export function getScenePrompt(
  industry: IndustryId,
  sceneId: SceneId,
): IndustryScenePrompt | undefined {
  const template = INDUSTRY_TEMPLATES[industry];
  return template.scenes.find((s) => s.sceneId === sceneId);
}

/**
 * Build a scene prompt combining industry template with product description
 */
export function buildScenePrompt(
  sceneId: SceneId,
  industry: IndustryId,
  productDescription: string,
  language: "en" | "id" = "id",
): string {
  const scenePrompt = getScenePrompt(industry, sceneId);
  const sceneConfig = HPAS_SCENES[sceneId];

  if (!scenePrompt) {
    // Fallback to general
    const generalPrompt = getScenePrompt("general", sceneId);
    const basePrompt =
      language === "id"
        ? generalPrompt?.promptId_lang
        : generalPrompt?.promptEn;
    return `${basePrompt || sceneConfig.description}. Product: ${productDescription}`;
  }

  const basePrompt =
    language === "id" ? scenePrompt.promptId_lang : scenePrompt.promptEn;
  return `${basePrompt}. Produk: ${productDescription}`;
}

/**
 * Generate all scene prompts for a video
 */
export function generateVideoScenePrompts(
  industry: IndustryId,
  productDescription: string,
  preset: DurationPreset = "standard",
  language: "en" | "id" = "id",
): Array<{
  sceneId: SceneId;
  scene: SceneConfig;
  prompt: string;
  durationSeconds: number;
}> {
  const presetConfig = DURATION_PRESETS[preset];

  return presetConfig.scenesIncluded.map((sceneId) => ({
    sceneId,
    scene: HPAS_SCENES[sceneId],
    prompt: buildScenePrompt(sceneId, industry, productDescription, language),
    durationSeconds: presetConfig.sceneDurations[sceneId] || 4,
  }));
}

/**
 * Detect industry from product description
 */
export function detectIndustry(productDescription: string): IndustryId {
  const desc = productDescription.toLowerCase();

  if (
    /skin|cream|serum|lotion|wajah|jerawat|moisturizer|makeup|lipstik|kosmetik|kecantikan/.test(
      desc,
    )
  )
    return "beauty";
  if (
    /makanan|minuman|restoran|cafe|kafe|food|kuliner|catering|snack|kue|masakan|makan/.test(
      desc,
    )
  )
    return "food";
  if (
    /baju|kaos|dress|fashion|pakaian|celana|jaket|tas|sepatu|aksesori|outfit|clothing/.test(
      desc,
    )
  )
    return "fashion";
  if (
    /hp|handphone|laptop|gadget|tech|teknologi|software|apps|charging|earphone|speaker/.test(
      desc,
    )
  )
    return "tech";
  if (
    /gym|olahraga|fitness|suplemen|diet|protein|workout|sport|sehat|kesehatan/.test(
      desc,
    )
  )
    return "fitness";

  return "general";
}

/**
 * AI-powered storyboard generator using Gemini.
 * Falls back to static template generation if Gemini is unavailable.
 */
export async function generateScenePromptsWithAI(
  productDescription: string,
  preset: DurationPreset = "standard",
  language: "en" | "id" = "id",
): Promise<
  Array<{
    sceneId: SceneId;
    scene: SceneConfig;
    prompt: string;
    durationSeconds: number;
  }>
> {
  const presetConfig = DURATION_PRESETS[preset];
  const scenes = presetConfig.scenesIncluded;
  const apiKey = getConfig().GEMINI_API_KEY;
  if (!apiKey) throw new ConfigError("GEMINI_API_KEY");

  const sceneDescriptions = scenes
    .map((id) => `${id}: ${HPAS_SCENES[id].description}`)
    .join("\n");

  const prompt =
    language === "id"
      ? `Kamu adalah sutradara iklan video viral. Buat storyboard untuk video iklan produk berikut:\n\nPRODUK: ${productDescription}\n\nBuat prompt visual yang spesifik dan menarik untuk setiap scene berikut:\n${sceneDescriptions}\n\nFormat output (JSON array, satu objek per scene):\n[{"sceneId":"hook","prompt":"<visual prompt dalam bahasa Indonesia>"},...]`
      : `You are a viral video ad director. Create a storyboard for this product:\n\nPRODUCT: ${productDescription}\n\nCreate specific, compelling visual prompts for each scene:\n${sceneDescriptions}\n\nOutput format (JSON array):\n[{"sceneId":"hook","prompt":"<visual prompt>"},...]`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1500 },
    },
    { timeout: 30000 },
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extract first valid JSON array from response (robust against multiple arrays in output)
  let aiScenes: Array<{ sceneId: SceneId; prompt: string }> = [];
  const arrayMatches = [...text.matchAll(/\[[\s\S]*?\]/g)];
  let parsed = false;
  for (const m of arrayMatches) {
    try {
      const candidate = JSON.parse(m[0]);
      if (Array.isArray(candidate) && candidate.length > 0) {
        aiScenes = candidate;
        parsed = true;
        break;
      }
    } catch {
      // try next match
    }
  }
  // Fallback: try the whole greedy match if non-greedy found nothing
  if (!parsed) {
    const greedyMatch = text.match(/\[[\s\S]*\]/);
    if (greedyMatch) {
      try {
        const candidate = JSON.parse(greedyMatch[0]);
        if (Array.isArray(candidate)) aiScenes = candidate;
      } catch {
        // ignore
      }
    }
  }
  if (aiScenes.length === 0)
    throw new ProviderError(
      "gemini-storyboard",
      "no valid JSON array in response",
    );

  // Validate match rate — warn if Gemini returned wrong sceneId keys
  const matchedCount = scenes.filter((sceneId) =>
    aiScenes.some((s) => s.sceneId === sceneId),
  ).length;
  if (matchedCount < Math.ceil(scenes.length / 2)) {
    logger.warn(
      `[hpas-engine] Gemini storyboard: only ${matchedCount}/${scenes.length} scene IDs matched. ` +
        `Expected: ${scenes.join(", ")}. Got: ${aiScenes.map((s) => s.sceneId).join(", ")}. Falling back to static for unmatched.`,
    );
  }

  return scenes.map((sceneId) => {
    const aiScene = aiScenes.find((s) => s.sceneId === sceneId);
    return {
      sceneId,
      scene: HPAS_SCENES[sceneId],
      prompt:
        aiScene?.prompt ||
        buildScenePrompt(
          sceneId,
          detectIndustry(productDescription),
          productDescription,
          language,
        ),
      durationSeconds: presetConfig.sceneDurations[sceneId] || 4,
    };
  });
}
