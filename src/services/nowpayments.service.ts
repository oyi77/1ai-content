/**
 * NOWPayments Service
 *
 * Handles crypto payment creation and webhook processing via NOWPayments API.
 * Supports USDT (BSC), BNB, MATIC, TON.
 */

import axios from 'axios';
import { prisma } from '@/config/database';
import { getSubscriptionPlansAsync } from '@/config/pricing';
import { ReferralService } from '@/services/referral.service';
import { AnalyticsService } from '@/services/analytics.service';
import { PaymentService } from '@/services/payment.service';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { secureRandomString } from '@/utils/crypto';
import { ValidationError, ApiError } from '@/types';

const BASE_URL = 'https://api.nowpayments.io/v1';

// USD pricing per credit package
// Note: NOWPayments minimum is ~$19 USD, so all packages must meet this threshold
export const CRYPTO_PACKAGES = [
  { credits: 10,  usd: 20.00 },  // ~Rp 320K — Starter crypto
  { credits: 30,  usd: 50.00 },  // ~Rp 800K — Growth crypto
  { credits: 75,  usd: 100.00 }, // ~Rp 1.6M — Scale crypto
  { credits: 200, usd: 250.00 }, // ~Rp 4M   — Enterprise crypto
] as const;

export const CRYPTO_COINS = [
  { id: 'usdtbsc', label: 'USDT (BSC)', emoji: '💵' },
  { id: 'bnbbsc', label: 'BNB (BSC)', emoji: '🔶' },
  { id: 'matic', label: 'MATIC (Polygon)', emoji: '🟣' },
  { id: 'ton', label: 'TON', emoji: '💎' },
] as const;

export interface NowPaymentResult {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expirationEstimate: string;
  orderId: string;
}

