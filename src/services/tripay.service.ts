/**
 * Tripay Payment Gateway Service
 * 
 * Handles payment transactions via Tripay with dynamic packages
 */

import axios from 'axios';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { PlanKey, BillingCycle, getPackagesAsync, getSubscriptionPlansAsync } from '@/config/pricing';
import { ReferralService } from '@/services/referral.service';
import { SubscriptionService } from '@/services/subscription.service';
import { AnalyticsService } from '@/services/analytics.service';
import { PaymentService } from '@/services/payment.service';
import { getConfig } from '@/config/env';
import { secureRandomString } from '@/utils/crypto';
import { ValidationError, ApiError } from '@/types';
import crypto from 'crypto';

interface TripayCreatePaymentParams {
  userId: bigint;
  packageId: string;
  username: string;
}

interface TripayPayment {
  success: boolean;
  orderId?: string;
  paymentUrl?: string;
  reference?: string;
  error?: string;
}

export class TripayService {
  private static getHeaders() {
    const config = getConfig();
    return {
      'Authorization': `Bearer ${config.TRIPAY_API_KEY || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private static getBaseUrl() {
    const config = getConfig();
    return (config.TRIPAY_ENVIRONMENT || 'sandbox') === 'production'
      ? 'https://tripay.co.id/api/v1'
      : 'https://tripay.co.id/api-sandbox';
  }

  static async createTransaction(params: TripayCreatePaymentParams): Promise<TripayPayment> {
    try {
      const packages = await getPackagesAsync();
      const pkg = packages.find(p => p.id === params.packageId);
      
      if (!pkg) {
        throw new ValidationError('Invalid package', { packageId: params.packageId });
      }

      const price = pkg.priceIdr || pkg.priceIdr;
      const credits = pkg.credits + (pkg.bonus || 0);
      const random = secureRandomString(6);
      const orderId = `TRP-${Date.now()}-${params.userId}-${random}`;

      const payload = {
        method: 'BRIVA',
        merchant_ref: orderId,
        amount: price,
        customer_name: params.username,
        customer_email: `${params.username || 'user'}@telegram.local`,
        customer_phone: '0000000000',
        order_items: [
          {
            name: pkg.name,
            price: price,
            quantity: 1,
          },
        ],
        callback_url: `${getConfig().WEBHOOK_URL}/webhook/tripay`,
        return_url: `${getConfig().WEBHOOK_URL}/payment/finish`,
        expired_time: Math.floor(Date.now() / 1000) + (24 * 3600), // 24 hours
        signature: this.generateSignature(orderId, price),
      };

      const response = await axios.post(`${this.getBaseUrl()}/transaction/create`, payload, {
        headers: this.getHeaders(),
      });

      const data = response.data;
      
      if (data.success) {
        await prisma.transaction.create({
          data: {
            orderId: orderId,
            userId: params.userId,
            type: 'topup',
            packageName: params.packageId,
            amountIdr: price,
            creditsAmount: credits,
            gateway: 'tripay',
            gatewayTransactionId: data.data.reference,
            paymentMethod: data.data.method,
            status: 'pending',
          },
        });

        return {
          success: true,
          orderId: orderId,
          paymentUrl: data.data.checkout_url,
          reference: data.data.reference,
        };
      }

      return {
        success: false,
        error: data.message || 'Failed to create payment',
      };
    } catch (error: any) {
      logger.error('Tripay create transaction error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  static async handleCallback(callbackData: any): Promise<{ success: boolean; message: string }> {
    try {
      const { merchant_ref, status } = callbackData;
      
      const transaction = await prisma.transaction.findUnique({
        where: { orderId: merchant_ref },
      });

      if (!transaction) {
        return { success: false, message: 'Transaction not found' };
      }

      let newStatus = 'pending';
      if (status === 'PAID') {
        newStatus = 'success';
      } else if (status === 'EXPIRED') {
        newStatus = 'expired';
      } else if (status === 'FAILED') {
        newStatus = 'failed';
      } else if (status === 'REFUND') {
        newStatus = 'refunded';
      }

      const updateResult = await prisma.transaction.updateMany({
        where: { orderId: transaction.orderId, status: { not: 'success' } },
        data: {
          status: newStatus,
          paidAt: newStatus === 'success' ? new Date() : undefined,
        },
      });

      if (newStatus === 'success') {
        if (updateResult.count === 0) {
          // Already processed or status is already success — skip credit grant
          return { success: true, message: 'Already processed' };
        }

        if (transaction.type === 'subscription') {
          const parts = (transaction.packageName ?? '').split('_');
          const plan = parts[0] as PlanKey;
          const billingCycle: BillingCycle = parts[1] === 'annual' ? 'annual' : 'monthly';

          await SubscriptionService.createSubscription(
            transaction.userId,
            plan,
            billingCycle,
            merchant_ref
          );
          logger.info(`Subscription activated: ${plan}/${billingCycle} for user ${transaction.userId} via Tripay`);
        } else {
          const credits = Number(transaction.creditsAmount) || 0;
          const plans = await getSubscriptionPlansAsync();
          const plan = plans[transaction.packageName ?? ''];
          const userUpdateData: any = { creditBalance: { increment: credits } };
          if (plan && plan.tier) {
            userUpdateData.tier = plan.tier;
          }
          await prisma.user.update({
            where: { telegramId: transaction.userId },
            data: userUpdateData,
          });

          await prisma.user.update({
            where: { telegramId: transaction.userId },
            data: { totalSpent: { increment: Number(transaction.amountIdr) } },
          }).catch(() => {}); // non-critical

          logger.info(`Added ${credits} credits to user ${transaction.userId} via Tripay (tier: ${plan?.tier || 'unchanged'})`);
        }

        // Process referral commissions (same as Duitku/Midtrans)
        await ReferralService.processCommissions(
          merchant_ref,
          Number(transaction.amountIdr),
          transaction.userId
        ).catch(err => logger.warn('Tripay referral commission failed (non-blocking):', err));

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
            transaction_id: merchant_ref,
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
            where: { orderId: merchant_ref },
            data: {
              utmCampaign: user?.utmCampaign,
              utmContent: user?.utmContent,
              lpVariant: user?.lpVariant,
              daysToConversion,
            },
          });

          logger.info(`Analytics tracked for Tripay purchase: ${merchant_ref}`);
        } catch (analyticsError) {
          logger.warn(`Analytics tracking failed for Tripay (non-blocking): ${analyticsError}`);
        }
      } else if (newStatus === 'refunded') {
        // Refund: reverse previously granted credits
        const refundResult = await prisma.transaction.updateMany({
          where: { orderId: merchant_ref, status: 'success' },
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
            logger.info(`Tripay refund: reversed ${decrementAmount} credits for user ${transaction.userId} (order ${merchant_ref})`);
          }
        } else {
          logger.warn(`Tripay refund for ${merchant_ref} — transaction was not in success state, skipping credit reversal`);
        }
      } else if (newStatus === 'failed' || newStatus === 'expired') {
        // Notify user of terminal failure/expiry
        PaymentService.sendFailureNotification(
          transaction.userId,
          merchant_ref,
          newStatus as 'failed' | 'expired',
        ).catch(() => {});
      }

      return { success: true, message: 'Callback processed' };
    } catch (error: any) {
      logger.error('Tripay callback error:', error);
      return { success: false, message: error.message };
    }
  }

  static async checkTransaction(reference: string): Promise<any> {
    try {
      const response = await axios.get(`${this.getBaseUrl()}/transaction/detail`, {
        headers: this.getHeaders(),
        params: { reference },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Tripay check transaction error:', error);
      return null;
    }
  }

  private static generateSignature(merchantRef: string, amount: number): string {
    const config = getConfig();
    return crypto
      .createHmac('sha256', config.TRIPAY_PRIVATE_KEY || '')
      .update((config.TRIPAY_MERCHANT_CODE || '') + merchantRef + amount)
      .digest('hex');
  }

  static async getPackages() {
    return getPackagesAsync();
  }
}
