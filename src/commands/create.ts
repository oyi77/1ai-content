/**
 * Create Command - With Video Extend Technique
 *
 * Handles video creation using sequential chaining for longer videos
 */

import { BotContext } from "@/types";
import type { InlineKeyboardButton } from '@telegraf/types/markup';
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { VideoService } from "@/services/video.service";
import { GeminiGenService } from "@/services/geminigen.service";
import { generateVideoWithFallback } from "@/services/video-fallback.service";
import {
  NICHES,
  generateStoryboard as genStoryboardFromService,
} from "@/services/video-generation.service";
import { PostAutomationService } from "@/services/postautomation.service";
import { SceneConsistencyEngine } from "@/services/scene-consistency.service";
import { getVideoCreditCost, SUBSCRIPTION_PLANS, CUSTOM_DURATION_MIN } from "@/config/pricing";
import {
  MARKETING_HOOKS,
  MARKETING_CTAS,
} from "@/config/audio-subtitle-engine";
import { getConfig } from "@/config/env";
import { actionableError } from "@/utils/errors";
import { t } from "@/i18n/translations";
import { promisify } from "util";
import { execFile as execFileCallback } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ConfigError } from '@/utils/app-errors';

const execFile = promisify(execFileCallback);

// Video storage directory — resolved at call time to respect initConfig() ordering
function getVideoDir(): string { return getConfig().VIDEO_DIR; }

/** Resolve the user's preferred language from the DB record. */
function getUserLang(dbUser: { language?: string } | null): string {
  return dbUser?.language || "id";
}

/**
 * Handle /create command - Redirected to V3 Flow
 */
export async function createCommand(ctx: BotContext): Promise<void> {
  const { showGenerateMode } = await import("../flows/generate.js");
  return await showGenerateMode(ctx);
}

/**
 * Handle duration selection - simplified for MVP (no mode selection needed)
 */
