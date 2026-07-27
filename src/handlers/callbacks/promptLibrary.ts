import { BotContext } from "@/types";
import type { InlineKeyboardButton } from '@telegraf/types/markup';
import { UserService } from "@/services/user.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import {
  showNichePrompts,
  showCustomizePrompt,
  promptsCommand,
  trendingCommand as promptsTrendingCommand,
  dailyCommand as promptsDailyCommand,
  PROMPT_LIBRARY,
  MYSTERY_PROMPTS,
  TRENDING_PROMPTS,
  getPromptById,
  saveLibraryPrompt,
  showMyPrompts,
  startAddCustomPrompt,
} from "@/commands/prompts";
import { t } from "@/i18n/translations";

export async function handlePromptLibraryCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // Route prompts_niche_*, use_prompt_*, use_admin_prompt_*, use_saved_*, generate_free_* to existing module
  if (
    data.startsWith("prompts_niche_") ||
    data.startsWith("use_prompt_") ||
    data.startsWith("use_admin_prompt_") ||
    data.startsWith("use_saved_") ||
    data.startsWith("generate_free_") ||
    data.startsWith("generate_i2i_") ||
    data.startsWith("edit_prompt_")
  ) {
    const { handlePromptsCallback } = await import("./prompts.js");
    return await handlePromptsCallback(ctx, data);
  }

  // prompts_ (niche browsing, trending, custom)
  if (data.startsWith("prompts_")) {
    await ctx.answerCbQuery();
    const nicheKey = data.replace("prompts_", "");
    if (nicheKey === "trending") {
      const lang = ctx.session?.userLang || 'id';
      const TP = TRENDING_PROMPTS;
      const PL = PROMPT_LIBRARY;
      let msg = t('cb.trending_header', lang) + '\n\n';
      const buttons: InlineKeyboardButton[][] = [];
      TP.forEach((tp, i: number) => {
        const niche = PL[tp.niche];
        const p = niche.prompts.find(x => x.id === tp.promptId)!;
        msg += `*#${i + 1}* ${niche.emoji} ${p.title} — ⭐${p.successRate}% | 📈+${tp.usageChange}%\n\n`;
        buttons.push([
          {
            text: `#${i + 1} ${p.title}`,
            callback_data: `use_prompt_${p.id}`,
          },
        ]);
      });
      buttons.push([
        { text: t('btn.back_to_niche', lang), callback_data: "back_prompts" },
      ]);
      try {
        await ctx.editMessageText(msg, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      } catch {
        await promptsTrendingCommand(ctx);
      }
    } else if (nicheKey === "custom") {
      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb.custom_prompt_gen', lang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('btn.back', lang), callback_data: "back_prompts" }],
            ],
          },
        },
      );
      if (ctx.session) ctx.session.state = "CUSTOM_PROMPT_CREATION";
    } else {
      await showNichePrompts(ctx, nicheKey, true);
    }
    return true;
  }

  // customize_prompt_
  if (data.startsWith("customize_prompt_")) {
    await ctx.answerCbQuery();
    const promptId = data.replace("customize_prompt_", "");
    await showCustomizePrompt(ctx, promptId, true);
    return true;
  }

  // cust_style_ / cust_light_
  if (data.startsWith("cust_style_") || data.startsWith("cust_light_")) {
    await ctx.answerCbQuery();
    const parts = data.split("_");
    const type = parts[1]; // style or light
    const value = parts[2];
    const promptId = parts.slice(3).join("_");
    const p = await getPromptById(promptId);
    const base = p?.prompt || "";
    const modifiers: Record<string, string> = {
      cinematic: "cinematic style, film-grade quality",
      dramatic: "dramatic lighting, high contrast, intense atmosphere",
      minimal: "minimalist clean aesthetic, simple background",
      golden: "golden hour natural lighting, warm tones",
      studio: "professional studio lighting, even illumination",
      moody: "moody dark atmosphere, low-key lighting",
    };
    const newPrompt = `${base}, ${modifiers[value] || value}`;
    if (ctx.session)
      ctx.session.stateData = {
        ...(ctx.session.stateData || {}),
        selectedPrompt: newPrompt,
      };
    const lang = ctx.session?.userLang || 'id';
    const typeLabel = type === "style" ? "Style" : "Lighting";
    await ctx.editMessageText(
      t('cb.prompt_updated', lang, { prompt: newPrompt.slice(0, 300), typeLabel, value }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('btn.create_video', lang), callback_data: "create_video_new" },
              { text: t('btn.create_image', lang), callback_data: "image_from_prompt" },
            ],
            [
              {
                text: t('btn.customize_again', lang),
                callback_data: `customize_prompt_${promptId}`,
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  // save_prompt_
  if (data.startsWith("save_prompt_")) {
    const promptId = data.replace("save_prompt_", "");
    await saveLibraryPrompt(ctx, promptId);
    return true;
  }

  // my_prompts_
  if (data.startsWith("my_prompts_")) {
    await ctx.answerCbQuery();
    const nicheKey = data.replace("my_prompts_", "");
    await showMyPrompts(ctx, nicheKey, true);
    return true;
  }

  // del_saved_
  if (data.startsWith("del_saved_")) {
    const parts = data.replace("del_saved_", "").split("_");
    const savedId = parseInt(parts[0]);
    const nicheKey = parts.slice(1).join("_");
    const telegramId = ctx.from?.id;
    if (telegramId) {
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (dbUser) {
        await SavedPromptService.delete(
          savedId,
          dbUser.id as unknown as bigint,
        );
        const lang = ctx.session?.userLang || 'id';
        await ctx.answerCbQuery(t('prompt.deleted', lang));
        await showMyPrompts(ctx, nicheKey, true);
      }
    }
    return true;
  }

  // add_custom_prompt_
  if (data.startsWith("add_custom_prompt_")) {
    await ctx.answerCbQuery();
    const nicheKey = data.replace("add_custom_prompt_", "");
    await startAddCustomPrompt(ctx, nicheKey, true);
    return true;
  }

  // back_prompts
  if (data === "back_prompts") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    try {
      await ctx.editMessageText(
        t('cb.prompt_library_title', lang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: t('niche.food', lang), callback_data: "prompts_fnb" },
                { text: t('niche.fashion', lang), callback_data: "prompts_fashion" },
              ],
              [
                { text: t('niche.tech', lang), callback_data: "prompts_tech" },
                { text: t('niche.health', lang), callback_data: "prompts_health" },
              ],
              [
                { text: t('niche.travel', lang), callback_data: "prompts_travel" },
                { text: t('niche.education', lang), callback_data: "prompts_education" },
              ],
              [
                { text: t('niche.finance', lang), callback_data: "prompts_finance" },
                {
                  text: t('niche.entertainment', lang),
                  callback_data: "prompts_entertainment",
                },
              ],
              [
                { text: t('btn.trending', lang), callback_data: "prompts_trending" },
                { text: t('btn.custom_ai', lang), callback_data: "prompts_custom" },
              ],
            ],
          },
        },
      );
    } catch {
      await promptsCommand(ctx);
    }
    return true;
  }

  // daily_save_
  if (data.startsWith("daily_save_")) {
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('prompt.saved_to_session', lang));
    const promptId = data.replace("daily_save_", "");
    const p = await getPromptById(promptId);
    if (p && ctx.session)
      ctx.session.stateData = {
        ...(ctx.session.stateData || {}),
        savedPrompt: p.prompt,
      };
    return true;
  }

  // daily_another
  if (data === "daily_another") {
    await ctx.answerCbQuery();
    const dayShift = new Date().getHours() % MYSTERY_PROMPTS.length;
    const mystery = MYSTERY_PROMPTS[dayShift];
    const niche = PROMPT_LIBRARY[mystery.niche];
    const p = niche?.prompts.find((x) => x.id === mystery.promptId);
    if (p) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb.another_mystery', lang, { emoji: niche.emoji, title: p.title, prompt: p.prompt, rate: p.successRate }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('btn.use_now', lang),
                  callback_data: `use_prompt_${p.id}`,
                },
              ],
              [{ text: t('btn.browse_all', lang), callback_data: "back_prompts" }],
            ],
          },
        },
      );
    }
    return true;
  }

  // daily_open
  if (data === "daily_open") {
    await ctx.answerCbQuery();
    const MP = MYSTERY_PROMPTS;
    const PL2 = PROMPT_LIBRARY;
    const dayOfWeek = new Date().getDay();
    const mystery = MP[dayOfWeek % MP.length];
    const niche = PL2[mystery.niche];
    const p = niche?.prompts.find(x => x.id === mystery.promptId);
    if (p) {
      const lang = ctx.session?.userLang || 'id';
      const msg = t('cb2.mystery_prompt_box', lang, {
        nicheEmoji: niche.emoji,
        nicheLabel: niche.label,
        rarity: mystery.rarity,
        title: p.title,
        prompt: p.prompt,
        successRate: p.successRate,
      });
      try {
        await ctx.editMessageText(msg, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('cb2.use_now', lang),
                  callback_data: `use_prompt_${p.id}`,
                },
              ],
              [{ text: t('cb2.another_prompt', lang), callback_data: "daily_another" }],
              [{ text: t('cb2.back_to_menu', lang), callback_data: "back_prompts" }],
            ],
          },
        });
      } catch {
        await ctx.deleteMessage().catch(() => { });
        await promptsDailyCommand(ctx);
      }
    }
    return true;
  }

  // rate_*
  if (data === "generate_rate") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.rate_title', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('cb.rate_5', lang), callback_data: "rate_5" }],
            [{ text: t('cb.rate_4', lang), callback_data: "rate_4" }],
            [{ text: t('cb.rate_3', lang), callback_data: "rate_3" }],
            [{ text: t('cb.rate_2', lang), callback_data: "rate_2" }],
            [{ text: t('btn.main_menu', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data.startsWith("rate_")) {
    const lang = ctx.session?.userLang || 'id';
    const score = parseInt(data.replace("rate_", ""));
    const stars = "⭐".repeat(score);
    await ctx.answerCbQuery(t('cb.rate_thanks', lang, { stars }));
    await ctx.editMessageText(
      t('cb.rate_thanks_msg', lang, { stars }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.generate_again', lang), callback_data: "generate_start" }],
            [{ text: t('btn.home_menu', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  // view_tutorial
  if (data === "view_tutorial") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.tutorial', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.back', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data === "report_bug") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BotState string assignment
    if (ctx.session) ctx.session.state = 'WAITING_BUG_REPORT' as any;
    await ctx.editMessageText(
      t('cb.report_bug', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.back', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  return false;
}
