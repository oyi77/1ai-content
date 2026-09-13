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


// ── Pro Mode: Multi-Image Upload ─────────────────────────────────────────────

export async function showProImageUpload(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || "id";
    const total = 7; // HPAS 7-scene standard
    const current = ctx.session?.generatePhotos?.length || 0;

    if (ctx.session) {
      ctx.session.generatePhotoCount = total;
      ctx.session.state = "AWAITING_MULTI_IMAGE_UPLOAD";
    }

    const text = t("gen.multi_image_title", lang, { n: current, total });
    const markup = {
      inline_keyboard: [
        ...(current > 0
          ? [
              [
                {
                  text: t("gen.btn_complete_ai", lang),
                  callback_data: "pro_image_complete_ai",
                },
              ],
            ]
          : []),
        [
          {
            text: t("gen.btn_skip_images", lang),
            callback_data: "pro_image_skip",
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
    logger.error("showProImageUpload error", err);
  }
}

// ── Pro Mode: Storyboard ────────────────────────────────────────────────────

export async function showProStoryboardChoice(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || "id";

    const text = t("gen.storyboard_choice", lang);
    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.btn_storyboard_auto", lang),
            callback_data: "pro_storyboard_auto",
          },
        ],
        [
          {
            text: t("gen.btn_storyboard_manual", lang),
            callback_data: "pro_storyboard_manual",
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
    logger.error("showProStoryboardChoice error", err);
  }
}

/** Pro storyboard per-scene manual editor */
export async function showProStoryboardEditor(
  ctx: BotContext,
  sceneIndex: number,
): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  const preset = (ctx.session?.generatePreset as DurationPreset) || "standard";
  const presetConfig = DURATION_PRESETS[preset];
  const sceneIds = presetConfig.scenesIncluded;

  if (sceneIndex >= sceneIds.length) {
    // All scenes done — proceed to transcript choice
    if (ctx.session) ctx.session.state = "DASHBOARD";
    await showProTranscriptChoice(ctx);
    return;
  }

  const sceneId = sceneIds[sceneIndex];
  const sceneName = HPAS_SCENES[sceneId]?.nameId || sceneId;

  if (ctx.session) {
    ctx.session.state = "AWAITING_STORYBOARD_EDIT";
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      storyboardEditIndex: sceneIndex,
    };
  }

  await ctx.reply(
    t("gen.storyboard_edit_scene", lang, {
      n: sceneIndex + 1,
      name: sceneName,
    }),
    { parse_mode: "Markdown" },
  );
}

// ── Pro Mode: Transcript Choice ─────────────────────────────────────────────

export async function showProTranscriptChoice(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || "id";

    const text = t("gen.transcript_choice", lang);
    const markup = {
      inline_keyboard: [
        [
          {
            text: t("gen.btn_transcript_auto", lang),
            callback_data: "pro_transcript_auto",
          },
        ],
        [
          {
            text: t("gen.btn_transcript_manual", lang),
            callback_data: "pro_transcript_manual",
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
    logger.error("showProTranscriptChoice error", err);
  }
}

// ── Pro Mode: Scene Review ──────────────────────────────────────────────────

export async function showProSceneReview(
  ctx: BotContext,
  productDescription: string,
): Promise<void> {
  try {
    const lang = ctx.session?.userLang || "id";
    const industry = detectIndustry(productDescription);
    let scenes: import("./generate.types").GeneratedSceneData[];
    try {
      scenes = await generateScenePromptsWithAI(
        productDescription,
        "standard",
        lang === "en" ? "en" : "id",
      );
    } catch {
      scenes = generateVideoScenePrompts(
        industry,
        productDescription,
        "standard",
        lang === "en" ? "en" : "id",
      );
    }

    if (ctx.session) {
      ctx.session.generateScenes = scenes;
    }

    const sceneList = scenes
      .map(
        (s, i) =>
          `${i + 1}. *${HPAS_SCENES[s.sceneId as SceneId].nameId}* (${s.durationSeconds}s)\n   ${s.prompt.slice(0, 200)}${s.prompt.length > 200 ? "..." : ""}`,
      )
      .join("\n\n");

    const text = t("gen.pro_scene_review", lang, {
      industry,
      scenes: sceneList,
    });

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...scenes.map((s, i) => [
            {
              text: `✏️ Edit Scene ${i + 1}: ${HPAS_SCENES[s.sceneId as SceneId].nameId}`,
              callback_data: `edit_scene_${s.sceneId}`,
            },
          ]),
          [
            {
              text: t("gen.btn_pro_continue", lang),
              callback_data: "pro_select_duration",
            },
          ],
          [{ text: t("btn.back", lang), callback_data: "action_video" }],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
  } catch (err) {
    logger.error("showProSceneReview error", err);
  }
}
