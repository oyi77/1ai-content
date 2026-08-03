import { BotContext } from "@/types";
import { getConfig } from "@/config/env";
import { UserService } from "@/services/user.service";
import {
  topupCommand,
} from "@/commands/topup";
import { profileCommand } from "@/commands/profile";
import { referralCommand } from "@/commands/referral";
import { helpCommand } from "@/commands/help";
import {
  promptsCommand,
} from "@/commands/prompts";
import { t } from "@/i18n/translations";
import type { InlineKeyboardButton } from '@telegraf/types/markup';

export async function handleNavigationCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // ── UNIVERSAL NOOP ──────────────────────────────────────────────────────────
  if (data === "noop") {
    await ctx.answerCbQuery();
    return true;
  }

  // ── MAIN MENU ───────────────────────────────────────────────────────────────
  // back_dashboard from ebook (:ebook.py) routes to the same main dashboard menu
  if (data === "main_menu" || data === "back_dashboard") {
    await ctx.answerCbQuery();
    // Always reset state and clear generate session so user isn't stuck in a previous flow
    if (ctx.session) {
      ctx.session.state = "DASHBOARD";
      delete ctx.session.generateProductDesc;
      delete ctx.session.generatePhotoUrl;
      delete ctx.session.generatePreset;
      delete ctx.session.generatePlatform;
      delete ctx.session.generateAction;
      delete ctx.session.generateScenes;
      delete ctx.session.generateMode;
      delete ctx.session.generateCampaignSize;
      delete ctx.session.customPresetConfig;
      if (ctx.session.stateData && typeof ctx.session.stateData === 'object') {
        delete (ctx.session.stateData as unknown as Record<string, unknown>).selectedPrompt;
        delete (ctx.session.stateData as unknown as Record<string, unknown>).selectedPromptId;
      }
    }
    const user = ctx.from;
    if (!user) return true;
    const lang = ctx.session?.userLang || 'id';
    const dbUser = await UserService.findByTelegramId(BigInt(user.id));
    const credBal = dbUser ? Number(dbUser.creditBalance) : 0;
    const credEmoji = credBal === 0 ? "⚠️" : credBal < 3 ? "🟡" : "🟢";

    const rows: InlineKeyboardButton[][] = [
      [{ text: t('btn.browse_prompts', lang), callback_data: "back_prompts" }],
      [
        { text: t('btn.trending', lang), callback_data: "prompts_trending" },
        { text: t('btn.free_prompt', lang), callback_data: "daily_open" },
      ],
      [
        { text: t('btn.create_video', lang), callback_data: "create_video_new" },
        { text: t('btn.create_image', lang), callback_data: "image_from_prompt" },
      ],
      [
        { text: t('btn.clone', lang), callback_data: "clone_video" },
        { text: t('btn.storyboard', lang), callback_data: "storyboard_create" },
        { text: t('btn.viral', lang), callback_data: "viral_research" },
      ],
      [
        { text: t('btn.repurpose', lang), callback_data: "repurpose_video" },
        { text: t('btn.disassemble', lang), callback_data: "disassemble" },
      ],
      [
        { text: t('btn.topup', lang), callback_data: "topup" },
        { text: t('btn.subscription', lang), callback_data: "open_subscription" },
      ],
      [
        { text: t('btn.my_videos', lang), callback_data: "videos_list" },
        { text: t('btn.referral', lang), callback_data: "open_referral" },
        { text: t('btn.profile', lang), callback_data: "open_profile" },
      ],
    ];

    const webAppUrl = getConfig().WEB_APP_URL;
    if (webAppUrl) {
      rows.push([{ text: t('btn.web_dashboard', lang), web_app: { url: `${webAppUrl}/app` } }]);
    }

    await ctx.editMessageText(
      t('cb.main_menu_greeting', lang, { name: user.first_name, credEmoji, credits: credBal }),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rows },
      },
    );
    return true;
  }

  if (data === "credits_menu") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    const user = ctx.from;
    if (!user) return true;
    const dbUser = await UserService.findByTelegramId(BigInt(user.id));
    const credBal = dbUser ? Number(dbUser.creditBalance) : 0;
    const tier = dbUser?.tier || "free";
    await ctx.editMessageText(
      t('cb.credits_menu_title', lang, { credits: credBal, tier }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.buy_credits', lang), callback_data: "topup" }],
            [
              {
                text: t('btn.upgrade_subscription', lang),
                callback_data: "open_subscription",
              },
            ],
            [{ text: t('btn.referral_code', lang), callback_data: "open_referral" }],
            [{ text: t('btn.main_menu', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data === "topup") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });
    await topupCommand(ctx);
    return true;
  }

  if (data === "open_topup") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await topupCommand(ctx);
    return true;
  }

  if (data === "open_profile") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });
    await profileCommand(ctx);
    return true;
  }

  if (data === "open_referral") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });
    await referralCommand(ctx);
    return true;
  }

  if (data === "referral_menu") {
    await ctx.answerCbQuery();
    await referralCommand(ctx);
    return true;
  }

  if (data === "open_help") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });
    await helpCommand(ctx);
    return true;
  }

  if (data === "open_help_full") {
    await ctx.answerCbQuery();
    await helpCommand(ctx);
    return true;
  }

  if (data === "prompts_menu") {
    await ctx.answerCbQuery();
    await promptsCommand(ctx);
    return true;
  }

  if (data === "chat_ai" || data === "open_chat") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    if (ctx.session) ctx.session.state = "DASHBOARD";
    await ctx
      .editMessageText(
        t('cb2.ai_assistant_active', lang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('cb2.prompt_library', lang),
                  callback_data: "back_prompts",
                },
              ],
              [
                {
                  text: t('cb2.trending_prompts', lang),
                  callback_data: "prompts_trending",
                },
              ],
              [{ text: t('cb2.back_to_menu', lang), callback_data: "main_menu" }],
            ],
          },
        },
      )
      .catch(async () => {
        await ctx.reply(
          t('cb2.ai_assistant_fallback', lang),
          { parse_mode: "Markdown" },
        );
      });
    return true;
  }

  if (data === "contact_support") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.reply(
      t('cb2.contact_support', lang),
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: t('btn.main_menu', lang), callback_data: "main_menu" }]] } },
    );
    return true;
  }

  return false;
}
