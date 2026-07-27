
import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { UserService } from "@/services/user.service";
import { ContentAnalysisService } from "@/services/content-analysis.service";
import { VideoService } from "@/services/video.service";
import { enqueueVideoGeneration } from "@/config/queue";
import { getVideoCreditCost } from "@/config/pricing";
import { generateVideoAsync, generateExtendedVideoAsync } from "@/commands/create";
import { actionableError } from "@/utils/errors";
import { t } from "@/i18n/translations";
import { detectImageElements, renderElementSelectionKeyboard, buildElementSelectionMessage } from "../callbacks/image";
import * as fs from "fs";
import * as path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { ProviderError } from '@/utils/app-errors';
const execFile = promisify(execFileCallback);

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function handleDisassemble(ctx: BotContext): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Telegraf message type discrimination
  const message = ctx.message as any;
  if (!message) return;

  let mediaUrl: string | undefined;
  let mediaType: "video" | "image" = "image";

  if (message.video) {
    mediaUrl = message.video.file_id;
    mediaType = "video";
  } else if (message.photo) {
    const photos = message.photo;
    mediaUrl = photos[photos.length - 1].file_id;
    mediaType = "image";
  }

  if (!mediaUrl) {
    const dbUser = ctx.from ? await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(() => null) : null;
    const lang = dbUser?.language || 'id';
    await ctx.reply(t('uploader.no_media', lang));
    return;
  }

  {
    const dbUser = ctx.from ? await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(() => null) : null;
    const lang = dbUser?.language || 'id';
    await ctx.reply(t('uploader.analyzing', lang), {
      parse_mode: "Markdown",
    });
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(mediaUrl);
    const result = await ContentAnalysisService.extractPrompt(
      fileLink.toString(),
      mediaType,
    );

    if (result.success && result.prompt) {
      await ctx.reply(
        `✅ *Prompt Extracted:*\n\n` +
        `\`\`\`\n${result.prompt.slice(0, 1000)}\n\`\`\`\n\n` +
        `*Style:* ${result.style || "N/A"}\n` +
        `*Elements:* ${result.elements?.slice(0, 5).join(", ") || "N/A"}\n\n` +
        `_Use this prompt to create similar content!_`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎬 Create Video with This",
                  callback_data: "create_video_new",
                },
              ],
              [
                {
                  text: "🖼️ Generate Image with This",
                  callback_data: "image_generate",
                },
              ],
            ],
          },
        },
      );

      ctx.session.stateData = { extractedPrompt: result.prompt };
    } else {
      await ctx.reply(
        `❌ *Extraction Failed*\n\n` +
        `Error: ${result.error || "Unknown error"}\n\n` +
        `Please try again with a different image or video.`,
        { parse_mode: "Markdown" },
      );
    }
  } catch (error) {
    logger.error("Disassemble failed:", error);
    const dbUser2 = ctx.from ? await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(() => null) : null;
    const lang2 = dbUser2?.language || 'id';
    await ctx.reply(t('uploader.analysis_failed', lang2));
  }
}

export async function handleVideoElementPrecheck(
  ctx: BotContext,
  uploadedPhotos: Array<{ fileId: string; localPath?: string }>,
): Promise<void> {
  if (uploadedPhotos.length === 0) {
    await handleVideoCreationImage(ctx, uploadedPhotos);
    return;
  }

  try {
    const photoUrl = (await ctx.telegram.getFileLink(uploadedPhotos[0].fileId)).toString();
    const analysis = await ContentAnalysisService.extractPrompt(photoUrl, 'image');
    if (analysis.success && analysis.prompt) {
      const elements = detectImageElements(analysis.prompt);
      // Always show element selection when analysis succeeds (not just when both types detected)
      {
        const defaultSel = {
          keepProduct: elements.hasProduct,
          keepCharacter: elements.hasProduct ? false : elements.hasCharacter,
          keepBackground: false,
        };
        ctx.session.state = 'VIDEO_ELEMENT_SELECTION';
        ctx.session.videoCreation = {
          ...ctx.session.videoCreation,
          pendingPhotos: uploadedPhotos,
          videoAnalysisResult: {
            hasProduct: elements.hasProduct,
            hasCharacter: elements.hasCharacter,
            productDesc: elements.productDesc,
            characterDesc: elements.characterDesc,
            backgroundDesc: elements.backgroundDesc,
          },
          videoElementSelection: defaultSel,
        };
        await ctx.reply(
          buildElementSelectionMessage(elements, elements.characterDesc, elements.productDesc),
          {
            parse_mode: 'Markdown',
            reply_markup: renderElementSelectionKeyboard(defaultSel),
          },
        );
        return;
      }
    }
  } catch (err) {
    logger.warn('Video element precheck failed (non-fatal), proceeding directly');
  }

  await handleVideoCreationImage(ctx, uploadedPhotos);
}

