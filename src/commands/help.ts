/**
 * Help Command
 *
 * Handles /help command
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";

/**
 * Handle /help command
 */
export async function helpCommand(ctx: BotContext): Promise<void> {
  try {
    const lang = ctx.session?.userLang || ctx.from?.language_code || "id";
    await ctx.reply(t("help.full_guide", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
  } catch (error) {
    logger.error("helpCommand error:", error);
    try {
      await ctx.reply(t("error.generic", "id"));
    } catch {
      /* ignore */
    }
  }
}
