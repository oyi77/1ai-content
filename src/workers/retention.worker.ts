/**
 * Retention Worker
 *
 * Automated trigger system for 5 user types:
 * - Type 1: Deposit but no use
 * - Type 2: Used free trial, no deposit
 * - Type 3: Used once, stopped
 * - Type 4: Active but no referral
 * - Type 5: Churned (30+ days inactive)
 *
 * Anti-spam rules enforced per Master Doc v3.0 Part 8.6
 */

import { Worker, Job, Queue } from 'bullmq';
import { bullmqRedis } from '@/config/redis';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';
import { AdminConfigService } from '@/services/admin-config.service';
import type { Telegram } from 'telegraf';

export const retentionQueue = new Queue('retention', { connection: bullmqRedis });

// ── Scheduler ────────────────────────────────────────────────────────────────

export class RetentionScheduler {

  /**
   * Run all retention checks
   * Call this every hour via cron
   */
  static async runAllChecks(bot: { telegram: Telegram }): Promise<void> {
    const now = new Date();
    const wibHour = (now.getUTCHours() + 7) % 24;

    const retConfig = await AdminConfigService.getRetentionConfig();

    // Only send messages during allowed hours
    if (wibHour < retConfig.sendHourStart || wibHour >= retConfig.sendHourEnd) {
      logger.info('[retention] Outside send window, skipping');
      return;
    }

    await Promise.allSettled([
      this.checkType1DepositNoUse(bot),
      this.checkType2FreeNoDeposit(bot),
      this.checkType3UsedOnce(bot),
      this.checkType4ActiveNoAffiliate(bot),
      this.checkType5Churned(bot),
      this.checkType6SubscriptionExpiring(bot),
      this.checkType7VideoExpiry(bot),
    ]);
  }

