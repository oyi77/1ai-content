/**
 * Campaign Builder Service
 *
 * Generates 5 or 10 video ads from a single product,
 * each with a different hook variation for A/B testing.
 *
 * Scenes 2-7 are CONSISTENT across all videos.
 * Only Scene 1 (Hook) varies.
 *
 * v3.0 — Master Document
 */

import {
  detectIndustry,
  generateVideoScenePrompts,
  DURATION_PRESETS,
} from "@/config/hpas-engine";
import { UNIT_COSTS } from "@/config/pricing";

export type CampaignSize = 5 | 10;

export interface HookVariation {
  id: string;
  name: string;
  description: string;
  promptTemplate: string; // {product} placeholder
  style:
    | "question"
    | "statistic"
    | "before_after"
    | "testimonial"
    | "trending"
    | "emotional"
    | "comparison"
    | "fomo"
    | "influencer"
    | "ugc";
}

export interface CampaignJob {
  id: string;
  userId: bigint;
  productDescription: string;
  productImageUrl?: string;
  campaignSize: CampaignSize;
  durationPreset: "quick" | "standard" | "extended";
  status: "pending" | "processing" | "partial" | "done" | "failed";
  videosCompleted: number;
  videosFailed: number;
  videoIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignVideoSpec {
  hookVariation: HookVariation;
  hookPrompt: string;
  scenes: Array<{ sceneId: string; prompt: string; durationSeconds: number }>;
  totalCreditCost: number;
}

// ── 10 Hook Variations ────────────────────────────────────────────────────────

export const HOOK_VARIATIONS: HookVariation[] = [
  {
    id: "question",
    name: "Pertanyaan",
    description: "Opens with relatable question to trigger recognition",
    promptTemplate:
      "Capek dengan {problem}? Close-up dramatic product reveal, question text overlay",
    style: "question",
  },
  {
    id: "statistic",
    name: "Statistik",
    description: "Opens with surprising statistic to grab attention",
    promptTemplate:
      "8 dari 10 orang mengalami {problem}. Bold statistic text on dark background, dramatic visual",
    style: "statistic",
  },
  {
    id: "before_after",
    name: "Before-After",
    description: "Dramatic transformation tease",
    promptTemplate:
      "Transformasi dramatis dari {problem} ke solusi. Split screen hint, tease of amazing result",
    style: "before_after",
  },
  {
    id: "testimonial",
    name: "Testimoni",
    description: "Review-style authentic hook",
    promptTemplate:
      "Person sharing authentic excited reaction about {product}. UGC-style casual video review hook",
    style: "testimonial",
  },
  {
    id: "trending",
    name: "Trending",
    description: "Trend/challenge format hook",
    promptTemplate:
      "POV: ketemu {product} untuk pertama kali. TikTok POV format, trendy text overlay",
    style: "trending",
  },
  {
    id: "emotional",
    name: "Emosional",
    description: "Emotional storytelling hook",
    promptTemplate:
      "Hari-hari struggling dengan {problem} sampai aku menemukan {product}. Personal story opening",
    style: "emotional",
  },
  {
    id: "comparison",
    name: "Perbandingan",
    description: "Subtle comparison hook",
    promptTemplate:
      "Sebelum kenal {product} vs sesudah. Subtle before-after lifestyle comparison hook",
    style: "comparison",
  },
  {
    id: "fomo",
    name: "FOMO",
    description: "Fear of missing out urgency hook",
    promptTemplate:
      "SEMUA orang sudah pakai {product}. Trending/viral visual, FOMO text overlay, urgency atmosphere",
    style: "fomo",
  },
  {
    id: "influencer",
    name: "Influencer Style",
    description: "Celebrity/influencer recommendation style",
    promptTemplate:
      "Kenapa semua influencer rekomendasiin {product}? Aspirational lifestyle, confident presenter style",
    style: "influencer",
  },
  {
    id: "ugc",
    name: "UGC Authentic",
    description: "Authentic user-generated content style",
    promptTemplate:
      "Review jujur {product} dari pengguna nyata. Raw authentic video quality, genuine reaction hook",
    style: "ugc",
  },
];

// ── Service ───────────────────────────────────────────────────────────────────

export class CampaignService {
  /**
   * Get hook variations for campaign size
   */
  static getHookVariations(size: CampaignSize): HookVariation[] {
    return HOOK_VARIATIONS.slice(0, size);
  }

