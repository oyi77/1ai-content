import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { Subscription, Prisma } from '@prisma/client';
import { getSubscriptionPlansAsync, PlanKey, BillingCycle } from '@/config/pricing';
import { Telegraf } from 'telegraf';
import { t } from '@/i18n/translations';
import { NotFoundError } from '@/utils/app-errors';

export class SubscriptionService {
  /** Optional reference to the running Telegraf bot instance for sending proactive messages. */
  private static botInstance: Telegraf | null = null;

  /**
   * Register the bot instance so the service can send proactive messages.
   * Call this once during startup (e.g. in index.ts after bot creation).
   */
  static setBotInstance(bot: Telegraf): void {
    this.botInstance = bot;
  }

  static async createSubscription(
    telegramId: bigint,
    plan: PlanKey,
    billingCycle: BillingCycle,
    _transactionId: string
  ): Promise<Subscription> {
    const plans = await getSubscriptionPlansAsync();
    const planConfig = plans[plan];
    
    if (!planConfig) {
      throw new NotFoundError('Plan configuration', plan);
    }

    const now = new Date();
    const periodEnd = new Date(now);

    if (billingCycle === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await prisma.subscription.updateMany({
      where: { userId: telegramId, status: 'active' },
      data: { status: 'cancelled', cancelledAt: now },
    });

    const subscription = await prisma.subscription.create({
      data: {
        userId: telegramId,
        plan,
        billingCycle,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    const creditsToGrant = billingCycle === 'annual'
      ? (planConfig.monthlyCredits || 0) * 12
      : (planConfig.monthlyCredits || 0);

    await prisma.user.update({
      where: { telegramId },
      data: {
        tier: planConfig.tier || (plan as string === 'pro' ? 'pro' : (plan as string === 'agency' ? 'agency' : 'basic')),
        creditBalance: { increment: creditsToGrant },
        creditExpiresAt: periodEnd,
      },
    });
    // Track subscription credits separately (field added in migration, available after prisma generate)
    await prisma.$executeRaw`UPDATE "users" SET "subscription_credits" = "subscription_credits" + ${creditsToGrant} WHERE "telegram_id" = ${telegramId}`;

    logger.info(`Subscription created: ${plan}/${billingCycle} for user ${telegramId}`);
    return subscription;
  }

  static async cancelSubscription(telegramId: bigint): Promise<void> {
    await prisma.subscription.updateMany({
      where: { userId: telegramId, status: 'active' },
      data: { cancelAtPeriodEnd: true },
    });
    logger.info(`Subscription cancellation scheduled for user ${telegramId}`);
  }

  /**
   * Renew subscription after payment confirmation.
   * Called ONLY from payment webhook handlers — never from auto-renewal cron.
   */
  static async renewSubscription(subscriptionId: bigint): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.status !== 'active') return;

    const plan = sub.plan as PlanKey;
    const plans = await getSubscriptionPlansAsync();
    const planConfig = plans[plan];
    if (!planConfig) return;

    const newStart = new Date(sub.currentPeriodEnd);
    const newEnd = new Date(newStart);
    if (sub.billingCycle === 'annual') {
      newEnd.setFullYear(newEnd.getFullYear() + 1);
    } else {
      newEnd.setMonth(newEnd.getMonth() + 1);
    }

    const creditsToGrant = sub.billingCycle === 'annual'
      ? (planConfig.monthlyCredits || 0) * 12
      : (planConfig.monthlyCredits || 0);

    await prisma.$transaction(async (tx) => {
      // Read current balance for rollover calculation
      const currentUser = await tx.user.findUnique({
        where: { telegramId: sub.userId },
        select: { creditBalance: true, subscriptionCredits: true },
      });

      // Rollover: integer math on UNUSED subscription credits
      const subCredits = currentUser?.subscriptionCredits ?? 0;
      const balance = Number(currentUser?.creditBalance ?? 0);
      const unusedSub = Math.min(subCredits, balance);
      const rollover = Math.floor(Math.min(unusedSub, planConfig.monthlyCredits || 0) * 0.2);

      // Update subscription period and status
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
          cancelAtPeriodEnd: false,
        },
      });

      // Grant new credits + rollover
      await tx.user.update({
        where: { telegramId: sub.userId },
        data: {
          creditBalance: { increment: new Prisma.Decimal(creditsToGrant + rollover) },
          subscriptionCredits: creditsToGrant,
          creditExpiresAt: newEnd,
        },
      });

      // Log rollover as Transaction audit trail
      if (rollover > 0) {
        await tx.transaction.create({
          data: {
            orderId: `ROLLOVER-${sub.userId}-${newEnd.getTime()}`,
            userId: sub.userId,
            type: 'credit_rollover',
            packageName: `rollover_${rollover}cr`,
            amountIdr: new Prisma.Decimal(0),
            creditsAmount: rollover,
            gateway: 'system',
            status: 'success',
            paidAt: new Date(),
          },
        });
      }
    });

