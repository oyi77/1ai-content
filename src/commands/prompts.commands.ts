/**
 * Prompts Command — Command Entry Points
 *
 * /prompts, /daily, /trending, /fingerprint handlers
 * and saveLibraryPrompt helper.
 * Extracted from prompts.ts to separate commands from data/UI.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import type { InlineKeyboardButton } from "@telegraf/types/markup";
import { t } from "@/i18n/translations";
import { canUseDailyFree, getNextDailyFreeReset } from "@/config/free-trial";
import {
  PROMPT_LIBRARY,
  TRENDING_PROMPTS,
  findAnyPrompt,
  getPromptById,
  getUserDailyPrompt,
} from "./prompts.data";
import {
  showNichePrompts,
  showPromptDetail,
  showCustomizePrompt,
  showMyPrompts,
  startAddCustomPrompt,
} from "./prompts.ui";

// ─── /prompts ────────────────────────────────────────────────────────────────

export async function promptsCommand(ctx: BotContext): Promise<void> {
  try {
    const rawText = (ctx.message as { text?: string })?.text || "";
    const arg = rawText
      .replace(/^\/prompts\s*/, "")
      .trim()
      .toLowerCase();

    if (arg && PROMPT_LIBRARY[arg]) {
      await showNichePrompts(ctx, arg);
      return;
    }

    const lang = ctx.session?.userLang || ctx.from?.language_code || "id";
    await ctx.reply(t("prompts.library_menu", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🍔 F&B", callback_data: "prompts_fnb" },
            { text: "👗 Fashion", callback_data: "prompts_fashion" },
          ],
          [
            { text: "📱 Tech", callback_data: "prompts_tech" },
            { text: "💪 Health", callback_data: "prompts_health" },
          ],
          [
            { text: "✈️ Travel", callback_data: "prompts_travel" },
            { text: "📚 Education", callback_data: "prompts_education" },
          ],
          [
            { text: "💰 Finance", callback_data: "prompts_finance" },
            {
              text: "🎭 Entertainment",
              callback_data: "prompts_entertainment",
            },
          ],
          [
            { text: "🔥 Trending", callback_data: "prompts_trending" },
            { text: "✨ Custom AI", callback_data: "prompts_custom" },
          ],
        ],
      },
    });
  } catch (err) {
    logger.error("promptsCommand error:", err);
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("prompt.library_load_failed", lang));
  }
}

// ─── /daily ──────────────────────────────────────────────────────────────────

export async function dailyCommand(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply(t("social.unable_identify_user", "id"));
      return;
    }

    const dbUser = await UserService.findByTelegramId(BigInt(userId));
    if (!dbUser) {
      await ctx.reply(t("error.user_not_found", "id"));
      return;
    }

    if (!canUseDailyFree(dbUser)) {
      const resetAt = dbUser.dailyFreeResetAt || getNextDailyFreeReset();
      const hoursLeft = Math.ceil(
        (resetAt.getTime() - Date.now()) / (1000 * 60 * 60),
      );
      await ctx.reply(
        `🎁 **MYSTERY PROMPT BOX**\n\n⏰ **Daily reward sudah diklaim!**\n\nPrompt baru akan tersedia dalam: *${hoursLeft} jam*.\n\n_Ingin lebih banyak prompt? Jelajahi Library atau upgrade ke PRO!_`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const today = new Date();
    const userPrompt = getUserDailyPrompt(userId, today);
    const niche = PROMPT_LIBRARY[userPrompt.niche];
    const p = niche.prompts.find((x) => x.id === userPrompt.promptId)!;

    const msg =
      `🎁 **MYSTERY PROMPT BOX**\n─────────────────────────────────────\n\n✨ **PROMPT UNLOCKED!**\n\n` +
      `─────────────────────────────────────\n📂 Niche: **${niche.label}**\n⭐ Rarity: **${userPrompt.rarity}**\n` +
      `─────────────────────────────────────\n\n**${p.title}**\n\n\`${p.prompt}\`\n\n` +
      `─────────────────────────────────────\n💡 Prompt ini bisa langsung dipakai untuk generate!\n` +
      `─────────────────────────────────────\n\n⏰ Prompt baru setiap hari — jangan sampai ketinggalan!`;

    if (ctx.session) {
      ctx.session.stateData = {
        ...(ctx.session.stateData || {}),
        selectedPrompt: p.prompt,
      };
    }

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚀 Pakai Sekarang", callback_data: `use_prompt_${p.id}` },
            { text: "💾 Simpan", callback_data: `daily_save_${p.id}` },
          ],
          [{ text: "🔄 Prompt Lain", callback_data: "daily_another" }],
          [{ text: "📚 Lihat Semua Prompt", callback_data: "back_prompts" }],
        ],
      },
    });
  } catch (err) {
    logger.error("dailyCommand error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.daily_load_failed", errLang));
  }
}