  /**
   * Generate all video specs for a campaign
   */
  static generateCampaignSpecs(
    productDescription: string,
    size: CampaignSize,
    preset: "quick" | "standard" | "extended" = "standard",
  ): CampaignVideoSpec[] {
    const industry = detectIndustry(productDescription);
    const hookVariations = this.getHookVariations(size);
    const presetConfig = DURATION_PRESETS[preset];

    // Generate shared scenes (2-7) — same for all videos
    const allScenePrompts = generateVideoScenePrompts(
      industry,
      productDescription,
      preset,
    );
    const sharedScenes = allScenePrompts.filter((s) => s.sceneId !== "hook");

    const creditCost =
      size === 5 ? UNIT_COSTS.CAMPAIGN_5_VIDEO : UNIT_COSTS.CAMPAIGN_10_VIDEO;
    const creditCostPerVideo = creditCost / size;

    return hookVariations.map((hookVar) => {
      const hookPrompt = hookVar.promptTemplate
        .replace("{product}", productDescription)
        .replace("{problem}", `masalah ${industry}`);

      const hookDuration = presetConfig.sceneDurations["hook"] || 3;

      return {
        hookVariation: hookVar,
        hookPrompt,
        scenes: [
          {
            sceneId: "hook",
            prompt: hookPrompt,
            durationSeconds: hookDuration,
          },
          ...sharedScenes.map((s) => ({
            sceneId: s.sceneId,
            prompt: s.prompt,
            durationSeconds: s.durationSeconds,
          })),
        ],
        totalCreditCost: creditCostPerVideo,
      };
    });
  }

  /**
   * Calculate total unit cost for campaign
   */
  static async getCampaignCost(
    size: CampaignSize,
    preset: "quick" | "standard" | "extended" = "standard",
  ): Promise<number> {
    const { getUnitCostAsync } = await import("../config/pricing.js");
    const baseCost =
      size === 5
        ? await getUnitCostAsync("CAMPAIGN_5_VIDEO")
        : await getUnitCostAsync("CAMPAIGN_10_VIDEO");
    // Scale campaign cost based on duration preset — base cost is for 'standard' (30s)
    const standardSeconds = DURATION_PRESETS.standard.totalSeconds;
    const presetSeconds = DURATION_PRESETS[preset].totalSeconds;
    const durationMultiplier = presetSeconds / standardSeconds;
    return Math.round(baseCost * durationMultiplier);
  }

  /**
   * Get savings percentage vs individual video cost
   */
  static async getCampaignSavings(
    size: CampaignSize,
    preset: "quick" | "standard" | "extended" = "standard",
  ): Promise<number> {
    const { getVideoCreditCostAsync } = await import("../config/pricing.js");
    const presetCost = await getVideoCreditCostAsync(
      DURATION_PRESETS[preset].totalSeconds,
    );
    const individualTotal = presetCost * size;
    const campaignCost = await this.getCampaignCost(size, preset);
    return Math.round(
      ((individualTotal - campaignCost) / individualTotal) * 100,
    );
  }

  /**
   * Format campaign pricing message for Telegram
   */
  static async formatCampaignMessage(
    size: CampaignSize,
    preset: "quick" | "standard" | "extended" = "standard",
  ): Promise<string> {
    const cost = await this.getCampaignCost(size, preset);
    const savings = await this.getCampaignSavings(size, preset);
    const hooks = this.getHookVariations(size);

    const hookList = hooks
      .map((h, i) => `  ${i + 1}. ${h.name} — ${h.description}`)
      .join("\n");

    return (
      `📦 *Campaign ${size} Scene*\n\n` +
      `💰 Biaya: ${cost / 10} kredit (hemat ${savings}% vs individual)\n\n` +
      `🎯 ${size} Hook berbeda:\n${hookList}\n\n` +
      `✅ Scene 2-7 KONSISTEN di semua video\n` +
      `⚡ Ideal untuk A/B testing iklan`
    );
  }
}

export default CampaignService;
