/**
 * User Credits Service
 *
 * Credit/balance management and refund processing
 */
import { Telegram } from 'telegraf';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { t } from '@/i18n/translations';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { User, Prisma } from '@prisma/client';
import { InsufficientCreditsError, NotFoundError } from '@/utils/app-errors';
import { UserTelegramService } from './user-telegram.service';
import { UserCrudService } from './user-crud.service';

export class UserCreditsService {
  /**
   * Add credits to user
   */
  static async addCredits(telegramId: bigint, amount: number): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: {
        creditBalance: {
          increment: amount,
        },
      },
    });
  }

  /**
   * Grant credits to user (alias for addCredits)
   */
  static async grantCredits(userId: bigint, amount: number, reason: string): Promise<User> {
    // Log the grant reason for audit purposes
    logger.info(`Granting ${amount} credits to user ${userId}. Reason: ${reason}`);
    // Add the credits
    return this.addCredits(userId, amount);
  }

  /**
   * Grant welcome bonus (1 credit) to a new user.
   * Idempotent — returns false if the bonus was already granted (P2025).
   */
  static async grantWelcomeBonus(telegramId: bigint): Promise<boolean> {
    const bonus = 1; // 1 credit
    try {
      // Atomically update: if welcomeBonusUsed is false, set it to true AND add credits
      const tx = await prisma.$transaction(async (tx) => {
        // Check if already used
        const user = await tx.user.findUnique({
          where: { telegramId },
          select: { welcomeBonusUsed: true },
        });
        if (!user) throw new NotFoundError('User', telegramId.toString());
        if (user.welcomeBonusUsed) return false; // Already granted

        // Grant the bonus
        await tx.user.update({
          where: { telegramId, welcomeBonusUsed: false },
          data: {
            welcomeBonusUsed: true,
            creditBalance: {
              increment: bonus,
            },
          },
        });
        return true;
      });
      if (tx) {
        logger.info(`Welcome bonus granted to user ${telegramId} (+${bonus} credits)`);
      }
      return tx;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      logger.warn(`Failed to grant welcome bonus to ${telegramId}:`, err);
      return false;
    }
  }

  /**
   * Deduct credits from user
   */
  static async deductCredits(telegramId: bigint, amount: number): Promise<User> {
    // Atomic conditional decrement — prevents TOCTOU race condition.
    // The WHERE clause and UPDATE execute as a single SQL statement, so two
    // concurrent requests cannot both pass the balance check.
    const result = await prisma.user.updateMany({
      where: {
        telegramId,
        creditBalance: { gte: amount },
      },
      data: {
        creditBalance: {
          decrement: amount,
        },
      },
    });

    if (result.count === 0) {
      const user = await UserCrudService.findByTelegramId(telegramId);
      throw new InsufficientCreditsError();
    }

    const updated = await UserCrudService.findByTelegramId(telegramId);
    if (!updated) throw new NotFoundError('User', String(telegramId));

    const remaining = Number(updated.creditBalance);
    // Fire-and-forget low credit warning
    if (remaining < 5) {
      UserCreditsService.sendLowCreditWarning(telegramId, remaining, updated.language || 'id').catch(err => logger.warn('Failed to send low credit warning', { error: err.message }));
    }

    return updated;
  }

  /**
   * Send a low-credit warning via Telegram DM.
   * @private (only used by deductCredits)
   */
  private static async sendLowCreditWarning(
    telegramId: bigint,
    remaining: number,
    lang: string,
  ): Promise<void> {
    const redisKey = `low_credit_warned:${telegramId.toString()}`;
    const existingWarning = await redis.get(redisKey);
    if (existingWarning) return; // Already warned in last 24h
    const message = t('credits.low_warning', lang);
    const sent = await UserTelegramService.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
    if (!sent) return; // Message not sent; don't mark as warned

    // Mark as warned for 24 hours (prevent spam)
    await redis.setex(redisKey, 24 * 3600, '1');
    logger.info(`Low credit warning sent to user ${telegramId} (${remaining} remaining)`);
  }

  /**
   * Refund credits to user (idempotent, uses job ID to prevent duplicates)
   */
  static async refundCredits(
    telegramId: bigint,
    amount: number,
    jobId: string,
    _reason: string,
  ): Promise<void> {
    const tx = await prisma.$transaction([
      prisma.user.update({
        where: { telegramId },
        data: { creditBalance: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          orderId: `REFUND-${jobId}`,
          userId: telegramId,
          type: 'refund',
          packageName: 'refund',
          amountIdr: 0,
          creditsAmount: amount,
          gateway: 'system',
          status: 'success',
        },
      }),
    ]);
  }

  /**
   * Queue a failed refund for background retry
   */
  static async queueRefundRetry(
    telegramId: bigint,
    amount: number,
    jobId: string,
    reason: string,
  ): Promise<void> {
    const entry = JSON.stringify({ telegramId: telegramId.toString(), amount, jobId, reason, attempts: 0, createdAt: Date.now() });
    await redis.lpush('refund_retry', entry).catch(err => logger.error('Failed to queue refund retry', { error: err.message }));
    logger.warn(`Refund queued for retry: ${jobId} (${amount} credits for user ${telegramId})`);
  }

  /**
   * Process pending refund retries (call from background cron)
   */
  static async processRefundRetries(): Promise<number> {
    let processed = 0;
    const maxBatch = 20;

    for (let i = 0; i < maxBatch; i++) {
      const raw = await redis.rpop('refund_retry');
      if (!raw) break;

      try {
        const entry = JSON.parse(raw);
        const telegramId = BigInt(entry.telegramId);
        await this.refundCredits(telegramId, entry.amount, entry.jobId, `retry: ${entry.reason}`);
        logger.info(`Refund retry succeeded: ${entry.jobId} (${entry.amount} credits for user ${entry.telegramId})`);
        processed++;
      } catch (err) {
        // Re-queue if still failing (max 5 attempts)
        try {
          const entry = JSON.parse(raw);
          entry.attempts = (entry.attempts || 0) + 1;
          if (entry.attempts < 5) {
            await redis.lpush('refund_retry', JSON.stringify(entry));
            logger.warn(`Refund retry failed (attempt ${entry.attempts}/5), re-queued: ${entry.jobId}`);
          } else {
            logger.error(`CRITICAL: Refund permanently failed after 5 attempts: ${raw}`, err);
            sendAdminAlert('critical', 'Refund Permanently Failed', { entry: raw, error: String(err) });
          }
        } catch (err) { logger.debug("Parse failed, entry lost:", err); }
      }
    }
    return processed;
  }

  /**
   * Check if user has enough credits
   */
  static async hasEnoughCredits(telegramId: bigint, amount: number): Promise<boolean> {
    const user = await UserCrudService.findByTelegramId(telegramId);
    return user !== null && Number(user.creditBalance) >= amount;
  }

  /**
   * Expire stale credits for users with creditExpiresAt in the past.
   * Preserves purchased credits, zeros out subscription credits.
   * Notifies users via Telegram.
   */
  static async expireStaleCredits(telegram?: Telegram): Promise<number> {
    const now = new Date();
    const expired = await prisma.user.findMany({
      where: {
        creditExpiresAt: { lt: now },
        creditBalance: { gt: 0 },
      },
      select: { id: true, telegramId: true, creditBalance: true, subscriptionCredits: true },
    });

    if (expired.length === 0) return 0;

    // Preserve purchased credits (creditBalance - subscriptionCredits); zero out only sub credits
    for (const user of expired) {
      const purchased = Math.max(0, Number(user.creditBalance) - (user.subscriptionCredits ?? 0));
      await prisma.user.update({
        where: { id: user.id },
        data: {
          creditBalance: new Prisma.Decimal(purchased),
          subscriptionCredits: 0,
        },
      });
    }

    // Notify affected users via Telegram (best-effort, non-blocking)
    if (telegram) {
      for (const u of expired) {
        try {
          await telegram.sendMessage(
            u.telegramId.toString(),
            `⏰ *Kredit Kadaluarsa*\n\n` +
            `Kredit kamu sebesar *${Number(u.creditBalance)} kredit* telah kadaluarsa.\n\n` +
            `Gunakan /topup untuk mengisi ulang kredit.`,
            { parse_mode: 'Markdown' },
          );
        } catch (_) {
          // User may have blocked the bot — ignore
        }
      }
    }

    logger.info(`Credit expiry: reset balance for ${expired.length} user(s)`);
    return expired.length;
  }
}
