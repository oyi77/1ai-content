/**
 * Videos Command
 * 
 * Handles /videos command - Show user's video library
 */

import jwt from 'jsonwebtoken';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { VideoService } from '@/services/video.service';
import { UserService } from '@/services/user.service';
import { t } from '@/i18n/translations';
import { ConfigError } from '@/utils/app-errors';

/** Generate a signed download URL for a video job (valid 30d). Never exposes provider CDN URLs. */
function makeDownloadUrl(jobId: string, userId: string): string {
  const base = getConfig().WEBHOOK_URL.replace(/\/webhook.*$/, '');
  const secret = getConfig().JWT_SECRET;
  if (!secret) throw new ConfigError('JWT_SECRET');
  const token = jwt.sign({ telegramId: userId, jobId }, secret, { expiresIn: '30d' });
  return `${base}/video/${jobId}/download?token=${token}`;
}

/**
 * Handle /videos command
 */
export async function videosCommand(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;
  
    if (!user) {
      await ctx.reply(t('msg.unable_identify', 'id'));
      return;
    }

    const lang = ctx.from?.language_code || 'id';

    // Get user's videos from database with pagination
    const sessionExt = ctx.session as unknown as Record<string, unknown>;
    const page = parseInt(sessionExt?.videosPage as string) || 0;
    const videos = await VideoService.getUserVideos(BigInt(user.id), 10, page * 10);

    if (videos.length === 0) {
      await ctx.reply(
        t('videos.empty', lang),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎬 Create New Video', callback_data: 'create_video_new' }],
            ],
          },
        }
      );
      return;
    }

    // Build video list with buttons
    const videoButtons = videos.map((v, idx) => {
      const statusEmoji = v.status === 'completed' ? '✅' :
                          v.status === 'processing' ? '⏳' :
                          v.status === 'failed' ? '❌' : '📹';

      return [{
        text: `${statusEmoji} ${v.title || `Video ${idx + 1}`} (${v.duration}s)`,
        callback_data: `video_view_${v.jobId}`
      }];
    });

    const navButtons: { text: string; callback_data: string }[] = [];
    if (page > 0) navButtons.push({ text: '◀️ Prev', callback_data: 'videos_prev' });
    navButtons.push({ text: `Page ${page + 1}`, callback_data: 'videos_page' });
    if (videos.length === 10) navButtons.push({ text: 'Next ▶️', callback_data: 'videos_next' });

    await ctx.reply(
      t('videos.list_header', lang, { count: videos.length }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...videoButtons,
            navButtons,
            [{ text: t('videos.btn_create_new', lang), callback_data: 'create_video_new' }],
            [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
          ],
        },
      }
    );
  } catch (error) {
    logger.error('videosCommand error:', error);
    try { await ctx.reply(t('error.generic', 'id')); } catch { /* ignore */ }
  }
}

/**
 * View video details with download option
 */