    logger.info(`Subscription renewed: ${plan}/${sub.billingCycle} for user ${sub.userId} (+${creditsToGrant} credits, rollover calculated)`);
  }

  static async getActiveSubscription(telegramId: bigint): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId: telegramId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async isSubscribed(telegramId: bigint): Promise<boolean> {
    const sub = await this.getActiveSubscription(telegramId);
    return sub !== null && new Date(sub.currentPeriodEnd) > new Date();
  }

  static async checkExpiredSubscriptions(): Promise<number> {
    const now = new Date();

    const expiredCancelled = await prisma.subscription.findMany({
      where: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
      },
    });

    for (const sub of expiredCancelled) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' },
      });
      // Only remove subscription-granted credits, preserve purchased credits
      const user = await prisma.user.findUnique({
        where: { telegramId: sub.userId },
        select: { id: true, creditBalance: true, subscriptionCredits: true },
      });
      const subCredits = Math.min(Number(user?.subscriptionCredits || 0), Number(user?.creditBalance || 0));
      await prisma.user.update({
        where: { telegramId: sub.userId },
        data: {
          creditBalance: { decrement: subCredits },
          tier: 'free',
          creditExpiresAt: null,
        },
      });
      await prisma.$executeRaw`UPDATE "users" SET "subscription_credits" = 0 WHERE "telegram_id" = ${sub.userId}`;
      logger.info(`Subscription expired for user ${sub.userId} (removed ${subCredits} sub credits, preserved purchased)`);
    }

    // Subscriptions that expired without cancelAtPeriodEnd: attempt auto-renewal if enabled,
    // otherwise expire and notify user to re-subscribe manually.
    const dueForRenewal = await prisma.subscription.findMany({
      where: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: now },
      },
    });

    for (const sub of dueForRenewal) {
      try {
        const user = await prisma.user.findUnique({
          where: { telegramId: sub.userId },
          select: { telegramId: true, autoRenewal: true, creditBalance: true, language: true },
        });

        if (user?.autoRenewal === true) {
          // Don't deduct credits — send renewal prompt instead
          try {
            const { Telegraf } = await import('telegraf');
            const telegram = new Telegraf(process.env.BOT_TOKEN!).telegram;
            const lang = user.language || 'id';
            await telegram.sendMessage(
              user.telegramId.toString(),
              t('subscription.renewal_prompt', lang, { plan: sub.plan }),
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: t('subscription.btn_renew', lang), callback_data: `subscribe_${sub.plan}_monthly` }],
                    [{ text: t('subscription.btn_skip', lang), callback_data: 'main_menu' }],
                  ],
                },
              }
            );
          } catch (err) { logger.debug("Subscription: notification failed:", err); }
        } else {
          // No auto-renewal: expire and notify user to re-subscribe manually.
          // Credits are NOT auto-granted — that would be giving away free credits.
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });
          await prisma.user.update({
            where: { telegramId: sub.userId },
            data: { tier: 'free', creditExpiresAt: null },
          });
          logger.info(`Subscription expired (renewal needed): ${sub.plan} for user ${sub.userId}`);
        }
      } catch (err) {
        logger.error(`Failed to process renewal for sub ${sub.id} (user ${sub.userId}):`, err);
      }
    }


    logger.info(`Processed ${expiredCancelled.length} cancelled + ${dueForRenewal.length} expired subscriptions`);
    return expiredCancelled.length + dueForRenewal.length;
  }

  static async getDailyGenerationCount(telegramId: bigint): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.video.count({
      where: {
        userId: telegramId,
        createdAt: { gte: today },
      },
    });
  }

  static async canGenerate(telegramId: bigint): Promise<{ allowed: boolean; reason?: string }> {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return { allowed: false, reason: 'User not found' };

    const sub = await this.getActiveSubscription(telegramId);
    if (!sub) {
      if (Number(user.creditBalance) <= 0) {
        return { allowed: false, reason: 'No credits. Use /topup to purchase.' };
      }
      return { allowed: true };
    }

    const plan = sub.plan as PlanKey;
    const plans = await getSubscriptionPlansAsync();
    const planConfig = plans[plan];
    if (!planConfig) return { allowed: true };

    const dailyCount = await this.getDailyGenerationCount(telegramId);
    const dailyLimit = planConfig.dailyGenerationLimit || 10;

    if (dailyCount >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit reached (${dailyLimit}/${planConfig.name} plan). Try again tomorrow or upgrade.`,
      };
    }

    if (Number(user.creditBalance) <= 0) {
      return { allowed: false, reason: 'No credits remaining. Use /topup for extra credits.' };
    }

    return { allowed: true };
  }
}
