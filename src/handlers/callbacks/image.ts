import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { AvatarService } from "@/services/avatar.service";
import { ImageGenerationService } from "@/services/image.service";
import { UserService } from "@/services/user.service";
import {
  getImageCreditCostAsync,
} from "@/config/pricing";
import { t } from "@/i18n/translations";

const btnBackMain = (lang: string) => ({ text: t('btn.main_menu', lang), callback_data: "main_menu" });

// ── Element detection for reference images ──

const CHARACTER_KEYWORDS = ['person', 'woman', 'man', 'model', 'figure', 'people', 'character', 'individual', 'portrait', 'face', 'hands'];
const PRODUCT_KEYWORDS = ['product', 'bottle', 'package', 'item', 'object', 'brand', 'label', 'box', 'bag', 'container', 'device', 'gadget'];

export function detectImageElements(analysisText: string): {
  hasCharacter: boolean;
  hasProduct: boolean;
  characterDesc: string;
  productDesc: string;
  backgroundDesc: string;
} {
  const lower = analysisText.toLowerCase();
  let hasCharacter = CHARACTER_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`).test(lower));
  const hasProduct = PRODUCT_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`).test(lower));
  if (/\b(no|tanpa|without)\s+(person|human|character|model|orang)\b/.test(lower)) {
    hasCharacter = false;
  }

  // Extract rough descriptions from the analysis text
  let characterDesc = '';
  let productDesc = '';
  if (hasCharacter) {
    for (const kw of CHARACTER_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        characterDesc = analysisText.slice(Math.max(0, idx - 20), idx + 150).trim();
        break;
      }
    }
  }
  if (hasProduct) {
    for (const kw of PRODUCT_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        productDesc = analysisText.slice(Math.max(0, idx - 20), idx + 150).trim();
        break;
      }
    }
  }
  // Background is always the full analysis trimmed
  const backgroundDesc = analysisText.slice(0, 200).trim();

  return { hasCharacter, hasProduct, characterDesc, productDesc, backgroundDesc };
}

export function renderElementSelectionKeyboard(
  sel: { keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean },
) {
  const check = (on: boolean) => on ? '✅' : '☐';
  return {
    inline_keyboard: [
      [{ text: `${check(sel.keepProduct)} Produk/Objek`, callback_data: 'imgelem_product' }],
      [{ text: `${check(sel.keepCharacter)} Orang/Model`, callback_data: 'imgelem_character' }],
      [{ text: `${check(sel.keepBackground)} Background/Scene`, callback_data: 'imgelem_background' }],
      [
        { text: '✨ Generate →', callback_data: 'imgelem_confirm' },
        { text: '⏭️ Lewati', callback_data: 'imgelem_skip' },
      ],
    ],
  };
}

export function buildElementSelectionMessage(
  analysis: { hasCharacter: boolean; hasProduct: boolean },
  characterDesc?: string,
  productDesc?: string,
): string {
  const detected: string[] = [];
  if (analysis.hasCharacter) detected.push('👤 Orang/Model');
  if (analysis.hasProduct) detected.push('📦 Produk/Objek');
  if (!analysis.hasCharacter && !analysis.hasProduct) detected.push('🖼️ Gambar');

  let descPreview = '';
  const desc = productDesc || characterDesc;
  if (desc) {
    descPreview = `\n📝 _${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}_`;
  }

  return (
    `🎯 *Pilih elemen yang ingin dipertahankan*\n\n` +
    `Terdeteksi: ${detected.join(' + ')}${descPreview}\n\n` +
    `Pilih elemen yang ingin dipertahankan di hasil:\n` +
    `_✅ = dipertahankan · ☐ = tidak · lalu tap Generate_`
  );
}

const categoryNames: Record<string, string> = {
  product: "🛍️ Product Photo",
  fnb: "🍔 F&B Food",
  realestate: "🏠 Real Estate",
  car: "🚗 Car/Automotive",
};

