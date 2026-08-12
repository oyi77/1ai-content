/**
 * Photo Upload Handlers
 *
 * Handles photo upload states: CREATE_VIDEO_UPLOAD, IMAGE_REFERENCE_WAITING,
 * AVATAR_UPLOAD_WAITING, AVATAR_NAME_WAITING, and related image upload flows.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { ContentAnalysisService } from "@/services/content-analysis.service";
import {
  detectImageElements,
  renderElementSelectionKeyboard,
  buildElementSelectionMessage,
} from "@/handlers/callbacks/image";
import { AvatarService } from "@/services/avatar.service";
import { PostAutomationService } from "@/services/postautomation.service";

/**
 * Handle CREATE_VIDEO_UPLOAD state — user uploads a photo to start video creation.
 */
export async function handleCreateVideoUpload(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "CREATE_VIDEO_UPLOAD" ||
    !("photo" in ctx.message!)
  ) {
    return false;
  }

  const { getPersonaForUser, isNicheAllowedForPersona } =
    await import("@/config/personas.js");
  const { resolveNicheKey } = await import("@/config/niches.js");
  const cvuLang = ctx.session?.userLang || "id";
  const cvuPersona = getPersonaForUser(ctx.session?.userMode);
  const allNicheButtons = [
    {
      text: t("msg.niche_btn_fnb", cvuLang),
      callback_data: "niche_fnb",
      key: "fnb",
    },
    {
      text: t("msg.niche_btn_beauty", cvuLang),
      callback_data: "niche_beauty",
      key: "beauty",
    },
    {
      text: t("msg.niche_btn_retail", cvuLang),
      callback_data: "niche_retail",
      key: "retail",
    },
    {
      text: t("msg.niche_btn_services", cvuLang),
      callback_data: "niche_services",
      key: "services",
    },
    {
      text: t("msg.niche_btn_professional", cvuLang),
      callback_data: "niche_professional",
      key: "professional",
    },
    {
      text: t("msg.niche_btn_hospitality", cvuLang),
      callback_data: "niche_hospitality",
      key: "hospitality",
    },
  ].filter((b) => isNicheAllowedForPersona(cvuPersona, resolveNicheKey(b.key)));

  const nicheRows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < allNicheButtons.length; i += 2) {
    nicheRows.push(
      allNicheButtons
        .slice(i, i + 2)
        .map((b) => ({ text: b.text, callback_data: b.callback_data })),
    );
  }

  await ctx.reply(t("msg.photo_received_niche", cvuLang), {
    reply_markup: {
      inline_keyboard:
        nicheRows.length > 0
          ? nicheRows
          : [
              [
                {
                  text: t("msg.niche_btn_fnb", cvuLang),
                  callback_data: "niche_fnb",
                },
              ],
            ],
    },
  });
  ctx.session.state = "CREATE_VIDEO_NICHE";
  return true;
}

/**
 * Handle IMAGE_REFERENCE_WAITING state — user uploads reference image for img2img.
 */
