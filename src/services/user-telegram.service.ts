/**
 * User Telegram Service
 *
 * Telegram DM functionality for users
 */

import { logger } from "@/utils/logger";
import { Telegraf } from "telegraf";

export class UserTelegramService {
  /**
   * Static Telegram bot instance (shared across all user operations)
   * Set at startup via setBotInstance()
   */
  private static botInstance: Telegraf | null = null;

  /**
   * Set the Telegram bot instance
   * Call once at startup
   */
  static setBotInstance(bot: Telegraf): void {
    UserTelegramService.botInstance = bot;
  }

  /**
   * Send a Telegram DM to a user
   * Returns true if the message was delivered, false otherwise.
   */
  static async sendMessage(
    telegramId: bigint | string,
    message: string,
    options?: { parse_mode?: "Markdown" | "HTML" },
  ): Promise<boolean> {
    if (!this.botInstance) return false;
    try {
      await this.botInstance.telegram.sendMessage(
        telegramId.toString(),
        message,
        options,
      );
      return true;
    } catch (err) {
      logger.warn(`Failed to send Telegram message to ${telegramId}:`, err);
      return false;
    }
  }

  /**
   * Get the current bot instance (for internal use)
   */
  static getBotInstance(): Telegraf | null {
    return this.botInstance;
  }
}
