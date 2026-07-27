import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { t } from "@/i18n/translations";
import type { InlineKeyboardButton } from '@telegraf/types/markup';

export async function handleReferralCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  if (data === 'referral_explain') {
    await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || 'id';
    await ctx.reply(t('referral.explanation', lang), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: t('btn.back', lang), callback_data: 'referral_menu' }]],
      },
    });
    return true;
  }

  if (data === "share_referral") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('misc.share_coming_soon', lang));
    return true;
  }

  if (data === "referral_stats") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const user = await UserService.findByTelegramId(BigInt(userId));
      if (!user) {
        const lang = ctx.session?.userLang || 'id';
        await ctx.reply(t('error.user_not_found', lang));
        return true;
      }

      const [referralCount, commissionAgg, availableAgg, withdrawnAgg] =
        await Promise.all([
          prisma.user.count({ where: { referredBy: user.uuid } }),
          prisma.commission.aggregate({
            where: { referrerId: BigInt(userId) },
            _sum: { amount: true },
          }),
          prisma.commission.aggregate({
            where: { referrerId: BigInt(userId), status: "available" },
            _sum: { amount: true },
          }),
          prisma.commission.aggregate({
            where: { referrerId: BigInt(userId), status: "withdrawn" },
            _sum: { amount: true },
          }),
        ]);

      const totalCommission = Number(commissionAgg._sum.amount || 0);
      const availableCommission = Number(availableAgg._sum.amount || 0);
      const withdrawnCommission = Number(withdrawnAgg._sum.amount || 0);

      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb2.referral_stats', lang, {
          referralCount,
          referralTier: user.referralTier,
          totalCommission: totalCommission.toLocaleString("id-ID"),
          availableCommission: availableCommission.toLocaleString("id-ID"),
          withdrawnCommission: withdrawnCommission.toLocaleString("id-ID"),
          referralCode: user.referralCode || "N/A",
        }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('cb2.withdraw_btn', lang), callback_data: "referral_withdraw" }],
              [
                {
                  text: t('btn.back', lang),
                  callback_data: "open_referral",
                },
              ],
            ],
          },
        },
      );
    } catch (error) {
      logger.error("Referral stats error:", error);
      await ctx.reply(
        t('cb.referral_stats_error', ctx.session?.userLang || 'id'),
      );
    }
    return true;
  }

  if (data === "referral_withdraw") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const availableAgg = await prisma.commission.aggregate({
        where: { referrerId: BigInt(userId), status: "available" },
        _sum: { amount: true },
      });
      const available = Number(availableAgg._sum.amount || 0);

      const sellRateStr = await PaymentSettingsService.get('referral_sell_rate');
      const SELL_RATE = sellRateStr ? parseInt(sellRateStr) : 3000;
      const creditsCanConvert = Math.floor(available / SELL_RATE);

      const lang = ctx.session?.userLang || 'id';
      let message = t('cb2.withdraw_title', lang) + "\n\n";
      message += t('cb2.withdraw_balance', lang, { available: available.toLocaleString("id-ID") }) + "\n\n";

      if (available <= 0) {
        message += t('cb2.withdraw_no_commission', lang);
      } else {
        message += t('cb2.withdraw_options', lang, {
          creditsCanConvert,
          sellRate: SELL_RATE.toLocaleString("id-ID"),
          cashoutHalf: (available / 2).toLocaleString("id-ID"),
        });
      }

      const buttons: InlineKeyboardButton[][] = [];
      if (creditsCanConvert > 0) {
        buttons.push([{ text: t('cb2.convert_to_credits_btn', lang, { credits: creditsCanConvert }), callback_data: "referral_convert_credits" }]);
        buttons.push([{ text: t('cb2.sell_to_admin_btn', lang, { amount: (available / 2).toLocaleString("id-ID") }), callback_data: "referral_sell_admin" }]);
      }
      buttons.push([{ text: t('cb2.view_stats', lang), callback_data: "referral_stats" }]);
      buttons.push([{ text: t('btn.back', lang), callback_data: "open_referral" }]);

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (error) {
      logger.error("Referral withdraw error:", error);
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('referral.withdraw_load_failed', lang));
    }
    return true;
  }

  if (data === "referral_convert_credits") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const telegramId = BigInt(userId);

      const result = await prisma.$transaction(async (tx) => {
        const sellRateStr = await PaymentSettingsService.get('referral_sell_rate');
        const SELL_RATE = sellRateStr ? parseInt(sellRateStr) : 3000;

        const availableAgg = await tx.commission.aggregate({
          where: { referrerId: telegramId, status: "available" },
          _sum: { amount: true },
        });
        const available = Number(availableAgg._sum.amount || 0);
        const creditsToAdd = Math.floor(available / SELL_RATE);

        if (creditsToAdd <= 0) return { creditsToAdd: 0, available: 0 };

        await tx.commission.updateMany({
          where: { referrerId: telegramId, status: "available" },
          data: { status: "withdrawn" },
        });
        await tx.user.update({
          where: { telegramId },
          data: { creditBalance: { increment: creditsToAdd } },
        });
        await tx.transaction.create({
          data: {
            orderId: `REF-CONV-${Date.now()}`,
            userId: telegramId,
            type: "referral_conversion",
            amountIdr: available,
            creditsAmount: creditsToAdd,
            gateway: "internal",
            status: "success",
            paymentMethod: "referral_commission",
          },
        });
        return { creditsToAdd, available };
      });

      const { creditsToAdd, available } = result;
      if (creditsToAdd <= 0) {
        const lang = ctx.session?.userLang || 'id';
        await ctx.editMessageText(t('referral.insufficient_convert', lang), {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: t('btn.back', ctx.session?.userLang || 'id'), callback_data: "referral_withdraw" }]] },
        });
        return true;
      }

      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb2.conversion_success', lang, { available: available.toLocaleString("id-ID"), credits: creditsToAdd }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('cb2.create_video_btn', lang), callback_data: "create_video_new" }],
              [{ text: t('cb2.main_menu', lang), callback_data: "main_menu" }],
            ],
          },
        },
      );
    } catch (error) {
      logger.error("Referral convert credits error:", error);
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('referral.convert_failed', lang));
    }
    return true;
  }

  if (data === "referral_sell_admin") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const telegramId = BigInt(userId);
      const availableAgg = await prisma.commission.aggregate({
        where: { referrerId: telegramId, status: "available" },
        _sum: { amount: true },
      });
      const available = Number(availableAgg._sum.amount || 0);
      const cashoutAmount = Math.floor(available / 2);

      if (cashoutAmount <= 0) {
        const lang = ctx.session?.userLang || 'id';
        await ctx.editMessageText(t('referral.insufficient_sell', lang), {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: t('btn.back', ctx.session?.userLang || 'id'), callback_data: "referral_withdraw" }]] },
        });
        return true;
      }

      await prisma.commission.updateMany({
        where: { referrerId: telegramId, status: "available" },
        data: { status: "pending_cashout" },
      });

      await prisma.transaction.create({
        data: {
          orderId: `REF-CASH-${Date.now()}`,
          userId: telegramId,
          type: "referral_cashout",
          amountIdr: cashoutAmount,
          creditsAmount: 0,
          gateway: "admin_transfer",
          status: "pending",
          paymentMethod: "admin_transfer",
        },
      });

      const adminIds = (getConfig().ADMIN_TELEGRAM_IDS || "").split(",").filter(Boolean);
      const user = await UserService.findByTelegramId(telegramId);
      const userName = user?.firstName || user?.username || String(telegramId);
      for (const adminId of adminIds) {
        try {
          await ctx.telegram.sendMessage(
            adminId.trim(),
            t('cb2.cashout_admin_notify', 'id', {
              userName,
              telegramId: String(telegramId),
              available: available.toLocaleString("id-ID"),
              cashoutAmount: cashoutAmount.toLocaleString("id-ID"),
            }),
            { parse_mode: "Markdown" },
          );
        } catch { /* admin unreachable */ }
      }

      const lang = ctx.session?.userLang || 'id';
      await ctx.editMessageText(
        t('cb2.cashout_sent', lang, {
          available: available.toLocaleString("id-ID"),
          cashoutAmount: cashoutAmount.toLocaleString("id-ID"),
        }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('cb2.view_stats', lang), callback_data: "referral_stats" }],
              [{ text: t('cb2.main_menu', lang), callback_data: "main_menu" }],
            ],
          },
        },
      );
    } catch (error) {
      logger.error("Referral sell admin error:", error);
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('referral.cashout_failed', lang));
    }
    return true;
  }

  return false;
}
