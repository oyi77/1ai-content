/**
 * Message Handler
 *
 * Handles all incoming messages
 */

import { handleDisassemble, handleVideoCreationImage, handleSkipImageReference, handleVideoElementPrecheck } from "./messages/video-uploader";
export { handleDisassemble, handleVideoCreationImage, handleSkipImageReference, handleVideoElementPrecheck };
import { updateSessionDirectly, SESSION_TTL } from "./messages/session";
export { updateSessionDirectly };

import {
  handleCustomDurationV3,
  handleAwaitingGenerateImage,
  handleCustomDurationInput,
} from "./messages/v3-flow";
import {
  handleCustomPromptCreation,
  handleCustomPromptInput,
  handleWaitingAccountId,
  handleEbookStates,
} from "./messages/text-input";
import {
  handleCreateVideoUpload,
  handleImageReferenceWaiting,
  handleAvatarUploadWaiting,
  handleAvatarNameWaiting,
  handleAvatarTalkPhoto,
} from "./messages/photo-upload";
import {
  handleImageGenerationWaiting,
  handleCloneEditDescWaiting,
  handleCloneVideoWaiting,
} from "./messages/image-gen";
import type { UserFreeTrial } from "@/config/free-trial";
import { routeMenuButton, detectVideoIntent } from "./messages/menu-router";
import { tryAIChat } from "./messages/ai-chat";

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { videosCommand } from "@/commands/videos";
import { topupCommand } from "@/commands/topup";
import { profileCommand } from "@/commands/profile";
import { referralCommand } from "@/commands/referral";
import { subscriptionCommand } from "@/commands/subscription";
import { settingsCommand } from "@/commands/settings";
import { supportCommand } from "@/commands/support";
import { helpCommand } from "@/commands/help";
import { showMainMenu } from "@/menus/main";
import { UserService } from "@/services/user.service";
import { MetricsService } from "@/services/metrics.service";
import {
  ImageGenerationService,
  ImageGenerationMode,
} from "@/services/image.service";
import { AvatarService } from "@/services/avatar.service";
import { ContentAnalysisService } from "@/services/content-analysis.service";
import { PostAutomationService } from "@/services/postautomation.service";
import { detectImageElements, renderElementSelectionKeyboard, buildElementSelectionMessage } from "./callbacks/image";
import { generateStoryboard } from "@/services/video-generation.service";
import { getVideoCreditCost, getImageCreditCostAsync, CUSTOM_DURATION_MIN } from "@/config/pricing";
import { canUseDailyFree, canUseWelcomeBonus, getNextDailyFreeReset } from "@/config/free-trial";
import { prisma } from "@/config/database";
import {
  promptsCommand,
  dailyCommand,
  trendingCommand,
  fingerprintCommand,
} from "@/commands/prompts";
import { getOmniRouteService } from "@/services/omniroute.service";
import { sendVilonaLoading } from "@/services/vilona-animation.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import { PROMPT_LIBRARY as _PL } from "@/commands/prompts";
import { actionableError } from "@/utils/errors";
import { redis } from "@/config/redis";
import { VideoAnalysisService } from "@/services/video-analysis.service";
import { t } from "@/i18n/translations";
import { getPersonaForUser, isNicheAllowedForPersona } from "@/config/personas";
import { resolveNicheKey } from "@/config/niches";

/**
 * Handle incoming messages
 */






/**
 * Shared image generation executor — used by both the IMAGE_GENERATION_WAITING handler
 * and the catch-all spontaneous photo upload flow.
 */
