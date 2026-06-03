/**
 * Menu Router Handlers
 *
 * Handles reply keyboard button routing (create, image, chat, videos, etc.)
 * and the t2v contextless video intent detection.
 */

import { BotContext } from "@/types";
import { t } from "@/i18n/translations";

/**
 * Route text messages to the appropriate command based on menu button matching.
 * Returns true if a menu match was found and handled.
 */
export async function routeMenuButton(ctx: BotContext, text: string): Promise<boolean> {
  const { getAllMenuTexts } = await import("@/config/pricing.js");
  const menuMatch = (key: string) => getAllMenuTexts(key).includes(text);

  // Lazy-import commands to avoid circular deps
  const { videosCommand } = await import("@/commands/videos.js");
  const { topupCommand } = await import("@/commands/topup.js");
  const { profileCommand } = await import("@/commands/profile.js");
  const { referralCommand } = await import("@/commands/referral.js");
  const { subscriptionCommand } = await import("@/commands/subscription.js");
  const { settingsCommand } = await import("@/commands/settings.js");
  const { supportCommand } = await import("@/commands/support.js");
  const { helpCommand } = await import("@/commands/help.js");
  const { promptsCommand, dailyCommand, trendingCommand, fingerprintCommand } = await import("@/commands/prompts.js");

  if (menuMatch("create") || text === "🚀 Get Started") {
    const { showGenerateMode } = await import("@/flows/generate.js");
    await showGenerateMode(ctx);
    return true;
  }

  if (menuMatch("image")) {
    const imgLang = ctx.session?.userLang || "id";
    await ctx.reply(t("msg.image_generate_title", imgLang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("msg.img_btn_product_photo", imgLang), callback_data: "img_product" }],
          [{ text: t("msg.img_btn_fnb", imgLang), callback_data: "img_fnb" }],
          [{ text: t("msg.img_btn_realestate", imgLang), callback_data: "img_realestate" }],
          [{ text: t("msg.img_btn_car", imgLang), callback_data: "img_car" }],
        ],
      },
    });
    return true;
  }

  if (menuMatch("chat")) {
    const chatLang = ctx.session?.userLang || "id";
    await ctx.reply(t("msg.ai_chat_active", chatLang), { parse_mode: "MarkdownV2" });
    if (ctx.session) ctx.session.state = "DASHBOARD";
    return true;
  }

  if (menuMatch("videos")) { await videosCommand(ctx); return true; }
  if (menuMatch("topup")) { await topupCommand(ctx); return true; }
  if (menuMatch("subscription")) { await subscriptionCommand(ctx); return true; }
  if (menuMatch("profile")) { await profileCommand(ctx); return true; }
  if (menuMatch("referral")) { await referralCommand(ctx); return true; }
  if (menuMatch("settings")) { await settingsCommand(ctx); return true; }
  if (menuMatch("support")) { await supportCommand(ctx); return true; }
  if (menuMatch("library")) { await promptsCommand(ctx); return true; }
  if (menuMatch("trending")) { await trendingCommand(ctx); return true; }
  if (menuMatch("daily")) { await dailyCommand(ctx); return true; }
  if (menuMatch("fingerprint")) { await fingerprintCommand(ctx); return true; }

  if (menuMatch("talk")) {
    const { handleAvatarTalkCallbacks } = await import("@/handlers/callbacks/avatar-talk.js");
    await handleAvatarTalkCallbacks(ctx, "avatar_talk_start");
    return true;
  }

  if (menuMatch("help")) { await helpCommand(ctx); return true; }

  return false;
}

/**
 * Detect video intent keywords in free text (t2v contextless).
 * Returns true if a video creation prompt was detected and handled.
 */
export async function detectVideoIntent(ctx: BotContext, text: string): Promise<boolean> {
  if (
    !(
      (ctx.session?.state === "DASHBOARD" || ctx.session?.state === "START") &&
      /\b(buat video|create video|jadikan video|video dari|bikin video|video tentang)\b/i.test(text)
    )
  ) {
    return false;
  }

  const videoPrompt = text;
  ctx.session.stateData = { ...ctx.session.stateData, pendingVideoPrompt: videoPrompt };
  await ctx.reply(
    `🎬 *Deteksi: prompt video*\n\n_"${videoPrompt.slice(0, 200)}"_\n\nMau buat video dari prompt ini?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎬 Ya, buat video!", callback_data: "t2v_confirm_contextless" },
            { text: "💬 Chat saja", callback_data: "media_intent_ignore" },
          ],
        ],
      },
    },
  );
  return true;
}
