/**
 * Image Generation Handlers
 *
 * Handles IMAGE_GENERATION_WAITING, CLONE_EDIT_DESC_WAITING,
 * CLONE_VIDEO_WAITING, and related image generation flows.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { executeImageGeneration } from "@/handlers/message";

/**
 * Handle IMAGE_GENERATION_WAITING state — user types description for image generation.
 */
export async function handleImageGenerationWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "IMAGE_GENERATION_WAITING" ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const description = message.text.trim();

  if (!description) {
    await ctx.reply(t("msg.send_description", ctx.session?.userLang || "id"));
    return true;
  }

  // Get mode from session state data (default: text2img)
  const mode =
    (ctx.session.stateData?.mode as "text2img" | "img2img" | "ip_adapter") ||
    "text2img";
  const referenceImageUrl = ctx.session.stateData?.referenceImageUrl as
    | string
    | undefined;
  const avatarImageUrl = ctx.session.stateData?.avatarImageUrl as
    | string
    | undefined;
  const category = (ctx.session.stateData?.category as string) || "product";
  const elementSelection = ctx.session.stateData?.imageElementSelection as
    | { keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean }
    | undefined;
  const elementAnalysis = ctx.session.stateData?.imageAnalysisResult as
    | { productDesc: string; characterDesc: string; backgroundDesc: string }
    | undefined;

  await executeImageGeneration(ctx, description, {
    category,
    referenceImageUrl,
    avatarImageUrl,
    mode,
    elementSelection,
    elementAnalysis,
  });
  return true;
}

/**
 * Handle CLONE_EDIT_DESC_WAITING state — user edits clone style description.
 */
export async function handleCloneEditDescWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "CLONE_EDIT_DESC_WAITING" ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const newDesc = message.text.trim();
  const lang = ctx.session?.userLang || "id";

  if (newDesc.length < 5) {
    await ctx.reply(t("msg.prompt_too_short", lang));
    return true;
  }

  if (ctx.session) {
    ctx.session.stateData = {
      ...ctx.session.stateData,
      cloneDescription: newDesc,
    };
    ctx.session.state = "DASHBOARD";
  }

  await ctx.reply(t("msg.clone_desc_updated", lang), {
    parse_mode: "Markdown",
  });
  return true;
}

/**
 * Handle CLONE_VIDEO_WAITING state — user provides reference for video clone.
 */
export async function handleCloneVideoWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (ctx.session?.state !== "CLONE_VIDEO_WAITING") {
    return false;
  }

  const message = ctx.message!;
  const lang = ctx.session?.userLang || "id";

  if (!("photo" in message) && !("video" in message) && !("text" in message)) {
    await ctx.reply(t("msg.send_photo_video_or_text", lang));
    return true;
  }

  if ("photo" in message) {
    const photos = message.photo;
    const largest = photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);
    if (ctx.session) {
      ctx.session.stateData = {
        ...ctx.session.stateData,
        cloneReferenceUrl: fileLink.toString(),
      };
    }
    await ctx.reply(t("msg.clone_reference_received", lang), {
      parse_mode: "Markdown",
    });
    return true;
  }

  if ("text" in message && message.text) {
    const description = message.text.trim();
    if (ctx.session) {
      ctx.session.stateData = {
        ...ctx.session.stateData,
        cloneDescription: description,
      };
    }
    await ctx.reply(t("msg.clone_desc_updated", lang), {
      parse_mode: "Markdown",
    });
    return true;
  }

  return true;
}
