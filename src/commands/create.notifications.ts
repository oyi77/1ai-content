/**
 * Create Command — Notification Helpers
 *
 * Sends success/error notifications to users after video generation.
 * Extracted from create.ts god object.
 */

import { BotContext } from "@/types";
import type { InlineKeyboardButton } from '@telegraf/types/markup';
import { logger } from "@/utils/logger";
import { VideoService } from "@/services/video.service";
import { PostAutomationService } from "@/services/postautomation.service";
import { getConfig } from "@/config/env";
import { ConfigError } from '@/utils/app-errors';
import { actionableError } from "@/utils/errors";
import { generateCaption } from "./create.caption";
import { getVideoCreditCost } from "@/config/pricing";

/**
 * Send success notification
 */
export async function sendSuccessNotification(
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
  const keyboard: InlineKeyboardButton[][] = [];

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

  if (video.downloadUrl && (await import('fs')).existsSync(video.downloadUrl)) {
    // Local file: stream directly to Telegram
    await ctx.replyWithVideo(
      { source: video.downloadUrl },
      {
        caption: videoCaption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  } else if (video.videoUrl) {
    // CDN URL: send via URL (Telegram will fetch it)
    try {
      await ctx.replyWithVideo(video.videoUrl, {
        caption: videoCaption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {
      // Telegram rejected the URL — send link message as final fallback
      await ctx.reply(videoCaption, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    }
  } else {
    // No file anywhere — send message with download link only
    await ctx.reply(videoCaption, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  // Send auto-generated caption as a follow-up message
  const niche = ctx.session?.selectedNiche || ctx.session?.videoCreation?.niche;
  const storyboard = ctx.session?.videoCreation?.storyboard;
  if (niche && storyboard && storyboard.length > 0) {
    try {
      const caption = generateCaption(niche, storyboard, platform);
      await ctx.reply(
        `📋 Suggested Caption:\n\n${caption.text}\n\n${caption.hashtags}\n\n💡 Copy and paste this when posting!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📋 Copy Caption",
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
export async function sendErrorNotification(
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