export async function handleDurationSelection(
  ctx: BotContext,
  durationStr: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    // Parse duration and scenes (format: duration_15_2 or duration_30_4)
    let duration: number, scenes: number | null;

    // Resolve language
    const langUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(langUser);

    if (durationStr === "custom_duration") {
      await ctx.reply(t("create.custom_duration_prompt", lang));
      ctx.session.state = "CUSTOM_DURATION_INPUT";
      return;
    }

    const parts = durationStr.replace("duration_", "").split("_");
    duration = parseInt(parts[0]);
    scenes = parts[1] ? parseInt(parts[1]) : null;

    // Auto-calculate scenes: standard 5s per scene
    if (!scenes) {
      const SCENE_DURATION = 5;
      scenes = Math.ceil(duration / SCENE_DURATION);
      duration = scenes * SCENE_DURATION;
      logger.info(
        `📊 Auto-calculated: ${scenes} scenes × ${SCENE_DURATION}s = ${duration}s total`,
      );
    }

    // Validate duration
    if (duration < CUSTOM_DURATION_MIN) {
      await ctx.answerCbQuery(t('msg.invalid_duration', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    const user = ctx.from;
    if (!user) return;

    // Get or create user
    let dbUser = await UserService.findByTelegramId(BigInt(user.id.toString()));

    // If user doesn't exist, create them (guard against concurrent creation)
    if (!dbUser) {
      try {
        dbUser = await UserService.create({
          telegramId: BigInt(user.id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        });
        await ctx.reply(`👋 Welcome to BK Vilona!`);
      } catch (err) {
        if ((err as {code: string})?.code === 'P2002') {
          // Created concurrently by another handler — fetch the existing record
          dbUser = await UserService.findByTelegramId(BigInt(user.id));
        } else {
          throw err;
        }
      }
    }

    if (!dbUser) return;

    if (ctx.session) {
      ctx.session.userMode = dbUser.userMode || 'content_creator';
    }

    const creditCost = getVideoCreditCost(duration);

    if (Number(dbUser.creditBalance) < creditCost) {
      await ctx.answerCbQuery(t('gen.insufficient_credits', ctx.session?.userLang || 'id', { cost: '?', balance: '0' })).catch(() => {});
      const minPlan = SUBSCRIPTION_PLANS.lite;
      const maxPlan = SUBSCRIPTION_PLANS.agency;
      await ctx.reply(
        `Insufficient credits.\n\n` +
        `Current: ${dbUser.creditBalance} | Needed: ${creditCost}\n\n` +
        `Top Up -- Buy credits instantly\n` +
        `Subscribe -- Get ${minPlan.monthlyCredits}-${maxPlan.monthlyCredits} credits/month (better value!)\n\n` +
        `Which would you like?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Top Up", callback_data: "topup" },
                { text: "Subscribe", callback_data: "open_subscription" },
              ],
            ],
          },
        },
      );
      return;
    }

    const niche = ctx.session.selectedNiche || "fnb";
    const selectedStyles = ctx.session.selectedStyles || [];
    const platform =
      (ctx.session.stateData?.selectedPlatform as string) || "tiktok";

    const storyboard = genStoryboardFromService(
      niche,
      selectedStyles,
      duration,
      scenes,
    );

    const sceneLabel =
      scenes > 1 ? t("create.scenes", lang) : t("create.scene", lang);

    // Store creation state before showing VO settings
    ctx.session.videoCreation = {
      mode: scenes > 1 ? "extended" : "short",
      niche,
      platform,
      totalDuration: duration,
      scenes,
      storyboard,
      jobId: "",
      waitingForImage: false,
      enableVO: true, // default ON
      enableSubtitles: true, // default ON
    };

    // Show VO/Subtitle toggle step
    const voLabel = ctx.session.videoCreation.enableVO ? "ON" : "OFF";
    const subLabel = ctx.session.videoCreation.enableSubtitles ? "ON" : "OFF";

    await ctx.editMessageText(
      `${t("create.almost_ready", lang)}\n\n` +
      `${t("create.niche_label", lang)}: ${niche}\n` +
      `${t("create.duration_label", lang)}: ${duration}s (${scenes} ${sceneLabel})\n` +
      `${t("create.credit_cost_label", lang)}: ${creditCost}\n\n` +
      `\ud83c\udf99\ufe0f Voice Over: ${voLabel}\n` +
      `\ud83d\udcdd Subtitles: ${subLabel}\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `\ud83c\udf99\ufe0f Toggle VO`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `\ud83d\udcdd Toggle Subs`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [{ text: "\u25b6\ufe0f Continue", callback_data: "vo_continue" }],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling duration selection:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

// Storyboard generation delegated to video-generation.service.ts (genStoryboardFromService)

/**
 * Handle niche selection
 */
export async function handleNicheSelection(
  ctx: BotContext,
  nicheKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    const nicheConfig = (NICHES as Record<string, typeof NICHES[keyof typeof NICHES] | undefined>)[nicheKey];
    if (!nicheConfig) {
      await ctx.answerCbQuery(t('topup.invalid_package', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    ctx.session.selectedNiche = nicheKey;

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);
    const styleButtons: InlineKeyboardButton[][] = (
      nicheConfig.styles as readonly string[]
    ).flatMap((s) => {
      if (!s || typeof s !== "string") return [];
      return [
        [
          {
            text: s.charAt(0).toUpperCase() + s.slice(1),
            callback_data: `select_style_${s}`,
          },
        ],
      ];
    });
    styleButtons.push([
      {
        text: t("create.change_category", lang),
        callback_data: "create_video_new",
      },
    ]);

    await ctx.editMessageText(
      `✅ ${nicheConfig.emoji} ${nicheConfig.name} ${t("create.niche_selected", lang)}\n\n` +
      t("create.select_style", lang),
      {
        reply_markup: {
          inline_keyboard: styleButtons,
        },
      },
    );
  } catch (error) {
    logger.error("Error handling niche selection:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Handle style selection - then show platform picker
 */
export async function handleStyleSelection(
  ctx: BotContext,
  styleKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    ctx.session.selectedStyles = [styleKey];

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    // Show platform picker (new step between style and duration)
    await ctx.editMessageText(
      `${t("create.style_selected", lang)}\n\n` +
      t("create.select_platform", lang),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("create.platform_tiktok", lang),
                callback_data: "create_platform_tiktok",
              },
              {
                text: t("create.platform_youtube", lang),
                callback_data: "create_platform_youtube",
              },
            ],
            [
              {
                text: t("create.platform_instagram", lang),
                callback_data: "create_platform_instagram",
              },
              {
                text: t("create.platform_square", lang),
                callback_data: "create_platform_square",
              },
            ],
            [
              {
                text: t("create.change_style", lang),
                callback_data: `select_niche_${ctx.session.selectedNiche || "fnb"}`,
              },
            ],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling style selection:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Platform to aspect ratio mapping
 */
const PLATFORM_ASPECT_RATIOS: Record<string, string> = {
  tiktok: "9:16",
  youtube: "16:9",
  instagram: "4:5",
  square: "1:1",
};

/**
 * Handle platform selection - then show duration picker
 */
export async function handlePlatformSelection(
  ctx: BotContext,
  platformKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    // Store selected platform in session
    ctx.session.stateData = {
      ...ctx.session.stateData,
      selectedPlatform: platformKey,
    };

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    const aspectRatio = PLATFORM_ASPECT_RATIOS[platformKey] || "9:16";

    // Show duration picker
    await ctx.editMessageText(
      `${t("create.platform_selected", lang)} (${aspectRatio})\n\n` +
      `${t("create.extend_mode", lang)}\n\n` +
      t("create.select_duration", lang),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("create.duration_quick", lang),
                callback_data: "duration_15_1",
              },
              {
                text: t("create.duration_standard", lang),
                callback_data: "duration_30_2",
              },
            ],
            [
              {
                text: t("create.duration_long", lang),
                callback_data: "duration_60_4",
              },
              {
                text: t("create.duration_extended", lang),
                callback_data: "duration_120_8",
              },
            ],
            [
              {
                text: t("create.custom_duration", lang),
                callback_data: "custom_duration",
              },
            ],
            [
              {
                text: t("create.change_category", lang),
                callback_data: "create_video_new",
              },
            ],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling platform selection:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Generate single scene video
 */
async function generateVideoAsync(
  ctx: BotContext,
  jobId: string,
  niche: string,
  platform: string,
  duration: number,
  storyboard: Array<any>,
  referenceImage?: string | null,
): Promise<void> {
  try {
    logger.info(`🎬 Starting single-scene video generation for job ${jobId}`);

    const scene = storyboard[0];
    const customPrompt = ctx.session?.videoCreation?.customPrompt;
    const prompt = buildPrompt(scene.description, platform, duration, customPrompt);

    // Use multi-provider fallback chain
    const result = await generateVideoWithFallback({
      prompt,
      duration,
      aspectRatio: getAspectRatio(platform),
      style: getStyleForNiche(niche),
      niche,
      referenceImage,
    });

    if (!result.success || !result.videoUrl) {
      logger.error("Video generation failed (all providers):", result.error);
      await VideoService.updateStatus(jobId, "failed", result.error);
      const telegramId = BigInt(ctx.from!.id);
      const creditCost = getVideoCreditCost(duration);
      await UserService.refundCredits(
        telegramId,
        creditCost,
        jobId,
        result.error || "Generation failed",
      );
      await sendErrorNotification(
        ctx,
        jobId,
        `${result.error || "Generation failed"}\n\n💰 Credits refunded.`,
      );
      return;
    }

    logger.info(`🎬 Video generated via ${result.provider}`);

    // Download and save
    const localPath = await downloadVideo(result.videoUrl, jobId);
    logger.info(`📥 Video downloaded: ${localPath}`);

    await VideoService.setOutput(jobId, {
      videoUrl: result.videoUrl,
      downloadUrl: localPath,
    });
    await sendSuccessNotification(ctx, jobId, duration, platform);
    logger.info(`✅ Single-scene video generation complete for job ${jobId}`);
  } catch (error) {
    logger.error("Video generation error:", error);
    await VideoService.updateStatus(jobId, "failed", String(error));
    const telegramId = BigInt(ctx.from!.id);
    const creditCostFallback = getVideoCreditCost(duration);
    await UserService.refundCredits(telegramId, creditCostFallback, jobId, String(error));
    const userMessage = actionableError(String(error), { jobId });
    await ctx.reply(t('msg.credits_refunded', ctx.session?.userLang || 'id', { message: userMessage }));
  }
}

/**
 * Generate extended video with sequential chaining
 */
async function generateExtendedVideoAsync(
  ctx: BotContext,
  jobId: string,
  niche: string,
  platform: string,
  totalDuration: number,
  scenes: number,
  storyboard: Array<any>,
  referenceImage?: string | null,
): Promise<void> {
  try {
    logger.info(
      `🎬 Starting extended video generation for job ${jobId} (${scenes} scenes)`,
    );

    const sceneVideos: string[] = [];
    let lastUuid: string | null = null;

    // Scene consistency: create memory after first scene, enrich subsequent prompts
    let sceneMemory: ReturnType<
      typeof SceneConsistencyEngine.createMemory
    > | null = null;

    // Derive the style key from session or fall back to the niche-based style
    const styleKey =
      ctx.session?.selectedStyles?.[0] || getStyleForNiche(niche);

    // Generate each scene sequentially
    for (let i = 0; i < scenes; i++) {
      const scene = storyboard[i];
      const scenePath = path.join(getVideoDir(), `${jobId}_scene_${i + 1}.mp4`);

      logger.info(
        `🎬 Generating scene ${i + 1}/${scenes}: ${scene.description}`,
      );
      const customPrompt = ctx.session?.videoCreation?.customPrompt;
      let prompt = buildPrompt(scene.description, platform, scene.duration, customPrompt);

      // Apply scene consistency: create memory from scene 1, enrich scene 2+
      if (i === 0) {
        sceneMemory = SceneConsistencyEngine.createMemory(
          prompt,
          niche,
          styleKey,
          !!referenceImage,
        );
      } else if (sceneMemory) {
        prompt = SceneConsistencyEngine.enrichScenePrompt(
          prompt,
          sceneMemory,
          i,
        );
      }

      // Scene 1: use multi-provider fallback chain
      type GenerationResult = {
        success: boolean;
        videoUrl?: string;
        thumbnailUrl?: string;
        jobId?: string;
        error?: string;
      };
      let result: GenerationResult;
      if (i === 0) {
        result = await generateVideoWithFallback({
          prompt,
          duration: scene.duration,
          aspectRatio: getAspectRatio(platform),
          style: getStyleForNiche(niche),
          niche,
          referenceImage,
        });
      } else if (lastUuid) {
        // Try GeminiGen extend first, fallback to standalone generation
        try {
          result = await GeminiGenService.generateExtend({
            prompt,
            refHistory: lastUuid,
          });
        } catch (extendErr) {
          logger.warn(
            `🎬 Scene ${i + 1} extend failed, falling back to standalone: ${(extendErr as Error).message}`,
          );
          result = await generateVideoWithFallback({
            prompt,
            duration: scene.duration,
            aspectRatio: getAspectRatio(platform),
            style: getStyleForNiche(niche),
            niche,
            referenceImage,
          });
        }
      } else {
        // No lastUuid — generate standalone
        result = await generateVideoWithFallback({
          prompt,
          duration: scene.duration,
          aspectRatio: getAspectRatio(platform),
          style: getStyleForNiche(niche),
          niche,
          referenceImage,
        });
      }

      if (!result.success || !result.videoUrl) {
        logger.error(`Scene ${i + 1} generation failed:`, result.error);
        await VideoService.updateStatus(
          jobId,
          "failed",
          `Scene ${i + 1} failed: ${result.error}`,
        );
        const telegramId = BigInt(ctx.from!.id);
        const creditCost = getVideoCreditCost(totalDuration);
        await UserService.refundCredits(
          telegramId,
          creditCost,
          jobId,
          result.error || "Generation failed",
        );
        await sendErrorNotification(
          ctx,
          jobId,
          `Scene ${i + 1}: ${result.error || "Generation failed"}\n\n💰 Credits refunded.`,
        );
        return;
      }

      // Download scene
      await downloadVideoToPath(result.videoUrl, scenePath);
      logger.info(`📥 Scene ${i + 1} downloaded: ${scenePath}`);
      sceneVideos.push(scenePath);

      // Save UUID for next extend
      if (result.jobId) {
        lastUuid = result.jobId;
      }

      // Update progress
      const progress = Math.round(((i + 1) / scenes) * 80);
      await VideoService.updateProgress(jobId, progress);
    }

    // Concatenate scenes with crossfade
    const finalPath = path.join(getVideoDir(), `${jobId}.mp4`);
    logger.info(`🎞️ Concatenating ${scenes} scenes...`);
    await concatenateVideos(sceneVideos, finalPath);
    logger.info(`✅ Concatenation complete: ${finalPath}`);

    // Update status to completed
    await VideoService.updateProgress(jobId, 100);
    await VideoService.updateStatus(jobId, "completed");

    await sendSuccessNotification(ctx, jobId, totalDuration, platform);
    logger.info(`✅ Extended video generation complete for job ${jobId}`);
  } catch (error) {
    logger.error("Extended video generation error:", error);
    await VideoService.updateStatus(jobId, "failed", String(error));
    const telegramId = BigInt(ctx.from!.id);
    const creditCostExtended = getVideoCreditCost(totalDuration);
    await UserService.refundCredits(telegramId, creditCostExtended, jobId, String(error));
    const userMessage = actionableError(String(error), { jobId });
    await ctx.reply(t('msg.credits_refunded', ctx.session?.userLang || 'id', { message: userMessage }));
  }
}

// extractLastFrame removed — frame extraction handled by geminigen.service.ts

/**
 * Download video to specific path
 */
async function downloadVideoToPath(
  url: string,
  outputPath: string,
): Promise<void> {
  await execFile('wget', ['-O', outputPath, url]);
}

/**
 * Concatenate videos with crossfade transitions
 */
async function concatenateVideos(
  inputPaths: string[],
  outputPath: string,
): Promise<void> {
  // Create concat list file
  const listPath = path.join(getVideoDir(), "concat_list.txt");
  const listContent = inputPaths
    .map((p) => `file '${p}'\nduration 0.5`)
    .join("\n");
  fs.writeFileSync(listPath, listContent);

  // Concatenate with xfade crossfade
  if (inputPaths.length === 2) {
    await execFile('ffmpeg', [
      '-i', inputPaths[0], '-i', inputPaths[1],
      '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v]',
      '-map', '[v]', outputPath,
    ]);
  } else if (inputPaths.length === 3) {
    await execFile('ffmpeg', [
      '-i', inputPaths[0], '-i', inputPaths[1], '-i', inputPaths[2],
      '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v1];[v1][2:v]xfade=transition=fade:duration=0.5:offset=9.5[v]',
      '-map', '[v]', outputPath,
    ]);
  } else {
    // Fallback: simple concat without crossfade
    const simpleListPath = path.join(getVideoDir(), "simple_list.txt");
    const simpleListContent = inputPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(simpleListPath, simpleListContent);
    await execFile('ffmpeg', [
      '-f', 'concat', '-safe', '0', '-i', simpleListPath, '-c', 'copy', outputPath,
    ]);
  }
}

/**
 * Download video from URL
 */
async function downloadVideo(url: string, jobId: string): Promise<string> {
  const outputPath = path.join(getVideoDir(), `${jobId}.mp4`);
  await execFile('wget', ['-O', outputPath, url]);
  return outputPath;
}

/**
 * Build prompt based on scene description
 */
function buildPrompt(
  description: string,
  platform: string,
  duration: number,
  customPrompt?: string | null
): string {
  const baseDescription = customPrompt ? `${customPrompt} - ${description}` : description;
  return `${duration}s ${baseDescription}, high quality, ${platform} format, professional style`;
}

/**
 * Get aspect ratio for platform
 */
function getAspectRatio(platform: string): string {
  const ratios: { [key: string]: string } = {
    tiktok: "9:16",
    shorts: "9:16",
    reels: "9:16",
    facebook: "16:9",
    youtube: "16:9",
    instagram: "4:5",
    square: "1:1",
  };
  return ratios[platform] || "9:16";
}

/**
 * Get style for niche
 */
function getStyleForNiche(niche: string): string {
  const styles: { [key: string]: string } = {
    trading: "professional",
    fitness: "energetic",
    cooking: "appetizing",
    tech: "modern",
    travel: "cinematic",
    education: "clear",
  };
  return styles[niche] || "professional";
}

// ── Caption generation ──

interface GeneratedCaption {
  text: string;
  hashtags: string;
}

const NICHE_HASHTAGS: Record<string, string[]> = {
  fnb: ["foodie", "foodtok", "kuliner", "makananenak", "resep", "foodlover"],
  food_culinary: [
    "foodie",
    "foodtok",
    "kuliner",
    "makananenak",
    "resep",
    "foodlover",
  ],
  realestate: ["properti", "rumah", "realestate", "investasi", "homedecor"],
  product: ["produk", "review", "unboxing", "belanja", "shopee", "tokopedia"],
  beauty: ["skincare", "beauty", "glowup", "beautytips", "makeup"],
  beauty_skincare: ["skincare", "beauty", "glowup", "beautytips", "makeup"],
  fashion: ["ootd", "fashion", "style", "outfit", "fashiontok"],
  fashion_lifestyle: ["ootd", "fashion", "style", "outfit", "fashiontok"],
  tech: ["tech", "gadget", "teknologi", "review", "unboxing"],
  tech_gadgets: ["tech", "gadget", "teknologi", "review", "unboxing"],
  travel: ["travel", "jalan2", "liburan", "wisata", "explore"],
  travel_adventure: ["travel", "jalan2", "liburan", "wisata", "explore"],
  fitness: ["fitness", "workout", "gym", "health", "fitnesstips"],
  fitness_health: ["fitness", "workout", "gym", "health", "fitnesstips"],
  education: ["edukasi", "belajar", "tips", "tutorial", "knowledge"],
  education_knowledge: ["edukasi", "belajar", "tips", "tutorial", "knowledge"],
  trading: ["trading", "saham", "crypto", "investasi", "finansial"],
  business_finance: ["bisnis", "entrepreneur", "bisnismuda", "tips", "sukses"],
  home_decor: ["homedecor", "rumah", "interior", "dekorasi", "aesthetic"],
};

const PLATFORM_HASHTAG_COUNT: Record<string, number> = {
  tiktok: 8,
  shorts: 5,
  reels: 6,
  instagram: 6,
  youtube: 4,
  facebook: 4,
};

export function generateCaption(
  niche: string,
  storyboard: Array<{ scene?: number; duration?: number; description: string }>,
  platform: string,
): GeneratedCaption {
  const hook =
    MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  const cta = MARKETING_CTAS[Math.floor(Math.random() * MARKETING_CTAS.length)];

  const sceneDescriptions = storyboard
    .slice(0, 3)
    .map((s) => s.description)
    .filter(Boolean);

  const sceneText =
    sceneDescriptions.length > 0
      ? sceneDescriptions[0].charAt(0).toUpperCase() +
      sceneDescriptions[0].slice(1)
      : "";

  const captionText = sceneText
    ? `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n${sceneText}\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`
    : `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`;

  const nicheKey = niche.toLowerCase();
  const nicheTags = NICHE_HASHTAGS[nicheKey] || ["viral", "fyp", "trending"];
  const baseTags = ["fyp", "viral"];
  const allTags = [...new Set([...baseTags, ...nicheTags])];

  const maxTags = PLATFORM_HASHTAG_COUNT[platform] || 6;
  const selectedTags = allTags.slice(0, maxTags);
  const hashtags = selectedTags.map((t) => `#${t}`).join(" ");

  return { text: captionText, hashtags };
}

/**
 * Send success notification
 */
async function sendSuccessNotification(
  ctx: BotContext,
  jobId: string,
  duration: number,
  platform: string,
): Promise<void> {
  const video = await VideoService.getByJobId(jobId);
  if (!video) return;

  // Build download URL
  const webhookUrl = getConfig().WEBHOOK_URL.replace(/\/webhook.*$/, "");
  const videoUserId = video.userId.toString();
  const jwtSecret = getConfig().JWT_SECRET;
  if (!jwtSecret) throw new ConfigError('JWT_SECRET');
  const downloadToken = (await import("jsonwebtoken")).default.sign(
    { telegramId: videoUserId, jobId },
    jwtSecret,
    { expiresIn: "30d" },
  );
  const downloadUrl = `${webhookUrl}/video/${jobId}/download?token=${downloadToken}`;

  // Build button rows dynamically based on whether the user has
  // connected social accounts.
  const keyboard: Array<
    Array<{ text: string; callback_data?: string; url?: string }>
  > = [];

  // Row 0: Download HD link
  keyboard.push([{ text: "⬇️ Download HD", url: downloadUrl }]);

  // Row 1: manual publish (always shown)
  keyboard.push([
    {
      text: "📤 Publish to Social Media",
      callback_data: `publish_video_${jobId}`,
    },
  ]);

  // Row 2: auto-post to all connected accounts (only if accounts exist)
  const userId = ctx.from?.id;
  if (userId) {
    try {
      const hasAccounts = await PostAutomationService.hasConnectedAccounts(
        BigInt(userId),
      );
      if (hasAccounts) {
        keyboard.push([
          { text: "🚀 Auto-Post to All", callback_data: `auto_post_${jobId}` },
        ]);
      }
    } catch (err) {
      logger.warn(
        "Failed to check connected accounts for auto-post button:",
        err,
      );
    }
  }

  // Row 3: feedback
  keyboard.push([
    { text: "👍 Good", callback_data: `feedback_good_${jobId}` },
    { text: "👎 Needs Work", callback_data: `feedback_bad_${jobId}` },
  ]);

  // Row 4: create another / my videos
  keyboard.push([
    { text: "🎬 Create Another", callback_data: "create_video_new" },
    { text: "📁 My Videos", callback_data: "videos_list" },
  ]);

  const videoCaption =
    `✅ *Video Selesai!*\n\n` +
    `🎬 Durasi: ${duration}s | Platform: ${platform.toUpperCase()}`;

  if (video.downloadUrl && require('fs').existsSync(video.downloadUrl)) {
    // Local file: stream directly to Telegram
    await ctx.replyWithVideo(
      { source: video.downloadUrl },
      {
        caption: videoCaption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard as any },
      },
    );
  } else if (video.videoUrl) {
    // CDN URL: send via URL (Telegram will fetch it)
    try {
      await ctx.replyWithVideo(video.videoUrl, {
        caption: videoCaption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard as any },
      });
    } catch {
      // Telegram rejected the URL — send link message as final fallback
      await ctx.reply(videoCaption, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard as any },
      });
    }
  } else {
    // No file anywhere — send message with download link only
    await ctx.reply(videoCaption, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard as any },
    });
  }

  // Send auto-generated caption as a follow-up message
  const niche = ctx.session?.selectedNiche || ctx.session?.videoCreation?.niche;
  const storyboard = ctx.session?.videoCreation?.storyboard;
  if (niche && storyboard && storyboard.length > 0) {
    try {
      const caption = generateCaption(niche, storyboard, platform);
      await ctx.reply(
        `\ud83d\udccb Suggested Caption:\n\n${caption.text}\n\n${caption.hashtags}\n\n\ud83d\udca1 Copy and paste this when posting!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "\ud83d\udccb Copy Caption",
                  callback_data: `copy_caption_${jobId}`,
                },
              ],
            ],
          },
        },
      );
    } catch (captionErr) {
      logger.warn(`Failed to generate caption for job ${jobId}:`, captionErr);
    }
  }
}

/**
 * Send error notification
 */
async function sendErrorNotification(
  ctx: BotContext,
  jobId: string,
  error: string,
): Promise<void> {
  const userMessage = actionableError(error, { jobId });
  await ctx.reply(
    `Video generation failed\n\n` + `Job ID: ${jobId}\n` + `${userMessage}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Try Again", callback_data: `video_retry_${jobId}` }],
          [
            { text: "Top Up", callback_data: "topup" },
            { text: "Support", callback_data: "open_help" },
          ],
        ],
      },
    },
  );
}

/**
 * Handle VO/Subtitle toggle callbacks.
 * Toggles the flag in session and re-renders the settings panel.
 */
export async function handleVOToggle(
  ctx: BotContext,
  toggleKey: "vo" | "subtitles",
): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx.answerCbQuery(t('error.no_session', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    if (toggleKey === "vo") {
      ctx.session.videoCreation.enableVO = !ctx.session.videoCreation.enableVO;
    } else {
      ctx.session.videoCreation.enableSubtitles =
        !ctx.session.videoCreation.enableSubtitles;
    }

    const voLabel = ctx.session.videoCreation.enableVO ? "ON" : "OFF";
    const subLabel = ctx.session.videoCreation.enableSubtitles ? "ON" : "OFF";

    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    const { niche, totalDuration, scenes } = ctx.session.videoCreation;
    const creditCost = getVideoCreditCost(totalDuration ?? 0);
    const sceneLabel =
      (scenes || 1) > 1 ? t("create.scenes", lang) : t("create.scene", lang);

    await ctx.editMessageText(
      `${t("create.almost_ready", lang)}\n\n` +
      `${t("create.niche_label", lang)}: ${niche}\n` +
      `${t("create.duration_label", lang)}: ${totalDuration}s (${scenes} ${sceneLabel})\n` +
      `${t("create.credit_cost_label", lang)}: ${creditCost}\n\n` +
      `\ud83c\udf99\ufe0f Voice Over: ${voLabel}\n` +
      `\ud83d\udcdd Subtitles: ${subLabel}\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `\ud83c\udf99\ufe0f Toggle VO`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `\ud83d\udcdd Toggle Subs`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [{ text: "\u25b6\ufe0f Continue", callback_data: "vo_continue" }],
          ],
        },
      },
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling VO toggle:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Handle "Continue" after VO settings — show custom prompt step.
 */
export async function handleVOContinue(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx.answerCbQuery(t('error.no_session', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    // ── If prompt from library → SKIP VO screen, go straight to generate ──
    if (ctx.session.videoCreation.customPrompt) {
      await ctx.answerCbQuery();
      // Auto-trigger generation immediately
      await ctx.editMessageText(
        `🚀 *Siap generate!*\n\n` +
        `📋 Prompt: \`${ctx.session.videoCreation.customPrompt.slice(0, 120)}...\`\n` +
        `⏱️ Durasi: *${ctx.session.videoCreation.totalDuration} detik*\n` +
        `🎙️ Voice Over: ON · 📝 Subtitles: ON\n\n` +
        `Tap Generate untuk mulai!`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🚀 Generate Sekarang!",
                  callback_data: "create_skip_prompt",
                },
              ],
              [
                {
                  text: "📸 Upload Foto Referensi Dulu",
                  callback_data: "create_upload_reference",
                },
              ],
              [
                { text: "🔇 VO OFF", callback_data: "vo_toggle_vo" },
                { text: "📝 Subs OFF", callback_data: "vo_toggle_subtitles" },
              ],
              [{ text: "◀️ Ganti Prompt", callback_data: "back_prompts" }],
            ],
          },
        },
      );
      return;
    }

    // ── Normal flow: show VO settings + prompt option ──────────────────────
    const voOn = ctx.session.videoCreation.enableVO !== false;
    const subOn = ctx.session.videoCreation.enableSubtitles !== false;

    await ctx.editMessageText(
      `🎙️ *Pengaturan Suara & Teks*\n\n` +
      `Voice Over: *${voOn ? "✅ ON" : "❌ OFF"}*\n` +
      `Subtitles: *${subOn ? "✅ ON" : "❌ OFF"}*\n\n` +
      `_Voice Over = narasi otomatis AI\nSubtitles = teks di layar_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `🎙️ VO ${voOn ? "ON ✅" : "OFF ❌"}`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `📝 Subs ${subOn ? "ON ✅" : "OFF ❌"}`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [
              {
                text: "✍️ Tambah Prompt Custom",
                callback_data: "create_custom_prompt",
              },
            ],
            [
              {
                text: "⚡ Generate Langsung!",
                callback_data: "create_skip_prompt",
              },
            ],
          ],
        },
      },
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling VO continue:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Handle "Add custom prompt" button — wait for text input.
 */
export async function handleCustomPromptRequest(
  ctx: BotContext,
): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx.answerCbQuery(t('error.no_session', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    ctx.session.videoCreation.waitingForCustomPrompt = true;
    ctx.session.state = "CUSTOM_PROMPT_INPUT";

    await ctx.editMessageText(
      `✍️ Type your custom prompt below:\n\n` +
      `Describe the scenes, mood, style, or specific content you want in your video.`,
    );

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling custom prompt request:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

/**
 * Handle "Skip prompt" button — proceed to reference image step.
 */
export async function handleSkipPrompt(ctx: BotContext): Promise<void> {
  try {
    if (!ctx.session?.videoCreation) {
      await ctx.answerCbQuery(t('error.no_session', ctx.session?.userLang || 'id')).catch(() => {});
      return;
    }

    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    ctx.session.videoCreation.waitingForImage = true;

    await ctx.editMessageText(t("create.send_reference_image", lang), {
      parse_mode: "Markdown",
    });

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error handling skip prompt:", error);
    await ctx.answerCbQuery(t('error.generic', ctx.session?.userLang || 'id')).catch(() => {});
  }
}

// Export functions for message handler
export { generateVideoAsync, generateExtendedVideoAsync };
