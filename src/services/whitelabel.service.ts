/**
 * Whitelabel Service
 *
 * Manages partner bots with custom branding.
 * Partners run their own Telegram bot pointing to our backend.
 * They earn commission on every transaction from their users.
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { Decimal } from "@prisma/client/runtime/library";
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from "@/utils/app-errors";

export interface WhiteLabelConfig {
  id: bigint;
  ownerId: bigint;
  uuid: string;
  botToken: string;
  botUsername: string | null;
  brandName: string;
  welcomeMsg: string | null;
  logoUrl: string | null;
  commissionRate: Decimal;
  isActive: boolean;
}

export class WhiteLabelService {
  /**
   * Register a new whitelabel bot
   */
  static async register(params: {
    ownerId: bigint;
    botToken: string;
    brandName: string;
    welcomeMsg?: string;
  }): Promise<WhiteLabelConfig> {
    // Verify owner exists and is agency tier
    const owner = await prisma.user.findUnique({
      where: { telegramId: params.ownerId },
    });
    if (!owner) throw new NotFoundError("Owner");
    if (owner.tier !== "agency") {
      throw new ForbiddenError("Only agency tier can create whitelabel bots");
    }

    // Check if bot token already registered
    const existing = await prisma.whiteLabelBot.findUnique({
      where: { botToken: params.botToken },
    });
    if (existing) throw new ConflictError("Bot token already registered");

    const bot = await prisma.whiteLabelBot.create({
      data: {
        ownerId: params.ownerId,
        botToken: params.botToken,
        brandName: params.brandName,
        welcomeMsg: params.welcomeMsg || null,
      },
    });

    logger.info(`[Whitelabel] New bot registered: ${params.brandName} by ${params.ownerId}`);
    return bot;
  }

  /**
   * Get whitelabel bot by token
   */
  static async getByToken(botToken: string): Promise<WhiteLabelConfig | null> {
    return prisma.whiteLabelBot.findUnique({
      where: { botToken },
    });
  }

  /**
   * Get all whitelabel bots for an owner
   */
  static async getByOwner(ownerId: bigint) {
    return prisma.whiteLabelBot.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Process commission when a whitelabel user makes a purchase
   * Called from PaymentService after successful transaction
   */
  static async processCommission(
    botId: bigint,
    buyerTelegramId: bigint,
    transactionAmount: number,
  ) {
    const bot = await prisma.whiteLabelBot.findUnique({
      where: { id: botId },
    });
    if (!bot || !bot.isActive) return;

    const commission = transactionAmount * Number(bot.commissionRate);

    // Update bot stats
    await prisma.whiteLabelBot.update({
      where: { id: botId },
      data: {
        totalEarned: { increment: commission },
        totalSales: { increment: transactionAmount },
        userCount: { increment: 1 },
      },
    });

    // Also create a commission record for the owner
    await prisma.commission.create({
      data: {
        referrerId: bot.ownerId,
        referredId: buyerTelegramId,
        amount: commission,
        tier: 0, // tier 0 = whitelabel commission
        status: "available",
        availableAt: new Date(),
      },
    });

    logger.info(
      `[Whitelabel] Commission: Rp ${commission} to ${bot.brandName} (owner: ${bot.ownerId})`,
    );
  }

  /**
   * Withdraw commission for a whitelabel partner
   */
  static async withdraw(ownerId: bigint, amount: number): Promise<boolean> {
    const bots = await prisma.whiteLabelBot.findMany({
      where: { ownerId, isActive: true },
    });

    const totalEarned = bots.reduce(
      (sum, b) => sum + Number(b.totalEarned),
      0,
    );
    const totalWithdrawn = bots.reduce(
      (sum, b) => sum + Number(b.totalWithdrawn),
      0,
    );
    const available = totalEarned - totalWithdrawn;

    if (amount > available) {
      throw new ValidationError(
        `Insufficient balance. Available: Rp ${available.toLocaleString()}`,
      );
    }

    // Distribute withdrawal across bots proportionally
    for (const bot of bots) {
      const botEarned = Number(bot.totalEarned);
      const botShare = botEarned > 0 ? (botEarned / totalEarned) * amount : 0;
      if (botShare > 0) {
        await prisma.whiteLabelBot.update({
          where: { id: bot.id },
          data: { totalWithdrawn: { increment: botShare } },
        });
      }
    }

    logger.info(`[Whitelabel] Withdrawal: Rp ${amount} by ${ownerId}`);
    return true;
  }

  /**
   * Update branding
   */
  static async updateBranding(
    botId: bigint,
    updates: {
      brandName?: string;
      welcomeMsg?: string;
      logoUrl?: string;
    },
  ) {
    return prisma.whiteLabelBot.update({
      where: { id: botId },
      data: updates,
    });
  }

  /**
   * Deactivate a whitelabel bot
   */
  static async deactivate(botId: bigint) {
    return prisma.whiteLabelBot.update({
      where: { id: botId },
      data: { isActive: false },
    });
  }

  /**
   * Get stats for a whitelabel partner
   */
  static async getStats(ownerId: bigint) {
    const bots = await prisma.whiteLabelBot.findMany({
      where: { ownerId },
    });

    const totalEarned = bots.reduce(
      (sum, b) => sum + Number(b.totalEarned),
      0,
    );
    const totalWithdrawn = bots.reduce(
      (sum, b) => sum + Number(b.totalWithdrawn),
      0,
    );
    const totalUsers = bots.reduce((sum, b) => sum + b.userCount, 0);
    const totalSales = bots.reduce(
      (sum, b) => sum + Number(b.totalSales),
      0,
    );

    return {
      botCount: bots.length,
      activeBots: bots.filter((b) => b.isActive).length,
      totalEarned,
      totalWithdrawn,
      availableBalance: totalEarned - totalWithdrawn,
      totalUsers,
      totalSales,
      bots: bots.map((b) => ({
        id: b.id,
        brandName: b.brandName,
        botUsername: b.botUsername,
        userCount: b.userCount,
        totalEarned: Number(b.totalEarned),
        commissionRate: Number(b.commissionRate),
        isActive: b.isActive,
      })),
    };
  }
}