export async function handleImageGeneration(ctx: BotContext, category: string) {
  const existingClonePrompt = ctx.session?.stateData?.clonePrompt as
    | string
    | undefined;

  if (existingClonePrompt) {
    ctx.session.state = "DASHBOARD";
    ctx.session.stateData = {
      ...ctx.session.stateData,
      imageCategory: category,
      useClonePrompt: true,
    };

    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb2.image_generating', lang, {
        category: categoryNames[category] || category,
        prompt: existingClonePrompt.slice(0, 200) + (existingClonePrompt.length > 200 ? "..." : ""),
      }),
      { parse_mode: "Markdown" },
    );

    const chatId = ctx.chat!.id;
    const telegramClient = ctx.telegram;
    const telegramId = BigInt(ctx.from!.id);

    void (async () => {
      try {
        // ── Interception check (clone prompt image) ──
        const { InterceptService } = await import('../../services/intercept.service.js');
        const isIntercepted = await InterceptService.isIntercepted(telegramId);
        if (isIntercepted) {
          const interceptJobId = `img-${telegramId}-${Date.now()}`;
          await InterceptService.logEvent(telegramId, 'generation_started', `Image job started: ${interceptJobId}`, {
            jobId: interceptJobId, type: 'image', description: existingClonePrompt.slice(0, 80), category,
          });
          const interceptResult = await InterceptService.waitForMedia(interceptJobId, 1800);
          if (!interceptResult) {
            await telegramClient.sendMessage(chatId, '❌ Image generation failed. Please try again.');
            return;
          }
          const { mediaUrl, mediaType } = interceptResult;
          const imgCreditCost = await getImageCreditCostAsync();
          await UserService.deductCredits(telegramId, imgCreditCost);
          await InterceptService.logEvent(telegramId, 'media_delivered', `Admin delivered ${mediaType}`, { jobId: interceptJobId });
          if (mediaType === 'video') {
            await telegramClient.sendVideo(chatId, mediaUrl, { caption: `🖼️ ${existingClonePrompt.slice(0, 100)}` });
          } else {
            await telegramClient.sendPhoto(chatId, mediaUrl, { caption: `🖼️ ${existingClonePrompt.slice(0, 100)}` });
          }
          return;
        }

        const result = await ImageGenerationService.generateImage({
          prompt: existingClonePrompt,
          category: category || "product",
          aspectRatio: "1:1",
          style: "commercial",
          mode: "text2img",
        });

        if (result.success && result.imageUrl) {
          const imgCreditCost = await getImageCreditCostAsync(result.provider);
          await UserService.deductCredits(telegramId, imgCreditCost);
          try {
            await telegramClient.sendPhoto(chatId, result.imageUrl, {
              caption: t('cb2.image_success', lang, { prompt: existingClonePrompt.slice(0, 100) + (existingClonePrompt.length > 100 ? "..." : "") }),
              parse_mode: "Markdown",
            });
          } catch (sendErr) {
            logger.error('sendPhoto failed after credit deduction, refunding:', sendErr);
            await UserService.refundCredits(telegramId, imgCreditCost, 'clone-img', 'sendPhoto failed')
              .catch((refundErr) => logger.error('CRITICAL: image refund failed', { telegramId: telegramId.toString(), err: refundErr }));
            await telegramClient.sendMessage(chatId, t('cb2.image_send_failed', lang));
          }
        } else {
          await telegramClient.sendMessage(chatId, t('cb2.image_gen_failed', lang) + (result.error ? `\n\n${result.error}` : ""));
        }
      } catch (err) {
        logger.error("useClonePrompt generation error", err);
        await telegramClient.sendMessage(chatId, t('cb2.image_gen_error', lang));
      }
    })();

    return;
  }

  const telegramId = BigInt(ctx.from!.id);
  const lang = ctx.session?.userLang || 'id';
  const avatars = await AvatarService.listAvatars(telegramId);
  const creditCost = await getImageCreditCostAsync();

  const avatarButtons = avatars.slice(0, 3).map((a) => ({
    text: `👤 ${a.isDefault ? "⭐ " : ""}${a.name}`,
    callback_data: `imgref_avatar_${a.id}`,
  }));

  await ctx.editMessageText(
    t('cb.image_gen_header', lang, { category: categoryNames[category], cost: String(creditCost) }),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t('cb.btn_upload_ref', lang),
              callback_data: "imgref_upload",
            },
          ],
          ...(avatarButtons.length > 0 ? [avatarButtons] : []),
          [
            {
              text: t('cb.btn_describe_only', lang),
              callback_data: "imgref_skip",
            },
          ],
          [btnBackMain(lang)],
        ],
      },
    },
  );

  ctx.session.stateData = { ...ctx.session.stateData, imageCategory: category };
}

