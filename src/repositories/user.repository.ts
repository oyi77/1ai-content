/**
 * User Repository
 *
 * Thin wrapper around Prisma user operations. Decouples business logic
 * from the ORM, enables easier mocking in tests, and provides a single
 * point of truth for User database operations.
 *
 * NOTE: This is a proof-of-concept. The existing UserService methods
 * still work via the facade pattern. New code should prefer this
 * repository directly.
 */

import { prisma } from "@/config/database";
import { User, Prisma } from "@prisma/client";

export class UserRepository {
  /** Find user by Telegram ID */
  static async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return prisma.user.findUnique({ where: { telegramId } });
  }

  /** Find user by UUID */
  static async findByUuid(uuid: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { uuid } });
  }

  /** Find user by referral code */
  static async findByReferralCode(code: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { referralCode: code } });
  }

  /** Create a new user */
  static async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  /** Update user by Telegram ID */
  static async update(
    telegramId: bigint,
    data: Prisma.UserUpdateInput,
  ): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: { ...data, updatedAt: new Date() },
    });
  }

  /** Update last activity timestamp */
  static async updateActivity(telegramId: bigint): Promise<void> {
    await prisma.user.update({
      where: { telegramId },
      data: { lastActivityAt: new Date() },
    });
  }

  /** Atomically add credits */
  static async addCredits(telegramId: bigint, amount: number): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: { creditBalance: { increment: amount } },
    });
  }

  /**
   * Atomically deduct credits (conditional on sufficient balance).
   * Returns the number of rows updated (0 = insufficient balance, 1 = success).
   */
  static async deductCredits(
    telegramId: bigint,
    amount: number,
  ): Promise<number> {
    const result = await prisma.user.updateMany({
      where: { telegramId, creditBalance: { gte: amount } },
      data: { creditBalance: { decrement: amount } },
    });
    return result.count;
  }

  /** Ban a user */
  static async ban(telegramId: bigint, reason: string): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: { isBanned: true, banReason: reason, bannedAt: new Date() },
    });
  }

  /** Unban a user */
  static async unban(telegramId: bigint): Promise<User> {
    return prisma.user.update({
      where: { telegramId },
      data: { isBanned: false, banReason: null, bannedAt: null },
    });
  }

  /** Find users with expiring credits */
  static async findWithExpiringCredits(now: Date = new Date()) {
    return prisma.user.findMany({
      where: { creditExpiresAt: { lt: now }, creditBalance: { gt: 0 } },
      select: {
        id: true,
        telegramId: true,
        creditBalance: true,
        subscriptionCredits: true,
      },
    });
  }

  /** Count users referred by a specific user */
  static async countReferrals(referredByUuid: string): Promise<number> {
    return prisma.user.count({ where: { referredBy: referredByUuid } });
  }
}