  /**
   * Type 6: Subscription expiring in 1 or 3 days
   */
  static async checkType6SubscriptionExpiring(bot: { telegram: Telegram }): Promise<void> {
    const now = new Date();
    const triggers = [
      { daysAhead: 3, msgKey: 'retention.sub_expiring_3d' as const },
      { daysAhead: 1, msgKey: 'retention.sub_expiring_1d' as const },
    ];

    for (const trigger of triggers) {
      const targetDate = new Date(now.getTime() + trigger.daysAhead * 24 * 60 * 60 * 1000);
      const targetStart = new Date(targetDate);
      targetStart.setHours(0, 0, 0, 0);
      const targetEnd = new Date(targetDate);
      targetEnd.setHours(23, 59, 59, 999);

      const subs = await prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: { gte: targetStart, lte: targetEnd },
        },
        include: { user: { select: { id: true, telegramId: true, firstName: true, notificationsEnabled: true, language: true } } },
        take: 50,
      });

      for (const sub of subs) {
        if (!sub.user?.notificationsEnabled) continue;
        if (await this.canSend(sub.user.telegramId, 'subscription')) {
          const lang = sub.user.language || 'id';
          await this.sendMessage(bot, sub.user.telegramId, t(trigger.msgKey, lang, { name: sub.user.firstName }), lang);
          await this.logSent(sub.user.telegramId, 'subscription');
        }
      }
    }
  }

  /**
   * Type 1: Deposited but never generated
   */
  static async checkType1DepositNoUse(bot: { telegram: Telegram }): Promise<void> {
    const type1Hours = await AdminConfigService.get<number[]>('retention', 'type1_trigger_hours', [2, 24, 72, 168]);
    const msgKeys: Record<number, string> = {
      2: 'retention.deposit_2h',
      24: 'retention.deposit_24h',
      72: 'retention.deposit_72h',
      168: 'retention.deposit_7d',
    };

    for (const hoursAgo of type1Hours) {
      const msgKey = msgKeys[hoursAgo] ?? 'retention.deposit_24h';
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      const cutoffPrev = new Date(Date.now() - (hoursAgo + 1) * 60 * 60 * 1000);

      const users = await prisma.user.findMany({
        where: {
          creditBalance: { gt: 0 },
          videos: { none: {} },
          notificationsEnabled: true,
          isBanned: false,
          createdAt: { gte: cutoffPrev, lt: cutoff },
        },
        take: 50,
      });

      for (const user of users) {
        if (await this.canSend(user.telegramId, 'deposit')) {
          const lang = user.language || 'id';
          await this.sendMessage(bot, user.telegramId, t(msgKey, lang, { name: user.firstName }), lang);
          await this.logSent(user.telegramId, 'deposit');
        }
      }
    }
  }

  /**
   * Type 2: Used free trial, no deposit
   */
  static async checkType2FreeNoDeposit(bot: { telegram: Telegram }): Promise<void> {
    const type2Hours = await AdminConfigService.get<number[]>('retention', 'type2_trigger_hours', [1, 24, 72, 168]);
    const msgKeys: Record<number, string> = {
      1: 'retention.free_1h',
      24: 'retention.free_24h',
      72: 'retention.free_3d',
      168: 'retention.free_7d',
    };

    for (const hoursAgo of type2Hours) {
      const msgKey = msgKeys[hoursAgo] ?? 'retention.free_24h';
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      const cutoffPrev = new Date(Date.now() - (hoursAgo + 1) * 60 * 60 * 1000);

      const users = await prisma.user.findMany({
        where: {
          welcomeBonusUsed: true,
          transactions: { none: {} },
          notificationsEnabled: true,
          isBanned: false,
          createdAt: { gte: cutoffPrev, lt: cutoff },
        },
        take: 50,
      });

      for (const user of users) {
        if (await this.canSend(user.telegramId, 'free_trial')) {
          const lang = user.language || 'id';
          await this.sendMessage(bot, user.telegramId, t(msgKey, lang, { name: user.firstName }), lang);
          await this.logSent(user.telegramId, 'free_trial');
        }
      }
    }
  }

  /**
   * Type 3: Used once, stopped
   */
  static async checkType3UsedOnce(bot: { telegram: Telegram }): Promise<void> {
    const triggers = [
      { daysAgo: 3, msgKey: 'retention.used_3d' as const },
      { daysAgo: 7, msgKey: 'retention.used_7d' as const },
      { daysAgo: 14, msgKey: 'retention.used_14d' as const },
      { daysAgo: 21, msgKey: 'retention.used_21d' as const },
    ];

    for (const trigger of triggers) {
      const cutoff = new Date(Date.now() - trigger.daysAgo * 24 * 60 * 60 * 1000);
      const cutoffPrev = new Date(Date.now() - (trigger.daysAgo + 1) * 24 * 60 * 60 * 1000);

      const users = await prisma.user.findMany({
        where: {
          videos: { some: {} },
          notificationsEnabled: true,
          isBanned: false,
          lastActivityAt: { gte: cutoffPrev, lt: cutoff },
        },
        take: 50,
      });

      for (const user of users) {
        if (await this.canSend(user.telegramId, 'inactive')) {
          const lang = user.language || 'id';
          await this.sendMessage(bot, user.telegramId, t(trigger.msgKey, lang, { name: user.firstName }), lang);
          await this.logSent(user.telegramId, 'inactive');
        }
      }
    }
  }

  /**
   * Type 4: Active but not using referral
   * Triggered at 3rd, 5th, 10th generate
   */
  static async checkType4ActiveNoAffiliate(bot: { telegram: Telegram }): Promise<void> {
    const checkPoints = [3, 5, 10];
    const msgKeys: Record<number, string> = {
      3: 'retention.active_3rd_gen',
      5: 'retention.active_5th_gen',
      10: 'retention.active_10th_gen',
    };

    for (const count of checkPoints) {
      // Use Prisma ORM instead of raw SQL to avoid column name mismatch
      const usersWithVideoCount = await prisma.user.findMany({
        where: {
          notificationsEnabled: true,
          isBanned: false,
          commissions: { none: {} },  // No referral commissions earned
        },
        select: { id: true, telegramId: true, firstName: true, language: true, _count: { select: { videos: { where: { status: { in: ['completed', 'done'] } } } } } },
        take: 100,
      });

      const users = usersWithVideoCount.filter(u => u._count.videos === count).slice(0, 30);
      const msgKey = msgKeys[count] ?? 'retention.active_3rd_gen';

      for (const user of users) {
        if (await this.canSend(user.telegramId, 'affiliate')) {
          const lang = user.language || 'id';
          await this.sendMessage(bot, user.telegramId, t(msgKey, lang, { name: user.firstName }), lang);
          await this.logSent(user.telegramId, 'affiliate');
        }
      }
    }
  }

  /**
   * Type 5: Churned users (30+ days inactive)
   */
  static async checkType5Churned(bot: { telegram: Telegram }): Promise<void> {
    const triggers = [
      { daysAgo: 30, msgKey: 'retention.churn_30d' as const },
      { daysAgo: 60, msgKey: 'retention.churn_60d' as const },
    ];

    for (const trigger of triggers) {
      const cutoff = new Date(Date.now() - trigger.daysAgo * 24 * 60 * 60 * 1000);
      const cutoffPrev = new Date(Date.now() - (trigger.daysAgo + 1) * 24 * 60 * 60 * 1000);

      const users = await prisma.user.findMany({
        where: {
          videos: { some: {} },
          notificationsEnabled: true,
          isBanned: false,
          lastActivityAt: { gte: cutoffPrev, lt: cutoff },
        },
        take: 30,
      });

      for (const user of users) {
        if (await this.canSend(user.telegramId, 'churn')) {
          const lang = user.language || 'id';
          await this.sendMessage(bot, user.telegramId, t(trigger.msgKey, lang, { name: user.firstName }), lang);
          await this.logSent(user.telegramId, 'churn');
        }
      }
    }
  }

  /**
   * Type 7: Videos expiring in next 3 days
   */
  static async checkType7VideoExpiry(bot: { telegram: Telegram }): Promise<void> {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringVideos = await prisma.video.findMany({
      where: {
        status: 'completed',
        expiresAt: { gt: now, lte: threeDaysLater },
      },
      select: {
        userId: true,
        user: { select: { id: true, telegramId: true, notificationsEnabled: true, language: true } },
      },
    });

    const byUser = new Map<string, { user: typeof expiringVideos[0]['user']; count: number }>();
    for (const video of expiringVideos) {
      if (!video.user) continue;
      const key = video.userId.toString();
      const entry = byUser.get(key);
      if (entry) {
        entry.count++;
      } else {
        byUser.set(key, { user: video.user, count: 1 });
      }
    }

    for (const { user, count } of byUser.values()) {
      if (!user?.notificationsEnabled) continue;
      if (await this.canSend(user.telegramId, 'video_expiry')) {
        const lang = user.language || 'id';
        const msg = t('retention.video_expiry_warning', lang, { count: String(count) });
        await this.sendMessage(bot, user.telegramId, msg, lang);
        await this.logSent(user.telegramId, 'video_expiry');
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private static async canSend(userId: bigint, category: string): Promise<boolean> {
    // Fast-path: distributed lock prevents duplicate sends across concurrent worker
    // instances. TTL = 3 days (259200s) matches the anti-spam window so once a
    // message is sent the key blocks any retry for the same user+category pair.
    const dedupKey = `retention:lock:${userId}:${category}`;
    // Short-lived in-flight guard (10s) prevents two workers racing the DB check
    // at the same instant. Separate from the 3-day dedup key below.
    const inFlightKey = `retention:inflight:${userId}:${category}`;
    try {
      const { redis } = await import('../config/redis.js');
      // Reject if another worker is mid-flight for this user+category
      const inFlight = await redis.set(inFlightKey, '1', 'EX', 10, 'NX');
      if (inFlight !== 'OK') return false;
      // Reject if already sent within the 3-day dedup window
      const alreadySent = await redis.exists(dedupKey);
      if (alreadySent) return false;
    } catch {
      // Redis unavailable — refuse to send to prevent double-send
      return false;
    }

    const retConfig = await AdminConfigService.getRetentionConfig();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [categoryCount, dayCount] = await Promise.all([
      prisma.retentionLog.count({
        where: { userId, triggerType: category, sentAt: { gte: threeDaysAgo } },
      }),
      prisma.retentionLog.count({
        where: { userId, sentAt: { gte: oneDayAgo } },
      }),
    ]);

    return categoryCount < retConfig.maxPerCategoryPer3Days &&
           dayCount < retConfig.maxPerDay;
  }

  private static async logSent(userId: bigint, triggerType: string): Promise<void> {
    await prisma.retentionLog.create({
      data: { userId, triggerType },
    });
    // Write the 3-day dedup key so concurrent/future workers skip this user+category
    try {
      const { redis } = await import('../config/redis.js');
      const dedupKey = `retention:lock:${userId}:${triggerType}`;
      await redis.set(dedupKey, '1', 'EX', 3 * 24 * 60 * 60); // 3 days
    } catch {
      // Non-fatal: DB log is the source of truth; Redis is a fast-path guard
    }
  }

  private static async sendMessage(
    bot: { telegram: Telegram },
    telegramId: bigint,
    message: string,
    lang: string = 'id'
  ): Promise<void> {
    try {
      await bot.telegram.sendMessage(Number(telegramId), message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('retention.btn_generate', lang), callback_data: 'generate_start' },
              { text: t('retention.btn_unsubscribe', lang), callback_data: 'notif_unsubscribe' },
            ],
          ],
        },
      });
    } catch (err: any) {
      if (err.message?.includes('bot was blocked')) {
        logger.debug(`[retention] User ${telegramId} blocked bot`);
      } else {
        logger.error(`[retention] Failed to send to ${telegramId}:`, err.message);
      }
    }
  }
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────

export function createRetentionWorker(bot: { telegram: Telegram }) {
  return new Worker(
    'retention',
    async (job: Job) => {
      if (job.name === 'run_checks') {
        await RetentionScheduler.runAllChecks(bot);
      }
    },
    {
      connection: bullmqRedis,
      concurrency: 1,
    }
  );
}

export default RetentionScheduler;