export class NowPaymentsService {
  /**
   * Create a crypto payment via NOWPayments API
   */
  static async createPayment(params: {
    userId: bigint;
    credits: number;
    coin: string;
  }): Promise<NowPaymentResult> {
    const pkg = CRYPTO_PACKAGES.find(p => p.credits === params.credits);
    if (!pkg) throw new ValidationError('Invalid credit package', { credits: params.credits });

    const validCoin = CRYPTO_COINS.find(c => c.id === params.coin);
    if (!validCoin) throw new ValidationError('Invalid coin', { coin: params.coin });

    const random = secureRandomString(6);
    const orderId = `CRYPTO-${Date.now()}-${params.userId}-${random}`;

    // Create payment on NOWPayments
    const response = await axios.post(
      `${BASE_URL}/payment`,
      {
        price_amount: pkg.usd,
        price_currency: 'usd',
        pay_currency: params.coin,
        order_id: orderId,
        order_description: `${params.credits} credits for @berkahkarya_saas_bot`,
        ipn_callback_url: `${getConfig().WEBHOOK_URL}/webhook/nowpayments`,
      },
      {
        headers: {
          'x-api-key': getConfig().NOWPAYMENTS_API_KEY || '',
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;

    // Record pending transaction in DB
    await prisma.transaction.create({
      data: {
        orderId,
        userId: params.userId,
        type: 'topup',
        packageName: `crypto_${params.credits}`,
        amountIdr: Math.round(pkg.usd * getConfig().USD_TO_IDR_RATE),
        creditsAmount: params.credits,
        gateway: 'nowpayments',
        status: 'pending',
        gatewayTransactionId: String(data.payment_id),
        metadata: {
          coin: params.coin,
          payAddress: data.pay_address,
          payAmount: data.pay_amount,
          priceUsd: pkg.usd,
        },
      },
    });

    return {
      paymentId: String(data.payment_id),
      payAddress: data.pay_address,
      payAmount: data.pay_amount,
      payCurrency: data.pay_currency,
      expirationEstimate: data.expiration_estimate_date,
      orderId,
    };
  }

  /**
   * Handle NOWPayments IPN webhook callback
   */
  static async handleWebhook(body: any): Promise<{ success: boolean; message: string }> {
    const { payment_status, order_id, payment_id } = body;

    logger.info(`NOWPayments webhook: order=${order_id} status=${payment_status} payment_id=${payment_id}`);

    if (!order_id) {
      return { success: false, message: 'Missing order_id' };
    }

    const transaction = await prisma.transaction.findUnique({
      where: { orderId: order_id },
    });

    if (!transaction) {
      logger.warn(`NOWPayments webhook: transaction not found for order ${order_id}`);
      return { success: false, message: 'Transaction not found' };
    }

    if (payment_status === 'finished' || payment_status === 'confirmed') {
      // Atomic guard: only one concurrent webhook wins this update
      const updateResult = await prisma.transaction.updateMany({
        where: { orderId: order_id, status: { not: 'success' } },
        data: {
          status: 'success',
          paidAt: new Date(),
          gatewayTransactionId: String(payment_id),
        },
      });

      if (updateResult.count === 0) {
        return { success: true, message: 'Already processed' };
      }

      if (transaction.type === 'subscription') {
        const { SubscriptionService } = await import('./subscription.service.js');
        const parts = (transaction.packageName ?? '').split('_');
        const planId = parts[0] || 'lite';
        const cycle: 'monthly' | 'annual' = parts[1] === 'annual' ? 'annual' : 'monthly';
        await SubscriptionService.createSubscription(transaction.userId, planId as 'lite' | 'pro' | 'agency', cycle, order_id);
        logger.info(`NOWPayments: subscription activated: ${planId}/${cycle} for user ${transaction.userId} (order ${order_id})`);
      } else {
        const credits = Number(transaction.creditsAmount);

        // Determine and update user tier — only change tier for subscription packages
        const plans = await getSubscriptionPlansAsync();
        const plan = plans[transaction.packageName ?? ''];
        const userUpdateData: any = { creditBalance: { increment: credits } };
        if (plan && plan.tier) {
          userUpdateData.tier = plan.tier; // Only set tier for subscription packages
        }
        await prisma.user.update({
          where: { telegramId: transaction.userId },
          data: userUpdateData,
        });

        await prisma.user.update({
          where: { telegramId: transaction.userId },
          data: { totalSpent: { increment: Number(transaction.amountIdr) } },
        }).catch(() => {}); // non-critical

        logger.info(`NOWPayments: ${credits} credits added for user ${transaction.userId} (order ${order_id})`);
      }

      // Process referral commissions using IDR amount (0 for crypto — acceptable)
      const amountIdr = Number(transaction.amountIdr) || 0;
      if (amountIdr > 0) {
        try {
          await ReferralService.processCommissions(order_id, amountIdr, transaction.userId);
        } catch (refErr) {
          logger.warn('NOWPayments: referral commission error (non-fatal):', refErr);
        }
      }

      // Track purchase analytics
      try {
        const user = await prisma.user.findUnique({
          where: { telegramId: transaction.userId },
          select: {
            username: true,
            utmSource: true,
            utmCampaign: true,
            utmContent: true,
            lpVariant: true,
            fbc: true,
            fbp: true,
            ttclid: true,
            createdAt: true,
          },
        });

        const daysToConversion = user?.createdAt
          ? Math.floor((Date.now() - user.createdAt.getTime()) / 86400000)
          : 0;

        await AnalyticsService.trackPurchase({
          user_id: transaction.userId.toString(),
          amount_idr: Number(transaction.amountIdr),
          transaction_id: order_id,
          event_source_url: `${getConfig().WEBHOOK_URL}/topup`,
          utm_source: user?.utmSource ?? undefined,
          utm_campaign: user?.utmCampaign ?? undefined,
          utm_content: user?.utmContent ?? undefined,
          lp_variant: user?.lpVariant ?? undefined,
          fbc: user?.fbc ?? undefined,
          fbp: user?.fbp ?? undefined,
          ttclid: user?.ttclid ?? undefined,
          days_to_conversion: daysToConversion,
        });

        await prisma.transaction.update({
          where: { orderId: order_id },
          data: {
            utmCampaign: user?.utmCampaign,
            utmContent: user?.utmContent,
            lpVariant: user?.lpVariant,
            daysToConversion,
          },
        });

        logger.info(`Analytics tracked for NOWPayments purchase: ${order_id}`);
      } catch (analyticsError) {
        logger.warn(`Analytics tracking failed for NOWPayments (non-blocking): ${analyticsError}`);
      }

      return { success: true, message: 'Credits added' };
    }

    if (payment_status === 'refunded') {
      // Refund: reverse previously granted credits
      const refundResult = await prisma.transaction.updateMany({
        where: { orderId: order_id, status: 'success' },
        data: { status: 'refunded' },
      });

      if (refundResult.count === 1) {
        const credits = Number(transaction.creditsAmount) || 0;
        if (credits > 0) {
          const user = await prisma.user.findUnique({
            where: { telegramId: transaction.userId },
            select: { creditBalance: true },
          });
          const currentBalance = Number(user?.creditBalance) || 0;
          const decrementAmount = Math.min(credits, currentBalance);
          if (decrementAmount > 0) {
            await prisma.user.update({
              where: { telegramId: transaction.userId },
              data: { creditBalance: { decrement: decrementAmount } },
            });
          }
          logger.info(`NOWPayments refund: reversed ${decrementAmount} credits for user ${transaction.userId} (order ${order_id})`);
        }
      } else {
        logger.warn(`NOWPayments refund for ${order_id} — transaction was not in success state, skipping credit reversal`);
      }
      return { success: true, message: 'Payment refunded' };
    }

    if (payment_status === 'failed' || payment_status === 'expired') {
      await prisma.transaction.update({
        where: { orderId: order_id },
        data: { status: 'failed' },
      });
      PaymentService.sendFailureNotification(
        transaction.userId,
        order_id,
        payment_status as 'failed' | 'expired',
      ).catch(() => {});
      return { success: true, message: `Payment ${payment_status}` };
    }

    // Other statuses (waiting, confirming, sending) — just log
    logger.info(`NOWPayments: intermediate status ${payment_status} for order ${order_id}`);
    return { success: true, message: 'Status noted' };
  }
}
