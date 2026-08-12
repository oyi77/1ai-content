/**
 * Video Generation Worker — Caption Generator
 *
 * Auto-generates social media captions with hashtags.
 * Extracted from video-generation.worker.ts.
 */

import {
  MARKETING_HOOKS,
  MARKETING_CTAS,
} from "@/config/audio-subtitle-engine";
import type { GeneratedCaption } from "./video-generation.types";

const NICHE_HASHTAGS: Record<string, string[]> = {
  fnb: ["foodie", "foodtok", "kuliner", "makananenak", "resep", "foodlover"],
  food_culinary: [
    "foodie",
    "foodtok",
    "kuliner",
    "makananenak",
    "resep",
    "foodlover",
  ],
  realestate: ["properti", "rumah", "realestate", "investasi", "homedecor"],
  product: ["produk", "review", "unboxing", "belanja", "shopee", "tokopedia"],
  beauty: ["skincare", "beauty", "glowup", "beautytips", "makeup"],
  beauty_skincare: ["skincare", "beauty", "glowup", "beautytips", "makeup"],
  fashion: ["ootd", "fashion", "style", "outfit", "fashiontok"],
  fashion_lifestyle: ["ootd", "fashion", "style", "outfit", "fashiontok"],
  tech: ["tech", "gadget", "teknologi", "review", "unboxing"],
  tech_gadgets: ["tech", "gadget", "teknologi", "review", "unboxing"],
  travel: ["travel", "jalan2", "liburan", "wisata", "explore"],
  travel_adventure: ["travel", "jalan2", "liburan", "wisata", "explore"],
  fitness: ["fitness", "workout", "gym", "health", "fitnesstips"],
  fitness_health: ["fitness", "workout", "gym", "health", "fitnesstips"],
  education: ["edukasi", "belajar", "tips", "tutorial", "knowledge"],
  education_knowledge: ["edukasi", "belajar", "tips", "tutorial", "knowledge"],
  trading: ["trading", "saham", "crypto", "investasi", "finansial"],
  business_finance: ["bisnis", "entrepreneur", "bisnismuda", "tips", "sukses"],
  home_decor: ["homedecor", "rumah", "interior", "dekorasi", "aesthetic"],
};

const PLATFORM_HASHTAG_COUNT: Record<string, number> = {
  tiktok: 8,
  shorts: 5,
  reels: 6,
  instagram: 6,
  youtube: 4,
  facebook: 4,
};

export function generateCaption(
  niche: string,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
  platform: string,
): GeneratedCaption {
  const hook =
    MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  const cta = MARKETING_CTAS[Math.floor(Math.random() * MARKETING_CTAS.length)];

  const sceneDescriptions = storyboard
    .slice(0, 3)
    .map((s) => s.description)
    .filter(Boolean);
  const sceneText =
    sceneDescriptions.length > 0
      ? sceneDescriptions[0].charAt(0).toUpperCase() +
        sceneDescriptions[0].slice(1)
      : "";

  const captionText = sceneText
    ? `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n${sceneText}\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`
    : `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`;

  const nicheKey = niche.toLowerCase();
  const nicheTags = NICHE_HASHTAGS[nicheKey] || ["viral", "fyp", "trending"];
  const baseTags = ["fyp", "viral"];
  const allTags = [...new Set([...baseTags, ...nicheTags])];
  const maxTags = PLATFORM_HASHTAG_COUNT[platform] || 6;
  const selectedTags = allTags.slice(0, maxTags);
  const hashtags = selectedTags.map((t) => `#${t}`).join(" ");

  return { text: captionText, hashtags };
}
