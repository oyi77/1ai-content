/**
 * Safe Reply Utilities
 *
 * Wraps Telegram ctx methods to gracefully handle common errors:
 * - "message is not modified" (edit same content)
 * - "bot was blocked by the user"
 * - "message to edit not found"
 * - "query is too old"
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";

const IGNORABLE_ERRORS = [
  "message is not modified",
  "message to edit not found",
  "bot was blocked by the user",
  "user is deactivated",
  "chat not found",
  "query is too old",
  "MESSAGE_ID_INVALID",
  "PEER_ID_INVALID",
];

function isIgnorable(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return IGNORABLE_ERRORS.some((e) =>
    msg.toLowerCase().includes(e.toLowerCase()),
  );
}

/**
 * Safe ctx.reply — never throws, logs ignorable errors silently
 */
export async function safeReply(
  ctx: BotContext,
  text: string,
  extra?: Parameters<BotContext["reply"]>[1],
): Promise<void> {
  try {
    await ctx.reply(text, extra);
  } catch (err) {
    if (!isIgnorable(err)) {
      logger.error("safeReply error:", { err, userId: ctx.from?.id });
    }
  }
}

/**
 * Safe ctx.editMessageText — never throws on "not modified" / "not found"
 */
export async function safeEdit(
  ctx: BotContext,
  text: string,
  extra?: Parameters<BotContext["editMessageText"]>[1],
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    if (isIgnorable(err)) return;
    // Fallback to reply if edit fails
    try {
      await ctx.reply(text, extra as Parameters<BotContext["reply"]>[1]);
    } catch (replyErr) {
      if (!isIgnorable(replyErr)) {
        logger.error("safeEdit fallback reply error:", {
          replyErr,
          userId: ctx.from?.id,
        });
      }
    }
  }
}

/**
 * Safe ctx.answerCbQuery — never throws on "query is too old"
 */
export async function safeAnswerCb(
  ctx: BotContext,
  text?: string,
  showAlert?: boolean,
): Promise<void> {
  try {
    await ctx.answerCbQuery(text, { show_alert: showAlert });
  } catch (err) {
    if (!isIgnorable(err)) {
      logger.error("safeAnswerCb error:", { err, userId: ctx.from?.id });
    }
  }
}

/**
 * Wrap any async handler with consistent error handling + user feedback
 */
export async function withErrorBoundary(
  ctx: BotContext,
  fn: () => Promise<void>,
  opts?: { action?: string; answerCb?: boolean },
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`Error in ${opts?.action ?? "handler"}:`, {
      err,
      userId: ctx.from?.id,
    });

    const userMsg =
      "❌ Terjadi kesalahan. Silakan coba lagi atau hubungi /support jika masalah berlanjut.";

    try {
      if (opts?.answerCb) await ctx.answerCbQuery("Error — please try again");
      await ctx.reply(userMsg);
    } catch {
      // silently swallow reply errors
    }
  }
}
