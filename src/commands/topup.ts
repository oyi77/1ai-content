/**
 * Topup Command
 * 
 * Handles credit topup via payment gateway with dynamic pricing
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { UserService } from '@/services/user.service';
import { PaymentService } from '@/services/payment.service';
import { DuitkuService } from '@/services/duitku.service';
import { TripayService } from '@/services/tripay.service';
import { PaymentSettingsService } from '@/services/payment-settings.service';
import { SubscriptionService } from '@/services/subscription.service';
import {
  getUnitCostAsync,
  getPackagesAsync,
} from '@/config/pricing';
import { NowPaymentsService, CRYPTO_PACKAGES, CRYPTO_COINS } from '@/services/nowpayments.service';
import { prisma } from '@/config/database';
import { t } from '@/i18n/translations';

const formatIdr = (amount: number): string =>
  new Intl.NumberFormat('id-ID').format(amount);

const USD_RATE = () => getConfig().USD_TO_IDR_RATE;

/** Format price with dual currency based on user language */
function formatPrice(idr: number, lang: string): string {
  if (lang === 'id') return `Rp ${formatIdr(idr)}`;
  const usd = (idr / USD_RATE()).toFixed(2);
  if (lang === 'ru') return `$${usd} (~${formatIdr(idr)} IDR)`;
  if (lang === 'zh') return `$${usd} (≈${formatIdr(idr)} IDR)`;
  return `$${usd} (~Rp ${formatIdr(idr)})`;
}

/** Resolve user UI language from DB or Telegram lang code. */
async function getLang(ctx: BotContext): Promise<string> {
  try {
    if (ctx.from) {
      const dbUser = await UserService.findByTelegramId(BigInt(ctx.from.id));
      if (dbUser?.language) return dbUser.language;
    }
  } catch { /* fall through */ }
  return ctx.from?.language_code || 'id';
}

// Duitku globals removed - unused in this file

// Telegram Stars pricing (Moved to dynamic or kept as is if not in DB yet)
export const STARS_PACKAGES = [
  { credits: 1, stars: 15 },
  { credits: 5, stars: 70 },
  { credits: 10, stars: 130 },
  { credits: 25, stars: 300 },
] as const;

/**
 * Handle /topup command
 */
export async function topupCommand(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    const telegramId = BigInt(user.id);
    const dbUser = await UserService.findByTelegramId(telegramId);
    if (!dbUser) {
      await ctx.reply(t('sub.start_first', 'id'));
      return;
    }

    const subscribed = await SubscriptionService.isSubscribed(telegramId);

    const packages = await getPackagesAsync();

    const lang = dbUser.language || ctx.from?.language_code || 'id';

    let message =
      `💰 *Top Up Credits*\n\n` +
      `${t('profile.credits', lang)}: ${dbUser.creditBalance}\n\n`;

    if (subscribed) {
      message += `✅ *Subscriber* — priority generation\n\n`;
    } else {
      message += `_Subscribe to save up to 50%!_\n\n`;
    }

    message += '*Bulk Packages:*';

    const packageButtons = packages.map(pkg => [{
      text: `${pkg.name} — ${formatPrice(pkg.priceIdr, lang)} (${pkg.credits + (pkg.bonus || 0)} cr)`,
      callback_data: `topup_pkg_${pkg.id}`,
    }]);

    const upsellRow = !subscribed
      ? [[{ text: '💡 Subscribe for Cheaper Rates!', callback_data: 'open_subscription' }]]
      : [];

    const starsRow = [
      [{ text: '⭐ Pay with Telegram Stars', callback_data: 'topup_stars_menu' }],
      [{ text: '💎 Crypto (USDT/BNB/MATIC/TON)', callback_data: 'topup_crypto_menu' }],
    ];

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [...upsellRow, ...packageButtons, ...starsRow, [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }]],
      },
    });
  } catch (error) {
    logger.error('Error in topup command:', error);
    const lang = await getLang(ctx);
    await ctx.reply(t('error.generic', lang));
  }
}

/**
 * Handle topup package selection - ask for gateway
 */
