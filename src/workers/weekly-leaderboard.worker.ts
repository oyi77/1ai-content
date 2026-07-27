/**
 * Weekly Leaderboard Worker
 * 
 * Runs every Monday at 09:00 WIB:
 * 1. Calculate top 10 users by generate count (past week)
 * 2. Award credit bonuses to top 3
 * 3. Broadcast leaderboard to all active users (opt-in only)
 * 4. Reset weekly counters
 * 
 * Master Document v3.0 — Part 8.3
 */

import { Worker, Job, Queue } from 'bullmq';
import { bullmqRedis } from '@/config/redis';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { GamificationService } from '@/services/gamification.service';
import type { Telegram } from 'telegraf';

export const leaderboardQueue = new Queue('leaderboard', { connection: bullmqRedis });

// const LEADERBOARD_REWARDS = [2.0, 1.0, 0.5]; // Top 3 credit bonuses

export class WeeklyLeaderboardService {

  /**
   * Run weekly leaderboard cycle
   */
  static async runWeeklyCycle(bot: { telegram: Telegram }): Promise<void> {
    logger.info('[leaderboard] Running weekly cycle...');

    try {
      // 1. Get leaderboard
      const leaderboard = await GamificationService.getWeeklyLeaderboard();
      if (leaderboard.length === 0) {
        logger.info('[leaderboard] No activity this week, skipping');
        return;
      }

      // 2. Award credits to top 3
      for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
        const entry = leaderboard[i];
        if (entry.creditReward > 0) {
          await prisma.user.update({
            where: { telegramId: entry.userId },
            data: { creditBalance: { increment: entry.creditReward } },
          });
          logger.info(`[leaderboard] Awarded ${entry.creditReward} credit to user ${entry.userId} (rank ${i + 1})`);

          // Notify winner
          try {
            const medals = ['🥇', '🥈', '🥉'];
            await bot.telegram.sendMessage(
              Number(
                (await prisma.user.findUnique({ where: { telegramId: entry.userId }, select: { telegramId: true } }))
                  ?.telegramId || 0
              ),
              `${medals[i]} *Selamat, kamu masuk Top ${i + 1} Leaderboard Minggu Ini!*\n\n` +
              `Kamu generate ${entry.generateCount} konten minggu ini 🔥\n` +
              `Bonus: +${entry.creditReward} credit sudah masuk ke akunmu!\n\n` +
              `Pertahankan minggu depan! 💪`,
              { parse_mode: 'Markdown' }
            );
          } catch (err) {
            logger.error('[leaderboard] Failed to notify winner', err);
          }
        }
      }

      // 3. Broadcast leaderboard to community (optional channel)
      const channelId = getConfig().COMMUNITY_CHANNEL_ID;
      if (channelId) {
        try {
          const message = GamificationService.formatLeaderboardMessage(leaderboard);
          await bot.telegram.sendMessage(channelId, message, { parse_mode: 'Markdown' });
        } catch (err) {
          logger.error('[leaderboard] Failed to broadcast to channel', err);
        }
      }

      logger.info(`[leaderboard] Weekly cycle complete. ${leaderboard.length} users ranked.`);
    } catch (err) {
      logger.error('[leaderboard] Weekly cycle failed', err);
    }
  }

  /**
   * Schedule next Monday run
   */
  static async scheduleNext(): Promise<void> {
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
    nextMonday.setHours(2, 0, 0, 0); // 09:00 WIB = 02:00 UTC

    const delay = nextMonday.getTime() - Date.now();
    await leaderboardQueue.add('weekly_cycle', {}, { delay, removeOnComplete: true });
    logger.info(`[leaderboard] Next run scheduled: ${nextMonday.toISOString()}`);
  }
}

export function createLeaderboardWorker(bot: { telegram: Telegram }) {
  return new Worker(
    'leaderboard',
    async (job: Job) => {
      if (job.name === 'weekly_cycle') {
        await WeeklyLeaderboardService.runWeeklyCycle(bot);
        await WeeklyLeaderboardService.scheduleNext();
      }
    },
    { connection: bullmqRedis, concurrency: 1 }
  );
}

export default WeeklyLeaderboardService;
