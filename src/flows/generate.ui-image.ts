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


// ── Image Preference (for prompt library / pre-filled prompts) ────────────────

/** Show image preference screen: user can upload a reference image or skip */
export async function showImagePreference(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || "id";
    const text = t("gen.image_pref_title", lang);

    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.btn_upload_ref", lang),
            callback_data: "image_pref_upload",
          },
        ],
        [
          {
            text: t("gen.btn_skip_ref", lang),
            callback_data: "image_pref_skip",
          },
        ],
        [{ text: t("btn.back", lang), callback_data: "generate_start" }],
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
    logger.error("showImagePreference error", err);
  }
}

// ── Prompt Source Selection ───────────────────────────────────────────────────

/** Show prompt source selection: library or custom input */
export async function showPromptSourceSelection(
  ctx: BotContext,
): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || "id";
    const action = (ctx.session?.generateAction as GenerateAction) || "video";
    const actionLabel =
      action === "image_set"
        ? "gambar"
        : action === "campaign"
          ? "campaign"
          : "video";

    const text = t("gen.prompt_source_title", lang, { action: actionLabel });

    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.btn_auto_prompt", lang),
            callback_data: "prompt_source_auto",
          },
        ],
        [
          {
            text: t("gen.btn_prompt_library", lang),
            callback_data: "prompt_source_library",
          },
        ],
        [
          {
            text: t("gen.btn_custom_prompt", lang),
            callback_data: "prompt_source_custom",
          },
        ],
        [{ text: t("btn.back", lang), callback_data: "generate_start" }],
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
    logger.error("showPromptSourceSelection error", err);
  }
}

// ── Image Options: Aspect Ratio + Resolution ────────────────────────────────

/** Show aspect ratio selection for image_set action */
export async function showImageAspectRatio(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || "id";
    const mode = (ctx.session?.generateMode as string) || "basic";

    const text = `${getStepIndicator(mode, 3)} ${t("gen.select_aspect_ratio", lang)}`;
    const markup = {
      inline_keyboard: [
        [
          { text: "📱 9:16 (TikTok/Reels)", callback_data: "img_ar_9:16" },
          { text: "⬛ 1:1 (Feed)", callback_data: "img_ar_1:1" },
        ],
        [
          { text: "🖥️ 16:9 (Banner/YT)", callback_data: "img_ar_16:9" },
          { text: "📷 4:5 (IG Post)", callback_data: "img_ar_4:5" },
        ],
        [{ text: t("btn.back", lang), callback_data: "generate_start" }],
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
    logger.error("showImageAspectRatio error", err);
  }
}

/** Show resolution selection for image_set action */
export async function showImageResolution(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || "id";
    const mode = (ctx.session?.generateMode as string) || "basic";

    const text = `${getStepIndicator(mode, 4)} ${t("gen.select_resolution", lang)}`;
    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.res_standard", lang),
            callback_data: "img_res_standard",
          },
        ],
        [{ text: t("gen.res_hd", lang), callback_data: "img_res_hd" }],
        [{ text: t("gen.res_ultra", lang), callback_data: "img_res_ultra" }],
        [{ text: t("btn.back", lang), callback_data: "generate_start" }],
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
    logger.error("showImageResolution error", err);
  }
}