export async function handleTopupSelection(ctx: BotContext, packageId: string): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    await ctx.answerCbQuery('...').catch(() => {});

    const enabledGateways = await PaymentSettingsService.getEnabledGateways();

    if (enabledGateways.length === 1) {
      await handlePaymentGateway(ctx, packageId, enabledGateways[0].id);
      return;
    }

    await ctx.editMessageText(
      `💰 **Select Payment Gateway**\n\n` +
      `Package: \`${packageId.toUpperCase()}\`\n` +
      `Please choose your preferred payment method:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...enabledGateways.map(gw => [{
              text: gw.name,
              callback_data: `topup_pay_${packageId}_${gw.id}`,
            }]),
            [{ text: '◀️ Back', callback_data: 'topup' }]
          ],
        },
      }
    );
  } catch (error) {
    logger.error('Error handling topup selection:', error);
    const lang = await getLang(ctx);
    try { await ctx.editMessageText(t('topup.create_failed', lang)); } catch { try { await ctx.reply(t('topup.create_failed', lang)); } catch { /* ignore */ } }
  }
}

/**
 * Handle payment gateway selection and create transaction
 */
export async function handlePaymentGateway(ctx: BotContext, packageId: string, gateway: string): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    const lang = await getLang(ctx);
    await ctx.answerCbQuery('...').catch(() => {});

    let transaction: any;
    let gatewayDisplayName = 'Payment Gateway';

    if (gateway === 'duitku') {
      // Show available payment methods first
      await showDuitkuPaymentMethods(ctx, packageId);
      return;
    } else if (gateway === 'tripay') {
      gatewayDisplayName = 'Tripay';
      const res = await TripayService.createTransaction({
        userId: BigInt(user.id),
        packageId,
        username: user.username || user.first_name,
      });
      if (!res.success) throw new Error(res.error || 'Tripay error');
      transaction = res;
    } else {
      gatewayDisplayName = 'Midtrans';
      transaction = await PaymentService.createTransaction({
        userId: BigInt(user.id),
        packageId,
        username: user.username || user.first_name,
      });
    }

    const paymentUrl = transaction.paymentUrl || transaction.redirectUrl || '';

    await ctx.editMessageText(
      t('topup.payment_ready', lang, { orderId: transaction.orderId, method: gatewayDisplayName }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('topup.btn_pay', lang),
                url: paymentUrl,
              },
            ],
            [
              {
                text: t('topup.btn_paid', lang),
                callback_data: `check_payment_${transaction.orderId}`,
              },
            ],
          ],
        },
      }
    );
  } catch (error: any) {
    logger.error('Error handling payment gateway:', error);
    try { await ctx.editMessageText(t('topup.create_failed', await getLang(ctx))); } catch { try { await ctx.reply(t('topup.create_failed', 'id')); } catch { /* ignore */ } }
  }
}

/**
 * Show Duitku available payment methods for the selected package
 */
export async function showDuitkuPaymentMethods(ctx: BotContext, packageId: string): Promise<void> {
  try {
    const lang = await getLang(ctx);
    const packages = await getPackagesAsync();
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) {
      await ctx.editMessageText(t('topup.not_found', lang));
      return;
    }

    const price = pkg.priceIdr || (pkg as Record<string, unknown>).price as number || 0;
    const methods = await DuitkuService.getPaymentMethods(price);

    if (methods.length === 0) {
      // Fallback: create with default payment method and let Duitku page handle selection
      const user = ctx.from;
      if (!user) return;
      const transaction = await DuitkuService.createTransaction({
        userId: BigInt(user.id),
        packageId,
        username: user.username || user.first_name,
      });
      const paymentUrl = transaction.paymentUrl || '';
      await ctx.editMessageText(
        t('topup.payment_ready', lang, { orderId: transaction.orderId, method: 'Duitku' }),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: t('topup.btn_pay', lang), url: paymentUrl }],
              [{ text: t('topup.btn_paid', lang), callback_data: `check_payment_${transaction.orderId}` }],
              [{ text: t('btn.back', lang), callback_data: 'topup' }],
            ],
          },
        }
      );
      return;
    }

    // Group payment methods by category
    const methodButtons = methods.map(m => [{
      text: `${m.paymentName}${m.totalFee && Number(m.totalFee) > 0 ? ` (+Rp ${formatIdr(Number(m.totalFee))})` : ''}`,
      callback_data: `duitku_method_${packageId}_${m.paymentMethod}`,
    }]);
    methodButtons.push([{ text: t('btn.back', lang), callback_data: 'topup' }]);

    await ctx.editMessageText(
      `${t('topup.select_payment_method', lang)}\n\n` +
      `${t('topup.package_label', lang)}: *${pkg.name}*\n` +
      `${t('topup.price_label', lang)}: ${formatPrice(price, lang)}\n` +
      `${t('profile.credits', lang)}: ${pkg.credits + (pkg.bonus || 0)}\n\n` +
      `${t('topup.select_method_prompt', lang)}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: methodButtons },
      }
    );
  } catch (error: any) {
    logger.error('Error showing Duitku payment methods:', error);
    try { await ctx.editMessageText(t('topup.create_failed', await getLang(ctx))); } catch { try { await ctx.reply(t('topup.create_failed', 'id')); } catch { /* ignore */ } }
  }
}

