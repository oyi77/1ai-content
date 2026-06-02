/**
 * Payment Service
 * 
 * Handles Midtrans payment gateway integration with dynamic packages
 */

import axios from 'axios';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { ReferralService } from '@/services/referral.service';
import { SubscriptionService } from '@/services/subscription.service';
import { AnalyticsService } from '@/services/analytics.service';
import { PlanKey, BillingCycle, getPackagesAsync, getSubscriptionPlansAsync } from '@/config/pricing';
import crypto from 'crypto';
import { Telegraf } from 'telegraf';
import { secureRandomString } from '@/utils/crypto';
import { t } from '@/i18n/translations';
import { getConfig } from '@/config/env';

function getMidtransBaseUrl() {
  const config = getConfig();
  return (config.MIDTRANS_ENVIRONMENT || 'sandbox') === 'production'
    ? 'https://app.midtrans.com/snap/v1'
    : 'https://app.sandbox.midtrans.com/snap/v1';
}
function getMidtransServerKey() { return getConfig().MIDTRANS_SERVER_KEY || ''; }

export class PaymentService {
  /** Optional reference to the running Telegraf bot instance for sending fulfillment notifications. */
  private static botInstance: Telegraf | null = null;

  /**
   * Register the bot instance so the service can send proactive messages.
   */
  static setBotInstance(bot: Telegraf): void {
    this.botInstance = bot;
  }

  /**
   * Retrieve the registered bot instance (used by other payment services).
   */
  static getBotInstance(): Telegraf | null {
    return this.botInstance;
  }

