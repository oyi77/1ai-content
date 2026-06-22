import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { prisma } from "@/config/database";
import { VideoService } from "@/services/video.service";
import {
  getVideoCreditCostAsync,
} from "@/config/pricing";
import { enqueueVideoGeneration } from "@/config/queue";
import { t } from "@/i18n/translations";

const btnBackMain = (lang: string) => ({ text: t('btn.main_menu', lang), callback_data: "main_menu" });

async function handleStoryboardRequest(ctx: BotContext, niche: string) {
  try {
    const storyboard = await VideoService.generateStoryboard({
      niche,
      duration: 30,
    });

    const lang = ctx.session?.userLang || 'id';
    let message = t('cb.storyboard_title', lang, { niche: niche.toUpperCase() }) + '\n\n';

    storyboard.scenes.forEach((s) => {
      message += t('cb.storyboard_scene', lang, { scene: s.scene, duration: s.duration, type: s.type, description: s.description }) + '\n\n';
    });

    message += t('cb.storyboard_caption', lang, { caption: storyboard.caption }) + '\n\n';
    message += t('cb.storyboard_cost', lang);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t('btn.create_video_now', lang),
              callback_data: 'confirm_create',
            },
          ],
          [
            {
              text: t('btn.back_to_selection', lang),
              callback_data: "storyboard_create",
            },
          ],
        ],
      },
    });
  } catch (error) {
    logger.error("Storyboard error:", error);
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('cb.storyboard_failed', lang));
  }
}

