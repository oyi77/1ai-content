/**
 * Video Generation Worker — User Notification
 *
 * Sends completed videos to users via Telegram with download links, captions, and tips.
 * Extracted from video-generation.worker.ts.
 */

import * as fs from 'fs';
import type { Telegram } from 'telegraf';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { VideoService } from '@/services/video.service';
import { UserService } from '@/services/user.service';
import { prisma } from '@/config/database';
import { t } from '@/i18n/translations';
import { ConfigError } from '@/utils/app-errors';
import { generateCaption } from './video-generation.caption';

export async function sendVideoToUser(
  telegram: Telegram,
  chatId: number,
  jobId: string,
  duration: number,
  platform: string,
  localPath: string,
  niche?: string,
  storyboard?: Array<{ scene: number; duration: number; description: string }>
): Promise<void> {
  try {
    const webhookUrl = getConfig().WEBHOOK_URL.replace(/\/webhook.*$/, '');
    const video = await VideoService.getByJobId(jobId);
    const userId = video?.userId?.toString() || '0';
    const jwtSecret = getConfig().JWT_SECRET;
    if (!jwtSecret) throw new ConfigError('JWT_SECRET');
    const downloadToken = (await import('jsonwebtoken')).default.sign(
      { telegramId: userId, jobId }, jwtSecret, { expiresIn: '30d' },
    );
    const downloadUrl = `${webhookUrl}/video/${jobId}/download?token=${downloadToken}`;

    const dbUser = userId && userId !== '0' ? await UserService.findByTelegramId(BigInt(userId)) : null;
    const lang = dbUser?.language || 'id';

    const caption =
      `${t('video.completion_title', lang)}\n\n` +
      `${t('video.completion_info', lang, { duration, platform: platform.toUpperCase() })}\n\n` +
      `${t('video.completion_cta', lang)}`;

    const replyMarkup = {
      inline_keyboard: [
        [{ text: t('video.btn_download', lang), url: downloadUrl }],
        [{ text: t('video.btn_publish', lang), callback_data: `publish_video_${jobId}` }],
        [{ text: t('video.btn_good', lang), callback_data: `feedback_good_${jobId}` }, { text: t('video.btn_needs_work', lang), callback_data: `feedback_bad_${jobId}` }],
        [{ text: t('video.btn_create_another', lang), callback_data: 'create_video_new' }, { text: t('video.btn_my_videos', lang), callback_data: 'videos_list' }],
      ],
    };

    if (fs.existsSync(localPath)) {
      await telegram.sendVideo(chatId, { source: localPath }, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup });
    } else if (video?.videoUrl) {
      try { await telegram.sendVideo(chatId, video.videoUrl, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup }); }
      catch { await telegram.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: replyMarkup }); }
    } else {
      await telegram.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: replyMarkup });
    }

    if (dbUser) {
      const videoCount = await prisma.video.count({ where: { userId: dbUser.telegramId } });
      if (videoCount <= 1) {
        const tips = t('video.first_video_tips', lang);
        await telegram.sendMessage(chatId, tips, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }

    if (niche && storyboard) {
      try {
        const captionGen = generateCaption(niche, storyboard, platform);
        await telegram.sendMessage(chatId, `\ud83d\udccb Suggested Caption:\n\n${captionGen.text}\n\n${captionGen.hashtags}\n\n\ud83d\udca1 Copy and paste this when posting!`, {
          reply_markup: { inline_keyboard: [[{ text: '\ud83d\udccb Copy Caption', callback_data: `copy_caption_${jobId}` }]] },
        });
      } catch (captionErr) { logger.warn(`Failed to generate caption for job ${jobId}:`, captionErr); }
    }
  } catch (sendErr) { logger.error(`Failed to send video notification for job ${jobId}:`, sendErr); }
}
