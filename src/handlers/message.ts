/**
 * Message Handler
 *
 * Handles all incoming messages
 */

import { handleDisassemble, handleVideoCreationImage, handleSkipImageReference, handleVideoElementPrecheck } from "./messages/video-uploader";
export { handleDisassemble, handleVideoCreationImage, handleSkipImageReference, handleVideoElementPrecheck };
import { updateSessionDirectly, SESSION_TTL } from "./messages/session";
export { updateSessionDirectly };
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
    if (isLibraryPrompt && canUseDailyFree(user)) {
      useFreeSlot = 'daily';
    } else if (isLibraryPrompt && canUseWelcomeBonus(user)) {
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

        let photoSource: string | { source: Buffer };
        let isBase64 = false;
        if (result.imageUrl!.startsWith("data:")) {
          const base64Data = result.imageUrl!.split(",")[1];
          photoSource = { source: Buffer.from(base64Data, "base64") };
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
    } catch (error: any) {
      logger.error("Image generation error:", error);
      await telegram.sendMessage(chatId, t('msg.image_analyze_failed', ctx.session?.userLang || 'id'));
    }
  })();
}

/**
 * Handle incoming messages
 */
export async function messageHandler(ctx: BotContext): Promise<void> {
  try {
    const message = ctx.message;

    if (!message) {
      return;
    }

    // Log message
    logger.debug("Received message:", {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      text: "text" in message ? message.text : "[non-text]",
    });

    // Fire-and-forget event logging for intercepted users
    if (ctx.from?.id) {
      const fromId = ctx.from.id;
      import('@/services/intercept.service.js').then(({ InterceptService }) => {
        InterceptService.isIntercepted(BigInt(fromId)).then(intercepted => {
          if (!intercepted) return;
          const text = 'text' in message ? message.text : '[media]';
          InterceptService.logEvent(BigInt(fromId), 'user_message', text || '[media]', {
            state: ctx.session?.state,
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }

    if ("text" in message && message.text?.startsWith("/")) {
      return;
    }

    // Handle /skip for video creation (must be before switch)
    if (
      "text" in message &&
      message.text === "/skip" &&
      ctx.session?.videoCreation?.waitingForImage
    ) {
      await handleSkipImageReference(ctx);
      return;
    }

    // ── V3 FLOW: CUSTOM DURATION INPUT ─────────────────────────────────────
    if (ctx.session?.state === 'CUSTOM_DURATION_INPUT_V3' && 'text' in message) {
      const input = message.text.trim();
      const duration = parseInt(input);

      if (isNaN(duration) || duration < CUSTOM_DURATION_MIN) {
        await ctx.reply(t('msg.duration_range_error', ctx.session?.userLang || 'id'), { parse_mode: 'Markdown' });
        return;
      }

      const { buildCustomPresetConfig } = await import('../config/hpas-engine.js');
      const presetConfig = buildCustomPresetConfig(duration);

      if (ctx.session) {
        ctx.session.generatePreset = 'custom';
        ctx.session.customPresetConfig = presetConfig;
        ctx.session.state = 'DASHBOARD';
      }

      const cdLang = ctx.session?.userLang || 'id';
      const minutes = Math.floor(duration / 60);
      const secs = duration % 60;
      const durLabel = minutes > 0 ? `${minutes}m${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`;

      await ctx.reply(
        t('msg.custom_duration_set', cdLang, { durLabel, scenes: presetConfig.scenesIncluded.length, cost: presetConfig.creditCost / 10 }),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎵 TikTok (9:16)', callback_data: 'platform_tiktok' }],
              [{ text: '📸 Instagram (9:16)', callback_data: 'platform_instagram' }],
              [{ text: '▶️ YouTube (16:9)', callback_data: 'platform_youtube' }],
              [{ text: '⬛ Square (1:1)', callback_data: 'platform_square' }],
              [{ text: t('btn.main_menu', cdLang), callback_data: 'main_menu' }],
            ],
          },
        },
      );
      return;
    }

    // ── V3 FLOW: AWAITING PRODUCT INPUT (photo or text) ───────────────────
    if (ctx.session?.state === 'AWAITING_PRODUCT_INPUT') {
      const { handleProductInput } = await import('../flows/generate.js');
      await handleProductInput(ctx, message);
      return;
    }

    // ── PRO MODE: AWAITING SCENE EDIT ─────────────────────────────────────
    if (ctx.session?.state === 'AWAITING_SCENE_EDIT' && 'text' in message) {
      const newDesc = message.text?.trim();
      const editingSceneId = (ctx.session.stateData as Record<string, string> | null)?.editingSceneId;
      if (newDesc && editingSceneId && ctx.session.generateScenes) {
        ctx.session.generateScenes = ctx.session.generateScenes.map((s) =>
          s.sceneId === editingSceneId ? { ...s, prompt: newDesc } : s
        );
      }
      // Clear editing state and re-show scene review
      if (ctx.session) {
        ctx.session.stateData = {};
        ctx.session.state = 'DASHBOARD';
      }
      const { showProSceneReview } = await import('../flows/generate.js');
      const productDesc = ctx.session?.generateProductDesc || '';
      await showProSceneReview(ctx, productDesc);
      return;
    }

    // ── PRO MODE: MULTI-IMAGE UPLOAD ───────────────────────────────────
    if (ctx.session?.state === 'AWAITING_MULTI_IMAGE_UPLOAD' && 'photo' in message) {
      const { handleMultiImageUpload } = await import('../flows/generate.js');
      await handleMultiImageUpload(ctx, message);
      return;
    }

    // ── PRO MODE: STORYBOARD EDIT ───────────────────────────────────────
    if (ctx.session?.state === 'AWAITING_STORYBOARD_EDIT' && 'text' in message) {
      const { handleStoryboardEdit } = await import('../flows/generate.js');
      await handleStoryboardEdit(ctx, message);
      return;
    }

    // ── PRO MODE: TRANSCRIPT INPUT ──────────────────────────────────────
    if (ctx.session?.state === 'AWAITING_TRANSCRIPT_INPUT' && 'text' in message) {
      const { handleTranscriptInput } = await import('../flows/generate.js');
      await handleTranscriptInput(ctx, message);
      return;
    }

    // ── V3 GENERATE: AWAITING REFERENCE IMAGE ────────────────────────────
    if (ctx.session?.state === 'AWAITING_GENERATE_IMAGE') {
      const lang = ctx.session?.userLang || 'id';
      if ('photo' in message) {
        const largest = message.photo[message.photo.length - 1];
        const fileSize = largest.file_size || 0;
        if (fileSize > 0 && fileSize < 10000) {
          await ctx.reply(t('msg.photo_too_small', lang));
          return;
        }
        if (fileSize > 20 * 1024 * 1024) {
          await ctx.reply(t('msg.photo_too_large', lang));
          return;
        }
        const fileLink = await ctx.telegram.getFileLink(largest.file_id);
        ctx.session.generatePhotoUrl = fileLink.toString();
        ctx.session.state = 'DASHBOARD';
        await ctx.reply(t('msg.photo_received', lang), { parse_mode: 'Markdown' });
        const { continueAfterImagePreference } = await import('../flows/generate.js');
        await continueAfterImagePreference(ctx);
        return;
      }
      if ('text' in message && message.text === '/skip') {
        ctx.session.state = 'DASHBOARD';
        delete ctx.session.generatePhotoUrl;
        await ctx.reply(t('msg.skip_photo', lang));
        const { continueAfterImagePreference } = await import('../flows/generate.js');
        await continueAfterImagePreference(ctx);
        return;
      }
      await ctx.reply(t('msg.send_photo_or_skip', lang));
      return;
    }

    // ── (Dead VIDEO_CREATE_UPLOAD/TEXT handlers removed — states never set) ──

    // Handle custom duration input (must be before switch to catch numeric input)
    if (ctx.session?.state === "CUSTOM_DURATION_INPUT" && "text" in message) {
      const durationInput = message.text.trim();
      const duration = parseInt(durationInput);

      if (isNaN(duration) || duration < 6 || duration > 300) {
        const errLang = ctx.session?.userLang || 'id';
        if (ctx.session) ctx.session.state = 'DASHBOARD';
        await ctx.reply(
          t('msg.invalid_duration', errLang),
          {
            reply_markup: {
              inline_keyboard: [[
                { text: t('btn.main_menu', errLang), callback_data: 'main_menu' },
              ]],
            },
          },
        );
        return;
      }

      const SCENE_DURATION = 5;
      const bestFit = {
        scenes: Math.ceil(duration / SCENE_DURATION),
        durationPerScene: SCENE_DURATION,
      };

      const finalDuration = bestFit.scenes * bestFit.durationPerScene;
      const niche = ctx.session.selectedNiche || "fnb";
      const platform = String(ctx.session.selectedPlatforms?.[0] || "tiktok");
      const creditCost = getVideoCreditCost(finalDuration);
      const telegramId = BigInt(ctx.from!.id);

      const user = await UserService.findByTelegramId(telegramId);
      if (!user || Number(user.creditBalance) < creditCost) {
        await ctx.reply(
          t('gen.insufficient_credits', ctx.session?.userLang || 'id', { cost: creditCost, balance: Number(user?.creditBalance || 0) }),
        );
        ctx.session.state = "DASHBOARD";
        return;
      }

      const styles = ctx.session.selectedStyles || [];
      ctx.session.state = "DASHBOARD";

      const almostLang = ctx.session?.userLang || 'id';
      await ctx.reply(
        t('msg.almost_ready', almostLang, {
          requested: String(duration),
          optimized: String(finalDuration),
          scenes: String(bestFit.scenes),
          sceneDuration: String(bestFit.durationPerScene),
          creditCost: String(creditCost),
        }),
        { parse_mode: "Markdown" },
      );

      ctx.session.videoCreation = {
        mode: bestFit.scenes > 1 ? "extended" : "short",
        niche,
        platform,
        totalDuration: finalDuration,
        scenes: bestFit.scenes,
        storyboard: generateStoryboard(
          niche,
          styles,
          finalDuration,
          bestFit.scenes,
        ),
        jobId: "",
        waitingForImage: true,
        enableVO: true,
        enableSubtitles: true,
      };
      return;
    }

    // Handle add-to-library custom prompt input (CUSTOM_PROMPT_CREATION state)
    if (
      ctx.session?.state === "CUSTOM_PROMPT_CREATION" &&
      ctx.session?.stateData?.addingPromptNiche &&
      "text" in message
    ) {
      const promptText = message.text.trim();
      const nicheKey = ctx.session.stateData.addingPromptNiche as string;
      if (promptText.length < 10) {
        await ctx.reply(t('msg.prompt_too_short', ctx.session?.userLang || 'id'));
        return;
      }
      try {
        const dbUser = await UserService.findByTelegramId(BigInt(ctx.from!.id));
        if (dbUser) {
          // Auto-generate title from first 5 words
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
          const psLang = ctx.session?.userLang || 'id';
          const nicheDisplay = `${niche?.emoji || ""} ${niche?.label || nicheKey}`;
          const preview = `${promptText.slice(0, 150)}${promptText.length > 150 ? "..." : ""}`;
          await ctx.reply(
            t('msg.prompt_saved', psLang, { niche: nicheDisplay, preview }),
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: t('msg.btn_create_video_now', psLang), callback_data: "create_video_new" }],
                  [{ text: t('msg.btn_view_saved', psLang), callback_data: `my_prompts_${nicheKey}` }],
                  [{ text: t('btn.main_menu', psLang), callback_data: "main_menu" }],
                ],
              },
            },
          );
          // Pre-fill session
          ctx.session.stateData = {
            ...ctx.session.stateData,
            selectedPrompt: promptText,
          };
        }
      } catch (err) {
        await ctx.reply(t('msg.save_prompt_failed', ctx.session?.userLang || 'id'));
      }
      return;
    }

    // Handle custom prompt text input
    if (
      ctx.session?.state === "CUSTOM_PROMPT_INPUT" &&
      ctx.session?.videoCreation?.waitingForCustomPrompt &&
      "text" in message
    ) {
      const promptText = message.text.trim();
      if (!promptText) {
        await ctx.reply(t('msg.send_prompt_or_create', ctx.session?.userLang || 'id'));
        return;
      }

      ctx.session.videoCreation.customPrompt = promptText;
      ctx.session.videoCreation.waitingForCustomPrompt = false;
      ctx.session.state = "DASHBOARD";

      // Proceed to reference image step
      ctx.session.videoCreation.waitingForImage = true;
      const cpLang = ctx.session?.userLang || 'id';
      await ctx.reply(
        t('msg.photo_received', cpLang) + '\n\n' + t('msg.send_photo_or_skip', cpLang),
        { parse_mode: "Markdown" },
      );
      return;
    }

    // Handle social account connection (WAITING_ACCOUNT_ID state)
    if (ctx.session?.state === "WAITING_ACCOUNT_ID" && "text" in message) {
      const accountId = message.text.trim();
      const platform = ctx.session.connectingPlatform || "unknown";
      const telegramId = BigInt(ctx.from!.id);

      if (!accountId || accountId.startsWith("/")) {
        await ctx.reply(t('msg.invalid_account_id', ctx.session?.userLang || 'id'));
        return;
      }

      try {
        await PostAutomationService.connectAccount(
          telegramId,
          platform,
          accountId,
        );

        const acLang = ctx.session?.userLang || 'id';
        await ctx.reply(t('msg.account_connected', acLang, { platform: platform.toUpperCase(), accountId }), {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t('msg.btn_manage_accounts', acLang),
                    callback_data: "manage_accounts",
                  },
                ],
                [{ text: t('msg.btn_create_video_new', acLang), callback_data: "create_video_new" }],
              ],
            },
          },
        );
      } catch (error: any) {
        logger.error("Failed to connect account:", error);
        const cfLang = ctx.session?.userLang || 'id';
        await ctx.reply(
          t('msg.connect_failed', cfLang, { error: error.message || "Unknown error" }),
        );
      }

      ctx.session.state = "DASHBOARD";
      ctx.session.connectingPlatform = undefined;
      return;
    }

    // Handle text messages
    if ("text" in message) {
      const text = message.text;

      // Check for active workflow states FIRST — before routing to menu/AI chat
      // This ensures prompts typed during image/video creation are captured correctly
      if (ctx.session?.state === "IMAGE_GENERATION_WAITING") {
        // Will be handled by the IMAGE_GENERATION_WAITING handler below
      } else if (ctx.session?.state === "CLONE_EDIT_DESC_WAITING") {
        // Will be handled by the CLONE_EDIT_DESC_WAITING handler below
      } else if (ctx.session?.state === "CUSTOM_PROMPT_CREATION") {
        // Will be handled by the CUSTOM_PROMPT_CREATION handler below
      } else if (ctx.session?.state === "CUSTOM_PROMPT_INPUT") {
        // Will be handled by the CUSTOM_PROMPT_INPUT handler below
      } else if (ctx.session?.state === "WAITING_ACCOUNT_ID") {
        // Will be handled by the WAITING_ACCOUNT_ID handler below
      } else if (ctx.session?.state === "EBOOK_IDEA") {
        const { handleEbookIdea } = await import("@/commands/ebook.js");
        await handleEbookIdea(ctx, message);
        return;
      } else if (ctx.session?.state === "EBOOK_TITLE") {
        const { handleEbookTitle } = await import("@/commands/ebook.js");
        await handleEbookTitle(ctx, message);
        return;
      } else if (ctx.session?.state === "EBOOK_CHAPTERS") {
        const { handleEbookChapters } = await import("@/commands/ebook.js");
        await handleEbookChapters(ctx, message);
        return;
      } else {
        // Handle reply keyboard buttons — match all language variants
        const { getAllMenuTexts } = await import('../config/pricing.js');
        const menuMatch = (key: string) => getAllMenuTexts(key).includes(text);

        if (menuMatch('create') || text === '🚀 Get Started') {
            const { showGenerateMode } = await import('../flows/generate.js');
            await showGenerateMode(ctx);
            return;
        }

        if (menuMatch('image')) {
            const imgLang = ctx.session?.userLang || 'id';
            await ctx.reply(t('msg.image_generate_title', imgLang), {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: t('msg.img_btn_product_photo', imgLang), callback_data: "img_product" }],
                  [{ text: t('msg.img_btn_fnb', imgLang), callback_data: "img_fnb" }],
                  [{ text: t('msg.img_btn_realestate', imgLang), callback_data: "img_realestate" }],
                  [{ text: t('msg.img_btn_car', imgLang), callback_data: "img_car" }],
                ],
              },
            });
            return;
        }

        if (menuMatch('chat')) {
            const chatLang = ctx.session?.userLang || 'id';
            await ctx.reply(t('msg.ai_chat_active', chatLang), { parse_mode: "MarkdownV2" });
            if (ctx.session) ctx.session.state = "DASHBOARD";
            return;
        }
        if (menuMatch('videos')) { await videosCommand(ctx); return; }
        if (menuMatch('topup')) { await topupCommand(ctx); return; }
        if (menuMatch('subscription')) { await subscriptionCommand(ctx); return; }
        if (menuMatch('profile')) { await profileCommand(ctx); return; }
        if (menuMatch('referral')) { await referralCommand(ctx); return; }
        if (menuMatch('settings')) { await settingsCommand(ctx); return; }
        if (menuMatch('support')) { await supportCommand(ctx); return; }
        if (menuMatch('library')) { await promptsCommand(ctx); return; }
        if (menuMatch('trending')) { await trendingCommand(ctx); return; }
        if (menuMatch('daily')) { await dailyCommand(ctx); return; }
        if (menuMatch('fingerprint')) { await fingerprintCommand(ctx); return; }
        if (menuMatch('talk')) {
          const { handleAvatarTalkCallbacks } = await import('./callbacks/avatar-talk.js');
          await handleAvatarTalkCallbacks(ctx, 'avatar_talk_start');
          return;
        }
        if (menuMatch('help')) { await helpCommand(ctx); return; }

        // t2v contextless: detect video intent keywords in text
        if (
          (ctx.session.state === 'DASHBOARD' || ctx.session.state === 'START') &&
          /\b(buat video|create video|jadikan video|video dari|bikin video|video tentang)\b/i.test(text)
        ) {
          const videoPrompt = text;
          ctx.session.stateData = { ...ctx.session.stateData, pendingVideoPrompt: videoPrompt };
          await ctx.reply(
            `🎬 *Deteksi: prompt video*\n\n_"${videoPrompt.slice(0, 200)}"_\n\nMau buat video dari prompt ini?`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🎬 Ya, buat video!', callback_data: 't2v_confirm_contextless' },
                    { text: '💬 Chat saja', callback_data: 'media_intent_ignore' },
                  ],
                ],
              },
            },
          );
          return;
        }

        // No menu match → try AI chat or show main menu
        {
            const trimmed = text.trim();
            if (trimmed.length > 2 && !trimmed.startsWith("/")) {
              const omni = getOmniRouteService();
              const userId = String(ctx.from?.id || "unknown");
              try {
                const loadingId = await sendVilonaLoading(ctx, "thinking");
                const result = await omni.chat(userId, trimmed);
                if (loadingId) {
                  await ctx.telegram
                    .deleteMessage(ctx.chat!.id, loadingId)
                    .catch(() => { });
                }
                if (result.success && result.content) {
                  try {
                    await ctx.reply(result.content, { parse_mode: "Markdown" });
                  } catch {
                    await ctx.reply(result.content);
                  }
                  return;
                }
              } catch {
                /* fall through to menu */
              }
            }
            await showMainMenu(ctx);
        }
      }
    }

    // Handle photo uploads
    if ("photo" in message) {
      if (ctx.session.state === "CREATE_VIDEO_UPLOAD") {
        const cvuLang = ctx.session?.userLang || 'id';
        const _cvuPersona = getPersonaForUser(ctx.session?.userMode);
        const _allNicheButtons = [
          { text: t('msg.niche_btn_fnb', cvuLang), callback_data: "niche_fnb", key: "fnb" },
          { text: t('msg.niche_btn_beauty', cvuLang), callback_data: "niche_beauty", key: "beauty" },
          { text: t('msg.niche_btn_retail', cvuLang), callback_data: "niche_retail", key: "retail" },
          { text: t('msg.niche_btn_services', cvuLang), callback_data: "niche_services", key: "services" },
          { text: t('msg.niche_btn_professional', cvuLang), callback_data: "niche_professional", key: "professional" },
          { text: t('msg.niche_btn_hospitality', cvuLang), callback_data: "niche_hospitality", key: "hospitality" },
        ].filter(b => isNicheAllowedForPersona(_cvuPersona, resolveNicheKey(b.key)));
        // Pair buttons into rows of 2
        const _nicheRows: { text: string; callback_data: string }[][] = [];
        for (let i = 0; i < _allNicheButtons.length; i += 2) {
          _nicheRows.push(_allNicheButtons.slice(i, i + 2).map(b => ({ text: b.text, callback_data: b.callback_data })));
        }
        await ctx.reply(
          t('msg.photo_received_niche', cvuLang),
          {
            reply_markup: {
              inline_keyboard: _nicheRows.length > 0 ? _nicheRows : [
                [{ text: t('msg.niche_btn_fnb', cvuLang), callback_data: "niche_fnb" }],
              ],
            },
          },
        );
        ctx.session.state = "CREATE_VIDEO_NICHE";
        return;
      }
    }

    // Handle reference image upload for image generation (img2img)
    if (ctx.session.state === "IMAGE_REFERENCE_WAITING" && "photo" in message) {
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
      const referenceUrl = fileLink.toString();

      const refImgLang = ctx.session?.userLang || 'id';

      // i2t mode: analyze only, no generation
      if (ctx.session.stateData?.mode === 'analyze') {
        const analyzeLoading = await ctx.reply('🔍 _Menganalisis gambar..._', { parse_mode: 'Markdown' });
        try {
          const analysis = await ContentAnalysisService.extractPrompt(referenceUrl, 'image');
          if (analysis.success && analysis.prompt) {
            const elements = detectImageElements(analysis.prompt);
            const detected: string[] = [];
            if (elements.hasProduct) detected.push(`📦 *Produk:* _${elements.productDesc || 'terdeteksi'}_`);
            if (elements.hasCharacter) detected.push(`👤 *Orang:* _${elements.characterDesc || 'terdeteksi'}_`);
            if (elements.backgroundDesc) detected.push(`🖼️ *Background:* _${elements.backgroundDesc}_`);
            const detectedText = detected.length > 0 ? detected.join('\n') : '_Tidak ada elemen spesifik_';

            await ctx.telegram.editMessageText(ctx.chat!.id, analyzeLoading.message_id, undefined,
              `📝 *Deskripsi Gambar*\n\n${detectedText}\n\n*Prompt AI:*\n\`${analysis.prompt.slice(0, 400)}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '🖼️ Edit Gambar', callback_data: 'imgref_upload' },
                      { text: '🎬 Jadikan Video', callback_data: 'create_video_new' },
                    ],
                    [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }],
                  ],
                },
              },
            );
          } else {
            await ctx.telegram.editMessageText(ctx.chat!.id, analyzeLoading.message_id, undefined, '❌ Tidak bisa menganalisis gambar.');
          }
        } catch (err) {
          logger.warn('i2t analyze failed:', err);
          await ctx.telegram.deleteMessage(ctx.chat!.id, analyzeLoading.message_id).catch(() => {});
          await ctx.reply('❌ Analisis gambar gagal.');
        }
        ctx.session.state = 'DASHBOARD';
        ctx.session.stateData = {};
        return;
      }

      // Show loading indicator while vision analysis runs (~3-5s)
      const loadingMsg = await ctx.reply('🔍 _Menganalisis gambar..._', { parse_mode: 'Markdown' });

      // Analyze image to detect elements (character, product, background)
      let analysisResult: { hasCharacter: boolean; hasProduct: boolean; characterDesc: string; productDesc: string; backgroundDesc: string } | null = null;
      try {
        const analysis = await ContentAnalysisService.extractPrompt(referenceUrl, 'image');
        if (analysis.success && analysis.prompt) {
          analysisResult = detectImageElements(analysis.prompt);
        }
      } catch (err) {
        logger.warn("Element detection failed (non-fatal):", err);
      }

      // Always show element selection keyboard when analysis succeeds —
      // gives user full control over what to preserve (product, character, background).
      // Default selection is context-aware: product-only shots default to keepProduct=true.
      if (analysisResult) {
        const defaultSel = {
          keepProduct: analysisResult.hasProduct,
          keepCharacter: analysisResult.hasProduct ? false : analysisResult.hasCharacter,
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

        // Edit the loading message in place → element selection keyboard
        // (same message ID stays, loading text visible briefly, then updated with buttons)
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          buildElementSelectionMessage(analysisResult, analysisResult.characterDesc, analysisResult.productDesc),
          {
            parse_mode: "Markdown",
            reply_markup: renderElementSelectionKeyboard(defaultSel),
          },
        );
        return;
      }

      // Remove loading indicator (analysis failed path)
      ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {});

      // Vision analysis failed — proceed directly without element selection
      ctx.session.state = "IMAGE_GENERATION_WAITING";
      ctx.session.stateData = {
        ...ctx.session.stateData,
        referenceImageUrl: referenceUrl,
        mode: "img2img",
      };

      await ctx.reply(
        t('msg.ref_image_received', refImgLang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('msg.btn_cancel', refImgLang), callback_data: "image_generate" }],
            ],
          },
        },
      );
      return;
    }

    // Handle avatar photo upload
    if (ctx.session.state === "AVATAR_UPLOAD_WAITING" && "photo" in message) {
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
      const avatarUrl = fileLink.toString();

      ctx.session.state = "AVATAR_NAME_WAITING";
      ctx.session.stateData = { avatarImageUrl: avatarUrl };

      const avatarPhotoLang = ctx.session?.userLang || 'id';
      await ctx.reply(
        t('msg.avatar_photo_received', avatarPhotoLang),
        { parse_mode: "Markdown" },
      );
      return;
    }

    // Handle avatar name input
    if (ctx.session.state === "AVATAR_NAME_WAITING" && "text" in message) {
      const name = message.text.slice(0, 64);
      const avatarUrl = ctx.session.stateData?.avatarImageUrl as string;

      if (!avatarUrl) {
        await ctx.reply(t('msg.avatar_lost', ctx.session?.userLang || 'id'));
        ctx.session.state = "DASHBOARD";
        return;
      }

      await ctx.reply(t('msg.analyzing_avatar', ctx.session?.userLang || 'id'), { parse_mode: "Markdown" });

      try {
        const telegramId = BigInt(ctx.from!.id);
        const avatar = await AvatarService.createAvatar(
          telegramId,
          name,
          avatarUrl,
        );

        const avatarSavedLang = ctx.session?.userLang || 'id';
        const defaultLine = avatar.isDefault ? t('msg.avatar_default_line', avatarSavedLang) : '';
        const descLine = avatar.description ? `_${avatar.description.slice(0, 200)}_\n\n` : '';
        await ctx.reply(
          t('msg.avatar_saved', avatarSavedLang, { name: avatar.name, defaultLine, descLine }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t('msg.btn_generate_with_avatar', avatarSavedLang),
                    callback_data: "image_generate",
                  },
                ],
                [{ text: t('msg.btn_manage_avatars', avatarSavedLang), callback_data: "avatar_manage" }],
                [{ text: t('msg.btn_back_to_menu', avatarSavedLang), callback_data: "main_menu" }],
              ],
            },
          },
        );
      } catch (error: any) {
        logger.error("Avatar creation failed:", error);
        await ctx.reply(
          t('msg.avatar_save_failed', ctx.session?.userLang || 'id', { error: error.message || "Please try again." }),
          { parse_mode: "Markdown" },
        );
      }

      ctx.session.state = "DASHBOARD";
      return;
    }

    // Handle talking photo — photo upload step
    if (ctx.session.state === "avatar_talk_photo" && "photo" in message) {
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
      const photoUrl = fileLink.toString();
      const { handleAvatarTalkPhoto } = await import('./callbacks/avatar-talk.js');
      await handleAvatarTalkPhoto(ctx, photoUrl);
      return;
    }

    // Catch-all: spontaneous photo/video in any non-flow state → intent selection
    const MEDIA_HANDLED_STATES: string[] = [
      'CREATE_VIDEO_UPLOAD', 'IMAGE_REFERENCE_WAITING', 'AVATAR_UPLOAD_WAITING',
      'avatar_talk_photo', 'AWAITING_MULTI_IMAGE_UPLOAD', 'AWAITING_GENERATE_IMAGE',
      'IMAGE_ELEMENT_SELECTION', 'VIDEO_ELEMENT_SELECTION', 'CLONE_IMAGE_WAITING',
      'DISASSEMBLE_WAITING', 'CLONE_VIDEO_WAITING', 'MEDIA_INTENT_SELECTION',
    ];

    if (("photo" in message || "video" in message) && !MEDIA_HANDLED_STATES.includes(ctx.session.state)) {
      const _lang = ctx.session?.userLang || 'id';

      if ("video" in message) {
        // ── Contextless video upload ──
        const fileLink = await ctx.telegram.getFileLink(message.video.file_id);
        const videoUrl = fileLink.toString();

        ctx.session.state = 'MEDIA_INTENT_SELECTION';
        ctx.session.stateData = {
          ...ctx.session.stateData,
          pendingMediaUrl: videoUrl,
          pendingMediaType: 'video',
        };

        await ctx.reply(
          '🎬 *Video diterima!* Mau diapakan?\n\n_Pilih aksi di bawah:_',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎬 Buat Video Serupa', callback_data: 'media_intent_v2v' },
                  { text: '📝 Analisis Video', callback_data: 'media_intent_v2t' },
                ],
                [{ text: '❌ Abaikan', callback_data: 'media_intent_ignore' }],
              ],
            },
          },
        );
        return;
      }

      // ── Contextless photo upload ──
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
      const photoUrl = fileLink.toString();
      const msgWithMedia = message as { media_group_id?: string; caption?: string };
      const mediaGroupId = msgWithMedia.media_group_id;
      const captionText = msgWithMedia.caption;

      if (mediaGroupId) {
        // Multi-photo batch: debounce and collect
      const existingUrls: string[] = ((ctx.session.stateData as Record<string, unknown>)._batchUrls as string[]) || [];
      existingUrls.push(photoUrl);
      const lastGroupId = (ctx.session.stateData as Record<string, unknown>)._batchGroupId as string | undefined;

        ctx.session.stateData = {
          ...ctx.session.stateData,
          _batchGroupId: mediaGroupId,
          _batchUrls: existingUrls,
        };

        if (lastGroupId === mediaGroupId) {
          // Same group still arriving — accumulate silently
          return;
        }

        // First photo of new group — wait for rest
        await new Promise((r) => setTimeout(r, 1500));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Session stateData dynamic access
        const finalUrls: string[] = (ctx.session.stateData as any)?._batchUrls || [photoUrl];

        ctx.session.state = 'MEDIA_INTENT_SELECTION';
        ctx.session.stateData = {
          ...ctx.session.stateData,
          pendingMediaUrl: finalUrls[0],
          pendingMediaUrls: finalUrls,
          pendingMediaType: 'photo_batch',
        };

        await ctx.reply(
          `📸 *${finalUrls.length} foto diterima!* Mau diapakan?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎬 Jadikan Video Slideshow', callback_data: 'media_intent_batch_i2v' },
                  { text: '🖼️ Edit Foto Pertama', callback_data: 'media_intent_i2i' },
                ],
                [{ text: '❌ Abaikan', callback_data: 'media_intent_ignore' }],
              ],
            },
          },
        );
        return;
      }

      // Single photo
      ctx.session.state = 'MEDIA_INTENT_SELECTION';
      ctx.session.stateData = {
        ...ctx.session.stateData,
        pendingMediaUrl: photoUrl,
        pendingMediaType: 'photo',
        pendingPrompt: captionText,
      };

      await ctx.reply(
        '📸 *Gambar diterima!* Mau diapakan?\n\n_Pilih aksi:_',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🖼️ Edit Gambar', callback_data: 'media_intent_i2i' },
                { text: '🎬 Jadikan Video', callback_data: 'media_intent_i2v' },
              ],
              [
                { text: '📝 Dapatkan Deskripsi', callback_data: 'media_intent_i2t' },
                { text: '❌ Abaikan', callback_data: 'media_intent_ignore' },
              ],
            ],
          },
        },
      );
      return;
    }

    // Handle talking photo — text script step
    if (ctx.session.state === "avatar_talk_text" && "text" in message) {
      const { handleAvatarTalkText } = await import('./callbacks/avatar-talk.js');
      await handleAvatarTalkText(ctx, message.text);
      return;
    }

    // Handle image generation (text2img, img2img, or ip_adapter)
    if (ctx.session.state === "IMAGE_GENERATION_WAITING" && "text" in message) {
      const description = message.text;
      const category = ctx.session.stateData?.imageCategory as string;
      const referenceImageUrl = ctx.session.stateData?.referenceImageUrl as string | undefined;
      const avatarImageUrl = ctx.session.stateData?.avatarImageUrl as string | undefined;
      const mode = (ctx.session.stateData?.mode as ImageGenerationMode) || "text2img";
      const elementSelection = ctx.session.stateData?.imageElementSelection as { keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean } | undefined;
      const elementAnalysis = ctx.session.stateData?.imageAnalysisResult as { productDesc: string; characterDesc: string; backgroundDesc: string } | undefined;

      await executeImageGeneration(ctx, description, { category, referenceImageUrl, avatarImageUrl, mode, elementSelection, elementAnalysis });
      return;
    }

    // Handle clone video
    if (ctx.session.state === "CLONE_VIDEO_WAITING") {
      let videoUrl: string | undefined;

      if ("text" in message) {
        videoUrl = message.text;
      } else if ("video" in message) {
        const fileId = message.video.file_id;
        videoUrl = (await ctx.telegram.getFileLink(fileId)).toString();
      }

      if (!videoUrl) {
        await ctx.reply(t('msg.send_video_or_url', ctx.session?.userLang || 'id'));
        return;
      }

      await ctx.reply(
        t('msg.analyzing_video', ctx.session?.userLang || 'id'),
        { parse_mode: "Markdown" },
      );

      // Release session immediately — fire and forget
      ctx.session.state = "DASHBOARD";

      const chatId = ctx.chat!.id;
      const userId = ctx.from!.id;
      const telegram = ctx.telegram;
      const cloneUrl = videoUrl;

      void (async () => {
        try {
          const result = await ContentAnalysisService.cloneVideo(cloneUrl);

          if (result.success && result.prompt) {
            const cleanPrompt = result.prompt
              .replace(/\*\*/g, "")
              .replace(/\*/g, "")
              .replace(/_/g, "")
              .replace(/`/g, "")
              .slice(0, 1500);

            const cloneLang = ctx.session?.userLang || 'id';
            const structuredDesc = t('msg.video_analysis_result', cloneLang, {
              style: result.style || "Modern/Dynamic",
              cleanPrompt,
            });

            // Store result in session via direct Redis write
            await updateSessionDirectly(userId, (session) => {
              session.stateData = {
                ...session.stateData,
                clonePrompt: result.prompt,
                cloneStyle: result.style,
              };
            });

            await telegram.sendMessage(chatId, structuredDesc, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: t('msg.btn_create_similar_video', cloneLang), callback_data: "create_video_new" }],
                  [{ text: t('msg.btn_edit_description', cloneLang), callback_data: "clone_edit_desc" }],
                  [{ text: t('msg.btn_cancel_main_menu', cloneLang), callback_data: "main_menu" }],
                ],
              },
            });
          } else {
            const cloneFailLang = ctx.session?.userLang || 'id';
            await telegram.sendMessage(
              chatId,
              t('msg.analysis_failed_error', cloneFailLang, { error: result.error || "Unknown error" }),
              { parse_mode: "Markdown" },
            );
          }
        } catch (error: any) {
          logger.error("Clone video error:", error);
          await telegram.sendMessage(chatId, t('msg.image_analyze_failed', ctx.session?.userLang || 'id'));
        }
      })();

      return;
    }

    // Handle clone edit description
    if (ctx.session.state === "CLONE_EDIT_DESC_WAITING" && "text" in message) {
      const newDescription = message.text;

      if (!ctx.session?.stateData?.clonePrompt) {
        await ctx.reply(t('msg.clone_not_found', ctx.session?.userLang || 'id'));
        return;
      }

      // Update clone prompt with new description
      ctx.session.stateData.clonePrompt = newDescription;

      const cloneEditLang = ctx.session?.userLang || 'id';
      const structuredDesc = t('msg.clone_desc_updated', cloneEditLang, {
        style: String(ctx.session.stateData.cloneStyle || "Modern/Dynamic"),
        newDescription,
      });

      await ctx.reply(structuredDesc, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t('msg.btn_create_video_new', cloneEditLang), callback_data: "create_video_new" }],
            [{ text: t('msg.btn_edit_again', cloneEditLang), callback_data: "clone_edit_desc" }],
            [{ text: t('msg.btn_cancel_main_menu', cloneEditLang), callback_data: "main_menu" }],
          ],
        },
      });

      ctx.session.state = "DASHBOARD";
      return;
    }

    // Handle clone image
    if (ctx.session.state === "CLONE_IMAGE_WAITING") {
      let imageUrl: string | undefined;

      if ("text" in message) {
        imageUrl = message.text;
      } else if ("photo" in message) {
        const photos = message.photo;
        const fileId = photos[photos.length - 1].file_id;
        imageUrl = (await ctx.telegram.getFileLink(fileId)).toString();
      }

      if (!imageUrl) {
        await ctx.reply(t('msg.send_image_or_url', ctx.session?.userLang || 'id'));
        return;
      }

      const cloneImgLang = ctx.session?.userLang || 'id';
      await ctx.reply(
        t('msg.clone_image_analyzing', cloneImgLang),
        { parse_mode: "Markdown" },
      );

      try {
        const result = await ContentAnalysisService.cloneImage(imageUrl);

        if (result.success && result.prompt) {
          // Sanitize Gemini output for Telegram (strip markdown that breaks parsing)
          const cleanPrompt = result.prompt
            .replace(/\*\*/g, "") // Remove ** bold
            .replace(/\*/g, "") // Remove * italic
            .replace(/_/g, "") // Remove _ underline
            .replace(/`/g, "") // Remove backticks
            .slice(0, 1500); // Telegram message limit safety

          await ctx.reply(
            t('msg.clone_image_extracted', cloneImgLang, { cleanPrompt, style: result.style || "N/A" }),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: t('msg.btn_generate_similar_image', cloneImgLang),
                      callback_data: "image_generate",
                    },
                  ],
                  [{ text: t('msg.btn_cancel_main_menu', cloneImgLang), callback_data: "main_menu" }],
                ],
              },
            },
          );

          ctx.session.stateData = { clonePrompt: result.prompt };
        } else {
          await ctx.reply(
            t('msg.analysis_failed_error', cloneImgLang, { error: result.error || "Unknown error" }),
            { parse_mode: "Markdown" },
          );
        }
      } catch (error: any) {
        logger.error("Clone image error:", error);
        await ctx.reply(t('msg.image_analyze_failed', ctx.session?.userLang || 'id'), {
          parse_mode: "Markdown",
        });
      }

      ctx.session.state = "DASHBOARD";
      return;
    }

    // Repurpose video URL input
    if (ctx.session.state === "REPURPOSE_VIDEO_URL") {
      let videoUrl: string | undefined;
      const msgWithVideo = message as { video?: { file_id: string }; document?: { file_id: string; mime_type?: string } };
      if ("video" in message) {
        // Telegram compressed video
        videoUrl = (await ctx.telegram.getFileLink(msgWithVideo.video!.file_id)).toString();
      } else if ("document" in message) {
        // Video sent as file (uncompressed / .mp4 document)
        const doc = msgWithVideo.document;
        if (doc?.mime_type?.startsWith("video/")) {
          videoUrl = (await ctx.telegram.getFileLink(doc.file_id)).toString();
        }
      } else if ("text" in message) {
        const text = message.text?.trim() || "";
        // Accept any http(s) URL — social platforms handled by yt-dlp in the service
        if (text.startsWith("http://") || text.startsWith("https://")) {
          videoUrl = text;
        }
      }

      if (!videoUrl) {
        await ctx.reply(t('msg.unrecognized_format', ctx.session?.userLang || 'id'));
        return;
      }

      await ctx.reply(
        t('msg.analyzing_repurpose', ctx.session?.userLang || 'id'),
        { parse_mode: "Markdown" },
      );

      // Release session immediately — fire and forget
      ctx.session.state = "DASHBOARD";

      const repChatId = ctx.chat!.id;
      const repUserId = ctx.from!.id;
      const repTelegram = ctx.telegram;
      const repVideoUrl = videoUrl;

      void (async () => {
        try {
          const analysis = await VideoAnalysisService.analyze(repVideoUrl);

          if (!analysis.success || !analysis.storyboard?.length) {
            await repTelegram.sendMessage(
              repChatId,
              t('msg.analysis_failed', ctx.session?.userLang || 'id', { error: analysis.error || "Make sure the video URL is publicly accessible." }),
            );
            return;
          }

          // Store analysis result in session via direct Redis write
          await updateSessionDirectly(repUserId, (session) => {
            session.state = "REPURPOSE_CONFIRM";
            session.stateData = {
              ...session.stateData,
              repurposeData: {
                storyboard: analysis.storyboard,
                transcript: analysis.transcript,
                niche: analysis.niche,
                style: analysis.style,
                totalDuration: analysis.totalDuration,
                keyFramePaths: analysis.keyFramePaths,
              },
            };
          });

          const scenes = analysis.storyboard!.slice(0, 5);
          const sceneText = scenes
            .map(
              (s: any) =>
                `*Scene ${s.scene}* (${s.duration}s): ${s.description.slice(0, 80)}${s.description.length > 80 ? "..." : ""}`,
            )
            .join("\n");

          const rpLang = ctx.session?.userLang || 'id';
          const moreScenes =
            analysis.storyboard!.length > 5
              ? `\n_...+${analysis.storyboard!.length - 5} more scenes_`
              : "";
          const transcriptPreview = analysis.transcript
            ? t('msg.transcript_label', rpLang, { preview: `${analysis.transcript.slice(0, 200)}${analysis.transcript.length > 200 ? "..." : ""}` })
            : "";

          const hasFrames = (analysis.keyFramePaths?.length || 0) > 0;

          await repTelegram.sendMessage(
            repChatId,
            t('msg.analysis_complete', rpLang, {
              niche: analysis.niche || "general",
              style: analysis.style || "-",
              duration: analysis.totalDuration || "?",
              sceneCount: analysis.storyboard!.length,
              sceneText,
              moreScenes,
              transcriptPreview,
            }),
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: t('msg.repurpose_generate_t2v', rpLang), callback_data: "repurpose_generate_t2v" }],
                  ...(hasFrames
                    ? [[{ text: t('msg.repurpose_generate_i2v', rpLang), callback_data: "repurpose_generate_i2v" }]]
                    : []),
                  [{ text: t('msg.btn_cancel_main_menu', rpLang), callback_data: "main_menu" }],
                ],
              },
            },
          );
        } catch (err: any) {
          logger.error("Repurpose video analysis error:", err);
          await repTelegram.sendMessage(repChatId, `❌ Error: ${err.message}`);
        }
      })();

      return;
    }

    // REPURPOSE_CONFIRM — user is waiting to tap a button; any text message here is noise
    if (ctx.session.state === "REPURPOSE_CONFIRM") {
      await ctx.reply(t('msg.tap_button_above', ctx.session?.userLang || 'id'));
      return;
    }

    // Handle disassemble (video/image to prompt)
    if (ctx.session.state === "DISASSEMBLE_WAITING") {
      await handleDisassemble(ctx);
      ctx.session.state = "DASHBOARD";
      return;
    }

    // Handle image upload during video creation — accumulate multi-photo (up to 5)
    // Supports both single photo and batch uploads (media groups)
    if (ctx.session?.videoCreation?.waitingForImage && "photo" in message) {
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;

      if (!ctx.session.videoCreation.uploadedPhotos) {
        ctx.session.videoCreation.uploadedPhotos = [];
      }

      const currentPhotos = ctx.session.videoCreation.uploadedPhotos;
      const MAX_PHOTOS = 5;

      if (currentPhotos.length >= MAX_PHOTOS) {
        const maxPhotoLang = ctx.session?.userLang || 'id';
        await ctx.reply(
          t('msg.max_photos_reached', maxPhotoLang, { max: String(MAX_PHOTOS) }),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t('msg.btn_generate_now', maxPhotoLang),
                    callback_data: "generate_video_now",
                  },
                ],
                [
                  {
                    text: t('msg.btn_skip_reference', maxPhotoLang),
                    callback_data: "skip_reference_image",
                  },
                ],
              ],
            },
          },
        );
        return;
      }

      // Store the photo
      currentPhotos.push({ fileId });
      const count = currentPhotos.length;

      // Detect batch upload (media_group_id) — debounce reply
      // When user sends multiple photos at once, Telegram sends them as a media group.
      // We accumulate silently and only reply after the last photo in the group.
      const msgWithMedia = message as { media_group_id?: string };
      const mediaGroupId = msgWithMedia.media_group_id;
      if (mediaGroupId) {
        // Track the media group ID to debounce
        const sessionExt = ctx.session as unknown as Record<string, unknown>;
        const lastGroupId = sessionExt._lastMediaGroupId as string | undefined;
        sessionExt._lastMediaGroupId = mediaGroupId;
        sessionExt._lastMediaGroupTime = Date.now();

        if (lastGroupId === mediaGroupId) {
          // Same group — accumulate silently, don't spam replies
          return;
        }

        // First photo of a new group — wait briefly for the rest to arrive
        await new Promise((r) => setTimeout(r, 1500));

        // Re-read count after debounce (other photos may have arrived)
        const finalCount =
          ctx.session.videoCreation.uploadedPhotos?.length || count;

        const batchLang = ctx.session?.userLang || 'id';
        const batchExtra = finalCount < MAX_PHOTOS
          ? t('msg.batch_send_more', batchLang)
          : t('msg.batch_max_reached', batchLang);
        await ctx.reply(
          t('msg.batch_photos_received', batchLang, { count: String(finalCount), extra: batchExtra }),
          {
            reply_markup: {
              inline_keyboard: [
                ...(finalCount < MAX_PHOTOS
                  ? [
                    [
                      {
                        text: t('msg.btn_add_more', batchLang),
                        callback_data: "add_more_photos",
                      },
                    ],
                  ]
                  : []),
                [
                  {
                    text: t('msg.btn_generate_now', batchLang),
                    callback_data: "generate_video_now",
                  },
                ],
                [
                  {
                    text: t('msg.btn_skip_reference', batchLang),
                    callback_data: "skip_reference_image",
                  },
                ],
              ],
            },
          },
        );
        return;
      }

      // Single photo upload (no media group) — reply immediately
      const singleLang = ctx.session?.userLang || 'id';
      const singleExtra = count < MAX_PHOTOS
        ? t('msg.single_send_more', singleLang)
        : t('msg.batch_max_reached', singleLang);
      await ctx.reply(
        t('msg.single_photo_received', singleLang, { count: String(count), max: String(MAX_PHOTOS), extra: singleExtra }),
        {
          reply_markup: {
            inline_keyboard: [
              ...(count < MAX_PHOTOS
                ? [[{ text: t('msg.btn_add_more', singleLang), callback_data: "add_more_photos" }]]
                : []),
              [
                {
                  text: t('msg.btn_generate_now', singleLang),
                  callback_data: "generate_video_now",
                },
              ],
              [
                {
                  text: t('msg.btn_skip_reference', singleLang),
                  callback_data: "skip_reference_image",
                },
              ],
            ],
          },
        },
      );
      return;
    }

    // Handle bug report submission
    if (ctx.session?.state === 'WAITING_BUG_REPORT' && "text" in message) {
      const reportText = message.text;
      const lang = ctx.session?.userLang || 'id';
      ctx.session.state = 'DASHBOARD';
      await ctx.reply(t('cb.bug_report_thanks', lang), { parse_mode: 'Markdown' });
      const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [];
      for (const adminId of adminIds) {
        await ctx.telegram.sendMessage(adminId, `🐛 Bug Report from @${ctx.from?.username || ctx.from?.id}:\n\n${reportText}`).catch(() => {});
      }
      return;
    }

    // Handle /skip during video creation
    if ("text" in message && message.text === "/skip") {
      if (ctx.session?.videoCreation?.waitingForImage) {
        await handleSkipImageReference(ctx);
        return;
      }
    }
  } catch (error: any) {
    logger.error("Error in message handler:", error);
    const userMessage = actionableError(error.message || String(error));
    await ctx.reply(userMessage);
  }
}