/**
 * Handle Duitku payment method selection and create transaction
 */
export async function handleDuitkuMethodSelection(ctx: BotContext, packageId: string, paymentMethod: string): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    const lang = await getLang(ctx);
    await ctx.answerCbQuery('...').catch(() => {});

    const transaction = await DuitkuService.createTransaction({
      userId: BigInt(user.id),
      packageId,
      paymentMethod,
      username: user.username || user.first_name,
    });

    const paymentUrl = transaction.paymentUrl || '';

    await ctx.editMessageText(
      t('topup.payment_ready', lang, { orderId: transaction.orderId, method: 'Duitku' }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('topup.btn_pay', lang), url: paymentUrl }],
            [{ text: t('topup.btn_paid', lang), callback_data: `check_payment_${transaction.orderId}` }],
            [{ text: t('btn.back', lang), callback_data: 'topup' }],
          ],
        },
      }
    );
  } catch (error: any) {
    logger.error('Error creating Duitku payment:', error);
    try { await ctx.editMessageText(t('topup.create_failed', await getLang(ctx))); } catch { try { await ctx.reply(t('topup.create_failed', 'id')); } catch { /* ignore */ } }
  }
}

/**
 * Check payment status
 */
export async function checkPayment(ctx: BotContext, orderId: string): Promise<void> {
  try {
    const lang = await getLang(ctx);
    await ctx.answerCbQuery('...').catch(() => {});

    // Try multiple gateways if necessary, or check DB
    const transaction = await prisma.transaction.findUnique({ where: { orderId } });
    if (!transaction) {
      await ctx.editMessageText(t('topup.not_found', lang));
      return;
    }

    if (transaction.status === 'success') {
      await ctx.editMessageText(
        t('topup.success', lang, { credits: Number(transaction.creditsAmount) }),
        { parse_mode: 'Markdown' }
      );
    } else if (transaction.status === 'pending') {
      await ctx.answerCbQuery(t('topup.pending', lang), { show_alert: true });
    } else {
      await ctx.editMessageText(t('topup.failed_status', lang, { status: transaction.status }), { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error('Error checking payment:', error);
    await ctx.answerCbQuery(t('error.generic', await getLang(ctx)));
  }
}

export async function handleTopupExtraCredit(ctx: BotContext, credits: number): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    await ctx.answerCbQuery('...').catch(() => {});

    const telegramId = BigInt(user.id);
    const dbUser = await UserService.findByTelegramId(telegramId);
    if (!dbUser) {
      await ctx.editMessageText(t('error.user_not_found', ctx.from?.language_code || 'id'));
      return;
    }
    const lang = dbUser.language || 'id';

    const unitCost = await getUnitCostAsync('VIDEO_15S');
    const _amount = credits * unitCost;

    const gateways = await PaymentSettingsService.getEnabledGateways();
    if (!gateways || gateways.length === 0) {
      await ctx.editMessageText(t('topup.no_gateway_available', lang));
      return;
    }
    const duitkuEnabled = gateways.some((g: any) => g.id === 'duitku' || g.gateway === 'duitku');
    if (!duitkuEnabled) {
      await ctx.editMessageText(t('topup.gateway_unavailable', lang));
      return;
    }

    const gatewayRes = await DuitkuService.createTransaction({
      userId: telegramId,
      packageId: `extra_${credits}`,
      username: user.username || user.first_name,
    });

    await ctx.editMessageText(
      t('topup.payment_ready', lang, { orderId: gatewayRes.orderId, method: 'Duitku' }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('topup.btn_pay', lang), url: gatewayRes.paymentUrl }],
            [{ text: t('topup.btn_paid', lang), callback_data: `check_payment_${gatewayRes.orderId}` }],
            [{ text: t('btn.back', lang), callback_data: 'topup' }]
          ],
        },
      }
    );
  } catch (error) {
    logger.error('Error creating extra credit payment:', error);
    try { await ctx.editMessageText(t('topup.create_failed', await getLang(ctx))); } catch { try { await ctx.reply(t('topup.create_failed', 'id')); } catch { /* ignore */ } }
  }
}

/**
 * Show Telegram Stars package selection menu
 */
export async function handleStarsMenu(ctx: BotContext): Promise<void> {
  try {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);

    const buttons = STARS_PACKAGES.map(pkg => [{
      text: `${pkg.credits} ${t('topup.credits_word', lang)} — ${pkg.stars} ⭐`,
      callback_data: `topup_stars_${pkg.credits}`,
    }]);

    buttons.push([{ text: t('btn.back', lang), callback_data: 'topup' }]);

    const starsList = STARS_PACKAGES.map(pkg =>
      `• ${pkg.credits} ${t('topup.credits_word', lang)} = ${pkg.stars} Stars`
    ).join('\n');

    await ctx.editMessageText(
      t('topup.stars_title', lang, { list: starsList }),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  } catch (error) {
    logger.error('Error showing stars menu:', error);
    await ctx.reply(t('error.generic', await getLang(ctx)));
  }
}