export async function viewVideo(ctx: BotContext, jobId: string): Promise<void> {
  let lang = ctx.from?.language_code || 'id';
  if (ctx.from) {
    const dbUser = await UserService.findByTelegramId(BigInt(ctx.from.id));
    if (dbUser?.language) lang = dbUser.language;
  }

  const video = await VideoService.getByJobId(jobId);

  if (!video) {
    await ctx.answerCbQuery(t('videos.not_found', lang));
    return;
  }

  // Ownership check — users may only view their own videos
  if (ctx.from && video.userId !== BigInt(ctx.from.id)) {
    await ctx.answerCbQuery('❌ Access denied');
    return;
  }

  // Status message
  const statusText = {
    processing: '⏳ Processing...',
    completed: '✅ Completed',
    failed: '❌ Failed',
  }[video.status] || video.status;

  const message = 
    `📹 *Video Details*\n\n` +
    `*Title:* ${video.title || 'Untitled'}\n` +
    `*Status:* ${statusText}\n` +
    `*Niche:* ${video.niche}\n` +
    `*Platform:* ${video.platform}\n` +
    `*Duration:* ${video.duration}s\n` +
    `*Scenes:* ${video.scenes}\n` +
    `*Credits Used:* ${Number(video.creditsUsed)}\n` +
    `*Created:* ${video.createdAt.toLocaleDateString('id-ID', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}\n` +
    (video.completedAt ? `*Completed:* ${video.completedAt.toLocaleDateString('id-ID')}\n` : '') +
    `\n*Expires:* ${video.expiresAt?.toLocaleDateString('id-ID') || 'N/A'}`;

  // If video is completed, show details and download
  if (video.status === 'completed' && video.videoUrl) {
    const dlUrl = makeDownloadUrl(jobId, video.userId.toString());
    const textKeyboard = {
      inline_keyboard: [
        [{ text: '⬇️ Download Video', url: dlUrl }],
        [{ text: '🎬 Create Similar', callback_data: `create_similar_${jobId}` }],
        [
          { text: video.favorited ? '★ Unfavorite' : '☆ Favorite', callback_data: `video_fav_${jobId}` },
          { text: '🗑️ Delete', callback_data: `video_delete_${jobId}` },
        ],
        [{ text: '◀️ Back to List', callback_data: 'videos_list' }],
      ],
    };
    if (video.thumbnailUrl) {
      try {
        // Send thumbnail photo with video info
        await ctx.editMessageMedia(
          {
            type: 'photo',
            media: video.thumbnailUrl,
            caption: message,
            parse_mode: 'Markdown',
          } as unknown as Parameters<typeof ctx.editMessageMedia>[0]
        );
        // Follow-up with action buttons
        await ctx.reply(
          '⬇️ *Actions*',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬇️ Download Video', url: dlUrl }],
                [{ text: '🎬 Create Similar', callback_data: `create_similar_${jobId}` }],
                [{ text: '📤 Publish to Social Media', callback_data: `publish_video_${jobId}` }],
                [{ text: '📋 Copy Download Link', callback_data: `video_copy_${jobId}` }],
                [
                  { text: video.favorited ? '★ Unfavorite' : '☆ Favorite', callback_data: `video_fav_${jobId}` },
                  { text: '🗑️ Delete', callback_data: `video_delete_${jobId}` },
                ],
                [{ text: '◀️ Back to List', callback_data: 'videos_list' }],
              ],
            },
          }
        );
      } catch {
        // Photo failed — fall back to text view with download button
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: textKeyboard });
      }
    } else {
      // No thumbnail — use text view with download button (avoids exposing provider URL via media)
      await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: textKeyboard });
    }
  } else if (video.status === 'processing') {
    await ctx.editMessageText(
      message + '\n\n_Your video is being generated. Please check back in a few minutes._',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: `video_view_${jobId}` }],
            [{ text: '◀️ Back to List', callback_data: 'videos_list' }],
          ],
        },
      }
    );
  } else if (video.status === 'failed') {
    await ctx.editMessageText(
      message + '\n\n_❌ Video generation failed. Please try again or contact support._',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Retry', callback_data: `video_retry_${jobId}` }],
            [{ text: '◀️ Back to List', callback_data: 'videos_list' }],
          ],
        },
      }
    );
  } else {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀️ Back to List', callback_data: 'videos_list' }],
        ],
      },
    });
  }
}

/**
 * Copy video URL to clipboard (show as text)
 */
export async function copyVideoUrl(ctx: BotContext, jobId: string): Promise<void> {
  try {
    let lang = 'id';
    if (ctx.from) {
      const dbUser = await UserService.findByTelegramId(BigInt(ctx.from.id));
      lang = dbUser?.language || ctx.from.language_code || 'id';
    }

    const video = await VideoService.getByJobId(jobId);

    if (!video || !video.videoUrl) {
      await ctx.answerCbQuery(t('videos.not_found', lang));
      return;
    }

    if (ctx.from && video.userId !== BigInt(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Access denied');
      return;
    }

    const dlUrl = makeDownloadUrl(jobId, video.userId.toString());
    await ctx.answerCbQuery(t('videos.link_copied', lang));
    await ctx.reply(
      t('videos.copy_link', lang, { url: dlUrl }),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('copyVideoUrl error:', error);
    try { await ctx.reply(t('error.generic', 'en')); } catch { /* ignore */ }
  }
}

/**
 * Delete video
 */
export async function deleteVideo(ctx: BotContext, jobId: string): Promise<void> {
  try {
    const video = await VideoService.getByJobId(jobId);
  
    if (!video) {
      await ctx.answerCbQuery('❌ Video not found');
      return;
    }

    if (ctx.from && video.userId !== BigInt(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Access denied');
      return;
    }

    // Soft delete by setting status to deleted
    await ctx.editMessageText(
      `🗑️ *Delete Video*\n\n` +
      `Are you sure you want to delete "${video.title || 'this video'}"?\n\n` +
      `_This action cannot be undone._`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, Delete', callback_data: `video_confirm_delete_${jobId}` },
              { text: '❌ Cancel', callback_data: `video_view_${jobId}` },
            ],
          ],
        },
      }
    );
  } catch (error) {
    logger.error('deleteVideo error:', error);
    try { await ctx.reply(t('error.generic', 'id')); } catch { /* ignore */ }
  }
}
