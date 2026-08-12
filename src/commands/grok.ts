/**
 * Chat Command — Simple AI chat via /chat <prompt>
 * Uses the cheapest/free model on OmniRoute.
 */

import { BotContext } from "@/types";
import { getOmniRouteService } from "@/services/omniroute.service";
import { logger } from "@/utils/logger";
import { sendVilonaLoading } from "@/services/vilona-animation.service";
import { t } from "@/i18n/translations";

// Use the default model configured in OmniRoute (env: OMNIROUTE_DEFAULT_MODEL)

async function safeReply(ctx: BotContext, text: string): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply(text);
  }
}

export async function chatCommand(ctx: BotContext): Promise<void> {
  const rawText = (ctx.message as { text?: string })?.text || "";
  const prompt = rawText.replace(/^\/(?:chat|ask)\s*/, "").trim();

  if (!prompt) {
    await safeReply(
      ctx,
      "*💬 AI Chat*\n\n" +
        "Ask me anything!\n\n" +
        "Usage: `/chat <your question>`\n\n" +
        "*Examples:*\n" +
        "`/chat What is the best marketing strategy?`\n" +
        "`/chat Help me write a product description`\n" +
        "`/chat Suggest 5 TikTok video ideas for my cafe`",
    );
    return;
  }

  const userId = String(ctx.from?.id || "unknown");
  const omni = getOmniRouteService();

  // Vilona thinking animation
  const loadingMsgId = await sendVilonaLoading(ctx, "thinking");

  try {
    const result = await omni.chat(userId, prompt);

    // Delete loading animation
    if (loadingMsgId) {
      await ctx.telegram
        .deleteMessage(ctx.chat!.id, loadingMsgId)
        .catch(() => {});
    }

    if (!result.success) {
      await ctx.reply(`❌ ${result.error || t("error.generic", "id")}`);
      return;
    }

    const response = result.content || "No response received.";

    if (response.length > 4000) {
      const chunks = response.match(/[\s\S]{1,4000}/g) || [response];
      for (const chunk of chunks) {
        await safeReply(ctx, chunk);
      }
    } else {
      await safeReply(ctx, response);
    }

    logger.info(
      `Chat response (${result.model}): ${result.content?.slice(0, 100)}...`,
    );
  } catch (err) {
    if (loadingMsgId) {
      await ctx.telegram
        .deleteMessage(ctx.chat!.id, loadingMsgId)
        .catch(() => {});
    }
    logger.error("Chat command error:", err);
    await ctx.reply(t("error.generic", "id"));
  }
}