/**
 * Send Telegram Stars invoice for a specific credit package
 */
export async function handleStarsInvoice(ctx: BotContext, credits: number): Promise<void> {
  try {
    await ctx.answerCbQuery('...').catch(() => {});

    const pkg = STARS_PACKAGES.find(p => p.credits === credits);
    if (!pkg) {
      await ctx.reply(t('topup.invalid_package', await getLang(ctx)));
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) return;

    const sLang = await getLang(ctx);
    await ctx.telegram.sendInvoice(ctx.chat!.id, {
      title: 'AI Video Credits',
      description: t('topup.stars_invoice_desc', sLang, { credits: pkg.credits }),
      payload: `stars_${pkg.credits}_${userId}`,
      currency: 'XTR',
      prices: [{ label: t('topup.stars_invoice_label', sLang, { credits: pkg.credits }), amount: pkg.stars }],
      provider_token: '',
    });
  } catch (error) {
    logger.error('Error sending stars invoice:', error);
    await ctx.reply(t('topup.stars_invoice_failed', await getLang(ctx)));
  }
}

/**
 * Show crypto credit package selection menu
 */
export async function handleCryptoMenu(ctx: BotContext): Promise<void> {
  try {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);

    const buttons = CRYPTO_PACKAGES.map(pkg => [{
      text: `${pkg.credits} ${t('topup.credits_word', lang)} — $${pkg.usd.toFixed(2)}`,
      callback_data: `topup_crypto_pkg_${pkg.credits}`,
    }]);
    buttons.push([{ text: t('btn.back', lang), callback_data: 'topup' }]);

    const cryptoList = CRYPTO_PACKAGES.map(pkg =>
      `• ${pkg.credits} ${t('topup.credits_word', lang)} = $${pkg.usd.toFixed(2)} USD`
    ).join('\n');

    await ctx.editMessageText(
      t('topup.crypto_title', lang, { list: cryptoList }),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  } catch (error) {
    logger.error('Error showing crypto menu:', error);
    await ctx.reply(t('error.generic', await getLang(ctx)));
  }
}

/**
 * Show coin selector for a given credit amount
 */
export async function handleCryptoCoinSelect(ctx: BotContext, credits: number): Promise<void> {
  try {
    await ctx.answerCbQuery();

    const pkg = CRYPTO_PACKAGES.find(p => p.credits === credits);
    if (!pkg) {
      await ctx.reply(t('topup.invalid_package', await getLang(ctx)));
      return;
    }

    const buttons = CRYPTO_COINS.map(coin => [{
      text: `${coin.emoji} ${coin.label}`,
      callback_data: `topup_crypto_pay_${credits}_${coin.id}`,
    }]);
    const csLang = await getLang(ctx);
    buttons.push([{ text: t('btn.back', csLang), callback_data: 'topup_crypto_menu' }]);

    await ctx.editMessageText(
      t('topup.crypto_coin_select', csLang, { credits, usd: pkg.usd.toFixed(2) }),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  } catch (error) {
    logger.error('Error showing coin selector:', error);
    await ctx.reply(t('error.generic', await getLang(ctx)));
  }
}

/**
 * Create NOWPayments payment and show address to user
 */
export async function handleCryptoPayment(ctx: BotContext, credits: number, coin: string): Promise<void> {
  try {
    await ctx.answerCbQuery('...').catch(() => {});

    const userId = ctx.from?.id;
    if (!userId) return;

    const result = await NowPaymentsService.createPayment({
      userId: BigInt(userId),
      credits,
      coin,
    });

    const coinInfo = CRYPTO_COINS.find(c => c.id === coin);
    const coinLabel = coinInfo?.label || coin.toUpperCase();

    const cpLang = await getLang(ctx);
    await ctx.editMessageText(
      t('topup.crypto_created', cpLang, {
        payAmount: result.payAmount,
        payCurrency: result.payCurrency.toUpperCase(),
        payAddress: result.payAddress,
        coinLabel,
        credits,
        orderId: result.orderId,
      }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '◀️ Back to Top Up', callback_data: 'topup' }],
          ],
        },
      }
    );
  } catch (error) {
    logger.error('Error creating crypto payment:', error);
    try { await ctx.editMessageText(t('topup.crypto_payment_failed', await getLang(ctx))); } catch { try { await ctx.reply(t('topup.crypto_payment_failed', 'id')); } catch { /* ignore */ } }
  }
}
