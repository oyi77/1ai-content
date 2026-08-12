/**
 * Scene Consistency Engine
 *
 * Ensures multi-scene videos maintain visual consistency by extracting
 * key visual elements from the first scene and injecting them as
 * consistency anchors into subsequent scene prompts.
 */

import { logger } from "@/utils/logger";
import { NICHE_CONFIG, resolveNicheKey } from "@/config/niches";
import { STYLE_PRESETS } from "@/config/styles";

/**
 * Tracks visual identity across scenes to maintain coherence.
 */
export interface SceneMemory {
  mainSubject: string;
  colorPalette: string;
  lightingStyle: string;
  cameraStyle: string;
  mood: string;
  previousSceneDescription: string;
  referenceImageAnchored?: boolean;
}

/**
 * Mapping from niche IDs to default mood descriptors.
 */
const NICHE_MOOD_MAP: Record<string, string> = {
  fashion_lifestyle: "stylish and aspirational",
  food_culinary: "warm and appetizing",
  tech_gadgets: "sleek and modern",
  beauty_skincare: "soft and radiant",
  travel_adventure: "epic and adventurous",
  fitness_health: "energetic and powerful",
  home_decor: "cozy and inviting",
  business_finance: "professional and confident",
  education_knowledge: "clean and informative",
  // New niches
  cinematic: "dramatic and cinematic",
  anime: "vibrant and stylized",
  music_video: "energetic and rhythmic",
  entertainment: "vibrant and exciting",
  // Fallback keys used in the simpler NICHES map from video-generation service
  trading: "analytical and focused",
  fitness: "energetic and powerful",
  cooking: "warm and appetizing",
  tech: "sleek and modern",
  travel: "epic and adventurous",
  education: "clean and informative",
  fnb: "warm and appetizing",
  beauty: "soft and radiant",
  retail: "vibrant and engaging",
  services: "professional and trustworthy",
  professional: "polished and authoritative",
  hospitality: "welcoming and luxurious",
};

/**
 * Mapping from style IDs to default camera descriptors.
 */
const STYLE_CAMERA_MAP: Record<string, string> = {
  realistic: "natural perspective, steady framing",
  cartoon: "dynamic playful angles",
  anime: "dramatic anime angles, expressive framing",
  closeup_product: "macro close-up, shallow depth of field",
  daily_life: "handheld candid, point of view",
  comparison: "matched split-screen framing",
  cinematic: "cinematic tracking, widescreen framing",
  minimalist: "centered symmetrical composition",
  luxury: "premium editorial framing",
};

/**
 * SceneConsistencyEngine
 *
 * Stateless utility that creates a SceneMemory from the first scene's
 * prompt and uses it to enrich subsequent scene prompts so the generated
 * videos share a coherent visual language.
 */
export class SceneConsistencyEngine {
  /**
   * Analyse the first scene prompt together with the selected niche and
   * style to build a SceneMemory that captures the key visual identity.
   */
  static createMemory(
    firstScenePrompt: string,
    niche: string,
    style: string,
    hasReferenceImage?: boolean,
  ): SceneMemory {
    const mainSubject = SceneConsistencyEngine.extractSubject(firstScenePrompt);
    const colorPalette = SceneConsistencyEngine.deriveColorPalette(
      niche,
      firstScenePrompt,
    );
    const lightingStyle = SceneConsistencyEngine.deriveLighting(
      style,
      firstScenePrompt,
    );
    const cameraStyle = STYLE_CAMERA_MAP[style] || "consistent framing";
    const canonicalNiche = resolveNicheKey(niche);
    const mood =
      NICHE_MOOD_MAP[canonicalNiche as keyof typeof NICHE_MOOD_MAP] ||
      "professional and engaging";

    const memory: SceneMemory = {
      mainSubject,
      colorPalette,
      lightingStyle,
      cameraStyle,
      mood,
      previousSceneDescription: firstScenePrompt,
      referenceImageAnchored: !!hasReferenceImage,
    };

    logger.info("[SceneConsistency] Memory created", {
      mainSubject: memory.mainSubject,
      colorPalette: memory.colorPalette,
      lightingStyle: memory.lightingStyle,
      referenceImageAnchored: memory.referenceImageAnchored,
    });

    return memory;
  }

