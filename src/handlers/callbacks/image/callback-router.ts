/**
 * Image handlers — Callback router.
 *
 * Dispatches image-related callback_data to the appropriate focused handler.
 * Keeps the if-else chain but delegates logic to smaller modules.
 */
import { t } from "@/i18n/translations";
import { AvatarService } from "@/services/avatar.service";
import { btnBackMain } from "./element-ui";
import { handleImageGeneration } from "./handle-generation";
import {
  handleAvatarManage,
  handleAvatarAdd,
  handleAvatarView,
  handleAvatarSetDefault,
  handleAvatarDelete,
} from "./avatar-callbacks";
import type { BotContext } from "@/types";

export async function handleImageCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  // ── Image generate menu ──
  if (data === "image_generate") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || "id";
    await ctx.editMessageText(t("cb.image_generate_title", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("btn.product_photo", lang),
              callback_data: "img_product",
            },
          ],
          [{ text: t("btn.fnb_food", lang), callback_data: "img_fnb" }],
          [
            {
              text: t("btn.real_estate", lang),
              callback_data: "img_realestate",
            },
          ],
          [{ text: t("btn.automotive", lang), callback_data: "img_car" }],
          [{ text: "🔍 Analisis Gambar", callback_data: "image_analyze" }],
          [
            {
              text: t("btn.manage_avatar", lang),
              callback_data: "avatar_manage",
            },
          ],
          [btnBackMain(lang)],
        ],
      },
    });
    return true;
  }

  // ── Image gen sub-menu ──
  if (data === "img_gen_menu") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || "id";
    await ctx.editMessageText(t("cb.img_gen_menu", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("cb.img_product", lang), callback_data: "img_product" }],
          [{ text: t("cb.img_fnb", lang), callback_data: "img_fnb" }],
          [
            {
              text: t("cb.img_realestate", lang),
              callback_data: "img_realestate",
            },
          ],
          [{ text: t("cb.img_car", lang), callback_data: "img_car" }],
          [btnBackMain(lang)],
        ],
      },
    });
    return true;
  }

  // ── Image from prompt (auto-category) ──
  if (data === "image_from_prompt") {
    await ctx.answerCbQuery();
    const nicheToCategory: Record<string, string> = {
      fnb: "fnb",
      food: "fnb",
      fashion: "product",
      health: "product",
      tech: "product",
      finance: "product",
      education: "product",
      entertainment: "product",
      travel: "realestate",
    };
    const sessionNiche = (ctx.session?.selectedNiche ||
      ctx.session?.stateData?.addingPromptNiche ||
      "product") as string;
    const autoCategory = nicheToCategory[sessionNiche] || "product";
    await handleImageGeneration(ctx, autoCategory);
    return true;
  }

  // ── img_* category selection ──
  if (data.startsWith("img_")) {
    const category = data.replace("img_", "");
    await handleImageGeneration(ctx, category);
    return true;
  }

  // ── Avatar management ──
  if (data === "avatar_manage") return handleAvatarManage(ctx);
  if (data === "avatar_add") return handleAvatarAdd(ctx);
  if (data.startsWith("avatar_view_"))
    return handleAvatarView(
      ctx,
      parseInt(data.replace("avatar_view_", ""), 10),
    );
  if (data.startsWith("avatar_default_"))
    return handleAvatarSetDefault(
      ctx,
      parseInt(data.replace("avatar_default_", ""), 10),
    );
  if (data.startsWith("avatar_delete_"))
    return handleAvatarDelete(
      ctx,
      parseInt(data.replace("avatar_delete_", ""), 10),
    );

  // ── imgref_* reference image flow ──
  if (data === "imgref_upload") return handleImgRefUpload(ctx);
  if (data === "imgref_skip") return handleImgRefSkip(ctx);
  if (data.startsWith("imgref_avatar_"))
    return handleImgRefAvatar(
      ctx,
      parseInt(data.replace("imgref_avatar_", ""), 10),
    );

  // ── imgelem_* element selection ──
  if (data.startsWith("imgelem_")) return handleElementSelection(ctx, data);

  // ── image_analyze ──
  if (data === "image_analyze") {
    await ctx.answerCbQuery();
    ctx.session.state = "IMAGE_REFERENCE_WAITING";
    ctx.session.stateData = { ...ctx.session.stateData, mode: "analyze" };
    await ctx.editMessageText(
      "🔍 *Analisis Gambar*\n\nKirim foto yang ingin dianalisis.\n\nBot akan mendeskripsikan isi gambar, elemen yang terdeteksi, dan prompt AI yang sesuai.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Kembali", callback_data: "image_generate" }],
          ],
        },
      },
    );
    return true;
  }

  // ── generate_image_v3_* ──
  if (data.startsWith("generate_image_v3_")) {
    await ctx.answerCbQuery();
    const promptId = data.replace("generate_image_v3_", "");
    const { findAnyPrompt } = await import("../../../commands/prompts.js");
    const prompt = await findAnyPrompt(promptId);
    if (!prompt) {
      const lang = ctx.session?.userLang || "id";
      await ctx.reply(t("cb.prompt_not_found", lang));
      return true;
    }
    const { handlePromptsCallback } = await import("../prompts.js");
    await handlePromptsCallback(ctx, `generate_free_${promptId}`);
    return true;
  }

  return false;
}