export async function handleImageReferenceWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "IMAGE_REFERENCE_WAITING" ||
    !("photo" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as {
    photo: Array<{ file_id: string; file_size?: number }>;
  };
  const photos = message.photo;
  const largestPhoto = photos[photos.length - 1];
  const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
  const referenceUrl = fileLink.toString();
  const refImgLang = ctx.session?.userLang || "id";

  // i2t mode: analyze only, no generation
  if (ctx.session.stateData?.mode === "analyze") {
    const analyzeLoading = await ctx.reply("🔍 _Menganalisis gambar..._", {
      parse_mode: "Markdown",
    });
    try {
      const analysis = await ContentAnalysisService.extractPrompt(
        referenceUrl,
        "image",
      );
      if (analysis.success && analysis.prompt) {
        const elements = detectImageElements(analysis.prompt);
        const detected: string[] = [];
        if (elements.hasProduct)
          detected.push(
            `📦 *Produk:* _${elements.productDesc || "terdeteksi"}_`,
          );
        if (elements.hasCharacter)
          detected.push(
            `👤 *Orang:* _${elements.characterDesc || "terdeteksi"}_`,
          );
        if (elements.backgroundDesc)
          detected.push(`🖼️ *Background:* _${elements.backgroundDesc}_`);
        const detectedText =
          detected.length > 0
            ? detected.join("\n")
            : "_Tidak ada elemen spesifik_";

        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          analyzeLoading.message_id,
          undefined,
          `📝 *Deskripsi Gambar*\n\n${detectedText}\n\n*Prompt AI:*\n\`${analysis.prompt.slice(0, 400)}\``,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🖼️ Edit Gambar", callback_data: "imgref_upload" },
                  {
                    text: "🎬 Jadikan Video",
                    callback_data: "create_video_new",
                  },
                ],
                [{ text: "🏠 Menu Utama", callback_data: "main_menu" }],
              ],
            },
          },
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          analyzeLoading.message_id,
          undefined,
          "❌ Tidak bisa menganalisis gambar.",
        );
      }
    } catch (err) {
      logger.warn("i2t analyze failed:", err);
      await ctx.telegram
        .deleteMessage(ctx.chat!.id, analyzeLoading.message_id)
        .catch(() => {});
      await ctx.reply("❌ Analisis gambar gagal.");
    }
    ctx.session.state = "DASHBOARD";
    ctx.session.stateData = {};
    return true;
  }

  // Regular img2img flow with element selection
  const loadingMsg = await ctx.reply("🔍 _Menganalisis gambar..._", {
    parse_mode: "Markdown",
  });

  let analysisResult: {
    hasCharacter: boolean;
    hasProduct: boolean;
    characterDesc: string;
    productDesc: string;
    backgroundDesc: string;
  } | null = null;

  try {
    const analysis = await ContentAnalysisService.extractPrompt(
      referenceUrl,
      "image",
    );
    if (analysis.success && analysis.prompt) {
      analysisResult = detectImageElements(analysis.prompt);
    }
  } catch (err) {
    logger.warn("Element detection failed (non-fatal):", err);
  }

  if (analysisResult) {
    const defaultSel = {
      keepProduct: analysisResult.hasProduct,
      keepCharacter: analysisResult.hasProduct
        ? false
        : analysisResult.hasCharacter,
      keepBackground: false,
    };

    ctx.session.state = "IMAGE_ELEMENT_SELECTION";
    ctx.session.stateData = {
      ...ctx.session.stateData,
      referenceImageUrl: referenceUrl,
      mode: "img2img",
      imageAnalysisResult: {
        hasProduct: analysisResult.hasProduct,
        hasCharacter: analysisResult.hasCharacter,
        productDesc: analysisResult.productDesc,
        characterDesc: analysisResult.characterDesc,
        backgroundDesc: analysisResult.backgroundDesc,
      },
      imageElementSelection: defaultSel,
    };

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      undefined,
      buildElementSelectionMessage(
        analysisResult,
        analysisResult.characterDesc,
        analysisResult.productDesc,
      ),
      {
        parse_mode: "Markdown",
        reply_markup: renderElementSelectionKeyboard(defaultSel),
      },
    );
    return true;
  }

  // Analysis failed — proceed with img2img without element selection
  ctx.telegram
    .deleteMessage(ctx.chat!.id, loadingMsg.message_id)
    .catch(() => {});
  ctx.session.state = "IMAGE_GENERATION_WAITING";
  ctx.session.stateData = {
    ...ctx.session.stateData,
    referenceImageUrl: referenceUrl,
    mode: "img2img",
  };
  await ctx.reply(t("msg.ref_image_received", refImgLang), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t("msg.btn_cancel", refImgLang),
            callback_data: "image_generate",
          },
        ],
      ],
    },
  });
  return true;
}

/**
 * Handle AVATAR_UPLOAD_WAITING state — user uploads an avatar photo.
 */
export async function handleAvatarUploadWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "AVATAR_UPLOAD_WAITING" ||
    !("photo" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { photo: Array<{ file_id: string }> };
  const photos = message.photo;
  const largest = photos[photos.length - 1];
  const fileLink = await ctx.telegram.getFileLink(largest.file_id);
  const photoUrl = fileLink.toString();

  ctx.session.stateData = {
    ...ctx.session.stateData,
    avatarImageUrl: photoUrl,
  };
  ctx.session.state = "AVATAR_NAME_WAITING";

  const lang = ctx.session?.userLang || "id";
  await ctx.reply(t("msg.avatar_upload_received", lang), {
    parse_mode: "Markdown",
  });
  return true;
}

/**
 * Handle AVATAR_NAME_WAITING state — user names their avatar.
 */
export async function handleAvatarNameWaiting(
  ctx: BotContext,
): Promise<boolean> {
  if (
    ctx.session?.state !== "AVATAR_NAME_WAITING" ||
    !("text" in ctx.message!)
  ) {
    return false;
  }

  const message = ctx.message as { text: string };
  const name = message.text.trim();
  const telegramId = BigInt(ctx.from!.id);
  const photoUrl = ctx.session?.stateData?.avatarImageUrl as string | undefined;

  if (!name || !photoUrl) {
    const lang = ctx.session?.userLang || "id";
    await ctx.reply(t("msg.avatar_name_required", lang));
    return true;
  }

  try {
    await AvatarService.createAvatar(telegramId, name, photoUrl);
    ctx.session.state = "DASHBOARD";
    ctx.session.stateData = {};
    const lang = ctx.session?.userLang || "id";
    await ctx.reply(t("msg.avatar_created", lang, { name }), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    logger.error("Failed to create avatar:", err);
    await ctx.reply("❌ Gagal membuat avatar.");
  }
  return true;
}

/**
 * Handle AVATAR_TALK_PHOTO state — user uploads photo for talking avatar.
 */
export async function handleAvatarTalkPhoto(ctx: BotContext): Promise<boolean> {
  if (
    ctx.session?.state !== "avatar_talk_photo" ||
    !("photo" in ctx.message!)
  ) {
    return false;
  }
  const { handleAvatarTalkCallbacks } =
    await import("@/handlers/callbacks/avatar-talk.js");
  await handleAvatarTalkCallbacks(ctx, "avatar_talk_photo_received");
  return true;
}