// ─── /trending ───────────────────────────────────────────────────────────────

export async function trendingCommand(ctx: BotContext): Promise<void> {
  try {
    let msg = `🔥 **TRENDING PROMPTS THIS WEEK**\n`;
    msg += `─────────────────────────────────────\n\n`;
    msg += `Diupdate setiap hari berdasarkan penggunaan real user!\n\n`;
    msg += `─────────────────────────────────────\n\n`;

    const buttons: InlineKeyboardButton[][] = [];

    TRENDING_PROMPTS.forEach((t, i) => {
      const niche = PROMPT_LIBRARY[t.niche];
      const p = niche.prompts.find((x) => x.id === t.promptId)!;

      msg += `**#${i + 1}** ${niche.emoji} ${p.title}\n`;
      msg += `📈 +${t.usageChange}% usage | ⭐ ${p.successRate}% success\n`;
      msg += `Top niche: ${niche.label}\n`;
      msg += `\`"${p.prompt.slice(0, 60)}..."\`\n\n`;
      msg += `─────────────────────────────────────\n\n`;

      buttons.push([
        {
          text: `🔥 Use #${i + 1} ${p.title}`,
          callback_data: `use_prompt_${p.id}`,
        },
      ]);
    });

    msg += `💡 Tip: Trending prompts biasanya punya higher success rate karena sudah ditest ribuan user!`;

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...buttons,
          [{ text: "📚 Browse Semua Niche", callback_data: "back_prompts" }],
        ],
      },
    });
  } catch (err) {
    logger.error("trendingCommand error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.trending_load_failed", errLang));
  }
}

// ─── /fingerprint ────────────────────────────────────────────────────────────

export async function fingerprintCommand(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  await ctx.reply(
    `${t("fingerprint.preview_title", lang)}\n\n${t("fingerprint.preview_desc", lang)}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("fingerprint.try_library", lang),
              callback_data: "prompts_menu",
            },
          ],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    },
  );
}

// ─── Save prompt from library ─────────────────────────────────────────────────

export async function saveLibraryPrompt(
  ctx: BotContext,
  promptId: string,
): Promise<void> {
  try {
    const p = await getPromptById(promptId);
    if (!p) {
      await ctx.answerCbQuery(t("cb.prompt_not_found", "id"));
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCbQuery(t("error.user_not_found", "id"));
      return;
    }

    const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
    if (!dbUser) {
      await ctx.answerCbQuery(t("error.user_not_found", "id"));
      return;
    }

    const count = await SavedPromptService.count(
      dbUser.id as unknown as bigint,
    );
    if (count >= 20) {
      await ctx.answerCbQuery(
        "⚠️ Max 20 prompt tersimpan. Hapus dulu yang lama.",
      );
      return;
    }

    await SavedPromptService.save(dbUser.id as unknown as bigint, {
      title: p.title,
      prompt: p.prompt,
      niche: p.niche,
      source: "library",
      sourceId: promptId,
    });

    await ctx.answerCbQuery(`✅ "${p.title}" tersimpan!`);
  } catch (err) {
    logger.error("saveLibraryPrompt error:", err);
    await ctx.answerCbQuery(t("prompt.save_failed", "id"));
  }
}
