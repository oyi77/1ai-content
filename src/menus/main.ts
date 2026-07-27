/**
 * Main Menu — Inline Keyboard
 *
 * All UI strings come from the i18n translation system.
 * Supports ID, EN, RU, ZH.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { UserService } from '@/services/user.service';
import { t } from '@/i18n/translations';
import type { InlineKeyboardButton } from '@telegraf/types/markup';

export async function showMainMenu(ctx: BotContext, isEdit = false): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    // Fetch real credit balance and language from DB
    let credBal = 0;
    let lang = 'en';
    try {
      const dbUser = await UserService.findByTelegramId(BigInt(user.id));
      if (dbUser) {
        credBal = Number(dbUser.creditBalance);
        lang = dbUser.language || 'en';
      }
    } catch { /* fallback */ }

    const credEmoji = credBal === 0 ? '⚠️' : credBal < 3 ? '🟡' : '🟢';

    const menuText =
      `${t('menu.hello', lang, { name: user.first_name })}\n\n` +
      `${credEmoji} ${t('menu.credits_label', lang)}: *${credBal}*\n\n` +
      `${t('menu.today_question', lang)}`;

    const rows: InlineKeyboardButton[][] = [
      [{ text: t('menu.btn_prompts', lang), callback_data: 'back_prompts' }],
      [
        { text: t('menu.btn_trending', lang), callback_data: 'prompts_trending' },
        { text: t('menu.btn_free_prompt', lang), callback_data: 'daily_open' },
      ],
      [
        { text: t('menu.btn_create_video', lang), callback_data: 'create_video_new' },
        { text: t('menu.btn_create_image', lang), callback_data: 'image_from_prompt' },
      ],
      [
        { text: t('menu.btn_clone', lang), callback_data: 'clone_video' },
        { text: t('menu.btn_storyboard', lang), callback_data: 'storyboard_create' },
        { text: t('menu.btn_viral', lang), callback_data: 'viral_research' },
      ],
      [
        { text: t('menu.top_up', lang), callback_data: 'topup' },
        { text: t('menu.subscription', lang), callback_data: 'open_subscription' },
      ],
      [
        { text: t('menu.btn_my_videos', lang), callback_data: 'videos_list' },
        { text: t('menu.btn_referral', lang), callback_data: 'open_referral' },
        { text: t('menu.btn_profile', lang), callback_data: 'open_profile' },
      ],
    ];

    const webAppUrl = getConfig().WEB_APP_URL;
    if (webAppUrl) {
      rows.push([{ text: t('menu.btn_web_dashboard', lang), web_app: { url: `${webAppUrl}/app` } }]);
    }

    const menuButtons = { inline_keyboard: rows };

    if (isEdit && ctx.callbackQuery) {
      await ctx.editMessageText(menuText, {
        parse_mode: 'Markdown',
        reply_markup: menuButtons,
      });
    } else {
      await ctx.reply(menuText, {
        parse_mode: 'Markdown',
        reply_markup: menuButtons,
      });
    }
  } catch (error) {
    logger.error('Error showing main menu:', error);
  }
}
