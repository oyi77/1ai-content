/**
 * User CRUD Service
 *
 * Database CREATE, READ, UPDATE operations for users
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { User, Prisma } from '@prisma/client';
import { NotFoundError } from '@/utils/app-errors';
import { UserReferralService } from './user-referral.service';

export class UserCrudService {
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
    const referralCode = await UserReferralService.generateReferralCode(data.username || data.firstName);
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
   * Update user activity timestamp
   */
  static async updateActivity(telegramId: bigint): Promise<void> {
    await prisma.user.update({
      where: { telegramId },
      data: { lastActivityAt: new Date() },
    });
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
}
