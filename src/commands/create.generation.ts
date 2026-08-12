/**
 * Create Command — Core Generation Engine
 *
 * Video generation with single-scene and extended (sequential chaining) modes.
 * Extracted from create.ts god object.
 * KEY ENTRY POINTS: generateVideoAsync (used as fallback by V3 flow), generateExtendedVideoAsync, downloadVideo, concatenateVideos
 */

import { BotContext } from "@/types";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { execFile as execFileCallback } from "child_process";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { VideoService } from "@/services/video.service";
import { GeminiGenService } from "@/services/geminigen.service";
import { generateVideoWithFallback } from "@/services/video-fallback.service";
import { SceneConsistencyEngine } from "@/services/scene-consistency.service";
import { PostAutomationService } from "@/services/postautomation.service";
import { getVideoCreditCost } from "@/config/pricing";
import { getConfig } from "@/config/env";
import { actionableError } from "@/utils/errors";
import { t } from "@/i18n/translations";
import type { InlineKeyboardButton } from "@telegraf/types/markup";
import {
  sendSuccessNotification,
  sendErrorNotification,
} from "./create.notifications";
import {
  buildPrompt,
  getAspectRatio,
  getStyleForNiche,
} from "./create.helpers";

const execFile = promisify(execFileCallback);

function getVideoDir(): string {
  return getConfig().VIDEO_DIR;
}

/**
 * Generate single scene video
 */
export async function generateVideoAsync(
  ctx: BotContext,
  jobId: string,
  niche: string,
  platform: string,
  duration: number,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
  referenceImage?: string | null,
): Promise<void> {
  try {
    logger.info(`🎬 Starting single-scene video generation for job ${jobId}`);

    const scene = storyboard[0];
    const customPrompt = ctx.session?.videoCreation?.customPrompt;
    const prompt = buildPrompt(
      scene.description,
      platform,
      duration,
      customPrompt,
    );

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
    await UserService.refundCredits(
      telegramId,
      creditCostFallback,
      jobId,
      String(error),
    );
    const userMessage = actionableError(String(error), { jobId });
    await ctx.reply(
      t("msg.credits_refunded", ctx.session?.userLang || "id", {
        message: userMessage,
      }),
    );
  }
}

/**
 * Generate extended video with sequential chaining
 */
export async function generateExtendedVideoAsync(
  ctx: BotContext,
  jobId: string,
  niche: string,
  platform: string,
  totalDuration: number,
  scenes: number,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
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
      let prompt = buildPrompt(
        scene.description,
        platform,
        scene.duration,
        customPrompt,
      );

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
    await UserService.refundCredits(
      telegramId,
      creditCostExtended,
      jobId,
      String(error),
    );
    const userMessage = actionableError(String(error), { jobId });
    await ctx.reply(
      t("msg.credits_refunded", ctx.session?.userLang || "id", {
        message: userMessage,
      }),
    );
  }
}

/**
 * Download video to specific path
 */
async function downloadVideoToPath(
  url: string,
  outputPath: string,
): Promise<void> {
  await execFile("wget", ["-O", outputPath, url]);
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
    await execFile("ffmpeg", [
      "-i",
      inputPaths[0],
      "-i",
      inputPaths[1],
      "-filter_complex",
      "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v]",
      "-map",
      "[v]",
      outputPath,
    ]);
  } else if (inputPaths.length === 3) {
    await execFile("ffmpeg", [
      "-i",
      inputPaths[0],
      "-i",
      inputPaths[1],
      "-i",
      inputPaths[2],
      "-filter_complex",
      "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v1];[v1][2:v]xfade=transition=fade:duration=0.5:offset=9.5[v]",
      "-map",
      "[v]",
      outputPath,
    ]);
  } else {
    // Fallback: simple concat without crossfade
    const simpleListPath = path.join(getVideoDir(), "simple_list.txt");
    const simpleListContent = inputPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(simpleListPath, simpleListContent);
    await execFile("ffmpeg", [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      simpleListPath,
      "-c",
      "copy",
      outputPath,
    ]);
  }
}

/**
 * Download video from URL
 */
async function downloadVideo(url: string, jobId: string): Promise<string> {
  const outputPath = path.join(getVideoDir(), `${jobId}.mp4`);
  await execFile("wget", ["-O", outputPath, url]);
  return outputPath;
}
