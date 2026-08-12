/**
 * Error Handler
 *
 * Handles all bot errors
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";

/**
 * Handle bot errors
 */
export async function errorHandler(
  err: unknown,
  ctx: BotContext,
): Promise<void> {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error("Bot error:", {
    error: error.message,
    stack: error.stack,
    update: ctx.update,
  });

  // Don't show internal errors to users — they're confusing.
  // Only log for admin. The specific handler should have already
  // sent a user-friendly message before the error escaped here.
  // If we DO need to notify (e.g., completely unhandled), keep it minimal.
  try {
    // Only reply if this is a callback query (user tapped a button) — prevents spam
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery("").catch(() => {});
    }
    // Don't send error message to user — handlers already handle errors gracefully.
    // The global error handler is a safety net for truly unhandled exceptions.
  } catch (replyError) {
    logger.error("Failed in error handler:", replyError);
  }

  try {
    const sessionExt = ctx.session as unknown as
      | Record<string, unknown>
      | undefined;
    const lang = (sessionExt?.userLang as string) || "id";
    const { t } = await import("../i18n/translations.js");
    const { safeReply } = await import("../utils/safe-reply.js");
    await safeReply(
      ctx,
      t("error.something_went_wrong", lang) +
        "\n\n" +
        t("error.try_start", lang),
    );
  } catch {
    /* prevent error-in-error-handler */
  }
}
