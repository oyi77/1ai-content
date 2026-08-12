/**
 * Image Engine — Main module
 *
 * Builds keyword index from all category modules and exposes resolveImagePrompt().
 */
import type { DetectedCategory, ImagePromptResult } from "./types";
import {
  ADDITIONAL_CATEGORIES_DETECTION,
  ADDITIONAL_CATEGORY_STYLES,
  ADDITIONAL_MATERIALS,
} from "./categories/additional";
import { HOME_DECOR_DETECTION, INTERIOR_STYLES } from "./categories/home-decor";
import {
  FASHION_DETECTION,
  FASHION_SUB_GENRES,
  FASHION_ACCESSORY_EFFECTS,
} from "./categories/fashion";
import {
  FNB_CATEGORY_DETECTION,
  FNB_STYLE_OPTIONS,
  FNB_EFFECT_OPTIONS,
} from "./categories/fnb";
import {
  SKINCARE_PRODUCT_SPECIFICS,
  SKINCARE_STYLE_THEMES,
  SKINCARE_TEXTURE_EFFECTS,
} from "./categories/skincare";
import { DEFAULT_DETECTION, NICHE_TO_IMAGE_MODULE } from "./defaults";

// ── Keyword Index ──

interface KeywordIndexEntry {
  keyword: string;
  module: string;
  category_key: string;
  label: string;
  default_style_key: string;
  focus: string;
  effects: string[];
}

const KEYWORD_INDEX: KeywordIndexEntry[] = [];

function indexModule(
  detection: Record<
    string,
    { keywords: string[]; label?: string; global_label?: string }
  >,
  moduleName: string,
  labelKey: string,
  styleKey: string,
  focusKey: string,
  effectsFn?: (key: string) => string[],
) {
  for (const [key, det] of Object.entries(detection)) {
    for (const kw of det.keywords) {
      KEYWORD_INDEX.push({
        keyword: kw.toLowerCase(),
        module: moduleName,
        category_key: key,
        label: (det as any)[labelKey] || (det as any).label || key,
        default_style_key: (det as any)[styleKey] || "",
        focus: (det as any)[focusKey] || "",
        effects: effectsFn ? effectsFn(key) : [],
      });
    }
  }
}

// Module 1: Additional Categories
for (const [key, det] of Object.entries(ADDITIONAL_CATEGORIES_DETECTION)) {
  for (const kw of det.keywords) {
    KEYWORD_INDEX.push({
      keyword: kw.toLowerCase(),
      module: "additional_categories",
      category_key: key,
      label: det.label,
      default_style_key: det.default_style,
      focus: det.focus,
      effects: [],
    });
  }
}

// Module 2: Home Decor
for (const [key, det] of Object.entries(HOME_DECOR_DETECTION)) {
  for (const kw of det.keywords) {
    KEYWORD_INDEX.push({
      keyword: kw.toLowerCase(),
      module: "home_decor",
      category_key: key,
      label: det.label,
      default_style_key: det.default_subgenre,
      focus: det.focus_point,
      effects: [],
    });
  }
}

// Module 4: Fashion
for (const [key, det] of Object.entries(FASHION_DETECTION)) {
  for (const kw of det.keywords) {
    KEYWORD_INDEX.push({
      keyword: kw.toLowerCase(),
      module: "fashion",
      category_key: key,
      label: det.label,
      default_style_key: det.default_subgenre,
      focus: "",
      effects: [],
    });
  }
}

// Module 5: FnB
for (const [key, det] of Object.entries(FNB_CATEGORY_DETECTION)) {
  for (const kw of det.keywords) {
    KEYWORD_INDEX.push({
      keyword: kw.toLowerCase(),
      module: "fnb",
      category_key: key,
      label: det.global_label,
      default_style_key: det.auto_suggestion.style,
      focus: "",
      effects: det.auto_suggestion.effects,
    });
  }
}

// Module 6: Skincare
const SKINCARE_KEYWORDS: Record<string, string[]> = {
  serum_face: ["serum", "dropper", "face serum", "essence"],
  moisturizer_cream: [
    "moisturizer",
    "cream",
    "lotion",
    "body cream",
    "face cream",
  ],
  face_mask: ["face mask", "sheet mask", "clay mask", "peel off"],
  lipstick_makeup: [
    "lipstick",
    "makeup",
    "foundation",
    "mascara",
    "eyeshadow",
    "blush",
    "cosmetic",
  ],
  soap_cleanser: ["soap", "cleanser", "face wash", "hand soap", "body wash"],
};