export async function handleCloneCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // Clone/Remake Video
  if (data === "clone_video") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.clone_video', lang),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[btnBackMain(lang)]] },
      },
    );
    ctx.session.state = "CLONE_VIDEO_WAITING";
    return true;
  }

  // Analyze Video (v2t from menu)
  if (data === "analyze_video_menu") {
    await ctx.answerCbQuery();
    ctx.session.state = "CLONE_VIDEO_WAITING";
    ctx.session.stateData = { ...ctx.session.stateData, mode: 'analyze_only' };
    await ctx.editMessageText(
      '📝 *Analisis Video*\n\nKirim video atau URL video yang ingin dianalisis.\n\nBot akan mendeskripsikan gaya, konten, dan prompt AI yang sesuai.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'main_menu' }]] } },
    );
    return true;
  }

  if (data === "clone_edit_desc") {
    await ctx.answerCbQuery();

    if (!ctx.session?.stateData?.clonePrompt) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.clone_not_found', lang));
      return true;
    }

    await ctx.editMessageText(
      t('cb2.edit_video_desc', ctx.session?.userLang || 'id'),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('btn.cancel', ctx.session?.userLang || 'id'), callback_data: "main_menu" }],
          ],
        },
      },
    );

    ctx.session.state = "CLONE_EDIT_DESC_WAITING";
    return true;
  }

  // Clone/Remake Image
  if (data === "clone_image") {
    await ctx.editMessageText(
      t('cb2.clone_image', ctx.session?.userLang || 'id'),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[btnBackMain(ctx.session?.userLang || 'id')]] },
      },
    );
    ctx.session.state = "CLONE_IMAGE_WAITING";
    return true;
  }

  // Storyboard Creator
  if (data === "storyboard_create") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb2.storyboard_creator', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('cb2.product_promo', lang), callback_data: "sb_product" }],
            [{ text: t('cb2.fnb_content', lang), callback_data: "sb_fnb" }],
            [{ text: t('cb2.realestate_tour', lang), callback_data: "sb_realestate" }],
            [{ text: t('cb2.car_showcase', lang), callback_data: "sb_car" }],
            [btnBackMain(ctx.session?.userLang || 'id')],
          ],
        },
      },
    );
    return true;
  }

  if (data === "sb_product") { await handleStoryboardRequest(ctx, "product"); return true; }
  if (data === "sb_fnb") { await handleStoryboardRequest(ctx, "fnb"); return true; }
  if (data === "sb_realestate") { await handleStoryboardRequest(ctx, "realestate"); return true; }
  if (data === "sb_car") { await handleStoryboardRequest(ctx, "car"); return true; }

  // Viral/Trend Research
  if (data === "viral_research") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb2.viral_research', lang),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('cb2.all_trends', lang), callback_data: "trend_viral" }],
            [{ text: t('cb2.fnb_restaurant', lang), callback_data: "trend_fnb" }],
            [{ text: t('cb2.realestate', lang), callback_data: "trend_realestate" }],
            [{ text: t('cb2.ecommerce', lang), callback_data: "trend_ecom" }],
            [{ text: t('cb2.back_to_menu', lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    return true;
  }

  if (data.startsWith("trend_")) {
    const niche = data.replace("trend_", "");
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb2.viral_research_result', lang, { niche: niche.toUpperCase() }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t('cb2.generate_viral_storyboard', lang),
                callback_data: `sb_${niche === "viral" ? "product" : niche === "ecom" ? "product" : niche}`,
              },
            ],
            [{ text: t('btn.back', lang), callback_data: "viral_research" }],
          ],
        },
      },
    );
    return true;
  }

  // Disassemble
  if (data === "disassemble") {
    await ctx.editMessageText(
      t('cb2.disassemble', ctx.session?.userLang || 'id'),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[btnBackMain(ctx.session?.userLang || 'id')]] },
      },
    );
    ctx.session.state = "DISASSEMBLE_WAITING";
    return true;
  }

  // Repurpose
  if (data === "repurpose_video") {
    await ctx.editMessageText(
      t('cb2.repurpose_video', ctx.session?.userLang || 'id'),
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[btnBackMain(ctx.session?.userLang || 'id')]] },
      },
    );
    ctx.session.state = "REPURPOSE_VIDEO_URL";
    return true;
  }

  if (data === "repurpose_generate_t2v") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON field access
    const repurposeData = ctx.session.stateData?.repurposeData as any;
    if (!repurposeData?.storyboard) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.analysis_not_found', lang));
      return true;
    }
    const storyboard = repurposeData.storyboard;
    const duration = repurposeData.totalDuration || 15;
    const niche = repurposeData.niche || "general";

    const creditCost = await getVideoCreditCostAsync(duration);
    const telegramId = BigInt(ctx.from!.id);
    const user = await UserService.findByTelegramId(telegramId);
    if (!user || Number(user.creditBalance) < creditCost) {
      const lang = user?.language || ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.insufficient_credits_cost', lang, { cost: creditCost }));
      return true;
    }

    await UserService.deductCredits(telegramId, creditCost);
    const jobId = `RPR-T2V-${Date.now()}-${telegramId}`;
    const chatId = ctx.chat!.id;

    await prisma.video.create({
      data: {
        userId: telegramId,
        jobId,
        niche,
        platform: "reels",
        duration,
        scenes: storyboard.length,
        status: "processing",
        creditsUsed: creditCost,
        storyboard,
      },
    });

    try {
      await enqueueVideoGeneration({
        jobId,
        niche,
        platform: "reels",
        duration,
        scenes: storyboard.length,
        storyboard,
        userId: telegramId.toString(),
        chatId,
        enableVO: false,
        enableSubtitles: false,
        language: "id",
      });
    } catch (queueErr) {
      logger.error('Repurpose T2V queue failed:', queueErr);
      await UserService.refundCredits(telegramId, creditCost, jobId, 'queue failed')
        .catch((err) => logger.error('CRITICAL: repurpose refund failed', { jobId, err }));
      const lang2 = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.video_process_failed_refund', lang2));
      return true;
    }

    await ctx.editMessageText(
      t('cb2.video_regen_started', ctx.session?.userLang || 'id', { jobId, scenes: storyboard.length, duration, niche }),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  if (data === "repurpose_generate_i2v") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON field access
    const repurposeData = ctx.session.stateData?.repurposeData as any;
    if (!repurposeData?.storyboard) {
      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.analysis_not_found', lang));
      return true;
    }
    const storyboard = repurposeData.storyboard;
    const duration = repurposeData.totalDuration || 15;
    const niche = repurposeData.niche || "general";
    const referenceImage = repurposeData.keyFramePaths?.[0] || undefined;

    const creditCost = await getVideoCreditCostAsync(duration);
    const telegramId = BigInt(ctx.from!.id);
    const user = await UserService.findByTelegramId(telegramId);
    if (!user || Number(user.creditBalance) < creditCost) {
      const lang = user?.language || ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.insufficient_credits_cost', lang, { cost: creditCost }));
      return true;
    }

    await UserService.deductCredits(telegramId, creditCost);
    const jobId = `RPR-I2V-${Date.now()}-${telegramId}`;
    const chatId = ctx.chat!.id;

    await prisma.video.create({
      data: {
        userId: telegramId,
        jobId,
        niche,
        platform: "reels",
        duration,
        scenes: storyboard.length,
        status: "processing",
        creditsUsed: creditCost,
        storyboard,
      },
    });

    try {
      await enqueueVideoGeneration({
        jobId,
        niche,
        platform: "reels",
        duration,
        scenes: storyboard.length,
        storyboard,
        referenceImage,
        userId: telegramId.toString(),
        chatId,
        enableVO: false,
        enableSubtitles: false,
        language: "id",
      });
    } catch (queueErr) {
      logger.error('Repurpose I2V queue failed:', queueErr);
      await UserService.refundCredits(telegramId, creditCost, jobId, 'queue failed')
        .catch((err) => logger.error('CRITICAL: repurpose i2v refund failed', { jobId, err }));
      const lang2 = ctx.session?.userLang || 'id';
      await ctx.reply(t('cb.video_process_failed_refund', lang2));
      return true;
    }

    await ctx.editMessageText(
      t('cb2.video_regen_started_ref', ctx.session?.userLang || 'id', { jobId, scenes: storyboard.length, duration, niche }),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  // copy_prompt
  if (data === "copy_prompt") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    const extractedPrompt = ctx.session?.stateData?.extractedPrompt as
      | string
      | undefined;

    if (extractedPrompt) {
      await ctx.reply(
        `${t('cb2.copy_prompt_title', lang)}\n\n\`\`\`\n${extractedPrompt}\n\`\`\`\n\n${t('cb2.copy_prompt_hint', lang)}`,
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        t('cb2.copy_prompt_not_found', lang),
        { parse_mode: "Markdown" },
      );
    }
    return true;
  }

  return false;
}