export async function handleVideoCreationImage(
  ctx: BotContext,
  collectedPhotos?: Array<{ fileId: string; localPath?: string }>,
): Promise<void> {
  if (!ctx.session?.videoCreation?.waitingForImage) {
    await ctx.reply(t('error.no_session', ctx.session?.userLang || 'id'));
    return;
  }

  const { storyboard } = ctx.session.videoCreation;
  const scenes = ctx.session.videoCreation.scenes ?? 1;
  const totalDuration = ctx.session.videoCreation.totalDuration ?? 0;
  const niche = ctx.session.videoCreation.niche ?? '';
  const platform = ctx.session.videoCreation.platform ?? 'tiktok';
  const telegramId = BigInt(ctx.from!.id);
  const creditCost = getVideoCreditCost(totalDuration);

  // Use collected photos from session or fallback to legacy single-photo
  const photos =
    collectedPhotos && collectedPhotos.length > 0
      ? collectedPhotos
      : ctx.session.videoCreation.uploadedPhotos || [];

  if (photos.length === 0) {
    await ctx.reply(
      "Belum ada foto. Kirim gambar referensi atau /skip.",
    );
    return;
  }

  let jobId: string | null = null;
  let creditsDeducted = false;

  try {
    const user = await UserService.findByTelegramId(telegramId);
    if (!user || Number(user.creditBalance) < creditCost) {
      await ctx.reply(
        `Not enough credits. Need ${creditCost}, have ${user?.creditBalance || 0}. Use /topup`,
      );
      return;
    }

    // Use the FIRST photo as the primary reference image for video generation
    const primaryFileId = photos[0].fileId;
    const primaryImageUrl = (
      await ctx.telegram.getFileLink(primaryFileId)
    ).toString();

    const VIDEO_DIR = getConfig().VIDEO_DIR;
    if (!fs.existsSync(VIDEO_DIR)) {
      fs.mkdirSync(VIDEO_DIR, { recursive: true });
    }

    const video = await VideoService.createJob({
      userId: telegramId,
      niche,
      platform,
      duration: totalDuration,
      scenes,
      title: `Video ${new Date().toLocaleDateString("id-ID")}`,
    });
    jobId = video.jobId;

    await UserService.deductCredits(telegramId, creditCost);
    creditsDeducted = true;

    // Download primary reference image
    const imagePath = path.join(VIDEO_DIR, `${jobId}_reference.jpg`);

    try {
      await execFile('wget', ['-q', '-O', imagePath, primaryImageUrl]);
    } catch (wgetErr) {
      logger.error("wget failed downloading reference image:", (wgetErr as Error).message);
      throw new ProviderError("video-uploader", `Failed to download reference image: ${(wgetErr as Error).message}`);
    }

    if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size === 0) {
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      throw new ProviderError("video-uploader", "Reference image download failed — file is empty or missing");
    }

    // Run Gemini Vision analysis on ALL uploaded photos to extract product details
    let visionInsights = "";
    try {
      const uploaderDbUser = ctx.from ? await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(() => null) : null;
      const uploaderLang = uploaderDbUser?.language || 'id';
      await ctx.reply(t('uploader.analyzing_photos', uploaderLang, { count: photos.length }), {
        parse_mode: "Markdown",
      });

      const results = await withConcurrency(photos, 3, async (photo, idx) => {
        try {
          const photoUrl = (
            await ctx.telegram.getFileLink(photo.fileId)
          ).toString();
          const result = await ContentAnalysisService.extractPrompt(
            photoUrl,
            "image",
          );
          if (result.success && result.prompt) {
            return `[Photo ${idx + 1}] ${result.prompt}`;
          }
          return null;
        } catch (err) {
          logger.warn(`Vision analysis failed for photo ${idx + 1}:`, err);
          return null;
        }
      });

      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null && r !== undefined);

      if (validResults.length > 0) {
        visionInsights = validResults.join("\n\n");
        logger.info(
          `Vision analysis completed for ${validResults.length}/${photos.length} photos`,
        );
      }
    } catch (visionErr) {
      logger.warn("Vision analysis batch failed (non-fatal):", visionErr);
      // Non-fatal: continue without vision enrichment
    }

    // Enrich storyboard scenes with vision analysis insights
    let enrichedStoryboard = storyboard;
    if (visionInsights && storyboard && storyboard.length > 0) {
      const videoSel = ctx.session.videoCreation?.videoElementSelection;
      const videoAnalysis = ctx.session.videoCreation?.videoAnalysisResult;

      let enrichmentText = visionInsights.slice(0, 800);

      if (videoSel && videoAnalysis) {
        const parts: string[] = [];
        if (videoSel.keepProduct && !videoSel.keepCharacter) {
          // Most common UMKM case: product video, no person
          const pDesc = (videoAnalysis.productDesc || '').slice(0, 200);
          parts.push(
            `Cinematic product video. The subject is this exact product: ${pDesc}.` +
            ` No person or human in frame. Professional product videography — close-up shots, slow camera reveal, dramatic lighting on the product.`
          );
        } else if (videoSel.keepCharacter && !videoSel.keepProduct) {
          const cDesc = (videoAnalysis.characterDesc || '').slice(0, 200);
          parts.push(`Keep this character consistent throughout: ${cDesc}.`);
        } else if (videoSel.keepProduct && videoSel.keepCharacter) {
          const pDesc = (videoAnalysis.productDesc || '').slice(0, 150);
          const cDesc = (videoAnalysis.characterDesc || '').slice(0, 150);
          parts.push(`Product to feature: ${pDesc}. Person/character: ${cDesc}.`);
        }
        if (videoSel.keepBackground) {
          const bgDesc = (videoAnalysis.backgroundDesc || '').slice(0, 150);
          parts.push(`Preserve this background setting: ${bgDesc}.`);
        }
        if (!videoSel.keepProduct && !videoSel.keepCharacter && !videoSel.keepBackground) {
          // keepNone — skip vision enrichment entirely
          enrichmentText = '';
        } else {
          enrichmentText = parts.join(' ');
        }
      }

      if (enrichmentText) {
        enrichedStoryboard = storyboard.map(scene => ({
          ...scene,
          description: `${scene.description}. ${enrichmentText}`,
        }));
        logger.info("Storyboard enriched with vision analysis insights");
      }
    }

    // Store vision analysis in session for potential later use
    ctx.session.videoCreation.visionAnalysis = visionInsights || undefined;

    await ctx.reply(
      `*Video Job Created!*\n\n` +
      `Job ID: \`${jobId}\`\n` +
      `Credits used: ${creditCost}\n\n` +
      `\ud83d\udcf8 ${photos.length} reference photo(s) received!\n` +
      (visionInsights ? `\ud83d\udd0d AI Vision analysis complete\n` : "") +
      `\ud83c\udfac Starting generation...\n\n` +
      `Scenes: ${scenes} | Duration: ${totalDuration}s\n` +
      `ETA: ${Math.ceil(scenes * 2)}-${Math.ceil(scenes * 5)} minutes`,
      { parse_mode: "Markdown" },
    );

    ctx.session.videoCreation.waitingForImage = false;
    ctx.session.videoCreation.referenceImage = imagePath;
    ctx.session.videoCreation.jobId = jobId;

    const capturedJobId = jobId;
    const enableVO = ctx.session.videoCreation.enableVO !== false;
    const enableSubtitles = ctx.session.videoCreation.enableSubtitles !== false;
    try {
      const { position } = await enqueueVideoGeneration({
        jobId: capturedJobId,
        niche,
        platform,
        duration: totalDuration,
        scenes,
        storyboard: enrichedStoryboard ?? [],
        referenceImage: imagePath,
        customPrompt: ctx.session.videoCreation.customPrompt,
        userId: telegramId.toString(),
        chatId: ctx.chat!.id,
        enableVO,
        enableSubtitles,
        language: user.language || "id",
      });
      await ctx.reply(
        `Video queued! Position: #${position}. You'll be notified when ready.`,
      );
    } catch (enqueueErr) {
      logger.warn(
        "Queue enqueue failed, falling back to direct async:",
        (enqueueErr as Error).message,
      );
      if (scenes === 1) {
        generateVideoAsync(
          ctx,
          capturedJobId,
          niche,
          platform,
          totalDuration,
          enrichedStoryboard ?? [],
          imagePath,
        ).catch((err) =>
          logger.error("Background generateVideoAsync error:", err),
        );
      } else {
        generateExtendedVideoAsync(
          ctx,
          capturedJobId,
          niche,
          platform,
          totalDuration,
          scenes,
          enrichedStoryboard ?? [],
          imagePath,
        ).catch((err) =>
          logger.error("Background generateExtendedVideoAsync error:", err),
        );
      }
    }
  } catch (error) {
    logger.error("handleVideoCreationImage error:", error);

    if (creditsDeducted && jobId) {
      try {
        await UserService.refundCredits(
          telegramId,
          creditCost,
          jobId,
          (error as Error).message || "Image upload failed",
        );
        await VideoService.updateStatus(
          jobId,
          "failed",
          (error as Error).message || "Image upload failed",
        );
      } catch (refundErr) {
        logger.error("Failed to refund credits after image error:", refundErr);
      }
    }

    if (ctx.session?.videoCreation) {
      ctx.session.videoCreation.waitingForImage = false;
    }

    const userMessage = actionableError((error as Error).message || String(error));
    await ctx.reply(
      `${userMessage}\n\n` +
      `${creditsDeducted ? "Credits have been refunded." : ""}\n\n` +
      `Please send the image again or type /skip to generate without a reference.`,
      { parse_mode: "Markdown" },
    );
  }
}

