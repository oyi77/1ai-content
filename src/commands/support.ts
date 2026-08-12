/**
 * Support Command
 *
 * Handles /support command
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { t } from "@/i18n/translations";

/**
 * Handle /support command
 */
export async function supportCommand(ctx: BotContext): Promise<void> {
  try {
    const lang = ctx.session?.userLang || ctx.from?.language_code || "id";
    await ctx.reply(t("support.full_msg", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("support.btn_chat", lang),
              url: `https://t.me/${getConfig().SUPPORT_TELEGRAM_USERNAME || "codergaboets"}`,
            },
          ],
          [
            {
              text: t("support.btn_tutorial", lang),
              callback_data: "view_tutorial",
            },
          ],
          [{ text: t("support.btn_bug", lang), callback_data: "report_bug" }],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });

    ctx.session.state = "DASHBOARD";
  } catch (error) {
    logger.error("supportCommand error:", error);
    try {
      await ctx.reply(t("error.generic", "id"));
    } catch {
      /* ignore */
    }
  }
}
