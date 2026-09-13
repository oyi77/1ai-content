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

// ── Smart Mode: Preset Selection ──────────────────────────────────────────────

export async function showSmartPresetSelection(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || "id";
    const mode = (ctx.session?.generateMode as string) || "smart";
    const text = `${getStepIndicator(mode, 3)} ${t("gen.smart_select_duration", lang)}`;

    const persona = getPersonaForUser(ctx.session?.userMode);
    const allPresets = [
      {
        text: `⚡ Quick — 15s (${UNIT_COSTS.VIDEO_15S / 10} cr)`,
        callback_data: "preset_quick",
        key: "quick",
      },
      {
        text: `🎯 Standard — 30s (${UNIT_COSTS.VIDEO_30S / 10} cr)`,
        callback_data: "preset_standard",
        key: "standard",
      },
      {
        text: `📽️ Extended — 60s (${UNIT_COSTS.VIDEO_60S / 10} cr)`,
        callback_data: "preset_extended",
        key: "extended",
      },
      { text: "⏱️ Custom", callback_data: "preset_custom", key: "custom" },
    ];
    const filteredPresets = allPresets.filter((p) =>
      isPresetAllowedForPersona(persona, p.key),
    );
    const markup = {
      inline_keyboard: [
        ...filteredPresets.map((p) => [
          { text: p.text, callback_data: p.callback_data },
        ]),
        [{ text: t("btn.back", lang), callback_data: "action_video" }],
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
    logger.error("showSmartPresetSelection error", err);
  }
}
// ── Smart Mode: Platform Selection ───────────────────────────────────────────

export async function showSmartPlatformSelection(
  ctx: BotContext,
  preset: DurationPreset,
): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    if (ctx.session) {
      ctx.session.generatePreset = preset;
    }

    const lang = ctx.session?.userLang || "id";
    const text = t("gen.select_platform", lang);

    const markup = {
      inline_keyboard: [
        [{ text: "🎵 TikTok (9:16)", callback_data: "platform_tiktok" }],
        [{ text: "📸 Instagram (9:16)", callback_data: "platform_instagram" }],
        [{ text: "▶️ YouTube (16:9)", callback_data: "platform_youtube" }],
        [{ text: "⬛ Square (1:1)", callback_data: "platform_square" }],
        [{ text: t("btn.back", lang), callback_data: "action_video" }],
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
    logger.error("showSmartPlatformSelection error", err);
  }
}
