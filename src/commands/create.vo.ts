/**
 * Create Command — VO/Subtitle Toggle Handlers
 *
 * Handles voice-over and subtitle toggle callbacks from the legacy create flow.
 * Extracted from create.ts god object.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { getVideoCreditCost } from "@/config/pricing";
import { t } from "@/i18n/translations";

/** Resolve the user's preferred language from the DB record. */
function getUserLang(dbUser: { language?: string } | null): string {
  return dbUser?.language || "id";
}

/**
 * Handle VO/Subtitle toggle callbacks.
 * Toggles the flag in session and re-renders the settings panel.
 */
export async function handleVOToggle(
  ctx: BotContext,
  toggleKey: "vo" | "subtitles",
): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx
        .answerCbQuery(t("error.no_session", ctx.session?.userLang || "id"))
        .catch(() => {});
      return;
    }

    if (toggleKey === "vo") {
      ctx.session.videoCreation.enableVO = !ctx.session.videoCreation.enableVO;
    } else {
      ctx.session.videoCreation.enableSubtitles =
        !ctx.session.videoCreation.enableSubtitles;
    }

    const voLabel = ctx.session.videoCreation.enableVO ? "ON" : "OFF";
    const subLabel = ctx.session.videoCreation.enableSubtitles ? "ON" : "OFF";

    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    const { niche, totalDuration, scenes } = ctx.session.videoCreation;
    const creditCost = getVideoCreditCost(totalDuration ?? 0);
    const sceneLabel =
      (scenes || 1) > 1 ? t("create.scenes", lang) : t("create.scene", lang);

    await ctx.editMessageText(
      `${t("create.almost_ready", lang)}\n\n` +
        `${t("create.niche_label", lang)}: ${niche}\n` +
        `${t("create.duration_label", lang)}: ${totalDuration}s (${scenes} ${sceneLabel})\n` +
        `${t("create.credit_cost_label", lang)}: ${creditCost}\n\n` +
        `🎙️ Voice Over: ${voLabel}\n` +
        `📝 Subtitles: ${subLabel}\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `🎙️ Toggle VO`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `📝 Toggle Subs`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [{ text: "▶️ Continue", callback_data: "vo_continue" }],
          ],
        },
      },
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling VO toggle:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

/**
 * Handle "Continue" after VO settings — show custom prompt step.
 */
export async function handleVOContinue(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx
        .answerCbQuery(t("error.no_session", ctx.session?.userLang || "id"))
        .catch(() => {});
      return;
    }

    // ── If prompt from library → SKIP VO screen, go straight to generate ──
    if (ctx.session.videoCreation.customPrompt) {
      await ctx.answerCbQuery();
      // Auto-trigger generation immediately
      await ctx.editMessageText(
        `🚀 *Siap generate!*\n\n` +
          `📋 Prompt: \`${ctx.session.videoCreation.customPrompt.slice(0, 120)}...\`\n` +
          `⏱️ Durasi: *${ctx.session.videoCreation.totalDuration} detik*\n` +
          `🎙️ Voice Over: ON · 📝 Subtitles: ON\n\n` +
          `Tap Generate untuk mulai!`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🚀 Generate Sekarang!",
                  callback_data: "create_skip_prompt",
                },
              ],
              [
                {
                  text: "📸 Upload Foto Referensi Dulu",
                  callback_data: "create_upload_reference",
                },
              ],
              [
                { text: "🔇 VO OFF", callback_data: "vo_toggle_vo" },
                { text: "📝 Subs OFF", callback_data: "vo_toggle_subtitles" },
              ],
              [{ text: "◀️ Ganti Prompt", callback_data: "back_prompts" }],
            ],
          },
        },
      );
      return;
    }

    // ── Normal flow: show VO settings + prompt option ──────────────────────
    const voOn = ctx.session.videoCreation.enableVO !== false;
    const subOn = ctx.session.videoCreation.enableSubtitles !== false;

    await ctx.editMessageText(
      `🎙️ *Pengaturan Suara & Teks*\n\n` +
        `Voice Over: *${voOn ? "✅ ON" : "❌ OFF"}*\n` +
        `Subtitles: *${subOn ? "✅ ON" : "❌ OFF"}*\n\n` +
        `_Voice Over = narasi otomatis AI\nSubtitles = teks di layar_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `🎙️ VO ${voOn ? "ON ✅" : "OFF ❌"}`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `📝 Subs ${subOn ? "ON ✅" : "OFF ❌"}`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [
              {
                text: "✍️ Tambah Prompt Custom",
                callback_data: "create_custom_prompt",
              },
            ],
            [
              {
                text: "⚡ Generate Langsung!",
                callback_data: "create_skip_prompt",
              },
            ],
          ],
        },
      },
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling VO continue:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

/**
 * Handle "Add custom prompt" button — wait for text input.
 */
export async function handleCustomPromptRequest(
  ctx: BotContext,
): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx
        .answerCbQuery(t("error.no_session", ctx.session?.userLang || "id"))
        .catch(() => {});
      return;
    }

    ctx.session.videoCreation.waitingForCustomPrompt = true;
    ctx.session.state = "CUSTOM_PROMPT_INPUT";

    await ctx.editMessageText(
      `✍️ Type your custom prompt below:\n\n` +
        `Describe the scenes, mood, style, or specific content you want in your video.`,
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling custom prompt request:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

/**
 * Handle "Skip prompt" button — proceed to reference image step.
 */
export async function handleSkipPrompt(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx
        .answerCbQuery(t("error.no_session", ctx.session?.userLang || "id"))
        .catch(() => {});
      return;
    }

    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    ctx.session.videoCreation.waitingForImage = true;

    await ctx.editMessageText(t("create.send_reference_image", lang), {
      parse_mode: "Markdown",
    });

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling skip prompt:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}
