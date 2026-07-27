/**
 * Gamification Service
 * 
 * Handles: Daily Streak, Achievement Badges, Weekly Leaderboard
 * Master Document v3.0 — Part 8.3
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';
import type { Telegram } from 'telegraf';

// ── Badge Definitions ─────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  condition: (stats: UserStats) => boolean;
  creditReward?: number;
}

export interface UserStats {
  totalGenerates: number;
  currentStreak: number;
  longestStreak: number;
  totalDeposits: number;
  referralCount: number;
  hasDownline3Level: boolean;
  stylesUsed: Set<string>;
  monthsActive: number;
}

export const BADGES: Record<string, BadgeDefinition> = {
  first_timer: {
    id: 'first_timer',
    name: 'First Timer',
    emoji: '🎬',
    description: 'Generate konten pertama kali',
    condition: (s) => s.totalGenerates >= 1,
  },
  video_creator: {
    id: 'video_creator',
    name: 'Video Creator',
    emoji: '🎥',
    description: 'Buat 5 video',
    condition: (s) => s.totalGenerates >= 5,
  },
  content_machine: {
    id: 'content_machine',
    name: 'Content Machine',
    emoji: '⚡',
    description: 'Streak 30 hari berturut-turut',
    condition: (s) => s.currentStreak >= 30,
    creditReward: 1.0,
  },
  style_master: {
    id: 'style_master',
    name: 'Style Master',
    emoji: '🎨',
    description: 'Gunakan semua 6 industry style',
    condition: (s) => s.stylesUsed.size >= 6,
  },
  campaign_pro: {
    id: 'campaign_pro',
    name: 'Campaign Pro',
    emoji: '📦',
    description: 'Buat 1 campaign batch',
    condition: (s) => s.totalGenerates >= 10, // proxy check
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer',
    emoji: '👥',
    description: 'Refer 5 orang',
    condition: (s) => s.referralCount >= 5,
  },
  team_leader: {
    id: 'team_leader',
    name: 'Team Leader',
    emoji: '🏆',
    description: 'Punya downline 3 level',
    condition: (s) => s.hasDownline3Level,
  },
  power_user: {
    id: 'power_user',
    name: 'Power User',
    emoji: '🔥',
    description: 'Total 100 kali generate',
    condition: (s) => s.totalGenerates >= 100,
  },
  loyal_customer: {
    id: 'loyal_customer',
    name: 'Loyal Customer',
    emoji: '💎',
    description: 'Aktif 3 bulan berturut-turut',
    condition: (s) => s.monthsActive >= 3,
  },
};

// ── Streak Rewards ────────────────────────────────────────────────────────────

export const STREAK_REWARDS: Array<{ days: number; creditBonus: number; label: string }> = [
  { days: 3, creditBonus: 0.1, label: '3 hari streak' },
  { days: 7, creditBonus: 0.3, label: '7 hari streak' },
  { days: 14, creditBonus: 0.5, label: '14 hari streak' },
  { days: 30, creditBonus: 1.0, label: '30 hari streak + Content Machine badge' },
];

// ── Service ───────────────────────────────────────────────────────────────────

export class GamificationService {

  /**
   * Record a generate and update streak
   * Returns: { streakUpdated, newStreak, rewardCredit, newBadges }
   * Pass options.telegram + options.chatId to send badge notifications via Telegram.
   */
  static async recordGenerate(
    userId: bigint,
    options?: { telegram?: Telegram; chatId?: number; lang?: string },
  ): Promise<{
    streakUpdated: boolean;
    newStreak: number;
    rewardCredit: number;
    newBadges: BadgeDefinition[];
    streakMessage?: string;
  }> {
    // Use WIB (UTC+7) for streak tracking since most users are in Indonesia
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
    const today = new Date(nowWib);
    today.setHours(0, 0, 0, 0);

    let rewardCredit = 0;
    let streakUpdated = false;
    let streakMessage: string | undefined;

    try {
      // Get or create streak record
      let streak = await prisma.userStreak.findUnique({ where: { userId } });

      if (!streak) {
        streak = await prisma.userStreak.create({
          data: { userId, currentStreak: 1, longestStreak: 1, lastGenerateDate: today, streakStartDate: today, totalGenerates: 1 },
        });
        streakUpdated = true;
      } else {
        const lastDate = streak.lastGenerateDate ? new Date(streak.lastGenerateDate) : null;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const isAlreadyToday = lastDate && lastDate.getTime() === today.getTime();
        const isContinuing = lastDate && lastDate.getTime() === yesterday.getTime();

        if (isAlreadyToday) {
          // Already generated today — just increment total
          await prisma.userStreak.update({
            where: { userId },
            data: { totalGenerates: { increment: 1 } },
          });
        } else if (isContinuing) {
          // Streak continues!
          const newStreak = streak.currentStreak + 1;
          const newLongest = Math.max(streak.longestStreak, newStreak);
          streak = await prisma.userStreak.update({
            where: { userId },
            data: { currentStreak: newStreak, longestStreak: newLongest, lastGenerateDate: today, totalGenerates: { increment: 1 } },
          });
          streakUpdated = true;

          // Check streak rewards
          const reward = STREAK_REWARDS.find((r) => r.days === newStreak);
          if (reward) {
            rewardCredit = reward.creditBonus;
            streakMessage = `🔥 *Streak ${newStreak} hari!* Bonus +${reward.creditBonus} credit!`;
          } else {
            streakMessage = `🔥 Streak ${newStreak} hari!`;
          }
        } else {
          // Streak broken — reset
          streak = await prisma.userStreak.update({
            where: { userId },
            data: { currentStreak: 1, lastGenerateDate: today, streakStartDate: today, totalGenerates: { increment: 1 } },
          });
          streakUpdated = true;
        }
      }

      // Check for new badges
      const newBadges = await this.checkAndAwardBadges(userId, options);

      // Apply reward credit if any
      if (rewardCredit > 0) {
        await prisma.user.update({
          where: { telegramId: userId },
          data: { creditBalance: { increment: rewardCredit } },
        });
        await prisma.transaction.create({
          data: {
            userId,
            orderId: `GAMIFY-streak-${Date.now()}`,
            type: 'gamification_reward',
            gateway: 'system',
            amountIdr: 0,
            creditsAmount: rewardCredit,
            status: 'success',
            metadata: { reason: 'Streak reward' },
          },
        }).catch(() => {}); // non-critical, don't fail the reward
      }

      return {
        streakUpdated,
        newStreak: streak.currentStreak || 1,
        rewardCredit,
        newBadges,
        streakMessage,
      };
    } catch (err) {
      logger.error('GamificationService.recordGenerate error', err);
      return { streakUpdated: false, newStreak: 0, rewardCredit: 0, newBadges: [] };
    }
  }

  /**
   * Check and award new badges to user.
   * If telegram + chatId are provided, sends a notification for each new badge and marks notified=true.
   */
  static async checkAndAwardBadges(
    userId: bigint,
    options?: { telegram?: Telegram; chatId?: number; lang?: string },
  ): Promise<BadgeDefinition[]> {
    try {
      const stats = await this.getUserStats(userId);
      const existingBadges = await prisma.userBadge.findMany({
        where: { userId },
        select: { badgeId: true },
      });
      const existingIds = new Set(existingBadges.map((b) => b.badgeId));

      const newBadges: BadgeDefinition[] = [];

      for (const badge of Object.values(BADGES)) {
        if (!existingIds.has(badge.id) && badge.condition(stats)) {
          // Use upsert to prevent duplicate badge award from concurrent calls
          const created = await prisma.userBadge.upsert({
            where: { userId_badgeId: { userId, badgeId: badge.id } },
            update: {}, // no-op if already exists
            create: { userId, badgeId: badge.id },
          }).catch(() => null);

          // Only award credit if we actually created a new badge (not a no-op upsert)
          if (created) {
            newBadges.push(badge);
            if (badge.creditReward) {
              await prisma.user.update({
                where: { telegramId: userId },
                data: { creditBalance: { increment: badge.creditReward } },
              });
              await prisma.transaction.create({
                data: {
                  userId,
                  orderId: `GAMIFY-${badge.id}-${Date.now()}`,
                  type: 'gamification_reward',
                  gateway: 'system',
                  amountIdr: 0,
                  creditsAmount: badge.creditReward,
                  status: 'success',
                  metadata: { reason: `Badge: ${badge.id}` },
                },
              }).catch(() => {}); // non-critical, don't fail the reward
            }

            // Send Telegram notification for the badge and mark as notified
            if (options?.telegram && options?.chatId) {
              const lang = options.lang || 'id';
              const message = t('gamification.badge_earned', lang, {
                emoji: badge.emoji,
                badgeName: badge.name,
              });
              await options.telegram
                .sendMessage(options.chatId, message, { parse_mode: 'Markdown' })
                .catch(() => {});
              await prisma.userBadge
                .update({
                  where: { userId_badgeId: { userId, badgeId: badge.id } },
                  data: { notified: true },
                })
                .catch(() => {});
            }
          }
        }
      }

      return newBadges;
    } catch (err) {
      logger.error('GamificationService.checkAndAwardBadges error', err);
      return [];
    }
  }

  /**
   * Get user stats for badge checking
   */
  static async getUserStats(userId: bigint): Promise<UserStats> {
    const [streak, referrals] = await Promise.all([
      prisma.userStreak.findUnique({ where: { userId } }),
      prisma.commission.findMany({ where: { referrerId: userId }, select: { tier: true } }),
    ]);

    const totalGenerates = streak?.totalGenerates || 0;
    const referralCount = referrals.filter((r) => r.tier === 1).length;
    const hasDownline3Level = referrals.some(r => r.tier === 3);

    // Calculate months active from user creation
    const user = await prisma.user.findUnique({ where: { telegramId: userId }, select: { createdAt: true } });
    const monthsActive = user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)) : 0;

    return {
      totalGenerates,
      currentStreak: streak?.currentStreak || 0,
      longestStreak: streak?.longestStreak || 0,
      totalDeposits: 0, // simplified
      referralCount,
      hasDownline3Level,
      stylesUsed: new Set(), // simplified
      monthsActive,
    };
  }

  /**
   * Get weekly leaderboard (top 10 by generate count this week)
   */
  static async getWeeklyLeaderboard(): Promise<Array<{
    rank: number;
    userId: bigint;
    firstName: string;
    username?: string;
    generateCount: number;
    creditReward: number;
  }>> {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const leaderboard = await prisma.video.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: weekStart }, status: { in: ['completed', 'done'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const rewards = [2.0, 1.0, 0.5]; // Top 3 credit rewards

    // Batch fetch all users in one query instead of N+1
    const userIds = leaderboard.map(e => e.userId);
    const users = await prisma.user.findMany({
      where: { telegramId: { in: userIds } },
      select: { telegramId: true, firstName: true, username: true },
    });
    const userMap = new Map(users.map(u => [u.telegramId, u]));
    return leaderboard.map((entry, index) => {
      const user = userMap.get(entry.userId);
      return {
        rank: index + 1,
        userId: entry.userId,
        firstName: user?.firstName || 'User',
        username: user?.username || undefined,
        generateCount: entry._count.id,
        creditReward: rewards[index] || 0,
      };
    });
  }

  /**
   * Format leaderboard message for Telegram
   */
  static formatLeaderboardMessage(
    leaderboard: Awaited<ReturnType<typeof GamificationService.getWeeklyLeaderboard>>
  ): string {
    const medals = ['🥇', '🥈', '🥉'];
    const rows = leaderboard.map((entry) => {
      const medal = medals[entry.rank - 1] || `${entry.rank}.`;
      const name = entry.username ? `@${entry.username}` : entry.firstName;
      const reward = entry.creditReward > 0 ? ` (+${entry.creditReward} credit)` : '';
      return `${medal} ${name} — ${entry.generateCount} generate${reward}`;
    });

    return `🏆 *Leaderboard Minggu Ini*\n\n${rows.join('\n')}\n\n_Update setiap Senin_`;
  }

  /**
   * Format badge notification for Telegram
   */
  static formatBadgeNotification(badges: BadgeDefinition[]): string {
    if (badges.length === 0) return '';
    const badgeList = badges.map((b) => `${b.emoji} *${b.name}* — ${b.description}`).join('\n');
    const creditTotal = badges.reduce((sum, b) => sum + (b.creditReward || 0), 0);
    return `🎖️ *Badge Baru Kamu!*\n\n${badgeList}${creditTotal > 0 ? `\n\n💰 Bonus: +${creditTotal} credit` : ''}`;
  }

  /**
   * Get user's streak and badge summary
   */
  static async getUserGamificationSummary(userId: bigint): Promise<string> {
    const [streak, badges] = await Promise.all([
      prisma.userStreak.findUnique({ where: { userId } }),
      prisma.userBadge.findMany({ where: { userId } }),
    ]);

    const streakText = streak?.currentStreak
      ? `🔥 Streak: ${streak.currentStreak} hari (terpanjang: ${streak.longestStreak})`
      : '🔥 Streak: Belum mulai';

    const badgeText = badges.length > 0
      ? `🎖️ Badge: ${badges.map(b => BADGES[b.badgeId]?.emoji || '?').join(' ')} (${badges.length} badge)`
      : '🎖️ Badge: Belum ada';

    return `${streakText}\n${badgeText}`;
  }
}

export default GamificationService;
