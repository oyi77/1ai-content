import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';

export async function cancelCommand(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) {
      await ctx.reply(t('social.unable_identify_user', 'id'));
      return;
    }

    const lang = ctx.session?.userLang || 'id';
    const state = ctx.session?.state;

    if (!state || state === 'DASHBOARD') {
      await ctx.reply(
        t('cancel.nothing_active', lang),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Menu Utama', callback_data: 'main_menu' }],
            ],
          },
        }
      );
      return;
    }

    // Reset to dashboard and clear flow-specific data
    ctx.session.state = 'DASHBOARD';
    ctx.session.videoCreation = undefined;
    ctx.session.videoCreationNew = undefined;
    delete (ctx.session as unknown as Record<string, unknown>).stateData;

    await ctx.reply(
      t('cancel.cancelled', lang),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Menu Utama', callback_data: 'main_menu' }],
          ],
        },
      }
    );

    logger.info(`User ${user.id} cancelled operation from state: ${state}`);
  } catch (error) {
    logger.error('Error in cancel command:', error);
    await ctx.reply(t('error.generic', 'id'));
  }
}