// ── Inline sub-handlers (small enough to keep local) ──

async function handleImgRefUpload(ctx: BotContext): Promise<boolean> {
  await ctx.answerCbQuery();
  const lang = ctx.session?.userLang || "id";
  ctx.session.state = "IMAGE_REFERENCE_WAITING";
  await ctx.editMessageText(t("cb.imgref_upload", lang), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: t("btn.skip_describe", lang), callback_data: "imgref_skip" }],
        [{ text: t("btn.back", lang), callback_data: "image_generate" }],
      ],
    },
  });
  return true;
}

async function handleImgRefSkip(ctx: BotContext): Promise<boolean> {
  await ctx.answerCbQuery();
  const lang = ctx.session?.userLang || "id";
  ctx.session.state = "IMAGE_GENERATION_WAITING";
  const category = ctx.session.stateData?.imageCategory as string;
  ctx.session.stateData = {
    ...ctx.session.stateData,
    imageCategory: category,
    mode: "text2img",
  };

  const hintKeys: Record<string, string> = {
    product: "cb.imgref_hint_product",
    fnb: "cb.imgref_hint_fnb",
    realestate: "cb.imgref_hint_realestate",
    car: "cb.imgref_hint_car",
  };
  const hint = t(hintKeys[category] || "cb.imgref_hint_default", lang);

  await ctx.editMessageText(t("cb.describe_image", lang, { hint }), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: t("btn.back", lang), callback_data: "image_generate" }],
      ],
    },
  });
  return true;
}

async function handleImgRefAvatar(
  ctx: BotContext,
  avatarId: number,
): Promise<boolean> {
  const avatar = await AvatarService.getAvatar(avatarId);
  if (!avatar) {
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(t("misc.avatar_not_found", lang));
    return true;
  }

  ctx.session.state = "IMAGE_GENERATION_WAITING";
  ctx.session.stateData = {
    ...ctx.session.stateData,
    avatarImageUrl: avatar.imageUrl,
    avatarId: avatar.id,
    avatarName: avatar.name,
    mode: "ip_adapter",
  };

  const lang2 = ctx.session?.userLang || "id";
  await ctx.editMessageText(
    t("cb.using_avatar", lang2, { name: avatar.name }),
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[btnBackMain(lang2)]] },
    },
  );
  return true;
}

