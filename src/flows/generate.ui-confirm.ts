/**
 * Generate Flow — UI / Display Functions
 *
 * All show* functions that present Telegram inline keyboards and messages to the user.
 * Extracted from generate.ts to break up the god object.
 * Pure presentation layer — no execution logic.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { UNIT_COSTS, creditsToUnits } from "@/config/pricing";
import {
  HPAS_SCENES,
  DURATION_PRESETS,
  detectIndustry,
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from "@/config/hpas-engine";
import type {
  DurationPreset,
  DurationPresetConfig,
  SceneConfig,
  SceneId,
} from "@/config/hpas-engine";
import {
  getPersonaForUser,
  isPresetAllowedForPersona,
} from "@/config/personas";
import { CampaignService } from "@/services/campaign.service";
import { UserService } from "@/services/user.service";
import { clearGenerateSession, getStepIndicator } from "./generate.types";
import type { GenerateMode, GenerateAction, Platform } from "./generate.types";

// ── Confirm Screen ────────────────────────────────────────────────────────────

export async function showConfirmScreen(ctx: BotContext): Promise<void> {
  try {
    const session = ctx.session;
    if (!session) return;

    const mode = (session.generateMode as GenerateMode) || "basic";
    const action = (session.generateAction as GenerateAction) || "video";
    const preset = (session.generatePreset as DurationPreset) || "standard";
    const platform = (session.generatePlatform as Platform) || "tiktok";
    const productDesc = (session.generateProductDesc as string) || "";

    const presetConfig =
      preset === "custom" && session.customPresetConfig
        ? (session.customPresetConfig as unknown as DurationPresetConfig)
        : DURATION_PRESETS[preset];
    const industry = detectIndustry(productDesc);

    let cost = 0;
    let actionLabel = "";

    const resMultipliers: Record<string, number> = {
      standard: 1,
      hd: 2,
      ultra: 4,
    };
    const resMult =
      resMultipliers[(session.generateResolution as string) || "standard"] || 1;
    const { getUnitCostAsync: getConfirmCost } =
      await import("../config/pricing.js");
    if (action === "image_set") {
      cost = (await getConfirmCost("IMAGE_SET_7_SCENE")) * resMult;
      actionLabel = "📸 Image Set 7 Scene";
    } else if (action === "video") {
      cost = await getConfirmCost(
        presetConfig.totalSeconds <= 15
          ? "VIDEO_15S"
          : presetConfig.totalSeconds <= 30
            ? "VIDEO_30S"
            : presetConfig.totalSeconds <= 60
              ? "VIDEO_60S"
              : "VIDEO_120S",
      );
      actionLabel = `🎥 Video ${presetConfig.totalSeconds}s`;
    } else if (action === "clone_style") {
      cost = await getConfirmCost("CLONE_STYLE");
      actionLabel = "🔄 Clone Style";
    } else if (action === "campaign") {
      const campSize = (session.generateCampaignSize as 5 | 10) || 5;
      cost = await CampaignService.getCampaignCost(campSize);
      actionLabel = `📦 Campaign ${campSize} Video`;
    }

    const modeLabel =
      mode === "basic" ? "⚡ Basic" : mode === "smart" ? "🎯 Smart" : "👑 Pro";
    const platformLabel: Record<Platform, string> = {
      tiktok: "🎵 TikTok 9:16",
      instagram: "📸 Instagram 9:16",
      youtube: "▶️ YouTube 16:9",
      square: "⬛ Square 1:1",
    };

    const resLabels: Record<string, string> = {
      standard: "📐 Standard (1024px)",
      hd: "🖼️ HD (2048px)",
      ultra: "✨ Ultra HD (4096px)",
    };
    const selectedAR = (session.generateAspectRatio as string) || "";
    const selectedRes = (session.generateResolution as string) || "";

    const lang = ctx.session?.userLang || "id";
    const totalSteps: Record<string, number> = { basic: 4, smart: 6, pro: 11 };
    const confirmStep = totalSteps[mode] || 6;
    let text =
      `${getStepIndicator(mode, confirmStep)} ${t("gen.confirm_title", lang)}` +
      `\n\n` +
      `Mode: ${modeLabel}\n` +
      `Aksi: ${actionLabel}\n`;

    if (action === "image_set" && selectedAR) {
      text += `Rasio: ${selectedAR}\n`;
      text += `Resolusi: ${resLabels[selectedRes] || selectedRes}\n`;
    } else {
      text += `Platform: ${platformLabel[platform]}\n`;
    }

    text +=
      `Industri: ${industry}\n` +
      `Produk: ${productDesc.slice(0, 60)}${productDesc.length > 60 ? "..." : ""}\n\n` +
      t("gen.confirm_cost", lang, { cost: cost / 10 });

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("gen.btn_generate_now", lang, { cost: cost / 10 }),
              callback_data: "generate_confirm",
            },
          ],
          [{ text: t("btn.back", lang), callback_data: "generate_start" }],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
  } catch (err) {
    logger.error("showConfirmScreen error", err);
  }
}
// ── Post-Delivery Nagih Loop ──────────────────────────────────────────────────

export async function showPostDelivery(ctx: BotContext): Promise<void> {
  try {
    // Clear session fields from previous generation to prevent stale data leaking into next flow
    if (ctx.session) {
      delete ctx.session.generateProductDesc;
      delete ctx.session.generatePhotoUrl;
      delete ctx.session.generatePreset;
      delete ctx.session.generatePlatform;
      delete ctx.session.generateAction;
      delete ctx.session.generateScenes;
      delete ctx.session.generateMode;
      delete ctx.session.generateCampaignSize;
      delete ctx.session.customPresetConfig;
      delete ctx.session.generateAspectRatio;
      delete ctx.session.generateResolution;
      delete ctx.session.generatePhotos;
      delete ctx.session.generatePhotoCount;
      delete ctx.session.generatePhotoUploadDone;
      delete ctx.session.generateStoryboardMode;
      delete ctx.session.generateManualStoryboard;
      delete ctx.session.generateTranscriptMode;
      delete ctx.session.generateManualTranscript;
      // Clear prompt library selection marker
      if (ctx.session.stateData && typeof ctx.session.stateData === "object") {
        delete (ctx.session.stateData as unknown as Record<string, unknown>)
          .selectedPrompt;
        delete (ctx.session.stateData as unknown as Record<string, unknown>)
          .selectedPromptId;
      }
    }

    const lang = ctx.session?.userLang || "id";
    const text = t("gen.post_delivery", lang);

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: t("btn.variation", lang), callback_data: "generate_start" },
            { text: t("btn.campaign", lang), callback_data: "action_campaign" },
          ],
          [
            { text: "⭐ Rate", callback_data: "generate_rate" },
            { text: "👥 Refer", callback_data: "referral_menu" },
          ],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
  } catch (err) {
    logger.error("showPostDelivery error", err);
  }
}
