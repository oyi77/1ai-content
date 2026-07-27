/**
 * Video Generation Worker — Initialisation
 *
 * BullMQ worker setup and startVideoWorker() export.
 * Contains interception check and the main job processing loop.
 * Extracted from video-generation.worker.ts.
 */

import * as fs from 'fs';
import { Worker, Job } from 'bullmq';
import type { Telegram } from 'telegraf';
import { logger } from '@/utils/logger';
import { redis, bullmqRedis } from '@/config/redis';
import { getConfig } from '@/config/env';
import { VideoService } from '@/services/video.service';
import { UserService } from '@/services/user.service';
import { generateVideoWithFallback } from '@/services/video-fallback.service';
import { getVideoCreditCostAsync } from '@/config/pricing';
import { actionableError } from '@/utils/errors';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { runWithCorrelation } from '@/utils/correlation';
import { t } from '@/i18n/translations';
import type { VideoGenerationJobData } from './video-generation.types';
import { VIDEO_DIR } from './video-generation.helpers';
import { processSingleScene, processExtendedScenes } from './video-generation.scene';

let workerInstance: Worker<VideoGenerationJobData> | null = null;

export function startVideoWorker(bot: { telegram: Telegram }): Worker<VideoGenerationJobData> {
  if (workerInstance) {
    logger.warn('Video worker already running, returning existing instance');
    return workerInstance;
  }

  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
  }

  const telegram = bot.telegram;

  workerInstance = new Worker<VideoGenerationJobData>(
    'video-generation',
    (job: Job<VideoGenerationJobData>) => runWithCorrelation(async () => {
      logger.info(`Processing video job ${job.id} (jobId=${job.data.jobId}, scenes=${job.data.scenes})`);

      try {
        // ── Interception Check ──
        const { InterceptService } = await import('@/services/intercept.service.js');
        const telegramId = BigInt(job.data.userId);
        const intercepted = await InterceptService.isIntercepted(telegramId);

        if (intercepted) {
          logger.info(`Job ${job.data.jobId}: user ${telegramId} is intercepted — pausing for admin media`);

          await InterceptService.logEvent(telegramId, 'generation_started', `Job started: ${job.data.jobId}`, {
            jobId: job.data.jobId, niche: job.data.niche, platform: job.data.platform, duration: job.data.duration,
          });

          const result = await InterceptService.waitForMedia(job.data.jobId, 1800);

          if (!result) {
            const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(job.data.duration);
            await VideoService.updateStatus(job.data.jobId, 'failed', 'Generation timed out');
            const refundLockKey = `refund-lock:${job.data.jobId}`;
            const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
            if (lockAcquired) { await UserService.refundCredits(telegramId, creditCost, job.data.jobId, 'Generation timed out'); }
            await telegram.sendMessage(job.data.chatId, '❌ Video generation failed. Your credits have been refunded. Please try again.');
            return;
          }

          const { mediaUrl, mediaType } = result;
          await VideoService.upsertForInterception(job.data.jobId, telegramId, mediaUrl);

          const caption = `✅ Video selesai!\n\n📱 Platform: ${job.data.platform.toUpperCase()}\n⏱ Durasi: ${job.data.duration}s\n\nSiap untuk dipublikasikan!`;
          const replyMarkup = { inline_keyboard: [[{ text: '🎬 Buat Video Lagi', callback_data: 'create_video_new' }], [{ text: '📂 Video Saya', callback_data: 'videos_list' }]] };

          if (mediaType === 'image') { await telegram.sendPhoto(job.data.chatId, mediaUrl, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup }); }
          else { await telegram.sendVideo(job.data.chatId, mediaUrl, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup }); }

          await InterceptService.logEvent(telegramId, 'media_delivered', `Admin delivered ${mediaType}`, { jobId: job.data.jobId, mediaUrl });
          logger.info(`Interception complete for job ${job.data.jobId}`);
          return;
        }

        if (job.data.scenes === 1) {
          await processSingleScene(job, telegram);
        } else {
          await processExtendedScenes(job, telegram);
        }
        logger.info(`Video job ${job.id} completed successfully`);
      } catch (error) {
        logger.error(`Video job ${job.id} failed with unhandled error:`, error);

        try {
          const existingVideo = await VideoService.getByJobId(job.data.jobId);
          if (existingVideo?.status === 'failed') {
            logger.warn(`Job ${job.data.jobId} already failed/refunded (catch) — skipping duplicate refund`);
          } else {
            const telegramId = BigInt(job.data.userId);
            const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(job.data.duration);
            await VideoService.updateStatus(job.data.jobId, 'failed', (error as Error).message);
            const refundLockKey = `refund-lock:${job.data.jobId}`;
            const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
            if (!lockAcquired) { logger.warn(`Refund lock already held for job ${job.data.jobId} — skipping duplicate refund`); }
            else { await UserService.refundCredits(telegramId, creditCost, job.data.jobId, (error as Error).message); }
            const workerUserMessage = actionableError((error as Error).message, { jobId: job.data.jobId });
            await telegram.sendMessage(job.data.chatId, `Video generation failed\n\nJob ID: ${job.data.jobId}\n${workerUserMessage}\n\nCredits refunded.`);
          }
        } catch (refundErr) { logger.error('Failed to handle job failure cleanup:', refundErr); }
        throw error;
      }
    }, job.data.correlationId),
    { connection: bullmqRedis, concurrency: 3 }
  );

  workerInstance.on('completed', (job) => { logger.info(`Video worker: job ${job.id} completed`); });
  workerInstance.on('failed', (job, err) => {
    logger.error(`Video worker: job ${job?.id} failed:`, err);
    sendAdminAlert('critical', 'Video Generation Failed', { jobId: job?.id, error: (err as Error)?.message?.slice(0, 300) });
  });
  workerInstance.on('error', (err) => {
    logger.error('Video worker error:', err);
    sendAdminAlert('warning', 'Video Worker Error', { error: (err as Error)?.message?.slice(0, 300) });
  });

  logger.info('Video generation worker started (concurrency: 3)');
  return workerInstance;
}