async function handleElementSelection(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  const { renderElementSelectionKeyboard, buildElementSelectionMessage } =
    await import("./element-ui.js");

  if (
    data === "imgelem_product" ||
    data === "imgelem_character" ||
    data === "imgelem_background"
  ) {
    await ctx.answerCbQuery();

    // Video context
    if (ctx.session.state === "VIDEO_ELEMENT_SELECTION") {
      const vsel = ctx.session.videoCreation?.videoElementSelection || {
        keepProduct: true,
        keepCharacter: false,
        keepBackground: false,
      };
      if (data === "imgelem_product") vsel.keepProduct = !vsel.keepProduct;
      if (data === "imgelem_character")
        vsel.keepCharacter = !vsel.keepCharacter;
      if (data === "imgelem_background")
        vsel.keepBackground = !vsel.keepBackground;
      ctx.session.videoCreation = {
        ...ctx.session.videoCreation,
        videoElementSelection: vsel,
      };
      const videoAnalysis = ctx.session.videoCreation?.videoAnalysisResult as
        | {
            hasCharacter: boolean;
            hasProduct: boolean;
            characterDesc?: string;
            productDesc?: string;
          }
        | undefined;
      await ctx.editMessageText(
        buildElementSelectionMessage(
          videoAnalysis || { hasCharacter: true, hasProduct: true },
          videoAnalysis?.characterDesc,
          videoAnalysis?.productDesc,
        ),
        {
          parse_mode: "Markdown",
          reply_markup: renderElementSelectionKeyboard(vsel),
        },
      );
      return true;
    }

    // Image context
    const sel = (ctx.session.stateData?.imageElementSelection as {
      keepProduct: boolean;
      keepCharacter: boolean;
      keepBackground: boolean;
    }) || { keepProduct: true, keepCharacter: false, keepBackground: false };

    if (data === "imgelem_product") sel.keepProduct = !sel.keepProduct;
    if (data === "imgelem_character") sel.keepCharacter = !sel.keepCharacter;
    if (data === "imgelem_background") sel.keepBackground = !sel.keepBackground;

    ctx.session.stateData = {
      ...ctx.session.stateData,
      imageElementSelection: sel,
    };
    const analysis = ctx.session.stateData?.imageAnalysisResult as
      | {
          hasCharacter: boolean;
          hasProduct: boolean;
          characterDesc?: string;
          productDesc?: string;
        }
      | undefined;

    await ctx.editMessageText(
      buildElementSelectionMessage(
        analysis || { hasCharacter: true, hasProduct: true },
        analysis?.characterDesc,
        analysis?.productDesc,
      ),
      {
        parse_mode: "Markdown",
        reply_markup: renderElementSelectionKeyboard(sel),
      },
    );
    return true;
  }

  if (data === "imgelem_skip") {
    await ctx.answerCbQuery("Melewati pemilihan elemen...");
    if (ctx.session.state === "VIDEO_ELEMENT_SELECTION") {
      const { handleVideoCreationImage } = await import("../../message.js");
      const pendingPhotos = ctx.session.videoCreation?.pendingPhotos || [];
      ctx.session.state = "DASHBOARD";
      await handleVideoCreationImage(ctx, pendingPhotos);
      return true;
    }
    // Image context
    const lang = ctx.session?.userLang || "id";
    ctx.session.state = "IMAGE_GENERATION_WAITING";
    const category = ctx.session.stateData?.imageCategory as string;
    const hintKeys: Record<string, string> = {
      product: "cb.imgref_hint_product",
      fnb: "cb.imgref_hint_fnb",
      realestate: "cb.imgref_hint_realestate",
      car: "cb.imgref_hint_car",
    };
    const hint = t(hintKeys[category] || "cb.imgref_hint_default", lang);
    await ctx.editMessageText(t("cb.describe_image", lang, { hint }), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("btn.back", lang), callback_data: "image_generate" }],
        ],
      },
    });
    return true;
  }

  if (data === "imgelem_confirm") {
    await ctx.answerCbQuery();

    // Video context
    if (ctx.session.state === "VIDEO_ELEMENT_SELECTION") {
      const { handleVideoCreationImage } = await import("../../message.js");
      const pendingPhotos = ctx.session.videoCreation?.pendingPhotos || [];
      ctx.session.state = "DASHBOARD";
      await handleVideoCreationImage(ctx, pendingPhotos);
      return true;
    }

    // Image context
    const lang = ctx.session?.userLang || "id";
    const sel = (ctx.session.stateData?.imageElementSelection as {
      keepProduct: boolean;
      keepCharacter: boolean;
      keepBackground: boolean;
    }) || { keepProduct: true, keepCharacter: false, keepBackground: false };

    const keepAny = sel.keepProduct || sel.keepCharacter || sel.keepBackground;
    if (!keepAny) {
      ctx.session.stateData = {
        ...ctx.session.stateData,
        mode: "text2img",
        referenceImageUrl: undefined,
      };
    }

    const pendingPrompt = ctx.session.stateData?.pendingPrompt as
      | string
      | undefined;
    if (pendingPrompt) {
      const { executeImageGeneration } = await import("../../message.js");
      ctx.session.stateData = {
        ...ctx.session.stateData,
        pendingPrompt: undefined,
      };
      const category = ctx.session.stateData?.imageCategory as string;
      const referenceImageUrl = ctx.session.stateData?.referenceImageUrl as
        | string
        | undefined;
      const mode = ((ctx.session.stateData?.mode as string) ||
        "img2img") as import("@/services/image.service").ImageGenerationMode;
      const elementAnalysis = ctx.session.stateData?.imageAnalysisResult as
        | { productDesc: string; characterDesc: string; backgroundDesc: string }
        | undefined;
      ctx.session.state = "DASHBOARD";
      await executeImageGeneration(ctx, pendingPrompt, {
        category,
        referenceImageUrl,
        mode,
        elementSelection: sel,
        elementAnalysis,
      });
      return true;
    }

    ctx.session.state = "IMAGE_GENERATION_WAITING";
    const category = ctx.session.stateData?.imageCategory as string;
    const hintKeys: Record<string, string> = {
      product: "cb.imgref_hint_product",
      fnb: "cb.imgref_hint_fnb",
      realestate: "cb.imgref_hint_realestate",
      car: "cb.imgref_hint_car",
    };
    const hint = t(hintKeys[category] || "cb.imgref_hint_default", lang);
    const textOnlyNote = !keepAny
      ? "\n\n_(tanpa referensi, mode text-only)_"
      : "";

    await ctx.editMessageText(
      t("cb.describe_image", lang, { hint }) + textOnlyNote,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.back", lang), callback_data: "image_generate" }],
          ],
        },
      },
    );
    return true;
  }

  return false;
}
