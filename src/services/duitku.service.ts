import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { ReferralService } from '@/services/referral.service';
import { SubscriptionService } from '@/services/subscription.service';
import { PlanKey, BillingCycle, getPackagesAsync, getSubscriptionPlansAsync } from '@/config/pricing';
import { AnalyticsService } from '@/services/analytics.service';
import { PaymentService } from '@/services/payment.service';
import { getConfig } from '@/config/env';

function getDuitkuBaseUrl() {
  const config = getConfig();
  return (config.DUITKU_ENVIRONMENT || 'sandbox') === 'production'
    ? 'https://passport.duitku.com'
    : 'https://sandbox.duitku.com';
}
function getMerchantCode() { return getConfig().DUITKU_MERCHANT_CODE || ''; }
function getApiKey() { return getConfig().DUITKU_API_KEY || ''; }

export interface DuitkuCreateResponse {
  merchantCode: string;
  reference: string;
  paymentUrl: string;
  vaNumber?: string;
  amount: string;
  statusCode: string;
  statusMessage: string;
}

export interface DuitkuPaymentMethod {
  paymentMethod: string;
  paymentName: string;
  paymentImage: string;
  totalFee: string;
}

export class DuitkuService {
  /** Fetch available payment methods from Duitku API for a given amount */
  static async getPaymentMethods(amount: number): Promise<DuitkuPaymentMethod[]> {
    const datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const signature = crypto.createHash('sha256')
      .update(getMerchantCode() + amount + datetime + getApiKey())
      .digest('hex');

    try {
      const response = await axios.post(
        `${getDuitkuBaseUrl()}/webapi/api/merchant/paymentmethod/getpaymentmethod`,
        {
          merchantcode: getMerchantCode(),
          amount,
          datetime,
          signature,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const methods: DuitkuPaymentMethod[] = response.data?.paymentFee || [];
      return methods.filter(m => m.paymentMethod && m.paymentName);
    } catch (error: any) {
      logger.error('Duitku getPaymentMethods error:', error.response?.data || error.message);
      return [];
    }
  }

  static async createTransaction(params: {
    userId: bigint;
    packageId: string;
    paymentMethod?: string;
    username?: string;
    email?: string;
    phone?: string;
  }): Promise<{ orderId: string; paymentUrl: string; vaNumber?: string }> {
    const packages = await getPackagesAsync();
    const pkg = packages.find(p => p.id === params.packageId);
    
    if (!pkg) {
      throw new Error('Invalid package');
    }

    const price = pkg.priceIdr || pkg.priceIdr;
    const credits = pkg.credits + (pkg.bonus || 0);

    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `OC-${Date.now()}-${params.userId}-${random}`;
    const signature = crypto.createHash('md5')
      .update(getMerchantCode() + orderId + price + getApiKey())
      .digest('hex');

    await prisma.transaction.create({
      data: {
        orderId,
        userId: params.userId,
        type: 'topup',
        packageName: params.packageId,
        amountIdr: price,
        creditsAmount: credits,
        gateway: 'duitku',
        status: 'pending',
      },
    });

    try {
      const response = await axios.post(
        `${getDuitkuBaseUrl()}/webapi/api/merchant/v2/inquiry`,
        {
          merchantCode: getMerchantCode(),
          paymentAmount: price,
          paymentMethod: params.paymentMethod || 'VC',
          merchantOrderId: orderId,
          productDetails: `${pkg.name} Package - ${credits} Credits`,
          customerVaName: params.username || 'Customer',
          email: params.email || 'customer@email.com',
          phoneNumber: params.phone || '08123456789',
          callbackUrl: `${getConfig().WEBHOOK_URL}/webhook/duitku`,
          returnUrl: `${getConfig().WEBHOOK_URL}/payment/finish`,
          signature,
          expiryPeriod: 60,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const data: DuitkuCreateResponse = response.data;
      logger.info(`Duitku transaction created: ${orderId}, ref: ${data.reference}`);

      return { orderId, paymentUrl: data.paymentUrl, vaNumber: data.vaNumber };
    } catch (error: any) {
      logger.error('Duitku API error:', error.response?.data || error.message);
      throw new Error('Failed to create payment');
    }
  }

  static async handleCallback(params: {
    merchantCode: string;
    amount: string;
    merchantOrderId: string;
    resultCode: string;
    reference: string;
    signature: string;
  }): Promise<{ success: boolean; message: string }> {
    const expectedSignature = crypto.createHash('md5')
      .update(params.merchantCode + params.amount + params.merchantOrderId + getApiKey())
      .digest('hex');

    if (params.signature !== expectedSignature) {
      logger.error('Invalid Duitku signature');
      return { success: false, message: 'Invalid signature' };
    }

    const transaction = await prisma.transaction.findUnique({
      where: { orderId: params.merchantOrderId },
    });

    if (!transaction) {
      logger.error(`Transaction not found: ${params.merchantOrderId}`);
      return { success: false, message: 'Transaction not found' };
    }

    let newStatus = transaction.status;
    if (params.resultCode === '00') newStatus = 'success';
    else if (params.resultCode === '01') newStatus = 'pending';
    else if (params.resultCode === '02') newStatus = 'refunded';
    else newStatus = 'failed';

    const updateResult = await prisma.transaction.updateMany({
      where: { orderId: params.merchantOrderId, status: { not: 'success' } },
      data: {
        status: newStatus,
        gatewayTransactionId: params.reference,
        paidAt: newStatus === 'success' ? new Date() : undefined,
      },
    });

    if (newStatus === 'success') {
      if (updateResult.count === 0) {
        // Already processed — skip credit grant
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
          params.merchantOrderId
        );
        logger.info(`Subscription activated: ${plan}/${billingCycle} for user ${transaction.userId}`);
      } else {
        const credits = Number(transaction.creditsAmount) || 0;
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

        logger.info(`Added ${credits} credits for user ${transaction.userId} (tier: ${plan?.tier || 'unchanged'})`);
      }

      await ReferralService.processCommissions(
        params.merchantOrderId,
        Number(transaction.amountIdr),
        transaction.userId
      );
    } else if (newStatus === 'refunded') {
      // Refund: reverse previously granted credits
      const refundResult = await prisma.transaction.updateMany({
        where: { orderId: params.merchantOrderId, status: 'success' },
        data: {
          status: 'refunded',
          gatewayTransactionId: params.reference,
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
          logger.info(`Duitku refund: reversed ${decrementAmount} credits for user ${transaction.userId} (order ${params.merchantOrderId})`);
        }
      } else {
        logger.warn(`Duitku refund for ${params.merchantOrderId} — transaction was not in success state, skipping credit reversal`);
      }
    } else if (newStatus === 'failed') {
      // Notify user of terminal failure
      PaymentService.sendFailureNotification(
        transaction.userId,
        params.merchantOrderId,
        'failed',
      ).catch(() => {});
    }

    if (newStatus === 'success') {
      // Track purchase event
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
          transaction_id: params.merchantOrderId,
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
          where: { orderId: params.merchantOrderId },
          data: {
            utmCampaign: user?.utmCampaign,
            utmContent: user?.utmContent,
            lpVariant: user?.lpVariant,
            daysToConversion,
          },
        });
        
        logger.info(`✅ Analytics tracked for Duitku purchase: ${params.merchantOrderId}`);
      } catch (analyticsError) {
        logger.warn(`⚠️ Analytics tracking failed (non-blocking): ${analyticsError}`);
      }
    }

    return { success: true, message: 'Callback processed' };
  }

  static async checkTransaction(orderId: string): Promise<{
    status: string;
    amount: number;
  } | null> {
    const signature = crypto.createHash('md5')
      .update(getMerchantCode() + orderId + getApiKey())
      .digest('hex');

    try {
      const response = await axios.post(
        `${getDuitkuBaseUrl()}/webapi/api/merchant/transactionStatus`,
        { merchantCode: getMerchantCode(), merchantOrderId: orderId, signature },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      return { status: data.statusCode, amount: parseInt(data.amount) };
    } catch (error) {
      logger.error('Duitku check error:', error);
      return null;
    }
  }

  static async getPackages() {
    return getPackagesAsync();
  }
}
