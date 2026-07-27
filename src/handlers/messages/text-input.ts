/**
 * Text Input Handlers
 *
 * Handles text input states: CUSTOM_PROMPT_CREATION, CUSTOM_PROMPT_INPUT,
 * WAITING_ACCOUNT_ID, and related text-input flows.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { UserService } from "@/services/user.service";
import { PostAutomationService } from "@/services/postautomation.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import { PROMPT_LIBRARY as _PL } from "@/commands/prompts";

/**
 * Handle CUSTOM_PROMPT_CREATION state — user adds a custom prompt to their library.
 */
export async function handleCustomPromptCreation(ctx: BotContext): Promise<boolean> {
  if (
    ctx.session?.state !== "CUSTOM_PROMPT_CREATION" ||
    !ctx.session?.stateData?.addingPromptNiche ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const promptText = message.text.trim();
  const nicheKey = ctx.session.stateData.addingPromptNiche as string;

  if (promptText.length < 10) {
    await ctx.reply(t("msg.prompt_too_short", ctx.session?.userLang || "id"));
    return true;
  }

  try {
    const dbUser = await UserService.findByTelegramId(BigInt(ctx.from!.id));
    if (dbUser) {
      const title = promptText.split(" ").slice(0, 5).join(" ");
      await SavedPromptService.save(dbUser.id as unknown as bigint, {
        title: title.length > 50 ? title.slice(0, 50) + "..." : title,
        prompt: promptText,
        niche: nicheKey,
        source: "custom",
      });
      ctx.session.state = "DASHBOARD";
      ctx.session.stateData = {
        ...ctx.session.stateData,
        addingPromptNiche: undefined,
      };
      const niche = _PL[nicheKey];
      const psLang = ctx.session?.userLang || "id";
      const nicheDisplay = `${niche?.emoji || ""} ${niche?.label || nicheKey}`;
      const preview = `${promptText.slice(0, 150)}${promptText.length > 150 ? "..." : ""}`;
      await ctx.reply(
        t("msg.prompt_saved", psLang, { niche: nicheDisplay, preview }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t("msg.btn_create_video_now", psLang), callback_data: "create_video_new" }],
              [{ text: t("msg.btn_view_saved", psLang), callback_data: `my_prompts_${nicheKey}` }],
              [{ text: t("btn.main_menu", psLang), callback_data: "main_menu" }],
            ],
          },
        },
      );
      ctx.session.stateData = {
        ...ctx.session.stateData,
        selectedPrompt: promptText,
      };
    }
  } catch (err) {
    await ctx.reply(t("msg.save_prompt_failed", ctx.session?.userLang || "id"));
    logger.warn("Failed to save custom prompt:", err);
  }
  return true;
}

/**
 * Handle CUSTOM_PROMPT_INPUT state — user enters custom prompt for video creation.
 */
export async function handleCustomPromptInput(ctx: BotContext): Promise<boolean> {
  if (
    ctx.session?.state !== "CUSTOM_PROMPT_INPUT" ||
    !ctx.session?.videoCreation?.waitingForCustomPrompt ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const promptText = message.text.trim();

  if (!promptText) {
    await ctx.reply(t("msg.send_prompt_or_create", ctx.session?.userLang || "id"));
    return true;
  }

  ctx.session.videoCreation.customPrompt = promptText;
  ctx.session.videoCreation.waitingForCustomPrompt = false;
  ctx.session.state = "DASHBOARD";
  ctx.session.videoCreation.waitingForImage = true;

  const cpLang = ctx.session?.userLang || "id";
  await ctx.reply(
    t("msg.photo_received", cpLang) + "\n\n" + t("msg.send_photo_or_skip", cpLang),
    { parse_mode: "Markdown" },
  );
  return true;
}

/**
 * Handle WAITING_ACCOUNT_ID state — user connects a social media account.
 */
export async function handleWaitingAccountId(ctx: BotContext): Promise<boolean> {
  if (ctx.session?.state !== "WAITING_ACCOUNT_ID" || !("text" in ctx.message!)) {
    return false;
  }

  const message = ctx.message as { text: string };
  const accountId = message.text.trim();
  const platform = ctx.session.connectingPlatform || "unknown";
  const telegramId = BigInt(ctx.from!.id);

  if (!accountId || accountId.startsWith("/")) {
    await ctx.reply(t("msg.invalid_account_id", ctx.session?.userLang || "id"));
    return true;
  }

  try {
    await PostAutomationService.connectAccount(telegramId, platform, accountId);
    const acLang = ctx.session?.userLang || "id";
    await ctx.reply(
      t("msg.account_connected", acLang, { platform: platform.toUpperCase(), accountId }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("msg.btn_manage_accounts", acLang), callback_data: "manage_accounts" }],
            [{ text: t("msg.btn_create_video_new", acLang), callback_data: "create_video_new" }],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Failed to connect account:", error);
    const cfLang = ctx.session?.userLang || "id";
    await ctx.reply(
      t("msg.connect_failed", cfLang, { error: (error as Error).message || "Unknown error" }),
    );
  }

  ctx.session.state = "DASHBOARD";
  ctx.session.connectingPlatform = undefined;
  return true;
}

/**
 * Handle eBook flow states (EBOOK_IDEA, EBOOK_TITLE, EBOOK_CHAPTERS).
 */
export async function handleEbookStates(ctx: BotContext): Promise<boolean> {
  const state = ctx.session?.state;
  if (state !== "EBOOK_IDEA" && state !== "EBOOK_TITLE" && state !== "EBOOK_CHAPTERS") {
    return false;
  }

  const message = ctx.message!;
  if (!("text" in message)) return false;

  if (state === "EBOOK_IDEA") {
    const { handleEbookIdea } = await import("@/commands/ebook.js");
    await handleEbookIdea(ctx, message as unknown as Record<string, unknown>);
    return true;
  }
  if (state === "EBOOK_TITLE") {
    const { handleEbookTitle } = await import("@/commands/ebook.js");
    await handleEbookTitle(ctx, message as unknown as Record<string, unknown>);
    return true;
  }
  if (state === "EBOOK_CHAPTERS") {
    const { handleEbookChapters } = await import("@/commands/ebook.js");
    await handleEbookChapters(ctx, message as unknown as Record<string, unknown>);
    return true;
  }
  return false;
}
