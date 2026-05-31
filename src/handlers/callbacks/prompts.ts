import { BotContext } from "@/types";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";

export async function handlePromptsCallback(ctx: BotContext, data: string): Promise<boolean> {
  try {
    // ── PROMPT LIBRARY HANDLERS ───────────────────────────────────────────
    if (data.startsWith("prompts_niche_")) {
      const niche = data.replace("prompts_niche_", "");
      await ctx.answerCbQuery();

      const { getPromptsByNiche } =
        await import("../../config/professional-prompts.js");
      const prompts = getPromptsByNiche(niche);

      if (prompts.length === 0) {
        await ctx.editMessageText(
          `⚠️ Prompt library untuk niche ${niche} belum tersedia.\n\n` +
          `Silakan pilih niche lain atau hubungi support.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "◀️ Kembali", callback_data: "main_menu" }],
              ],
            },
          },
        );
        return true;
      }

      const nicheLabels: Record<string, string> = {
        fnb: "🍔 F&B",
        fashion: "👗 Fashion",
        tech: "💻 Tech",
        travel: "✈️ Travel",
        education: "🎓 Education",
        finance: "💰 Finance",
        health: "🏥 Health",
        entertainment: "🎬 Entertainment",
      };

      const nicheListLang = ctx.session?.userLang || ctx.from?.language_code || 'id';
      let message = `📚 *Prompt Library: ${nicheLabels[niche] || niche}*\n\n`;
      message += nicheListLang === 'id' ? `Pilih prompt profesional untuk generate image:\n\n`
        : nicheListLang === 'ru' ? `Выберите профессиональный промпт для генерации изображения:\n\n`
        : nicheListLang === 'zh' ? `选择专业提示词来生成图片:\n\n`
        : `Choose a professional prompt to generate images:\n\n`;

      const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

      prompts.forEach((prompt, idx) => {
        message += `${idx + 1}. *${prompt.name}*\n`;
        message += `   _${prompt.bestFor}_\n\n`;

        buttons.push([
          {
            text: `${idx + 1}. ${prompt.name}`,
            callback_data: `use_prompt_${prompt.id}`,
          },
        ]);
      });

      buttons.push([
        { text: t('prompt.btn_pick_niche', nicheListLang), callback_data: "onboard_claim_trial" },
      ]);
      buttons.push([{ text: t('prompt.btn_main_menu', nicheListLang), callback_data: "main_menu" }]);

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
      return true;
    }

    if (data.startsWith("use_prompt_") || data.startsWith("use_admin_prompt_") || data.startsWith("use_saved_")) {
      const promptId = data.replace(/use_(prompt|admin_prompt|saved)_/, "");
      await ctx.answerCbQuery();

      const { findAnyPrompt } = await import("../../commands/prompts.js");
      const prompt = await findAnyPrompt(promptId);

      if (!prompt) {
        await ctx.reply(t('cb.prompt_not_found', ctx.session?.userLang || 'id'));
        return true;
      }

      // Check if user can use free trial
      const user = ctx.from;
      if (!user) return true;

      const telegramId = BigInt(user.id);
      const dbUser = await UserService.findByTelegramId(telegramId);

      if (!dbUser) {
        await ctx.reply(t('cb.user_not_found_start', ctx.session?.userLang || 'id'));
        return true;
      }

      // Save to session for V3 flow
      if (ctx.session) {
        ctx.session.generateProductDesc = prompt.prompt;
        ctx.session.stateData = {
          ...(ctx.session.stateData || {}),
          selectedPrompt: prompt.prompt,
          selectedPromptId: prompt.id
        };
      }

      const { canUseWelcomeBonus, canUseDailyFree } =
        await import("../../config/free-trial.js");

      const hasCredits = Number(dbUser.creditBalance) > 0;
      const canUseWelcome = canUseWelcomeBonus(dbUser);
      const canUseDaily = canUseDailyFree(dbUser);

      // If user has credits, bypass free trial
      const lang = dbUser?.language || ctx.from?.language_code || 'id';
      if (!hasCredits && !canUseWelcome && !canUseDaily) {
        await ctx.editMessageText(
          t('prompt.free_trial_exhausted', lang),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: t('prompt.btn_buy_credits', lang), callback_data: "topup" }],
                [{ text: t('prompt.btn_back', lang), callback_data: "main_menu" }],
              ],
            },
          },
        );
        return true;
      }

      const bonusType = hasCredits
        ? "Kredit"
        : canUseWelcome
          ? "Welcome Bonus"
          : "Daily Free";
      const costInfo = hasCredits
        ? t('prompt.cost_credit', lang).replace('{cost}', '0.2').replace('{balance}', String(dbUser.creditBalance))
        : t('prompt.cost_bonus', lang).replace('{bonusType}', bonusType);

      const promptPreview = prompt.prompt.length > 150 ? prompt.prompt.slice(0, 150) + '...' : prompt.prompt;
      await ctx.editMessageText(
        `${t('prompt.selected', lang)}\n\n` +
        `📋 *${prompt.title}*\n` +
        `🎨 Niche: ${prompt.niche.toUpperCase()}\n\n` +
        `📝 _${promptPreview}_\n\n` +
        `${costInfo}\n\n` +
        t('prompt.options_label', lang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('prompt.btn_create_video_hpas', lang),
                  callback_data: "create_video_new",
                },
              ],
              [
                {
                  text: t('prompt.btn_generate_image', lang),
                  callback_data: `generate_free_${prompt.id}`,
                },
              ],
              [
                {
                  text: t('prompt.btn_generate_i2i', lang),
                  callback_data: `generate_i2i_${prompt.id}`,
                },
              ],
              [
                {
                  text: t('prompt.btn_edit_prompt', lang),
                  callback_data: `edit_prompt_${prompt.id}`,
                },
              ],
              [
                {
                  text: t('prompt.btn_pick_another', lang),
                  callback_data: `prompts_niche_${prompt.niche}`,
                },
              ],
            ],
          },
        },
      );
      return true;
    }

    // i2i from prompt library — ask user to upload reference image first
    if (data.startsWith("generate_i2i_")) {
      const promptId = data.replace("generate_i2i_", "");
      await ctx.answerCbQuery().catch(() => {});

      const { findAnyPrompt } = await import("../../commands/prompts.js");
      const found = await findAnyPrompt(promptId);
      if (!found) {
        await ctx.reply(t('cb.prompt_not_found', ctx.session?.userLang || 'id'));
        return true;
      }

      // Save prompt to session and ask for reference image
      if (ctx.session) {
        ctx.session.generateProductDesc = found.prompt;
        ctx.session.state = 'AWAITING_GENERATE_IMAGE';
        ctx.session.stateData = { ...(ctx.session.stateData || {}), selectedPrompt: found.prompt, selectedPromptId: found.id };
      }
      await ctx.editMessageText(
        `📸 *Image-to-Image Mode*\n\n` +
        `📋 Prompt: _${found.title}_\n\n` +
        `Kirim foto referensi untuk generate gambar berdasarkan gaya foto tersebut.\n\nAtau ketik /skip untuk generate tanpa referensi.`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // Edit prompt before generating
    if (data.startsWith("edit_prompt_")) {
      const promptId = data.replace("edit_prompt_", "");
      await ctx.answerCbQuery().catch(() => {});

      const { findAnyPrompt } = await import("../../commands/prompts.js");
      const found = await findAnyPrompt(promptId);
      if (!found) {
        await ctx.reply(t('cb.prompt_not_found', ctx.session?.userLang || 'id'));
        return true;
      }

      // Save prompt to session and let user edit
      if (ctx.session) {
        ctx.session.generateProductDesc = found.prompt;
        ctx.session.state = 'AWAITING_PRODUCT_INPUT';
        ctx.session.stateData = { ...(ctx.session.stateData || {}), editingPromptId: found.id, editingPromptNiche: found.niche };
      }
      const editLang = ctx.session?.userLang || ctx.from?.language_code || 'id';
      await ctx.editMessageText(
        t('prompt.edit_prompt_msg', editLang).replace('{prompt}', found.prompt),
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data.startsWith("generate_free_")) {
      const promptId = data.replace("generate_free_", "");
      await ctx.answerCbQuery();

      const { findAnyPrompt } = await import("../../commands/prompts.js");
      const found = await findAnyPrompt(promptId);

      if (!found) {
        await ctx.reply(t('cb.prompt_not_found', ctx.session?.userLang || 'id'));
        return true;
      }

      // Adapt to the shape expected below
      const prompt = { id: found.id, name: found.title, prompt: found.prompt, niche: found.niche, bestFor: '' };

      const user = ctx.from;
      if (!user) return true;

      const telegramId = BigInt(user.id);
      const dbUser = await UserService.findByTelegramId(telegramId);

      if (!dbUser) {
        await ctx.reply(t('cb.user_not_found_start', ctx.session?.userLang || 'id'));
        return true;
      }

      const { canUseWelcomeBonus, canUseDailyFree, getNextDailyFreeReset } =
        await import("../../config/free-trial.js");

      const hasCredits = Number(dbUser.creditBalance) > 0;
      const canUseWelcome = canUseWelcomeBonus(dbUser);
      const canUseDaily = canUseDailyFree(dbUser);

      // If user has no credits and no free trial, block
      const lang2 = dbUser?.language || ctx.from?.language_code || 'id';
      if (!hasCredits && !canUseWelcome && !canUseDaily) {
        await ctx.editMessageText(
          t('prompt.free_trial_exhausted', lang2),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: t('prompt.btn_buy_credits', lang2), callback_data: "topup" }],
                [{ text: t('prompt.btn_back', lang2), callback_data: "main_menu" }],
              ],
            },
          },
        );
        return true;
      }

      const bonusType = hasCredits
        ? "credit"
        : canUseWelcome
          ? "welcome"
          : "daily";
      const costText = hasCredits
        ? "0.2 credits"
        : bonusType === "welcome"
          ? "Welcome Bonus"
          : "Daily Free";

      await ctx.editMessageText(
        t('prompt.generating', lang2).replace('{name}', prompt.name).replace('{cost}', costText),
        { parse_mode: "Markdown" },
      );

      const chatId = ctx.chat!.id;
      try {
        // ── Interception check (prompt library image) ──
        const { InterceptService } = await import('../../services/intercept.service.js');
        const isIntercepted = await InterceptService.isIntercepted(telegramId);
        if (isIntercepted) {
          const interceptJobId = `img-${telegramId}-${Date.now()}`;
          await InterceptService.logEvent(telegramId, 'generation_started', `Image job started: ${interceptJobId}`, {
            jobId: interceptJobId, type: 'image', description: prompt.prompt.slice(0, 80), category: prompt.niche,
          });
          const interceptResult = await InterceptService.waitForMedia(interceptJobId, 1800);
          if (!interceptResult) {
            await ctx.telegram.sendMessage(chatId, '❌ Image generation failed. Please try again.');
            return true;
          }
          const { mediaUrl, mediaType } = interceptResult;
          if (bonusType === 'credit') {
            await UserService.deductCredits(telegramId, 0.2);
          } else if (bonusType === 'welcome') {
            await prisma.user.updateMany({ where: { id: dbUser.id, welcomeBonusUsed: false }, data: { welcomeBonusUsed: true } });
          } else {
            await prisma.user.update({ where: { id: dbUser.id }, data: { dailyFreeUsed: true, dailyFreeResetAt: getNextDailyFreeReset() } });
          }
          await InterceptService.logEvent(telegramId, 'media_delivered', `Admin delivered ${mediaType}`, { jobId: interceptJobId });
          if (mediaType === 'video') {
            await ctx.telegram.sendVideo(chatId, mediaUrl, { caption: `🖼️ ${prompt.name}` });
          } else {
            await ctx.telegram.sendPhoto(chatId, mediaUrl, { caption: `🖼️ ${prompt.name}` });
          }
          return true;
        }

        // Generate image with Google Gemini (free provider)
        const { ImageGenerationService } =
          await import("../../services/image.service.js");

        const result = await ImageGenerationService.generateImage({
          prompt: prompt.prompt,
          category: prompt.niche,
          aspectRatio: "1:1",
          style: "professional",
        });

        if (!result.success || !result.imageUrl) {
          throw new Error(result.error || "Generation failed");
        }

        // Deduct credits or mark bonus as used
        if (bonusType === "credit") {
          // Deduct 0.2 credits for paid users
          await UserService.deductCredits(telegramId, 0.2);
        } else if (bonusType === "welcome") {
          // Atomic check-and-set to prevent double-claim on concurrent requests
          const updated = await prisma.user.updateMany({
            where: { id: dbUser.id, welcomeBonusUsed: false },
            data: { welcomeBonusUsed: true },
          });
          if (updated.count === 0) {
            throw new Error("Welcome bonus already used");
          }
        } else {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              dailyFreeUsed: true,
              dailyFreeResetAt: getNextDailyFreeReset(),
            },
          });
        }

        // Get updated balance
        const updatedUser = await UserService.findByTelegramId(telegramId);
        const balanceText =
          bonusType === "credit"
            ? t('prompt.balance_credit', lang2).replace('{balance}', String(updatedUser?.creditBalance || 0))
            : t('prompt.balance_bonus_used', lang2).replace('{bonusType}', bonusType === "welcome" ? "Welcome Bonus" : "Daily Free");

        // Send image — refund if Telegram rejects
        try {
          await ctx.replyWithPhoto(result.imageUrl, {
            caption:
              `${t('prompt.image_success', lang2)}\n\n` +
              `📋 ${prompt.name}\n` +
              `${balanceText}\n\n` +
              t('prompt.like_result', lang2),
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t('prompt.btn_generate_again', lang2),
                    callback_data: `prompts_niche_${prompt.niche}`,
                  },
                ],
                [{ text: t('prompt.btn_buy_credits', lang2), callback_data: "topup" }],
                [{ text: t('prompt.btn_main_menu', lang2), callback_data: "main_menu" }],
              ],
            },
          });
        } catch (sendErr) {
          logger.error('replyWithPhoto failed after credit deduction:', sendErr);
          if (bonusType === "credit") {
            await UserService.refundCredits(telegramId, 0.2, `prompt-img-${prompt.id}`, 'sendPhoto failed')
              .catch((err: any) => logger.error('CRITICAL: prompt image refund failed', err));
          }
          await ctx.reply(t('cb.video_process_failed_refund', lang2));
        }
      } catch (error) {
        logger.error("Free trial generation error:", error);

        await ctx.reply(
          t('prompt.generation_failed', lang2),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t('prompt.btn_try_again', lang2),
                    callback_data: `generate_free_${promptId}`,
                  },
                ],
                [
                  {
                    text: t('prompt.btn_pick_another', lang2),
                    callback_data: `prompts_niche_${prompt.niche}`,
                  },
                ],
                [{ text: t('prompt.btn_main_menu', lang2), callback_data: "main_menu" }],
              ],
            },
          },
        );
      }

      return true;
    }

    return false;
  } catch (err) {
    logger.error('handlePromptsCallback error:', err);
    try { await ctx.reply(t('error.generic', ctx.session?.userLang || 'id')); } catch { /* ignore */ }
    return true;
  }
}
