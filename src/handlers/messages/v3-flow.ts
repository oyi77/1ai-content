/**
 * V3 Flow Handlers
 *
 * Handles V3 flow states: CUSTOM_DURATION_INPUT_V3, AWAITING_GENERATE_IMAGE,
 * and related V3 video generation states.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { CUSTOM_DURATION_MIN } from "@/config/pricing";

/**
 * Handle CUSTOM_DURATION_INPUT_V3 state — user enters custom video duration.
 */
export async function handleCustomDurationV3(
  ctx: BotContext,
  text: string,
): Promise<boolean> {
  if (
    ctx.session?.state !== "CUSTOM_DURATION_INPUT_V3" ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const duration = parseInt(message.text.trim());

  if (isNaN(duration) || duration < CUSTOM_DURATION_MIN) {
    await ctx.reply(
      t("msg.duration_range_error", ctx.session?.userLang || "id"),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  const { buildCustomPresetConfig } = await import("@/config/hpas-engine.js");
  const presetConfig = buildCustomPresetConfig(duration);

  if (ctx.session) {
    ctx.session.generatePreset = "custom";
    ctx.session.customPresetConfig = presetConfig as unknown as Record<
      string,
      unknown
    >;
    ctx.session.state = "DASHBOARD";
  }

  const cdLang = ctx.session?.userLang || "id";
  const minutes = Math.floor(duration / 60);
  const secs = duration % 60;
  const durLabel =
    minutes > 0 ? `${minutes}m${secs > 0 ? ` ${secs}s` : ""}` : `${secs}s`;

  await ctx.reply(
    t("msg.custom_duration_set", cdLang, {
      durLabel,
      scenes: presetConfig.scenesIncluded.length,
      cost: presetConfig.creditCost / 10,
    }),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎵 TikTok (9:16)", callback_data: "platform_tiktok" }],
          [
            {
              text: "📸 Instagram (9:16)",
              callback_data: "platform_instagram",
            },
          ],
          [{ text: "▶️ YouTube (16:9)", callback_data: "platform_youtube" }],
          [{ text: "⬛ Square (1:1)", callback_data: "platform_square" }],
          [{ text: t("btn.main_menu", cdLang), callback_data: "main_menu" }],
        ],
      },
    },
  );
  return true;
}

/**
 * Handle AWAITING_GENERATE_IMAGE state — user uploads reference image or skips.
 */
export async function handleAwaitingGenerateImage(
  ctx: BotContext,
): Promise<boolean> {
  if (ctx.session?.state !== "AWAITING_GENERATE_IMAGE") {
    return false;
  }

  const message = ctx.message!;
  const lang = ctx.session?.userLang || "id";

  if ("photo" in message) {
    const largest = message.photo[message.photo.length - 1];
    const fileSize = largest.file_size || 0;
    if (fileSize > 0 && fileSize < 10000) {
      await ctx.reply(t("msg.photo_too_small", lang));
      return true;
    }
    if (fileSize > 20 * 1024 * 1024) {
      await ctx.reply(t("msg.photo_too_large", lang));
      return true;
    }
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);
    ctx.session.generatePhotoUrl = fileLink.toString();
    ctx.session.state = "DASHBOARD";
    await ctx.reply(t("msg.photo_received", lang), { parse_mode: "Markdown" });
    const { continueAfterImagePreference } =
      await import("@/flows/generate.js");
    await continueAfterImagePreference(ctx);
    return true;
  }

  if ("text" in message && message.text === "/skip") {
    ctx.session.state = "DASHBOARD";
    delete ctx.session.generatePhotoUrl;
    await ctx.reply(t("msg.skip_photo", lang));
    const { continueAfterImagePreference } =
      await import("@/flows/generate.js");
    await continueAfterImagePreference(ctx);
    return true;
  }

  await ctx.reply(t("msg.send_photo_or_skip", lang));
  return true;
}

/**
 * Handle CUSTOM_DURATION_INPUT state — legacy v2 custom duration input.
 */
export async function handleCustomDurationInput(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "CUSTOM_DURATION_INPUT" ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const duration = parseInt(message.text.trim());

  if (isNaN(duration) || duration < 6 || duration > 300) {
    const errLang = ctx.session?.userLang || "id";
    if (ctx.session) ctx.session.state = "DASHBOARD";
    await ctx.reply(t("msg.invalid_duration", errLang), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("btn.main_menu", errLang), callback_data: "main_menu" }],
        ],
      },
    });
    return true;
  }

  const SCENE_DURATION = 5;
  const bestFit = {
    scenes: Math.ceil(duration / SCENE_DURATION),
    durationPerScene: SCENE_DURATION,
  };

  const finalDuration = bestFit.scenes * bestFit.durationPerScene;
  const niche = ctx.session.selectedNiche || "fnb";
  const platform = String(ctx.session.selectedPlatforms?.[0] || "tiktok");

  const { getVideoCreditCost } = await import("@/config/pricing.js");
  const { UserService } = await import("@/services/user.service.js");
  const { generateStoryboard } =
    await import("@/services/video-generation.service.js");

  const creditCost = getVideoCreditCost(finalDuration);
  const telegramId = BigInt(ctx.from!.id);
  const user = await UserService.findByTelegramId(telegramId);

  if (!user || Number(user.creditBalance) < creditCost) {
    await ctx.reply(
      t("gen.insufficient_credits", ctx.session?.userLang || "id", {
        cost: creditCost,
        balance: Number(user?.creditBalance || 0),
      }),
    );
    ctx.session.state = "DASHBOARD";
    return true;
  }

  const styles = ctx.session.selectedStyles || [];
  ctx.session.state = "DASHBOARD";

  const almostLang = ctx.session?.userLang || "id";
  await ctx.reply(
    t("msg.almost_ready", almostLang, {
      requested: String(duration),
      optimized: String(finalDuration),
      scenes: String(bestFit.scenes),
      sceneDuration: String(bestFit.durationPerScene),
      creditCost: String(creditCost),
    }),
    { parse_mode: "Markdown" },
  );

  ctx.session.videoCreation = {
    mode: bestFit.scenes > 1 ? "extended" : "short",
    niche,
    platform,
    totalDuration: finalDuration,
    scenes: bestFit.scenes,
    storyboard: generateStoryboard(
      niche,
      styles,
      finalDuration,
      bestFit.scenes,
    ),
    jobId: "",
    waitingForImage: true,
    enableVO: true,
    enableSubtitles: true,
  };
  return true;
}