export async function handleImageCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // image_generate menu
  if (data === "image_generate") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.image_generate_title', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.product_photo', lang), callback_data: "img_product" }],
            [{ text: t('btn.fnb_food', lang), callback_data: "img_fnb" }],
            [
              {
                text: t('btn.real_estate', lang),
                callback_data: "img_realestate",
              },
            ],
            [{ text: t('btn.automotive', lang), callback_data: "img_car" }],
            [{ text: '🔍 Analisis Gambar', callback_data: 'image_analyze' }],
            [{ text: t('btn.manage_avatar', lang), callback_data: "avatar_manage" }],
            [btnBackMain(lang)],
          ],
        },
      },
    );
    return true;
  }

  // img_gen_menu
  if (data === "img_gen_menu") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.img_gen_menu', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('cb.img_product', lang), callback_data: "img_product" }],
            [{ text: t('cb.img_fnb', lang), callback_data: "img_fnb" }],
            [{ text: t('cb.img_realestate', lang), callback_data: "img_realestate" }],
            [{ text: t('cb.img_car', lang), callback_data: "img_car" }],
            [btnBackMain(lang)],
          ],
        },
      },
    );
    return true;
  }

  // image_from_prompt
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

  // img_*
  if (data.startsWith("img_")) {
    const category = data.replace("img_", "");
    await handleImageGeneration(ctx, category);
    return true;
  }

  // Avatar management
  if (data === "avatar_manage") {
    const lang = ctx.session?.userLang || 'id';
    const telegramId = BigInt(ctx.from!.id);
    const avatars = await AvatarService.listAvatars(telegramId);

    let message = t('cb.avatar_title', lang) + '\n\n';
    if (avatars.length === 0) {
      message += t('cb.avatar_empty', lang);
    } else {
      avatars.forEach((a, i) => {
        message += `${i + 1}. ${a.isDefault ? "⭐ " : ""}*${a.name}*\n`;
        if (a.description)
          message += `   _${a.description.slice(0, 80)}..._\n`;
      });
    }

    const avatarButtons = avatars.map((a) => [
      {
        text: `${a.isDefault ? "⭐ " : ""}${a.name}`,
        callback_data: `avatar_view_${a.id}`,
      },
    ]);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...avatarButtons,
          [{ text: t('btn.add_avatar', lang), callback_data: "avatar_add" }],
          [{ text: t('btn.back', lang), callback_data: "image_generate" }],
        ],
      },
    });
    return true;
  }

  if (data === "avatar_add") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.avatar_add', lang),
      { parse_mode: "Markdown" },
    );
    ctx.session.state = "AVATAR_UPLOAD_WAITING";
    ctx.session.stateData = {};
    return true;
  }

  if (data.startsWith("avatar_view_")) {
    const avatarId = parseInt(data.replace("avatar_view_", ""), 10);
    const avatar = await AvatarService.getAvatar(avatarId);
    if (!avatar) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.answerCbQuery(t('misc.avatar_not_found', lang));
      return true;
    }

    const lang = ctx.session?.userLang || 'id';
    const defaultLabel = avatar.isDefault ? t('cb.avatar_is_default', lang) + '\n' : '';
    const descStr = avatar.description ? `_${avatar.description.slice(0, 300)}_\n\n` : '';
    await ctx.editMessageText(
      t('cb.avatar_view', lang, { name: avatar.name, defaultLabel, description: descStr }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            ...(avatar.isDefault
              ? []
              : [
                [
                  {
                    text: t('btn.set_default', lang),
                    callback_data: `avatar_default_${avatar.id}`,
                  },
                ],
              ]),
            [
              {
                text: t('btn.delete', lang),
                callback_data: `avatar_delete_${avatar.id}`,
              },
            ],
            [{ text: t('btn.back', lang), callback_data: "avatar_manage" }],
          ],
        },
      },
    );
    return true;
  }

  if (data.startsWith("avatar_default_")) {
    const avatarId = parseInt(data.replace("avatar_default_", ""), 10);
    const telegramId = BigInt(ctx.from!.id);
    await AvatarService.setDefault(telegramId, avatarId);
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('misc.avatar_set_default', lang));
    const avatars = await AvatarService.listAvatars(telegramId);
    let message = t('cb.avatar_title', lang) + '\n\n';
    avatars.forEach((a, i) => {
      message += `${i + 1}. ${a.isDefault ? "⭐ " : ""}*${a.name}*\n`;
    });
    const avatarButtons = avatars.map((a) => [
      {
        text: `${a.isDefault ? "⭐ " : ""}${a.name}`,
        callback_data: `avatar_view_${a.id}`,
      },
    ]);
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...avatarButtons,
          [{ text: t('btn.add_avatar', lang), callback_data: "avatar_add" }],
          [{ text: t('btn.back', lang), callback_data: "image_generate" }],
        ],
      },
    });
    return true;
  }

  if (data.startsWith("avatar_delete_")) {
    const avatarId = parseInt(data.replace("avatar_delete_", ""), 10);
    const telegramId = BigInt(ctx.from!.id);
    const lang = ctx.session?.userLang || 'id';
    const deleted = await AvatarService.deleteAvatar(telegramId, avatarId);
    await ctx.answerCbQuery(
      deleted ? t('cb.avatar_deleted', lang) : t('cb.avatar_not_found_del', lang),
    );
    const avatars = await AvatarService.listAvatars(telegramId);
    let message = t('cb.avatar_title', lang) + '\n\n';
    if (avatars.length === 0) {
      message += t('cb.avatar_empty', lang);
    } else {
      avatars.forEach((a, i) => {
        message += `${i + 1}. ${a.isDefault ? "⭐ " : ""}*${a.name}*\n`;
      });
    }
    const avatarButtons = avatars.map((a) => [
      {
        text: `${a.isDefault ? "⭐ " : ""}${a.name}`,
        callback_data: `avatar_view_${a.id}`,
      },
    ]);
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...avatarButtons,
          [{ text: t('btn.add_avatar', lang), callback_data: "avatar_add" }],
          [{ text: t('btn.back', lang), callback_data: "image_generate" }],
        ],
      },
    });
    return true;
  }

  // imgref_upload
  if (data === "imgref_upload") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    ctx.session.state = "IMAGE_REFERENCE_WAITING";
    await ctx.editMessageText(
      t('cb.imgref_upload', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('btn.skip_describe', lang),
                callback_data: "imgref_skip",
              },
            ],
            [{ text: t('btn.back', lang), callback_data: "image_generate" }],
          ],
        },
      },
    );
    return true;
  }

  // imgref_skip
  if (data === "imgref_skip") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    ctx.session.state = "IMAGE_GENERATION_WAITING";
    const category = ctx.session.stateData?.imageCategory as string;
    ctx.session.stateData = { ...ctx.session.stateData, imageCategory: category, mode: "text2img" };

    const hintKeys: Record<string, string> = {
      product: 'cb.imgref_hint_product',
      fnb: 'cb.imgref_hint_fnb',
      realestate: 'cb.imgref_hint_realestate',
      car: 'cb.imgref_hint_car',
    };
    const hint = t(hintKeys[category] || 'cb.imgref_hint_default', lang);

    await ctx.editMessageText(
      t('cb.describe_image', lang, { hint }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.back', lang), callback_data: "image_generate" }],
          ],
        },
      },
    );
    return true;
  }

  // imgref_avatar_
  if (data.startsWith("imgref_avatar_")) {
    const avatarId = parseInt(data.replace("imgref_avatar_", ""), 10);
    const avatar = await AvatarService.getAvatar(avatarId);
    if (!avatar) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.answerCbQuery(t('misc.avatar_not_found', lang));
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

    const lang2 = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.using_avatar', lang2, { name: avatar.name }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [btnBackMain(lang2)],
          ],
        },
      },
    );
    return true;
  }

  // imgelem_* — element selection toggles
  if (data === "imgelem_product" || data === "imgelem_character" || data === "imgelem_background") {
    await ctx.answerCbQuery();

    // Video context: update videoCreation.videoElementSelection
    if (ctx.session.state === 'VIDEO_ELEMENT_SELECTION') {
      const vsel = ctx.session.videoCreation?.videoElementSelection ||
        { keepProduct: true, keepCharacter: false, keepBackground: false };
      if (data === "imgelem_product") vsel.keepProduct = !vsel.keepProduct;
      if (data === "imgelem_character") vsel.keepCharacter = !vsel.keepCharacter;
      if (data === "imgelem_background") vsel.keepBackground = !vsel.keepBackground;
      ctx.session.videoCreation = { ...ctx.session.videoCreation, videoElementSelection: vsel };
      const videoAnalysis = ctx.session.videoCreation?.videoAnalysisResult as { hasCharacter: boolean; hasProduct: boolean; characterDesc?: string; productDesc?: string } | undefined;
      await ctx.editMessageText(
        buildElementSelectionMessage(videoAnalysis || { hasCharacter: true, hasProduct: true }, videoAnalysis?.characterDesc, videoAnalysis?.productDesc),
        { parse_mode: "Markdown", reply_markup: renderElementSelectionKeyboard(vsel) },
      );
      return true;
    }

    // Image context
    const sel = (ctx.session.stateData?.imageElementSelection as {
      keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean;
    }) || { keepProduct: true, keepCharacter: false, keepBackground: false };

    if (data === "imgelem_product") sel.keepProduct = !sel.keepProduct;
    if (data === "imgelem_character") sel.keepCharacter = !sel.keepCharacter;
    if (data === "imgelem_background") sel.keepBackground = !sel.keepBackground;

    ctx.session.stateData = { ...ctx.session.stateData, imageElementSelection: sel };
    const analysis = ctx.session.stateData?.imageAnalysisResult as { hasCharacter: boolean; hasProduct: boolean; characterDesc?: string; productDesc?: string } | undefined;

    await ctx.editMessageText(
      buildElementSelectionMessage(analysis || { hasCharacter: true, hasProduct: true }, analysis?.characterDesc, analysis?.productDesc),
      {
        parse_mode: "Markdown",
        reply_markup: renderElementSelectionKeyboard(sel),
      },
    );
    return true;
  }

  // imgelem_skip — skip element selection, use full reference as-is
  if (data === "imgelem_skip") {
    await ctx.answerCbQuery('Melewati pemilihan elemen...');
    if (ctx.session.state === 'VIDEO_ELEMENT_SELECTION') {
      const { handleVideoCreationImage } = await import('../message.js');
      const pendingPhotos = ctx.session.videoCreation?.pendingPhotos || [];
      ctx.session.state = 'DASHBOARD';
      await handleVideoCreationImage(ctx, pendingPhotos);
      return true;
    }
    // Image: proceed without element selection (full reference)
    const lang = ctx.session?.userLang || 'id';
    ctx.session.state = "IMAGE_GENERATION_WAITING";
    const category = ctx.session.stateData?.imageCategory as string;
    const hintKeys: Record<string, string> = {
      product: 'cb.imgref_hint_product', fnb: 'cb.imgref_hint_fnb',
      realestate: 'cb.imgref_hint_realestate', car: 'cb.imgref_hint_car',
    };
    const hint = t(hintKeys[category] || 'cb.imgref_hint_default', lang);
    await ctx.editMessageText(t('cb.describe_image', lang, { hint }), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: t('btn.back', lang), callback_data: "image_generate" }]] },
    });
    return true;
  }

  // imgelem_confirm — proceed with element selection saved
  if (data === "imgelem_confirm") {
    await ctx.answerCbQuery();

    // Video context: proceed to video creation with saved element selection
    if (ctx.session.state === 'VIDEO_ELEMENT_SELECTION') {
      const { handleVideoCreationImage } = await import('../message.js');
      const pendingPhotos = ctx.session.videoCreation?.pendingPhotos || [];
      ctx.session.state = 'DASHBOARD';
      await handleVideoCreationImage(ctx, pendingPhotos);
      return true;
    }

    // Image context
    const lang = ctx.session?.userLang || 'id';
    const sel = (ctx.session.stateData?.imageElementSelection as {
      keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean;
    }) || { keepProduct: true, keepCharacter: false, keepBackground: false };

    // If all elements are off, switch to text2img mode
    const keepAny = sel.keepProduct || sel.keepCharacter || sel.keepBackground;
    if (!keepAny) {
      ctx.session.stateData = { ...ctx.session.stateData, mode: "text2img", referenceImageUrl: undefined };
    }

    // If a pending prompt was stored (from spontaneous photo+caption upload), skip the prompt step
    const pendingPrompt = ctx.session.stateData?.pendingPrompt as string | undefined;
    if (pendingPrompt) {
      const { executeImageGeneration } = await import('../message.js');
      ctx.session.stateData = { ...ctx.session.stateData, pendingPrompt: undefined };
      const category = ctx.session.stateData?.imageCategory as string;
      const referenceImageUrl = ctx.session.stateData?.referenceImageUrl as string | undefined;
      const mode = (ctx.session.stateData?.mode as string || "img2img") as import('@/services/image.service').ImageGenerationMode;
      const elementAnalysis = ctx.session.stateData?.imageAnalysisResult as { productDesc: string; characterDesc: string; backgroundDesc: string } | undefined;
      ctx.session.state = "DASHBOARD";
      await executeImageGeneration(ctx, pendingPrompt, { category, referenceImageUrl, mode, elementSelection: sel, elementAnalysis });
      return true;
    }

    ctx.session.state = "IMAGE_GENERATION_WAITING";
    const category = ctx.session.stateData?.imageCategory as string;

    const hintKeys: Record<string, string> = {
      product: 'cb.imgref_hint_product',
      fnb: 'cb.imgref_hint_fnb',
      realestate: 'cb.imgref_hint_realestate',
      car: 'cb.imgref_hint_car',
    };
    const hint = t(hintKeys[category] || 'cb.imgref_hint_default', lang);

    const textOnlyNote = !keepAny ? '\n\n_(tanpa referensi, mode text-only)_' : '';
    await ctx.editMessageText(
      t('cb.describe_image', lang, { hint }) + textOnlyNote,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.back', lang), callback_data: "image_generate" }],
          ],
        },
      },
    );
    return true;
  }

  // image_analyze — analyze-only mode (i2t from menu)
  if (data === "image_analyze") {
    await ctx.answerCbQuery();
    ctx.session.state = 'IMAGE_REFERENCE_WAITING';
    ctx.session.stateData = { ...ctx.session.stateData, mode: 'analyze' };
    await ctx.editMessageText(
      '🔍 *Analisis Gambar*\n\nKirim foto yang ingin dianalisis.\n\nBot akan mendeskripsikan isi gambar, elemen yang terdeteksi, dan prompt AI yang sesuai.',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'image_generate' }]] },
      },
    );
    return true;
  }

  // generate_image_v3_
  if (data.startsWith("generate_image_v3_")) {
    await ctx.answerCbQuery();
    const promptId = data.replace("generate_image_v3_", "");
    const { findAnyPrompt } = await import("../../commands/prompts.js");
    const prompt = await findAnyPrompt(promptId);
    if (!prompt) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.prompt_not_found', lang));
      return true;
    }
    // Route to generate_free_ flow which handles image generation
    const { handlePromptsCallback } = await import("./prompts.js");
    await handlePromptsCallback(ctx, `generate_free_${promptId}`);
    return true;
  }

  return false;
}
