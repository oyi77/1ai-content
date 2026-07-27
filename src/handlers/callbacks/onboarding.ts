import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { P2pService } from "@/services/p2p.service";
import {
  getLangConfig,
  LANGUAGE_LIST,
  LANG_PAGE_SIZE,
} from "@/config/languages";
import { t } from "@/i18n/translations";

export async function handleOnboardingCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // P2P transfer handlers
  if (data === "cancel_send") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('cb.transfer_cancelled', lang));
    await ctx.editMessageText(t('cb.transfer_cancelled', lang));
    return true;
  }

  if (data.startsWith("confirm_send_")) {
    const parts = data.replace("confirm_send_", "").split("_");
    const recipientIdStr = parts[0];
    const amountStr = parts[1];
    const recipientId = BigInt(recipientIdStr);
    const amount = Number(amountStr);
    const senderId = BigInt(ctx.from!.id);

    try {
      const lang = ctx.session?.userLang || 'id';
      await ctx.answerCbQuery(t('cb.processing_transfer', lang));
      const result = await P2pService.executeTransfer(senderId, recipientId, amount);

      if (result.success) {
        await ctx.editMessageText(
          t('cb.transfer_success', lang, { amount, recipientId: recipientIdStr }),
          { parse_mode: "Markdown" }
        );

        try {
          await ctx.telegram.sendMessage(
            Number(recipientIdStr),
            t('cb.transfer_received', lang, { senderId: senderId.toString(), amount }),
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          logger.warn(`Failed to notify recipient ${recipientIdStr}`);
        }
      } else {
        await ctx.editMessageText(t('cb.transfer_failed', lang, { error: result.error ?? '' }), { parse_mode: "Markdown" });
      }
    } catch (error) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(t('cb.transfer_error', lang, { error: (error as Error).message }), { parse_mode: "Markdown" });
    }
    return true;
  }

  // onboard_start
  if (data === "onboard_start") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.onboard_credits_info', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('btn.claim_trial', lang),
                callback_data: "onboard_claim_trial",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  if (data === "onboard_claim_trial") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';

    // Build persona-filtered niche picker
    const { getPersonaForUser, isNicheAllowedForPersona } = await import('@/config/personas.js');
    const { NICHE_CONFIG } = await import('@/config/niches.js');
    const userMode = (ctx.session?.stateData?.selectedUserMode as string) || ctx.session?.userMode || 'content_creator';
    const persona = getPersonaForUser(userMode);
    const allowedNiches = Object.entries(NICHE_CONFIG).filter(([k]) => isNicheAllowedForPersona(persona, k));

    const nicheRows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < allowedNiches.length; i += 2) {
      nicheRows.push(
        allowedNiches.slice(i, i + 2).map(([k, v]) => ({
          text: `${v.emoji} ${v.name}`,
          callback_data: `onboard_niche_${k}`,
        }))
      );
    }

    await ctx.editMessageText(
      t('cb.onboard_trial_claimed', lang),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: nicheRows },
      },
    );
    return true;
  }

  if (data.startsWith("onboard_niche_")) {
    const niche = data.replace("onboard_niche_", "");
    await ctx.answerCbQuery();

    const user = ctx.from;
    if (!user) return true;

    const telegramId = BigInt(user.id);

    const { resolveNicheKey } = await import('@/config/niches.js');
    const canonicalNiche = resolveNicheKey(niche);

    const detectedLang = (ctx.session?.stateData?.detectedLang as string) || "id";
    await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        language: detectedLang,
        selectedNiche: canonicalNiche,
        welcomeBonusUsed: false,
        dailyFreeUsed: false,
        dailyFreeResetAt: null,
        referralCode: await UserService.generateReferralCode(user.username || user.first_name),
        tier: 'free',
        creditBalance: 0,
        notificationsEnabled: true,
        userMode: (ctx.session?.stateData?.selectedUserMode as string) || 'content_creator',
      },
      update: {
        selectedNiche: canonicalNiche,
        userMode: (ctx.session?.stateData?.selectedUserMode as string) || 'content_creator',
      },
    });

    logger.info(`Upserted user with niche: ${telegramId}, niche: ${canonicalNiche}`);

    // Grant welcome bonus (no-op if already used)
    const granted = await UserService.grantWelcomeBonus(telegramId);
    if (granted) {
      await ctx.reply(
        '🎁 Welcome bonus: 1 free credit added to your account!\nUse it to generate your first video with /create'
      );
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

    const lang = (ctx.session?.stateData?.detectedLang as string) || ctx.session?.userLang || detectedLang;

    // Continue to welcome flow
    await ctx.editMessageText(
      t('cb.onboard_account_created', lang, { niche: nicheLabels[niche] || niche }),
      { parse_mode: "Markdown" },
    );

    await ctx.reply(t("onboarding.welcome", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t('btn.create_video', lang), callback_data: "create_video_new" }],
          [{ text: t('btn.create_image', lang), callback_data: "create_image_new" }],
          [{ text: t('btn.credits_packages', lang), callback_data: "credits_menu" }],
          [{ text: t('btn.my_videos_emoji', lang), callback_data: "videos_list" }],
          [{ text: t('btn.account', lang), callback_data: "account_menu" }],
        ],
      },
    });

    await new Promise((r) => setTimeout(r, 1500));
    await ctx.reply(t("onboarding.features", lang), { parse_mode: "Markdown" });

    await new Promise((r) => setTimeout(r, 1500));
    await ctx.reply(t("onboarding.cta", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("onboarding.btn_create_video", lang), callback_data: "back_prompts" }],
          [{ text: t("onboarding.btn_try_image", lang), callback_data: "daily_open" }],
          [{ text: t("onboarding.btn_chat_ai", lang), callback_data: "open_chat" }],
        ],
      },
    });

    if (ctx.session) {
      ctx.session.state = "DASHBOARD";
      ctx.session.lastActivity = new Date();
      ctx.session.stateData = {};
    }
    return true;
  }

  if (data === "use_welcome_bonus") {
    await ctx.answerCbQuery();
    const user = ctx.from;
    if (!user) return true;

    const telegramId = BigInt(user.id);
    const dbUser = await UserService.findByTelegramId(telegramId);

    if (!dbUser) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.user_not_found_start', lang));
      return true;
    }

    if (dbUser.welcomeBonusUsed) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb.welcome_bonus_used', lang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('btn.use_daily_free', lang),
                  callback_data: "use_daily_free",
                },
              ],
              [{ text: t('btn.buy_credits', lang), callback_data: "topup" }],
              [{ text: t('btn.home_menu', lang), callback_data: "main_menu" }],
            ],
          },
        },
      );
      return true;
    }

    const lang2 = ctx.session?.userLang || 'id';
    const niche = dbUser.selectedNiche || "fnb";
    await ctx.editMessageText(
      t('cb.welcome_bonus_prompt', lang2, { niche: niche.toUpperCase() }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('btn.view_prompt_library', lang2),
                callback_data: `prompts_niche_${niche}`,
              },
            ],
            [{ text: t('btn.back', lang2), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data === "use_daily_free") {
    await ctx.answerCbQuery();
    const user = ctx.from;
    if (!user) return true;

    const telegramId = BigInt(user.id);
    const dbUser = await UserService.findByTelegramId(telegramId);

    if (!dbUser) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.user_not_found_start', lang));
      return true;
    }

    const { canUseDailyFree, getNextDailyFreeReset } =
      await import("../../config/free-trial.js");

    if (!canUseDailyFree(dbUser)) {
      const resetAt = dbUser.dailyFreeResetAt || getNextDailyFreeReset();
      const hoursLeft = Math.ceil(
        (resetAt.getTime() - Date.now()) / (1000 * 60 * 60),
      );

      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb.daily_free_not_reset', lang, { hours: hoursLeft }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('btn.use_welcome', lang),
                  callback_data: "use_welcome_bonus",
                },
              ],
              [{ text: t('btn.buy_credits', lang), callback_data: "topup" }],
              [{ text: t('btn.home_menu', lang), callback_data: "main_menu" }],
            ],
          },
        },
      );
      return true;
    }

    const lang = ctx.session?.userLang || 'id';
    const niche = dbUser.selectedNiche || "fnb";
    await ctx.editMessageText(
      t('cb.daily_free_prompt', lang, { niche: niche.toUpperCase() }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('btn.view_prompt_library', lang),
                callback_data: `prompts_niche_${niche}`,
              },
            ],
            [{ text: t('btn.back', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data.startsWith('persona_select_')) {
    await ctx.answerCbQuery();
    const personaKey = data.replace('persona_select_', '');
    const userMode = personaKey === 'skip' ? 'content_creator' : personaKey;

    // Store in session
    ctx.session.stateData = { ...ctx.session.stateData, selectedUserMode: userMode };

    // Persist to DB immediately (user already created in onboard_lang_*)
    const userId = ctx.from?.id;
    if (userId) {
      await prisma.user.update({
        where: { telegramId: BigInt(userId) },
        data: { userMode },
      }).catch(() => {}); // ignore if user not yet created
    }

    // Get allowed niches for this persona
    const { getPersonaForUser, isNicheAllowedForPersona } = await import('@/config/personas.js');
    const { NICHE_CONFIG } = await import('@/config/niches.js');
    const persona = getPersonaForUser(userMode);

    const allowedNiches = Object.entries(NICHE_CONFIG).filter(([k]) =>
      isNicheAllowedForPersona(persona, k)
    );

    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < allowedNiches.length; i += 2) {
      rows.push(
        allowedNiches.slice(i, i + 2).map(([k, v]) => ({
          text: `${v.emoji} ${v.name}`,
          callback_data: `onboard_niche_${k}`,
        }))
      );
    }

    await ctx.reply(
      '📁 *Pilih niche konten kamu:*',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: rows },
      }
    );
    ctx.session.state = 'DASHBOARD';
    return true;
  }

  if (data.startsWith('persona_set_')) {
    await ctx.answerCbQuery('✅ Profil diperbarui!');
    const userMode = data.replace('persona_set_', '');
    const userId = ctx.from?.id;
    if (userId) {
      await prisma.user.update({
        where: { telegramId: BigInt(userId) },
        data: { userMode },
      }).catch(() => {});
    }
    ctx.session.stateData = { ...ctx.session.stateData, selectedUserMode: userMode };
    await ctx.editMessageText('✅ Profil berhasil diatur!').catch(() => {});
    return true;
  }

  // Onboarding language selection (more languages paginated)
  if (data.startsWith("onboard_lang_more_")) {
    await ctx.answerCbQuery();
    const page = parseInt(data.replace("onboard_lang_more_", ""));
    const start = page * LANG_PAGE_SIZE;
    const pageItems = LANGUAGE_LIST.slice(start, start + LANG_PAGE_SIZE);
    const totalPages = Math.ceil(LANGUAGE_LIST.length / LANG_PAGE_SIZE);

    const langButtons: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < pageItems.length; i += 2) {
      const row: Array<{ text: string; callback_data: string }> = [];
      for (let j = i; j < Math.min(i + 2, pageItems.length); j++) {
        const lang = pageItems[j];
        row.push({
          text: `${lang.flag} ${lang.label}`,
          callback_data: `onboard_lang_${lang.code}`,
        });
      }
      langButtons.push(row);
    }

    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 0)
      navRow.push({
        text: "\u25c0\ufe0f Prev",
        callback_data: `onboard_lang_more_${page - 1}`,
      });
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: "noop" });
    if (page < totalPages - 1)
      navRow.push({
        text: "Next \u25b6\ufe0f",
        callback_data: `onboard_lang_more_${page + 1}`,
      });
    langButtons.push(navRow);

    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.onboard_lang_welcome', lang),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: langButtons },
      },
    );
    return true;
  }

  if (data.startsWith("onboard_lang_")) {
    const langCode = data.replace("onboard_lang_", "");
    const langCfg = getLangConfig(langCode);
    await ctx.answerCbQuery(`${langCfg.flag} ${langCfg.label}`);

    const userId = ctx.from?.id;
    if (!userId) return true;

    let referredBy: string | undefined;
    const startPayload = ctx.session?.stateData?.startPayload as
      | string
      | null;
    if (startPayload?.startsWith("ref_")) {
      const refCode = startPayload.replace("ref_", "");
      const referrer = await UserService.findByReferralCode(refCode);
      if (referrer && referrer.telegramId !== BigInt(userId)) {
        referredBy = referrer.uuid;
      }
    }

    const user = ctx.from!;
    await prisma.user.upsert({
      where: { telegramId: BigInt(user.id) },
      create: {
        telegramId: BigInt(user.id),
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        language: langCode,
        referredBy,
        referralCode: await UserService.generateReferralCode(user.username || user.first_name),
        tier: 'free',
        creditBalance: 0,
        welcomeBonusUsed: false,
        dailyFreeUsed: false,
        notificationsEnabled: true,
      },
      update: {
        language: langCode,
      },
    });

    await ctx.editMessageText(`${langCfg.flag} ${langCfg.label} \u2705`, {
      parse_mode: "Markdown",
    });

    ctx.session.stateData = { ...ctx.session.stateData, detectedLang: langCode };
    ctx.session.state = 'ONBOARDING_PERSONA';

    await ctx.reply(
      '🎯 *Pilih profil kamu:*\n\n_Ini membantu kami menyesuaikan pengalaman terbaik untukmu_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏪 UMKM / Toko Kecil', callback_data: 'persona_select_umkm' }],
            [{ text: '🎥 Content Creator', callback_data: 'persona_select_content_creator' }],
            [{ text: '🎬 Movie Director', callback_data: 'persona_select_movie_director' }],
            [{ text: '🎌 Anime Studio', callback_data: 'persona_select_anime_studio' }],
            [{ text: '💼 Corporate', callback_data: 'persona_select_corporate' }],
            [{ text: '🏢 Agency', callback_data: 'persona_select_agency' }],
            [{ text: '⏭️ Lewati', callback_data: 'persona_select_skip' }],
          ],
        },
      }
    );
    return true;
  }

  return false;
}