  /**
   * Create Midtrans Snap transaction
   */
  static async createTransaction(params: {
    userId: bigint;
    packageId: string;
    username?: string;
  }): Promise<{
    orderId: string;
    token: string;
    redirectUrl: string;
  }> {
    const packages = await getPackagesAsync();
    const pkg = packages.find(p => p.id === params.packageId);
    
    if (!pkg) {
      throw new Error('Invalid package');
    }

    const price = pkg.priceIdr || pkg.priceIdr;
    const credits = pkg.credits + (pkg.bonus || 0);

    // Generate order ID
    const timestamp = Date.now();
    const random = secureRandomString(6);
    const orderId = `OC-${timestamp}-${params.userId}-${random}`;

    // Create transaction record
    await prisma.transaction.create({
      data: {
        orderId,
        userId: params.userId,
        type: 'topup',
        packageName: params.packageId,
        amountIdr: price,
        creditsAmount: credits,
        gateway: 'midtrans',
        status: 'pending',
      },
    });

    // Call Midtrans API
    try {
      const auth = Buffer.from(`${getMidtransServerKey()}:`).toString('base64');

      const response = await axios.post(
        `${getMidtransBaseUrl()}/transactions`,
        {
          transaction_details: {
            order_id: orderId,
            gross_amount: price,
          },
          customer_details: {
            first_name: params.username || 'User',
          },
          item_details: [
            {
              id: params.packageId,
              price: price,
              quantity: 1,
              name: `${pkg.name} Package - ${credits} Credits`,
            },
          ],
          callbacks: {
            finish: `${getConfig().WEBHOOK_URL}/payment/finish`,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        }
      );

      logger.info(`Created transaction: ${orderId}`);

      return {
        orderId,
        token: response.data.token,
        redirectUrl: response.data.redirect_url,
      };
    } catch (error: any) {
      logger.error('Midtrans API error:', error.response?.data || error.message);
      throw new Error('Failed to create payment transaction');
    }
  }

  /**
   * Verify Midtrans webhook signature
   */
  static verifySignature(
    orderId: string,
    statusCode: string,
    grossAmount: string,
    signatureKey: string
  ): boolean {
    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${getMidtransServerKey()}`)
      .digest('hex');
    
    return signatureKey === expectedSignature;
  }

  /**
   * Handle Midtrans webhook notification
   */
  static async handleNotification(notification: {
    order_id: string;
    status_code: string;
    gross_amount: string;
    signature_key: string;
    transaction_status: string;
    payment_type: string;
  }): Promise<{ success: boolean; message: string }> {
    // Verify signature
    const isValid = this.verifySignature(
      notification.order_id,
      notification.status_code,
      notification.gross_amount,
      notification.signature_key
    );

    if (!isValid) {
      logger.error('Invalid webhook signature');
      return { success: false, message: 'Invalid signature' };
    }

    // Find transaction
    const transaction = await prisma.transaction.findUnique({
      where: { orderId: notification.order_id },
    });

    if (!transaction) {
      logger.error(`Transaction not found: ${notification.order_id}`);
      return { success: false, message: 'Transaction not found' };
    }

    // Update transaction status
    let newStatus = transaction.status;
    
    switch (notification.transaction_status) {
      case 'capture':
      case 'settlement':
        newStatus = 'success';
        break;
      case 'pending':
        newStatus = 'pending';
        break;
      case 'deny':
      case 'cancel':
      case 'expire':
        newStatus = 'failed';
        break;
      case 'refund':
        newStatus = 'refunded';
        break;
    }

    if (newStatus === 'success') {
      // Atomic guard: only flip to success once. Two concurrent webhooks both read
      // status=pending, but only one UPDATE WHERE status != 'success' wins (count=1).
      const updateResult = await prisma.transaction.updateMany({
        where: { orderId: notification.order_id, status: { not: 'success' } },
        data: {
          status: 'success',
          paymentMethod: notification.payment_type,
          paidAt: new Date(),
        },
      });

      if (updateResult.count === 1) {
        // This process won the race — process exactly once.
        const credits = Number(transaction.creditsAmount) || 0;

        if (transaction.type === 'subscription') {
          const parts = (transaction.packageName ?? '').split('_');
          const plan = parts[0] as PlanKey;
          const billingCycle: BillingCycle = parts[1] === 'annual' ? 'annual' : 'monthly';

          await SubscriptionService.createSubscription(
            transaction.userId,
            plan,
            billingCycle,
            notification.order_id
          );
          logger.info(`Subscription activated: ${plan}/${billingCycle} for user ${transaction.userId} via Midtrans`);
          this.sendFulfillmentNotification(transaction.userId, credits, plan).catch(err => logger.error('Fulfillment notification failed', { error: err.message }));
        } else {
          const plans = await getSubscriptionPlansAsync();
          const planConfig = plans[transaction.packageName ?? ''];
          const userUpdateData: any = { creditBalance: { increment: credits } };
          if (planConfig && planConfig.tier) {
            userUpdateData.tier = planConfig.tier;
          }

          await prisma.user.update({
            where: { telegramId: transaction.userId },
            data: userUpdateData,
          });

          await prisma.user.update({
            where: { telegramId: transaction.userId },
            data: { totalSpent: { increment: Number(transaction.amountIdr) } },
          }).catch(() => {}); // non-critical

          const tierLabel = planConfig?.tier || 'unchanged';
          logger.info(`Added ${credits} credits for user ${transaction.userId} (tier: ${tierLabel})`);
          this.sendFulfillmentNotification(transaction.userId, credits, planConfig?.tier || '').catch(err => logger.error('Fulfillment notification failed', { error: err.message }));
        }

        await ReferralService.processCommissions(
          notification.order_id,
          Number(transaction.amountIdr),
          transaction.userId
        );

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
            transaction_id: notification.order_id,
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
            where: { orderId: notification.order_id },
            data: {
              utmCampaign: user?.utmCampaign,
              utmContent: user?.utmContent,
              lpVariant: user?.lpVariant,
              daysToConversion,
            },
          });

          logger.info(`Analytics tracked for Midtrans purchase: ${notification.order_id}`);
        } catch (analyticsError) {
          logger.warn(`Analytics tracking failed for Midtrans (non-blocking): ${analyticsError}`);
        }
      } else {
        logger.warn(`Duplicate webhook for ${notification.order_id} — already processed, skipping credit addition`);
      }
    } else if (newStatus === 'refunded') {
      // Refund: reverse previously granted credits
      const refundResult = await prisma.transaction.updateMany({
        where: { orderId: notification.order_id, status: 'success' },
        data: {
          status: 'refunded',
          paymentMethod: notification.payment_type,
        },
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
          logger.info(`Refund: reversed ${decrementAmount} credits for user ${transaction.userId} (order ${notification.order_id})`);
        }
      } else {
        logger.warn(`Refund webhook for ${notification.order_id} — transaction was not in success state, skipping credit reversal`);
      }
    } else {
      // Non-success (pending, failed, expired): plain update.
      await prisma.transaction.update({
        where: { orderId: notification.order_id },
        data: {
          status: newStatus,
          paymentMethod: notification.payment_type,
        },
      });

      // Notify user on terminal failure/expiry
      if (newStatus === 'failed' || newStatus === 'expired') {
        this.sendFailureNotification(
          transaction.userId,
          notification.order_id,
          newStatus,
        ).catch(() => {});
      }
    }

    return { success: true, message: 'Notification processed' };
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(orderId: string): Promise<{
    status: string;
    amount: number;
    credits: number;
  } | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { orderId },
    });

    if (!transaction) return null;

    return {
      status: transaction.status,
      amount: Number(transaction.amountIdr),
      credits: Number(transaction.creditsAmount) || 0,
    };
  }

  /**
   * Get available packages
   */
  static async getPackages() {
    return getPackagesAsync();
  }

  /**
   * Send payment failure/expiry notification to user
   */
  static async sendFailureNotification(telegramId: bigint, orderId: string, status: 'failed' | 'expired'): Promise<void> {
    if (!this.botInstance) return;
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { language: true },
      });
      const lang = user?.language || 'id';
      const key = status === 'expired' ? 'payment.expired' : 'payment.failed';
      await this.botInstance.telegram.sendMessage(
        telegramId.toString(),
        t(key, lang, { orderId }),
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.warn(`Failed to send payment failure notification to ${telegramId}:`, err);
    }
  }

  /**
   * Send fulfillment notification to user
   */
  private static async sendFulfillmentNotification(telegramId: bigint, credits: number, tier: string): Promise<void> {
    if (!this.botInstance) return;
    try {
      const tierEmoji = tier === 'pro' ? '💎' : tier === 'agency' ? '👑' : '✨';
      await this.botInstance.telegram.sendMessage(
        telegramId.toString(),
        `✅ *Pembayaran Berhasil!*\n\n` +
        `💰 *${credits.toFixed(1)} Credits* telah ditambahkan ke akun Anda.\n` +
        `🛡️ Tier Anda sekarang: *${tierEmoji} ${tier.toUpperCase()}*\n\n` +
        `Anda sekarang bisa langsung membuat video viral! 🚀`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.warn(`Failed to send fulfillment notification to ${telegramId}:`, err);
    }
  }
}
