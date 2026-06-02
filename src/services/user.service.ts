/**
 * User Service
 * 
 * Handles all user-related database operations
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { t } from '@/i18n/translations';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { User, Prisma } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { secureRandomInt } from '@/utils/crypto';
import { InsufficientCreditsError, NotFoundError } from '@/utils/app-errors';

export class UserService {
  /**
   * Find user by Telegram ID
   */
  static async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  }

  /**
   * Find user by UUID
   */
  static async findByUuid(uuid: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { uuid },
    });
  }

  /**
   * Create new user
   */
  static async create(data: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    referredBy?: string;
    language?: string;
    // UTM Parameters (Full Funnel Tracking)
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    lpVariant?: string;
    // Attribution IDs
    fbc?: string;
    fbp?: string;
    ttclid?: string;
  }): Promise<User> {
    // Generate referral code
    const referralCode = await this.generateReferralCode(data.username || data.firstName);

    const user = await prisma.user.create({
      data: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        tier: 'free',
        creditBalance: 0, // Standardize on reward slot system
        welcomeBonusUsed: false,
        dailyFreeUsed: false,
        referralCode,
        referredBy: data.referredBy,
        language: data.language || 'id',
        notificationsEnabled: true,
        // UTM Parameters
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmContent: data.utmContent,
        lpVariant: data.lpVariant,
        // Attribution IDs
        fbc: data.fbc,
        fbp: data.fbp,
        ttclid: data.ttclid,
      },
    });

    logger.info(`Created new user: ${user.telegramId} (${user.username || 'no username'}) [LP: ${data.lpVariant || 'direct'}]`);
    return user;
  }

  /**
   * Update user
   */
  static async update(telegramId: bigint, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update last activity
   */
  static async updateActivity(telegramId: bigint): Promise<void> {
    await prisma.user.update({
      where: { telegramId },
      data: { lastActivityAt: new Date() },
    });
  }

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
    try {
      await prisma.$transaction(async (tx) => {
        // Atomic CAS: only succeeds if welcomeBonusUsed is currently false
        await tx.user.update({
          where: { telegramId, welcomeBonusUsed: false },
          data: {
            welcomeBonusUsed: true,
            creditBalance: { increment: new Prisma.Decimal(1) },
          },
        });
        await tx.transaction.create({
          data: {
            orderId: `WELCOME-${telegramId}-${Date.now()}`,
            userId: telegramId,
            type: 'welcome_bonus',
            packageName: 'welcome_bonus_1cr',
            amountIdr: new Prisma.Decimal(0),
            creditsAmount: 1,
            gateway: 'system',
            status: 'success',
            paidAt: new Date(),
          },
        });
      });
      return true;
    } catch (e: any) {
      if (e?.code === 'P2025') return false; // Already granted — silent no-op
      throw e;
    }
  }

  /** Optional reference to the running Telegraf bot instance for sending DMs. */
  private static botInstance: Telegraf | null = null;

  /**
   * Register the bot instance so the service can send proactive messages.
   * Call this once during startup (e.g. in index.ts after bot creation).
   */
  static setBotInstance(bot: Telegraf): void {
    this.botInstance = bot;
  }

  /**
   * Send a Telegram DM to a user. Fire-and-forget safe — never throws.
   * Returns true if the message was delivered, false otherwise.
   */
  static async sendMessage(telegramId: bigint | string, message: string, options?: { parse_mode?: 'Markdown' | 'HTML' }): Promise<boolean> {
    if (!this.botInstance) return false;
    try {
      await this.botInstance.telegram.sendMessage(telegramId.toString(), message, options);
      return true;
    } catch (err) {
      logger.warn(`Failed to send Telegram message to ${telegramId}:`, err);
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
        creditBalance: { decrement: amount },
      },
    });

    if (result.count === 0) {
      throw new InsufficientCreditsError();
    }

    // Decrement subscription credits tracking (subscription credits are used first)
    await prisma.$executeRaw`UPDATE "users" SET "subscription_credits" = GREATEST(0, "subscription_credits" - ${amount}) WHERE "telegram_id" = ${telegramId}`;

    const updated = await this.findByTelegramId(telegramId);
    if (!updated) throw new NotFoundError('User', String(telegramId));

    // Fire-and-forget low credit warning
    const remaining = Number(updated.creditBalance);
    if (remaining > 0 && remaining < 1) {
      this.sendLowCreditWarning(telegramId, remaining, updated.language || 'id').catch(err => logger.warn('Failed to send low credit warning', { error: err.message }));
    }

    return updated;
  }

  /**
   * Send a low-credit warning via Telegram DM.
   * Throttled to once per 24 hours per user via Redis.
   */
  private static async sendLowCreditWarning(
    telegramId: bigint,
    remaining: number,
    lang: string,
  ): Promise<void> {
    if (!this.botInstance) return;

    const redisKey = `low_credit_warned:${telegramId.toString()}`;
    const alreadyWarned = await redis.get(redisKey);
    if (alreadyWarned) return;

    // Set flag with 24h TTL (86400 seconds)
    await redis.set(redisKey, '1', 'EX', 86400);

    const message = t('credits.low_warning', lang, {
      remaining: remaining.toFixed(1),
    });

    await this.botInstance.telegram.sendMessage(
      telegramId.toString(),
      message,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('menu.top_up', lang), callback_data: 'topup' },
              { text: t('menu.subscribe', lang), callback_data: 'open_subscription' },
            ],
          ],
        },
      },
    );

    logger.info(`Low credit warning sent to user ${telegramId} (${remaining} remaining)`);
  }

  /**
   * Refund credits to user
   */
  static async refundCredits(telegramId: bigint, amount: number, jobId: string, _reason: string): Promise<void> {
    await prisma.$transaction([
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
  static async queueRefundRetry(telegramId: bigint, amount: number, jobId: string, reason: string): Promise<void> {
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
    const user = await this.findByTelegramId(telegramId);
    return user !== null && Number(user.creditBalance) >= amount;
  }

  /**
   * Generate unique referral code
   */
  static async generateReferralCode(name: string): Promise<string> {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const sanitizeName = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    
    const base = sanitizeName(name) || 'USER';
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const random = Array.from({ length: 4 }, () => 
        charset[secureRandomInt(charset.length)]
      ).join('');
      
      const code = `REF-${base}-${random}`;
      
      const existing = await prisma.user.findUnique({
        where: { referralCode: code },
      });
      
      if (!existing) {
        return code;
      }
    }
    
    // Fallback to UUID-based
    const random = Array.from({ length: 8 }, () => 
      charset[secureRandomInt(charset.length)]
    ).join('');
    return `REF-${random}`;
  }

  /**
   * Find user by referral code
   */
  static async findByReferralCode(code: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { referralCode: code },
    });
  }

  /**
   * Ban user
   */
  static async ban(telegramId: bigint, reason: string): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
      },
    });
  }

  /**
   * Unban user
   */
  static async unban(telegramId: bigint): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
      },
    });
  }

  /**
   * Get the number of videos the user has generated today (WIB = UTC+7).
   * Resets at midnight WIB (17:00 UTC) so Indonesian users see the correct daily quota.
   */
  static async getDailyGenerationCount(telegramId: bigint): Promise<number> {
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    nowWIB.setUTCHours(0, 0, 0, 0); // midnight in WIB time, expressed as UTC
    const startOfDay = new Date(nowWIB.getTime() - WIB_OFFSET_MS); // convert back to real UTC

    return prisma.video.count({
      where: {
        userId: telegramId,
        createdAt: { gte: startOfDay },
      },
    });
  }

  /**
   * Check whether the user is allowed to generate another video today.
   * Returns the allowed flag, remaining count, and daily limit for the tier.
   */
  static async canGenerate(telegramId: bigint): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const user = await this.findByTelegramId(telegramId);
    if (!user) {
      return { allowed: false, remaining: 0, limit: 0 };
    }

    // Daily limits per tier
    const DAILY_LIMITS: Record<string, number> = {
      free: 2,
      basic: 3,
      lite: 3,
      pro: 10,
      agency: 30,
    };

    const tier = user.tier || 'free';
    const limit = DAILY_LIMITS[tier] ?? 2;
    const used = await this.getDailyGenerationCount(telegramId);
    const remaining = Math.max(0, limit - used);

    return { allowed: remaining > 0, remaining, limit };
  }

  /**
   * Get user stats
   */
  static async getStats(telegramId: bigint): Promise<{
    videosCreated: number;
    totalSpent: number;
    referralCount: number;
    commissionEarned: number;
  }> {
    try {
      const user = await this.findByTelegramId(telegramId);
      if (!user) {
        return { videosCreated: 0, totalSpent: 0, referralCount: 0, commissionEarned: 0 };
      }

      // Run queries with individual error handling or safe defaults
      const videosCreated = await prisma.video.count({ where: { userId: telegramId } }).catch(() => 0);
      
      const transactions = await prisma.transaction.aggregate({
        where: { userId: telegramId, status: 'success' },
        _sum: { amountIdr: true },
      }).catch(() => ({ _sum: { amountIdr: 0 } }));

      const referralCount = await prisma.user.count({ 
        where: { referredBy: user.uuid } 
      }).catch(() => 0);

      const commissions = await prisma.commission.aggregate({
        where: { referrerId: telegramId },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } }));

      return {
        videosCreated,
        totalSpent: Number(transactions?._sum?.amountIdr || 0),
        referralCount,
        commissionEarned: Number(commissions?._sum?.amount || 0),
      };
    } catch (error) {
      logger.error(`Error fetching stats for user ${telegramId}:`, error);
      return { videosCreated: 0, totalSpent: 0, referralCount: 0, commissionEarned: 0 };
    }
  }

  /**
   * Expire stale credits for users whose creditExpiresAt has passed.
   * Returns the number of users whose credits were reset.
   */
  static async expireStaleCredits(telegram?: any): Promise<number> {
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