for (const [key, keywords] of Object.entries(SKINCARE_KEYWORDS)) {
  for (const kw of keywords) {
    KEYWORD_INDEX.push({
      keyword: kw.toLowerCase(),
      module: "skincare",
      category_key: key,
      label: "Skincare & Cosmetic",
      default_style_key: "luxury_elegant",
      focus: SKINCARE_PRODUCT_SPECIFICS[key]?.prompt_hint || "",
      effects: ["water_droplets"],
    });
  }
}

// ── Style Lookup ──

function lookupStylePrompt(module: string, styleKey: string): string {
  switch (module) {
    case "additional_categories":
      return ADDITIONAL_CATEGORY_STYLES[styleKey]?.prompt_val || "";
    case "home_decor":
      return INTERIOR_STYLES[styleKey]?.prompt_val || "";
    case "fashion":
      return FASHION_SUB_GENRES[styleKey]?.prompt_val || "";
    case "fnb":
      return FNB_STYLE_OPTIONS[styleKey]?.prompt_val || "";
    case "skincare":
      return SKINCARE_STYLE_THEMES[styleKey]?.prompt_val || "";
    default:
      return "";
  }
}

function lookupEffectPrompts(module: string, effectKeys: string[]): string[] {
  const results: string[] = [];
  for (const ek of effectKeys) {
    let val: string | undefined;
    switch (module) {
      case "fnb":
        val = FNB_EFFECT_OPTIONS[ek]?.prompt_val;
        break;
      case "skincare":
        val = SKINCARE_TEXTURE_EFFECTS[ek]?.prompt_val;
        break;
      default:
        val =
          FASHION_ACCESSORY_EFFECTS[ek]?.prompt_val ||
          ADDITIONAL_MATERIALS[ek]?.prompt_val;
        break;
    }
    if (val) results.push(val);
  }
  return results;
}

// ── Resolver ──

/**
 * Resolve a complete image prompt from a user description and optional
 * pre-detected category.
 */
export function resolveImagePrompt(
  userDescription: string,
  detectedCategory?: string,
): ImagePromptResult {
  const descLower = userDescription.toLowerCase();

  // Step 1: Try keyword detection
  let detected: DetectedCategory | null = null;
  const sortedIndex = [...KEYWORD_INDEX].sort(
    (a, b) => b.keyword.length - a.keyword.length,
  );

  for (const entry of sortedIndex) {
    if (descLower.includes(entry.keyword)) {
      const stylePrompt = lookupStylePrompt(
        entry.module,
        entry.default_style_key,
      );
      detected = {
        module: entry.module,
        category_key: entry.category_key,
        label: entry.label,
        default_style_key: entry.default_style_key,
        default_style_prompt: stylePrompt,
        focus_prompt: entry.focus,
        effects: entry.effects,
      };
      break;
    }
  }

  // Step 2: Niche-based fallback
  if (!detected && detectedCategory) {
    const nicheMapping = NICHE_TO_IMAGE_MODULE[detectedCategory];
    if (nicheMapping) {
      const stylePrompt = lookupStylePrompt(
        nicheMapping.module,
        nicheMapping.default_style_key,
      );
      detected = {
        module: nicheMapping.module,
        category_key: detectedCategory,
        label: nicheMapping.label,
        default_style_key: nicheMapping.default_style_key,
        default_style_prompt: stylePrompt,
        focus_prompt: "",
        effects: [],
      };
    }
  }

  // Step 3: Default
  if (!detected) {
    detected = { ...DEFAULT_DETECTION };
  }

  // Step 4: Compose
  const segments: string[] = [userDescription.trim()];
  if (detected.focus_prompt) segments.push(detected.focus_prompt);
  if (detected.default_style_prompt)
    segments.push(detected.default_style_prompt);

  const effectPrompts = lookupEffectPrompts(detected.module, detected.effects);
  if (effectPrompts.length > 0) segments.push(effectPrompts.join(", "));

  segments.push(
    "photorealistic, 8K resolution, ultra detailed, commercial ad quality, sharp focus",
  );

  return {
    full: segments.join(", "),
    style: detected.default_style_key,
    effects: detected.effects,
    category: detected.label,
  };
}

export { DEFAULT_DETECTION, NICHE_TO_IMAGE_MODULE } from "./defaults";
export * from "./types";
export * from "./categories/additional";
export * from "./categories/home-decor";
export * from "./categories/fashion";
export * from "./categories/fnb";
export * from "./categories/skincare";
