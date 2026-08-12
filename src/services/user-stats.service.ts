/**
 * User Stats Service
 *
 * User statistics and quota management
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { UserCrudService } from "./user-crud.service";

export class UserStatsService {
  /**
   * Get the number of videos created by the user today (in WIB timezone)
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
  static async canGenerate(
    telegramId: bigint,
  ): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const user = await UserCrudService.findByTelegramId(telegramId);
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

    const tier = user.tier || "free";
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
      const user = await UserCrudService.findByTelegramId(telegramId);
      if (!user) {
        return {
          videosCreated: 0,
          totalSpent: 0,
          referralCount: 0,
          commissionEarned: 0,
        };
      }

      // Run queries with individual error handling or safe defaults
      const videosCreated = await prisma.video
        .count({ where: { userId: telegramId } })
        .catch(() => 0);

      const transactions = await prisma.transaction
        .aggregate({
          where: { userId: telegramId, status: "success" },
          _sum: { amountIdr: true },
        })
        .catch(() => ({ _sum: { amountIdr: 0 } }));

      const referralCount = await prisma.user
        .count({
          where: { referredBy: user.uuid },
        })
        .catch(() => 0);

      const commissions = await prisma.commission
        .aggregate({
          where: { referrerId: telegramId },
          _sum: { amount: true },
        })
        .catch(() => ({ _sum: { amount: 0 } }));

      return {
        videosCreated,
        totalSpent: Number(transactions?._sum?.amountIdr || 0),
        referralCount,
        commissionEarned: Number(commissions?._sum?.amount || 0),
      };
    } catch (error) {
      logger.error(`Error fetching stats for user ${telegramId}:`, error);
      return {
        videosCreated: 0,
        totalSpent: 0,
        referralCount: 0,
        commissionEarned: 0,
      };
    }
  }
}
