/**
 * Referral Command
 *
 * Handles /referral command - shows real referral data from database
 */

import { BotContext } from '@/types';
import { UserService } from '@/services/user.service';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { t } from '@/i18n/translations';

/**
 * Handle /referral command
 */
export async function referralCommand(ctx: BotContext): Promise<void> {
  const from = ctx.from;

  if (!from) {
    await ctx.reply(t('referral.load_failed', 'id'));
    return;
  }

  try {
    const telegramId = BigInt(from.id);
    const user = await UserService.findByTelegramId(telegramId);

    if (!user) {
      const rLang = ctx.session?.userLang || ctx.from?.language_code || 'id';
      await ctx.reply(t('referral.no_account', rLang));
      return;
    }

    const lang = user.language || ctx.from?.language_code || 'id';
    const stats = await UserService.getStats(telegramId);

    const referralCode = user.referralCode || 'N/A';
    const referralLink = `https://t.me/${getConfig().BOT_USERNAME || 'vilona_content_bot'}?start=ref_${referralCode}`;

    const formatRupiah = (amount: number): string => {
      return `Rp ${amount.toLocaleString('id-ID')}`;
    };

    const msg = t('referral.main_msg', lang, {
      code: referralCode,
      referralCount: stats.referralCount,
      commission: formatRupiah(stats.commissionEarned),
    });

    const markup = {
      inline_keyboard: [
        [{ text: t('referral.btn_share', lang), url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t('referral.share_text', lang))}` }],
        [{ text: t('referral.btn_withdraw', lang), callback_data: 'referral_withdraw' }],
        [{ text: t('referral.btn_stats', lang), callback_data: 'referral_stats' }],
        [{ text: t('referral.how_it_works', lang), callback_data: 'referral_explain' }],
        [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
      ],
    };

    await ctx.reply(msg, { reply_markup: markup });
  } catch (error) {
    logger.error('Error in referral command:', error);
    await ctx.reply(t('referral.load_failed', 'id'));
  }
}
