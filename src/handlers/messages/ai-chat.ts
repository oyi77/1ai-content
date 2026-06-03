/**
 * AI Chat Fallback Handler
 *
 * When no menu button matches and the state is DASHBOARD/START,
 * route the message to the AI chat service (OmniRoute).
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getOmniRouteService } from "@/services/omniroute.service";
import { sendVilonaLoading } from "@/services/vilona-animation.service";
import { showMainMenu } from "@/menus/main";

/**
 * Try to handle the text as an AI chat message.
 * Returns true if the message was sent to AI chat (regardless of success).
 */
export async function tryAIChat(ctx: BotContext, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (trimmed.length <= 2 || trimmed.startsWith("/")) {
    return false;
  }

  const omni = getOmniRouteService();
  const userId = String(ctx.from?.id || "unknown");

  try {
    const loadingId = await sendVilonaLoading(ctx, "thinking");
    const result = await omni.chat(userId, trimmed);
    if (loadingId) {
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingId).catch(() => {});
    }
    if (result.success && result.content) {
      try {
        await ctx.reply(result.content, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(result.content);
      }
      return true;
    }
  } catch (err) {
    logger.warn("AI chat failed, falling through to main menu:", err);
  }

  // Fall through to main menu
  await showMainMenu(ctx);
  return true;
}
