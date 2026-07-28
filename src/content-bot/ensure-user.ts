/**
 * Content Bot — User verification helper
 */
import { BotContext } from "@/types";
import { UserService } from "@/services/user.service";
import { logger } from "@/utils/logger";

export async function ensureUser(ctx: BotContext): Promise<boolean> {
  const from = ctx.from;
  if (!from) return false;
  try {
    let user = await UserService.findByTelegramId(BigInt(from.id));
    if (!user) {
      user = await UserService.create({
        telegramId: BigInt(from.id),
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
      logger.info(`[Bot] New user registered: ${from.username || from.id}`);
    }
    return true;
  } catch (err) {
    logger.error("[Bot] ensureUser error:", err);
    return false;
  }
}