export async function executeImageGeneration(
  ctx: BotContext,
  description: string,
  opts: {
    category?: string;
    referenceImageUrl?: string;
    avatarImageUrl?: string;
    mode?: ImageGenerationMode;
    elementSelection?: { keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean };
    elementAnalysis?: { productDesc: string; characterDesc: string; backgroundDesc: string };
  },
): Promise<void> {
  const {
    category,
    referenceImageUrl,
    avatarImageUrl,
    mode = "text2img",
    elementSelection,
    elementAnalysis,
  } = opts;

  const modeLabel =
    mode === "img2img" ? " (with reference)" : mode === "ip_adapter" ? " (with avatar)" : "";

  const estimatedCost = await getImageCreditCostAsync();
  const telegramId = BigInt(ctx.from!.id);
  const user = await UserService.findByTelegramId(telegramId);

  let useFreeSlot: 'daily' | 'welcome' | null = null;
  const selectedPrompt = ctx.session.stateData?.selectedPrompt as string | undefined;
  const isLibraryPrompt = selectedPrompt === description;

  if (!user || Number(user.creditBalance) < estimatedCost) {
    if (isLibraryPrompt && canUseDailyFree(user as UserFreeTrial)) {
      useFreeSlot = 'daily';
    } else if (isLibraryPrompt && canUseWelcomeBonus(user as UserFreeTrial)) {
      useFreeSlot = 'welcome';
    } else {
      const lang = ctx.session?.userLang || 'id';
      const reason = !isLibraryPrompt
        ? t('msg.custom_only_premium', lang)
        : t('msg.credits_exhausted', lang);
      await ctx.reply(
        t('msg.generation_start_failed', lang, { reason }),
        { parse_mode: "Markdown" },
      );
      ctx.session.state = "DASHBOARD";
      return;
    }
  }

  await ctx.reply(
    t('msg.generating_image', ctx.session?.userLang || 'id', { modeLabel }),
    { parse_mode: "Markdown" },
  );

  ctx.session.state = "DASHBOARD";

  const chatId = ctx.chat!.id;
  const telegram = ctx.telegram;

  void (async () => {
    try {
      // ── Interception check for image generation ──
      const { InterceptService } = await import('@/services/intercept.service.js');
      const isIntercepted = await InterceptService.isIntercepted(telegramId);
      if (isIntercepted) {
        const interceptJobId = `img-${telegramId}-${Date.now()}`;
        await InterceptService.logEvent(telegramId, 'generation_started', `Image job started: ${interceptJobId}`, {
          jobId: interceptJobId, type: 'image', description: description.slice(0, 80), category,
        });
        const interceptResult = await InterceptService.waitForMedia(interceptJobId, 1800);
        if (!interceptResult) {
          await telegram.sendMessage(chatId, '❌ Image generation failed. Please try again.');
          return;
        }
        const { mediaUrl, mediaType } = interceptResult;
        if (useFreeSlot !== 'daily' && useFreeSlot !== 'welcome') {
          const actualCost = await getImageCreditCostAsync();
          await UserService.deductCredits(telegramId, actualCost);
        }
        const lang = ctx.session?.userLang || 'id';
        const replyMarkup = { inline_keyboard: [[{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }]] };
        if (mediaType === 'video') {
          await telegram.sendVideo(chatId, mediaUrl, { caption: `🖼️ ${description}`, parse_mode: 'Markdown', reply_markup: replyMarkup });
        } else {
          await telegram.sendPhoto(chatId, mediaUrl, { caption: `🖼️ ${description}`, parse_mode: 'Markdown', reply_markup: replyMarkup });
        }
        await InterceptService.logEvent(telegramId, 'media_delivered', `Admin delivered ${mediaType}`, { jobId: interceptJobId });
        return;
      }

      const result = await ImageGenerationService.generateImage({
        prompt: description,
        category: category || "product",
        aspectRatio:
          category === "realestate" || category === "car"
            ? "16:9"
            : category === "fnb"
              ? "4:5"
              : "1:1",
        style:
          category === "fnb"
            ? "food photography"
            : category === "realestate"
              ? "architectural"
              : category === "car"
                ? "automotive"
                : "commercial",
        referenceImageUrl,
        avatarImageUrl,
        mode,
        elementSelection,
        elementAnalysis,
      });

      if (result.success && result.imageUrl) {
        const isDemo = result.provider === "demo";

        if (useFreeSlot === 'daily') {
          await prisma.user.update({
            where: { telegramId },
            data: { dailyFreeUsed: true, dailyFreeResetAt: getNextDailyFreeReset() },
          });
          await MetricsService.increment('generation_trial_daily');
        } else if (useFreeSlot === 'welcome') {
          const updated = await prisma.user.updateMany({
            where: { telegramId, welcomeBonusUsed: false },
            data: { welcomeBonusUsed: true },
          });
          if (updated.count === 0) {
            logger.warn(`Welcome bonus already used for user ${telegramId} — skipping charge`);
          }
          await MetricsService.increment('generation_trial_welcome');
        } else if (!isDemo) {
          const actualCost = await getImageCreditCostAsync(result.provider);
          await UserService.deductCredits(telegramId, actualCost);
          logger.info(`🖼️ Charged ${actualCost} credits for image (provider: ${result.provider})`);
        }

        const modeInfo =
          result.mode === "img2img"
            ? "\n📸 _Generated with your reference image_"
            : result.mode === "ip_adapter"
              ? "\n👤 _Generated with avatar consistency_"
              : "";

        const lang2 = ctx.session?.userLang || 'id';
        const captionText = isDemo
          ? `🖼️ *Sample Image (Demo)*\n\n_Description: ${description}_\n\n⚠️ This is a placeholder image. AI generation is temporarily unavailable.\nThe actual product will generate images matching your description.`
          : t('msg.image_success', lang2, { description, modeInfo });

        let photoSource: string | { source: Buffer; filename: string; contentType: string };
        let isBase64 = false;
        if (result.imageUrl!.startsWith("data:")) {
          const mime = /^data:([^;,]+)[;,]/.exec(result.imageUrl!)?.[1] ?? "image/png";
          const extMatch = /^image\/(png|jpe?g|webp|gif)$/i.exec(mime);
          const ext = extMatch ? (extMatch[1] === "jpeg" ? "jpg" : extMatch[1].toLowerCase()) : "png";
          photoSource = {
            source: Buffer.from(result.imageUrl!.split(",")[1], "base64"),
            filename: `photo.${ext}`,
            contentType: mime,
          };
          isBase64 = true;
        } else {
          photoSource = result.imageUrl!;
        }

        if (ctx.session) {
          ctx.session.generateLastImageUrl = isBase64 ? undefined : result.imageUrl;
        }

        await telegram.sendPhoto(chatId, photoSource as string, {
          caption: captionText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              ...(isDemo || isBase64
                ? []
                : [[{ text: "⬇️ Download", url: result.imageUrl! }]]),
              [
                { text: t('msg.btn_make_variation', lang2), callback_data: "image_generate" },
                { text: t('msg.btn_make_video', lang2), callback_data: "make_video_from_image" },
              ],
              [{ text: t('btn.main_menu', lang2), callback_data: "main_menu" }],
            ],
          },
        });
      } else {
        const lang3 = ctx.session?.userLang || 'id';
        await telegram.sendMessage(
          chatId,
          t('msg.generate_failed', lang3, { error: result.error || "Unknown error" }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: t('btn.try_again', lang3), callback_data: "image_generate" }]],
            },
          },
        );
      }
    } catch (error) {
      logger.error("Image generation error:", error);
      await telegram.sendMessage(chatId, t('msg.image_analyze_failed', ctx.session?.userLang || 'id'));
    }
  })();
}