  /**
   * Enrich a scene prompt with consistency anchors derived from the
   * SceneMemory so that the visual output stays coherent.
   *
   * For the first scene (sceneIndex === 0) the prompt is returned
   * unchanged because it is the source of truth for the memory.
   */
  static enrichScenePrompt(
    scenePrompt: string,
    memory: SceneMemory,
    sceneIndex: number,
  ): string {
    // Reference image identity anchor — applied to ALL scenes (including scene 0)
    const refImageAnchor = memory.referenceImageAnchored
      ? "maintain exact visual identity from original reference image, no identity drift"
      : "";

    // Scene 0 is the anchor — only add reference image lock if applicable
    if (sceneIndex === 0) {
      if (refImageAnchor) {
        return `${scenePrompt}, ${refImageAnchor}`;
      }
      return scenePrompt;
    }

    // Build a consistency prefix that reminds the model of the visual
    // identity established in scene 1.
    const consistencyParts: string[] = [];

    if (memory.mainSubject) {
      consistencyParts.push(`maintaining focus on ${memory.mainSubject}`);
    }
    if (memory.colorPalette) {
      consistencyParts.push(`${memory.colorPalette} color palette`);
    }
    if (memory.lightingStyle) {
      consistencyParts.push(`${memory.lightingStyle}`);
    }
    if (memory.cameraStyle) {
      consistencyParts.push(`${memory.cameraStyle}`);
    }
    if (memory.mood) {
      consistencyParts.push(`${memory.mood} mood`);
    }

    // Build the continuity anchor
    const continuityNote = `[Continuing from previous scene: ${memory.previousSceneDescription}]`;
    const consistencyAnchor =
      consistencyParts.length > 0
        ? `[Visual consistency: ${consistencyParts.join(", ")}]`
        : "";

    // Compose the enriched prompt: continuity context, original prompt,
    // then the consistency anchor as a suffix.
    const enrichedParts = [continuityNote, scenePrompt, consistencyAnchor];

    // Add reference image identity lock for all scenes
    if (refImageAnchor) {
      enrichedParts.push(refImageAnchor);
    }

    const enriched = enrichedParts.filter(Boolean).join(" ");

    // Update memory with current scene for next iteration
    memory.previousSceneDescription = scenePrompt;

    logger.debug(`[SceneConsistency] Enriched scene ${sceneIndex + 1} prompt`, {
      original: scenePrompt.slice(0, 80),
      enriched: enriched.slice(0, 120),
    });

    return enriched;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the main subject from a prompt by looking for common
   * patterns and falling back to the most descriptive noun phrase.
   */
  private static extractSubject(prompt: string): string {
    // Remove duration/platform tokens (e.g. "15s", "tiktok format")
    const cleaned = prompt
      .replace(/\d+s\s*/g, "")
      .replace(
        /,?\s*(tiktok|instagram|youtube|facebook|shorts|reels)\s*format/gi,
        "",
      )
      .replace(/,?\s*(high quality|professional style)/gi, "")
      .trim();

    // Take the first meaningful clause (before the first comma)
    const firstClause = cleaned.split(",")[0]?.trim() || cleaned;

    // Limit length to keep prompts sane
    if (firstClause.length > 80) {
      return firstClause.slice(0, 80).trim();
    }

    return firstClause || "the main subject";
  }

  /**
   * Derive a color palette description from the niche config or the
   * prompt itself.
   */
  private static deriveColorPalette(niche: string, _prompt: string): string {
    // Try the detailed NICHE_CONFIG first
    const nicheConfig = NICHE_CONFIG[niche];
    if (nicheConfig?.colorPalettes?.length) {
      return nicheConfig.colorPalettes[0];
    }

    // Fallback colour associations for the simpler niche keys
    const fallback: Record<string, string> = {
      trading: "green and dark tones",
      fitness: "high contrast bold tones",
      cooking: "warm appetizing tones",
      tech: "cool modern tones",
      travel: "golden hour natural tones",
      education: "clean bright tones",
      fnb: "warm rustic tones",
      beauty: "soft pastel tones",
      retail: "vibrant commercial tones",
      services: "professional neutral tones",
      professional: "muted corporate tones",
      hospitality: "warm luxurious tones",
    };

    return fallback[niche] || "consistent natural tones";
  }

  /**
   * Derive a lighting description from the style preset or the prompt.
   */
  private static deriveLighting(style: string, prompt: string): string {
    const preset = STYLE_PRESETS[style];
    if (preset?.lighting?.length) {
      return preset.lighting[0];
    }

    // Check the prompt for explicit lighting keywords
    const lightingKeywords = [
      "golden hour",
      "natural light",
      "studio lighting",
      "dramatic lighting",
      "soft light",
      "neon",
      "ambient",
      "backlit",
      "rim light",
    ];
    for (const kw of lightingKeywords) {
      if (prompt.toLowerCase().includes(kw)) {
        return kw;
      }
    }

    return "consistent professional lighting";
  }
}
