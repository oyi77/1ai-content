/**
 * Handlers Module
 *
 * Registers all event handlers
 */

import { Telegraf } from 'telegraf';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { UserService } from '@/services/user.service';
import { prisma } from '@/config/database';
import { t } from '@/i18n/translations';
import { STARS_PACKAGES } from '@/commands/topup';

// Import handlers
import { messageHandler } from './message';
import { callbackHandler } from './callback';
import { errorHandler } from './error';

/**
 * Setup all event handlers
 */
export function setupHandlers(bot: Telegraf<BotContext>): void {
  logger.info('Registering event handlers...');

  // Telegram Stars: answer pre-checkout query
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const query = ctx.preCheckoutQuery;
      const payload = query.invoice_payload;
      // Validate: must match "stars_{credits}_{userId}" pattern and credits must be a known package
      const match = /^stars_(\d+)_(\d+)$/.exec(payload);
      const valid = !!match && STARS_PACKAGES.some(p => p.credits === parseInt(match[1], 10));
      await ctx.answerPreCheckoutQuery(valid, valid ? undefined : 'Invalid payment payload');
    } catch (error) {
      logger.error('Error answering pre_checkout_query:', error);
      try { await ctx.answerPreCheckoutQuery(false, 'Internal error'); } catch {}
    }
  });

  // Telegram Stars: handle successful payment
  bot.on('successful_payment', async (ctx) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Telegram payment message
      const payment = (ctx.message as any).successful_payment;
      if (!payment) return;

      const payload = payment.invoice_payload as string;
      const payloadMatch = /^stars_(\d+)_(\d+)$/.exec(payload);
      if (!payloadMatch) return;

      const credits = parseInt(payloadMatch[1], 10);
      const userId = BigInt(payloadMatch[2]);

      const pkg = STARS_PACKAGES.find(p => p.credits === credits);
      if (!pkg) {
        logger.error(`Stars payment: invalid credits ${credits} in payload ${payload}`);
        return;
      }

      // Record transaction
      const orderId = `STARS-${payment.telegram_payment_charge_id}`;
      try {
        await prisma.transaction.create({
          data: {
            orderId,
            userId,
            type: 'topup',
            packageName: `stars_${credits}`,
            amountIdr: 0,
            creditsAmount: credits,
            gateway: 'stars',
            status: 'success',
            gatewayTransactionId: payment.telegram_payment_charge_id || null,
            paidAt: new Date(),
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          const target: string[] = e?.meta?.target ?? [];
          const isDuplicate = target.includes('order_id') || target.includes('gateway_transaction_id');
          if (!isDuplicate) throw e;
          logger.warn(`Stars duplicate payment ignored: ${payment.telegram_payment_charge_id}`);
          return; // Already processed — do NOT re-grant credits
        }
        throw e;
      }
      // Only grant credits AFTER successful transaction write:
      await UserService.addCredits(userId, credits);

      logger.info(`Stars payment success: ${credits} credits for user ${userId}`);

      await ctx.reply(
        `✅ *Payment Successful!*\n\n` +
        `${credits} credit${credits > 1 ? 's' : ''} added to your account.\n` +
        `Paid: ${pkg.stars} ⭐ Telegram Stars\n\n` +
        `Thank you for your purchase! 🎉`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error handling successful_payment:', error);
      await ctx.reply(t('error.generic', ctx.session?.userLang || 'id'));
    }
  });

  // Message handler
  bot.on('message', messageHandler);

  // Callback query handler
  bot.on('callback_query', callbackHandler);

  // Error handler
  bot.catch(errorHandler);

  logger.info('Event handlers registered successfully');
}