/**
 * Handle incoming messages — thin dispatcher that delegates to
 * the focused handler modules in `./messages/`.
 *
 * The dispatch order matters: more specific states must be checked
 * before generic fallbacks. Each handler returns `true` if it
 * handled the message, causing the dispatcher to return early.
 */
export async function messageHandler(ctx: BotContext): Promise<void> {
  try {
    const message = ctx.message;
    if (!message) return;

    // Log message
    logger.debug("Received message:", {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      text: "text" in message ? message.text : "[non-text]",
    });

    // Fire-and-forget event logging for intercepted users
    if (ctx.from?.id) {
      const fromId = ctx.from.id;
      import("@/services/intercept.service.js").then(({ InterceptService }) => {
        InterceptService.isIntercepted(BigInt(fromId))
          .then((intercepted) => {
            if (!intercepted) return;
            const text = "text" in message ? message.text : "[media]";
            InterceptService.logEvent(BigInt(fromId), "user_message", text || "[media]", {
              state: ctx.session?.state,
            }).catch(() => {});
          })
          .catch(() => {});
      }).catch(() => {});
    }

    // Handle /skip for video creation (must be before state checks)
    if (
      "text" in message &&
      message.text === "/skip" &&
      ctx.session?.videoCreation?.waitingForImage
    ) {
      await handleSkipImageReference(ctx);
      return;
    }

    // Fallback untuk command yang tidak terdaftar — balas alih-alih diam.
    // Semua command terdaftar ditangani Telegraf `bot.command`, jadi hanya
    // slash yang tidak dikenal yang sampai ke sini.
    if ("text" in message && message.text?.startsWith("/")) {
      const lang = ctx.session?.userLang || ctx.from?.language_code || 'id';
      const cmd = message.text.split(/\s+/)[0];
      await ctx.reply(t('msg.command_not_found', lang).replace('{cmd}', cmd), {
        parse_mode: 'Markdown',
      }).catch(() => {});
      return;
    }

    const messageText = "text" in message && message.text ? message.text : "";

    // ── Dispatch to focused handlers ──
    // Each handler returns true if it handled the current state.
    type SingleArgHandler = (ctx: BotContext) => Promise<boolean>;
    const handlers: SingleArgHandler[] = [
      // V3 flow states
      (c) => handleCustomDurationV3(c, messageText),
      handleAwaitingGenerateImage,
      handleCustomDurationInput,
      // Text input states
      handleCustomPromptCreation,
      handleCustomPromptInput,
      handleWaitingAccountId,
      handleEbookStates,
      // Photo upload states
      handleCreateVideoUpload,
      handleImageReferenceWaiting,
      handleAvatarUploadWaiting,
      handleAvatarNameWaiting,
      handleAvatarTalkPhoto,
      // Image generation states
      handleImageGenerationWaiting,
      handleCloneEditDescWaiting,
      handleCloneVideoWaiting,
      // Carousel topic waiting
      async (c) => {
        if (!c.session?.stateData?.waitingForCarouselTopic || !("text" in (c.message ?? {}))) return false;
        const msg = c.message as { text: string };
        const topic = msg.text?.trim();
        if (!topic) return false;
        c.session.stateData = { ...c.session.stateData, waitingForCarouselTopic: false, carouselTopic: topic };
        const { tiktokAutomation } = await import("@/services/tiktok-automation.service.js");
        await c.reply("🖼️ Generating carousel...\n⏳ Mohon tunggu 30-60 detik.");
        try {
          const result = await tiktokAutomation.createCarousel({ topic });
          if (result.success && result.slides) {
            const fs = await import("fs");
            for (const slidePath of result.slides) {
              if (fs.existsSync(slidePath)) {
                await c.replyWithPhoto({ source: slidePath });
              }
            }
            await c.reply(`✅ Carousel *${result.content?.title ?? topic}* selesai!`, { parse_mode: "Markdown" });
          } else {
            await c.reply(`❌ Gagal: ${result.error ?? "Unknown error"}`);
          }
        } catch (err: unknown) {
          const msg2 = err instanceof Error ? err.message : String(err);
          await c.reply(`❌ Error: ${msg2}`);
        }
        return true;
      },
      // Re-metadata video waiting
      async (c) => {
        if (!c.session?.stateData?.waitingForRemetaVideo) return false;
        if (!("video" in (c.message ?? {})) && !("document" in (c.message ?? {}))) return false;

        const message = c.message as { video?: { file_id: string }; document?: { file_id: string; mime_type?: string } };
        const fileId = message.video?.file_id ?? (message.document?.mime_type?.startsWith("video/") ? message.document?.file_id : undefined);
        if (!fileId) return false;

        const overlay = String(c.session.stateData?.remetaOverlay ?? "");
        const args = String(c.session.stateData?.remetaArgs ?? overlay);
        c.session.stateData = { ...c.session.stateData, waitingForRemetaVideo: false };

        // Download video
        const fs = await import("fs");
        const path = await import("path");
        const fileLink = await c.telegram.getFileLink(fileId);
        const ext = fileLink.pathname.endsWith(".mp4") ? ".mp4" : ".mov";
        const downloadPath = path.join("/tmp", `remeta_input_${Date.now()}${ext}`);

        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(downloadPath, buffer);

        c.session.stateData = { ...c.session.stateData, lastVideoPath: downloadPath };

        // Process
        // Parse args inline
        const parts = args.split(/\s+/);
        const overlayText = parts[0] || "@brand";
        let watermark = "";
        let niche = "general";
        for (let i = 1; i < parts.length; i++) {
          if (parts[i] === "--watermark" && parts[i + 1]) { watermark = parts[i + 1]; i++; }
          else if (parts[i] === "--niche" && parts[i + 1]) { niche = parts[i + 1]; i++; }
        }

        await c.reply(`🔄 Re-rendering video with overlay "${overlayText}"...\n⏳ 30-60 detik...`);

        try {
          const { tiktokAutomation } = await import("@/services/tiktok-automation.service.js");
          const result = await tiktokAutomation.remetaContent({
            source: downloadPath,
            overlay: overlayText,
            watermark: watermark || undefined,
            niche,
          });

          if (result.success) {
            const newVideoPath = result.video_path as string;
            const metadata = result.metadata as Record<string, unknown> | undefined;
            const changes = result.changes_applied as string[] | undefined;
            const hashtags = Array.isArray(metadata?.hashtags) ? (metadata.hashtags as string[]).slice(0, 5).join(" ") : "";

            if (newVideoPath && fs.existsSync(newVideoPath)) {
              await c.replyWithVideo(
                { source: newVideoPath },
                {
                  caption: `✅ *Re-Metadata Done!*\n\n🔄 ${changes?.join(",") ?? "none"}\n📝 ${String(metadata?.title ?? "").slice(0, 80)}\n#️⃣ ${hashtags}`,
                  parse_mode: "Markdown",
                },
              );
            }
          } else {
            await c.reply(`❌ ${String(result.error ?? "Failed")}`);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await c.reply(`❌ Error: ${errMsg}`);
        }
        return true;
      },
    ];

    for (const handler of handlers) {
      if (await handler(ctx)) return;
    }

    // ── Text message routing (menu + AI chat) ──
    if ("text" in message) {
      const text = message.text;
      const state = ctx.session?.state;

      // Active workflow states that are handled above
      const activeStates = [
        "IMAGE_GENERATION_WAITING",
        "CLONE_EDIT_DESC_WAITING",
        "CUSTOM_PROMPT_CREATION",
        "CUSTOM_PROMPT_INPUT",
        "WAITING_ACCOUNT_ID",
      ];
      if (activeStates.includes(state || "")) return;

      // Try menu button routing
      if (await routeMenuButton(ctx, text)) return;

      // Try video intent detection
      if (await detectVideoIntent(ctx, text)) return;

      // Try AI chat
      await tryAIChat(ctx, text);
    }
  } catch (error) {
    logger.error("Error in messageHandler:", error);
    try {
      await ctx.reply("❌ An error occurred. Please try again.");
    } catch {
      /* can't reply */
    }
  }
}
