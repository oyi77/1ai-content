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

// ── Step 1: Mode Selection ────────────────────────────────────────────────────

export async function showGenerateMode(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    // Clear stale session from previous incomplete flows — UNLESS prompt was
    // intentionally pre-filled from prompt library (stateData.selectedPrompt).
    const fromLibrary = !!(ctx.session?.stateData as any)?.selectedPrompt;
    if (!fromLibrary && ctx.session) {
      delete ctx.session.generateMode;
      delete ctx.session.generateAction;
      delete ctx.session.generatePreset;
      delete ctx.session.generatePlatform;
      delete ctx.session.generatePhotoUrl;
      delete ctx.session.generateScenes;
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
      // Only clear prompt if NOT from library
      if (!ctx.session.generateProductDesc || !fromLibrary) {
        delete ctx.session.generateProductDesc;
      }
    }

    // Cache userMode for persona-aware filtering downstream
    if (ctx.session && !ctx.session.userMode) {
      try {
        const { UserService } = await import("@/services/user.service.js");
        const u = await UserService.findByTelegramId(BigInt(ctx.from!.id));
        ctx.session.userMode = u?.userMode || "content_creator";
      } catch {
        ctx.session.userMode = "content_creator";
      }
    }

    const lang = ctx.session?.userLang || "id";
    const prefilledPrompt = ctx.session?.generateProductDesc;
    const text = prefilledPrompt
      ? `🎬 *${t("gen.title", lang)}*\n\nPrompt: \`${prefilledPrompt.slice(0, 50)}${prefilledPrompt.length > 50 ? "..." : ""}\`\n\n${t("gen.select_mode", lang)}`
      : `🎬 *${t("gen.title", lang)}*\n\n${t("gen.select_mode", lang)}`;

    const markup = {
      inline_keyboard: [
        [{ text: t("gen.mode_basic", lang), callback_data: "mode_basic" }],
        [{ text: t("gen.mode_smart", lang), callback_data: "mode_smart" }],
        [{ text: t("gen.mode_pro", lang), callback_data: "mode_pro" }],
        [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
      ],
    };

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, {
          parse_mode: "Markdown",
          reply_markup: markup,
        });
      } catch {
        await ctx.reply(text, { parse_mode: "Markdown", reply_markup: markup });
      }
    } else {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: markup });
    }
  } catch (err) {
    logger.error("showGenerateMode error", err);
  }
}
// ── Step 2: Action Selection ──────────────────────────────────────────────────

export async function showGenerateAction(
  ctx: BotContext,
  mode: GenerateMode,
): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || "id";

    // Fix 2.5: Pre-creation credit check
    const dbUser = await UserService.findByTelegramId(BigInt(ctx.from!.id));
    if (dbUser) {
      const balance = creditsToUnits(Number(dbUser.creditBalance));
      const minCost = UNIT_COSTS.IMAGE_UNIT; // cheapest possible action
      const { canUseWelcomeBonus, canUseDailyFree } =
        await import("../config/free-trial.js");
      const hasFreeSlot = canUseWelcomeBonus(dbUser) || canUseDailyFree(dbUser);
      if (balance < minCost && !hasFreeSlot) {
        await ctx.reply(
          t("gen.no_credits_early", lang, { balance: balance / 10 }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: t("btn.topup", lang), callback_data: "topup" }],
                [
                  {
                    text: t("btn.main_menu", lang),
                    callback_data: "main_menu",
                  },
                ],
              ],
            },
          },
        );
        return;
      }
    }

    const modeLabel =
      mode === "basic" ? "⚡ Basic" : mode === "smart" ? "🎯 Smart" : "👑 Pro";

    if (ctx.session) {
      ctx.session.generateMode = mode;
    }

    // Fix 2.6: Dynamic credit costs
    const { getUnitCostAsync } = await import("../config/pricing.js");
    const [imgSetCost, videoCost, cloneCost, camp5Cost, camp10Cost] =
      await Promise.all([
        getUnitCostAsync("IMAGE_SET_7_SCENE"),
        getUnitCostAsync("VIDEO_15S"),
        getUnitCostAsync("CLONE_STYLE"),
        getUnitCostAsync("CAMPAIGN_5_VIDEO"),
        getUnitCostAsync("CAMPAIGN_10_VIDEO"),
      ]);

    const balanceDisplay = dbUser
      ? ` (${t("gen.balance_label", lang)}: ${creditsToUnits(Number(dbUser.creditBalance)) / 10} cr)`
      : "";
    const text = `${getStepIndicator(mode, 2)} ${modeLabel} Mode${balanceDisplay}\n\n${t("gen.select_action", lang)}`;

    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.action_image_set", lang, { cost: imgSetCost / 10 }),
            callback_data: "action_image_set",
          },
        ],
        [
          {
            text: t("gen.action_video", lang, { cost: videoCost / 10 }),
            callback_data: "action_video",
          },
        ],
        [
          {
            text: t("gen.action_clone_style", lang, { cost: cloneCost / 10 }),
            callback_data: "action_clone_style",
          },
        ],
        [
          {
            text: t("gen.action_campaign", lang, {
              cost5: camp5Cost / 10,
              cost10: camp10Cost / 10,
            }),
            callback_data: "action_campaign",
          },
        ],
        [{ text: t("btn.back", lang), callback_data: "generate_start" }],
        [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
      ],
    };
    try {
      if (ctx.callbackQuery)
        await ctx.editMessageText(text, {
          parse_mode: "Markdown",
          reply_markup: markup,
        });
      else
        await ctx.reply(text, { parse_mode: "Markdown", reply_markup: markup });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: markup });
    }
  } catch (err) {
    logger.error("showGenerateAction error", err);
  }
}
