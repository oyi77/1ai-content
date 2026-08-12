/**
 * User Middleware
 *
 * Loads user data from database and attaches to session
 */

import { Middleware } from "telegraf";
import { BotContext } from "@/types";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";

/**
 * User middleware
 */
export const userMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return next();
  }

  try {
    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(userId) },
    });

    if (dbUser && ctx.session) {
      // Ban check — allow /start to show ban message, block everything else silently
      if (dbUser.isBanned) {
        const isStartCommand =
          ctx.message &&
          "text" in ctx.message &&
          ctx.message.text?.startsWith("/start");
        if (!isStartCommand) {
          return;
        }
      }

      // Store user ID in session for quick access
      ctx.session.stateData = {
        ...ctx.session.stateData,
        userId: dbUser.telegramId.toString(),
        tier: dbUser.tier,
        credits: Number(dbUser.creditBalance),
      };

      // Update last activity
      await prisma.user.update({
        where: { telegramId: BigInt(userId) },
        data: { lastActivityAt: new Date() },
      });
    }
  } catch (error) {
    logger.error("Error loading user:", error);
    // Continue even if user loading fails
  }

  return next();
};