export async function handleSkipImageReference(ctx: BotContext): Promise<void> {
  if (!ctx.session?.videoCreation?.waitingForImage) {
    const skipDbUser = ctx.from ? await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(() => null) : null;
    const skipLang = skipDbUser?.language || 'id';
    await ctx.reply(t('uploader.no_active_creation', skipLang));
    return;
  }

  const { storyboard: rawStoryboard } = ctx.session.videoCreation;
  const scenes = ctx.session.videoCreation.scenes ?? 1;
  const totalDuration = ctx.session.videoCreation.totalDuration ?? 0;
  const niche = ctx.session.videoCreation.niche ?? '';
  const platform = ctx.session.videoCreation.platform ?? 'tiktok';
  const storyboard = rawStoryboard ?? [];
  const telegramId = BigInt(ctx.from!.id);
  const creditCost = getVideoCreditCost(totalDuration);

  const user = await UserService.findByTelegramId(telegramId);
  if (!user || Number(user.creditBalance) < creditCost) {
    await ctx.reply(
      `❌ Not enough credits. Need ${creditCost}, have ${user?.creditBalance || 0}. Use /topup`,
    );
    return;
  }

  const video = await VideoService.createJob({
    userId: telegramId,
    niche,
    platform,
    duration: totalDuration,
    scenes,
    title: `Video ${new Date().toLocaleDateString("id-ID")}`,
  });
  const jobId = video.jobId;

  await UserService.deductCredits(telegramId, creditCost);

  await ctx.reply(
    `✅ **Video Job Created!**\n\n` +
    `Job ID: \`${jobId}\`\n` +
    `Credits used: ${creditCost}\n\n` +
    `⏭️ No reference image — AI will generate everything.\n` +
    `🎬 Starting generation...\n\n` +
    `Scenes: ${scenes} | Duration: ${totalDuration}s\n` +
    `⏳ ETA: ${Math.ceil(scenes * 2)}-${Math.ceil(scenes * 5)} minutes`,
    { parse_mode: "Markdown" },
  );

  ctx.session.videoCreation.waitingForImage = false;
  ctx.session.videoCreation.referenceImage = null;
  ctx.session.videoCreation.jobId = jobId;

  const skipEnableVO = ctx.session.videoCreation.enableVO !== false;
  const skipEnableSubtitles =
    ctx.session.videoCreation.enableSubtitles !== false;
  try {
    const { position } = await enqueueVideoGeneration({
      jobId,
      niche,
      platform,
      duration: totalDuration,
      scenes,
      storyboard,
      referenceImage: null,
      customPrompt: ctx.session.videoCreation.customPrompt,
      userId: telegramId.toString(),
      chatId: ctx.chat!.id,
      enableVO: skipEnableVO,
      enableSubtitles: skipEnableSubtitles,
      language: user.language || "id",
    });
    await ctx.reply(
      `Video queued! Position: #${position}. You'll be notified when ready.`,
    );
  } catch (enqueueErr) {
    logger.warn(
      "Queue enqueue failed, falling back to direct async:",
      (enqueueErr as Error).message,
    );
    if (scenes === 1) {
      generateVideoAsync(
        ctx,
        jobId,
        niche,
        platform,
        totalDuration,
        storyboard,
      ).catch((err) =>
        logger.error("Background generateVideoAsync error:", err),
      );
    } else {
      generateExtendedVideoAsync(
        ctx,
        jobId,
        niche,
        platform,
        totalDuration,
        scenes,
        storyboard,
      ).catch((err) =>
        logger.error("Background generateExtendedVideoAsync error:", err),
      );
    }
  }
}
