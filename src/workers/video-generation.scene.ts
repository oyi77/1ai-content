/**
 * Video Generation Worker — Scene Processing
 *
 * Single-scene and multi-scene (extended) generation pipelines.
 * Extracted from video-generation.worker.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Worker, Job } from 'bullmq';
import type { Telegram } from 'telegraf';
import { logger } from '@/utils/logger';
import { redis } from '@/config/redis';
import { getConfig } from '@/config/env';
import { VideoService } from '@/services/video.service';
import { UserService } from '@/services/user.service';
import { GeminiGenService } from '@/services/geminigen.service';
import { generateVideoWithFallback } from '@/services/video-fallback.service';
import { getVideoCreditCostAsync } from '@/config/pricing';
import { QualityCheckService } from '@/services/quality-check.service';
import { WatermarkService } from '@/services/watermark.service';
import { VideoPostProcessing } from '@/services/video-post-processing.service';
import { GamificationService } from '@/services/gamification.service';
import { prisma } from '@/config/database';
import { actionableError } from '@/utils/errors';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { runWithCorrelation } from '@/utils/correlation';
import { t } from '@/i18n/translations';
import { ProviderError } from '@/utils/app-errors';
import type { VideoGenerationJobData } from './video-generation.types';
import { notifyProgress, startTimeoutWatcher, buildPrompt, getAspectRatio, getStyleForNiche, VIDEO_DIR, downloadVideo, concatenateVideos } from './video-generation.helpers';
import { applyVOPipeline } from './video-generation.vo';
import { sendVideoToUser } from './video-generation.notify';
import { handleCampaignJobComplete } from './video-generation.campaign';

// ── Single-scene generation ──

async function processSingleScene(job: Job<VideoGenerationJobData>, telegram: Telegram): Promise<void> {
  const { jobId, niche, platform, duration, storyboard, referenceImage, customPrompt, userId, chatId } = job.data;
  const telegramId = BigInt(userId);

  const existingVideo = await VideoService.getByJobId(jobId);
  if (existingVideo && (existingVideo.status === 'failed' || existingVideo.status === 'completed')) {
    logger.warn(`Job ${jobId} already ${existingVideo.status} — skipping retry to prevent free generation`);
    return;
  }

  const cancelTimeout = startTimeoutWatcher(telegram, chatId);
  await job.updateProgress(10);

  const initialTimer = setTimeout(() => {
    notifyProgress(telegram, chatId, '\ud83c\udfac Generating your video... This usually takes 1-3 minutes.');
  }, 30_000);

  const scene = storyboard[0];
  const prompt = buildPrompt(scene.description, platform, duration, customPrompt);
  const result = await generateVideoWithFallback({ prompt, duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage });

  clearTimeout(initialTimer);
  await job.updateProgress(60);

  if (!result.success || !result.videoUrl) {
    cancelTimeout();
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') { logger.warn(`Job ${jobId} already failed/refunded — skipping duplicate refund`); return; }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', result.error);
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) { logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`); }
    else { await UserService.refundCredits(telegramId, creditCost, jobId, result.error || 'Generation failed'); }
    const userMessage = actionableError(result.error || 'Generation failed', { jobId });
    const { t: tFail } = await import('../i18n/translations.js');
    const failLang = job.data.language || 'id';
    await telegram.sendMessage(chatId, `${tFail('gen.video_failed_refund', failLang)}\n\nJob ID: ${jobId}\n${userMessage}`);
    return;
  }

  logger.info(`Video generated via ${result.provider} for job ${jobId}`);
  await job.updateProgress(80);
  await notifyProgress(telegram, chatId, '\u2705 Video generated! Downloading and processing...');

  const localPath = path.join(VIDEO_DIR, `${jobId}.mp4`);
  await downloadVideo(result.videoUrl, localPath);

  try {
    const cleanedPath = await WatermarkService.cleanVideo(localPath);
    if (cleanedPath !== localPath) { fs.unlinkSync(localPath); fs.renameSync(cleanedPath, localPath); logger.info(`🧹 Video watermark removed for ${jobId}`); }
  } catch (wmErr) { logger.warn(`🧹 Watermark removal skipped: ${(wmErr as Error).message}`); }

  try {
    await notifyProgress(telegram, chatId, '\ud83d\udd0d Running quality check...');
    const qcResult = await QualityCheckService.scoreVideo(localPath, niche, duration, !!referenceImage);
    try { await prisma.video.update({ where: { jobId }, data: { generationMetadata: { qualityScore: qcResult.score, qualityIssues: qcResult.issues } } }); } catch (_) {}

    const qcAttemptKey = `qc_retry:${jobId}`;
    const isRetry = await redis.get(qcAttemptKey);

    if (!qcResult.passable && !isRetry) {
      logger.warn(`[QualityCheck] Video ${jobId} scored ${qcResult.score}/10 -- retrying with different provider`);
      await redis.set(qcAttemptKey, '1', 'EX', 600);
      try { fs.unlinkSync(localPath); } catch (_) {}
      await notifyProgress(telegram, chatId, '\ud83d\udd04 Improving quality... Regenerating video.');
      const retryResult = await generateVideoWithFallback({ prompt: `High quality commercial ${niche} content. ${buildPrompt(storyboard[0].description, platform, duration, customPrompt)}`, duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage });
      if (retryResult.success && retryResult.videoUrl) { await downloadVideo(retryResult.videoUrl, localPath); logger.info(`[QualityCheck] Retry succeeded via ${retryResult.provider} for job ${jobId}`); }
      else { logger.warn(`[QualityCheck] Retry failed for ${jobId}, delivering original`); await downloadVideo(result.videoUrl, localPath); }
    } else { logger.info(`[QualityCheck] Video ${jobId} passed with score ${qcResult.score}/10`); }
  } catch (qcErr) { logger.warn(`[QualityCheck] Quality check error for ${jobId}, delivering as-is:`, (qcErr as Error).message); }

  const enableVO = job.data.enableVO !== false;
  const enableSubtitles = job.data.enableSubtitles !== false;
  let deliveryPath = localPath;

  if (enableVO || enableSubtitles) {
    deliveryPath = await applyVOPipeline(localPath, jobId, niche, platform, storyboard, duration, { enableVO, enableSubtitles, language: job.data.language, voScript: job.data.voScript }, telegram, chatId);
  } else {
    await notifyProgress(telegram, chatId, '\ud83d\udce6 Almost ready! Preparing delivery...');
  }

  await VideoService.setOutput(jobId, { videoUrl: result.videoUrl, downloadUrl: deliveryPath });
  await job.updateProgress(100);
  cancelTimeout();

  if (job.data.cacheAsTemplate && job.data.cacheNiche) {
    try { const { TemplateVideoService } = await import('../services/template-video.service.js'); await TemplateVideoService.cacheGeneratedVideo(job.data.cacheNiche, result.videoUrl || deliveryPath, undefined, duration); } catch (cacheErr) { logger.warn('Failed to cache template video', { error: (cacheErr as Error).message }); }
  }

  if (job.data.campaignGroupId) {
    await handleCampaignJobComplete(telegram, chatId, job.data.campaignGroupId, job.data.campaignTotal || 5, deliveryPath, result.videoUrl || '', niche, job.data.userId);
  } else {
    await sendVideoToUser(telegram, chatId, jobId, duration, platform, deliveryPath, niche, storyboard);
  }

  GamificationService.recordGenerate(telegramId, { telegram, chatId, lang: job.data.language || 'id' })
    .catch((err) => logger.warn('Gamification recordGenerate failed (single-scene)', err));
}

// ── Multi-scene (extended) generation ──

async function processExtendedScenes(job: Job<VideoGenerationJobData>, telegram: Telegram): Promise<void> {
  const { jobId, niche, platform, duration, scenes, storyboard, referenceImage, customPrompt, userId, chatId } = job.data;
  const telegramId = BigInt(userId);

  const existingVideoExt = await VideoService.getByJobId(jobId);
  if (existingVideoExt && (existingVideoExt.status === 'failed' || existingVideoExt.status === 'completed')) {
    logger.warn(`Extended job ${jobId} already ${existingVideoExt.status} — skipping retry`);
    return;
  }

  const cancelTimeout = startTimeoutWatcher(telegram, chatId);
  const sceneVideos: string[] = new Array(scenes).fill('');

  async function generateSceneWithRetry(sceneIndex: number, useExtend: boolean, lastUuidRef: string | null): Promise<{ result: import("@/services/video-fallback.service").VideoFallbackResult | import("@/services/geminigen.service").VideoGenerationResult; scenePath: string }> {
    const scene = storyboard[sceneIndex];
    const scenePath = path.join(VIDEO_DIR, `${jobId}_scene_${sceneIndex + 1}.mp4`);
    const prompt = buildPrompt(scene.description, platform, scene.duration, customPrompt);
    logger.info(`Generating scene ${sceneIndex + 1}/${scenes} for job ${jobId}: ${scene.description}`);
    let result: import("@/services/video-fallback.service").VideoFallbackResult | import("@/services/geminigen.service").VideoGenerationResult;
    const sceneRef = job.data.userImages?.find(u => u.sceneIndex === sceneIndex)?.url || referenceImage;

    if (sceneIndex === 0) {
      result = await generateVideoWithFallback({ prompt, duration: scene.duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage: sceneRef });
    } else if (useExtend && lastUuidRef) {
      try { result = await GeminiGenService.generateExtend({ prompt, refHistory: lastUuidRef }); }
      catch (extendErr) { logger.warn(`Scene ${sceneIndex + 1} extend failed, falling back to standalone: ${(extendErr as Error).message}`); result = await generateVideoWithFallback({ prompt, duration: scene.duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage: sceneRef }); }
    } else {
      result = await generateVideoWithFallback({ prompt, duration: scene.duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage: sceneRef });
    }

    if (!result.success || !result.videoUrl) {
      logger.warn(`Scene ${sceneIndex + 1}/${scenes} failed on first attempt: ${result.error}. Retrying...`);
      result = await generateVideoWithFallback({ prompt, duration: scene.duration, aspectRatio: getAspectRatio(platform), style: getStyleForNiche(niche), niche, referenceImage: sceneRef });
    }
    if (!result.success || !result.videoUrl) {
      throw new ProviderError("scene-generation", `Scene ${sceneIndex + 1} failed after 2 attempts: ${result.error}`);
    }
    try { await downloadVideo(result.videoUrl, scenePath); }
    catch (downloadErr) { try { fs.unlinkSync(scenePath); } catch {} throw downloadErr; }
    return { result, scenePath };
  }

  // Scene 0
  try {
    const { scenePath } = await generateSceneWithRetry(0, false, null);
    sceneVideos[0] = scenePath;
    const progress = Math.round((1 / scenes) * 80);
    await job.updateProgress(progress);
    await VideoService.updateProgress(jobId, progress);
    await notifyProgress(telegram, chatId, `\ud83c\udfac Scene 1/${scenes} complete (${Math.round((1 / scenes) * 100)}%)`);
  } catch (err) {
    cancelTimeout();
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') { logger.warn(`Job ${jobId} already failed/refunded (scene 1) — skipping duplicate refund`); return; }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', (err as Error).message);
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) { logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`); }
    else { await UserService.refundCredits(telegramId, creditCost, jobId, (err as Error).message); }
    await telegram.sendMessage(chatId, `Video generation failed (scene 1)\n\nJob ID: ${jobId}\n${actionableError((err as Error).message, { jobId })}\n\nCredits refunded.`);
    return;
  }

  // Remaining scenes: batched parallel (3 concurrent)
  const BATCH_SIZE = 3;
  for (let batchStart = 1; batchStart < scenes; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes);
    const batchPromises: Promise<{ sceneIndex: number; scenePath: string }>[] = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(generateSceneWithRetry(i, false, null).then(({ scenePath }) => ({ sceneIndex: i, scenePath })));
    }
    const batchResults = await Promise.allSettled(batchPromises);
    let batchFailures = 0;
    for (const settled of batchResults) {
      if (settled.status === 'rejected') { batchFailures++; logger.warn(`Batch scene failed (will skip): ${settled.reason?.message}`); continue; }
      sceneVideos[settled.value.sceneIndex] = settled.value.scenePath;
    }
    if (batchFailures > 0) { await notifyProgress(telegram, chatId, `⚠️ ${batchFailures} scene(s) skipped — continuing with remaining scenes.`); }
    const completedCount = batchEnd;
    await job.updateProgress(Math.round((completedCount / scenes) * 80));
    await VideoService.updateProgress(jobId, Math.round((completedCount / scenes) * 80));
    for (let i = batchStart; i < batchEnd; i++) { await notifyProgress(telegram, chatId, `\ud83c\udfac Scene ${i + 1}/${scenes} complete (${Math.round(((i + 1) / scenes) * 100)}%)`); }
  }

  // Concatenate
  await notifyProgress(telegram, chatId, `\u2702\ufe0f Combining ${scenes} scenes...`);
  const rawConcatPath = path.join(VIDEO_DIR, `${jobId}_raw.mp4`);
  const finalPath = path.join(VIDEO_DIR, `${jobId}.mp4`);
  const successfulScenes = sceneVideos.filter(p => p && fs.existsSync(p));

  if (successfulScenes.length === 0) {
    cancelTimeout();
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') { logger.warn(`Job ${jobId} already failed/refunded (all scenes) — skipping duplicate refund`); return; }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', 'All scenes failed');
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) { logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`); }
    else { await UserService.refundCredits(telegramId, creditCost, jobId, 'All scenes failed'); }
    const { t } = await import('../i18n/translations.js');
    await telegram.sendMessage(chatId, t('gen.video_failed_refund', job.data.language || 'id'));
    return;
  }

  const failedSceneCount = scenes - successfulScenes.length;
  if (failedSceneCount > 0) {
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    const refundAmount = Math.round((creditCost * failedSceneCount / scenes) * 100) / 100;
    if (refundAmount > 0) {
      const partialRefundLockKey = `refund-lock:${jobId}:partial`;
      const partialLockAcquired = await redis.set(partialRefundLockKey, '1', 'EX', 3600, 'NX');
      if (!partialLockAcquired) { logger.warn(`Partial refund lock already held for job ${jobId} — skipping duplicate partial refund`); }
      else { await UserService.refundCredits(telegramId, refundAmount, jobId, `${failedSceneCount}/${scenes} scenes failed`).catch((err) => logger.error('CRITICAL: partial scene refund failed', { jobId, refundAmount, err })); }
      await telegram.sendMessage(chatId, t('worker.partial_refund', job.data.language || 'id', { amount: refundAmount, count: failedSceneCount })).catch(() => {});
    }
  }

  logger.info(`Concatenating ${successfulScenes.length}/${scenes} scenes for job ${jobId} (niche: ${niche})...`);
  await concatenateVideos(successfulScenes, rawConcatPath, niche);

  try {
    const cleanedConcat = await WatermarkService.cleanVideo(rawConcatPath);
    if (cleanedConcat !== rawConcatPath) { fs.unlinkSync(rawConcatPath); fs.renameSync(cleanedConcat, rawConcatPath); logger.info(`🧹 Multi-scene watermark removed for ${jobId}`); }
  } catch (wmErr) { logger.warn(`🧹 Multi-scene watermark removal skipped: ${(wmErr as Error).message}`); }

  await notifyProgress(telegram, chatId, '\ud83c\udfa8 Applying color grading...');
  try {
    await VideoPostProcessing.postProcess(rawConcatPath, finalPath, { niche, platform, colorGrade: true });
    logger.info(`Post-processing complete for job ${jobId}`);
  } catch (ppErr) {
    logger.warn(`Post-processing failed for job ${jobId}, using raw concat: ${(ppErr as Error).message}`);
    if (fs.existsSync(rawConcatPath)) fs.copyFileSync(rawConcatPath, finalPath);
  }
  try { fs.unlinkSync(rawConcatPath); } catch (_) {}

  // Quality check
  try {
    await notifyProgress(telegram, chatId, '\ud83d\udd0d Running quality check...');
    const qcResult = await QualityCheckService.scoreVideo(finalPath, niche, duration, !!referenceImage);
    try { await prisma.video.update({ where: { jobId }, data: { generationMetadata: { qualityScore: qcResult.score, qualityIssues: qcResult.issues } } }); } catch (_) {}
    if (!qcResult.passable) { logger.warn(`[QualityCheck] Multi-scene video ${jobId} scored ${qcResult.score}/10 -- delivering as-is (no retry for multi-scene)`); }
    else { logger.info(`[QualityCheck] Multi-scene video ${jobId} passed with score ${qcResult.score}/10`); }
  } catch (qcErr) { logger.warn(`[QualityCheck] Quality check error for multi-scene ${jobId}:`, (qcErr as Error).message); }

  // VO pipeline
  const enableVO = job.data.enableVO !== false;
  const enableSubtitles = job.data.enableSubtitles !== false;
  let deliveryPath = finalPath;
  if (enableVO || enableSubtitles) {
    deliveryPath = await applyVOPipeline(finalPath, jobId, niche, platform, storyboard, duration, { enableVO, enableSubtitles, language: job.data.language, voScript: job.data.voScript }, telegram, chatId);
  } else { await notifyProgress(telegram, chatId, '\ud83d\udce6 Almost ready!'); }

  await VideoService.setOutput(jobId, { downloadUrl: deliveryPath });
  await job.updateProgress(100);
  cancelTimeout();

  if (job.data.campaignGroupId) {
    await handleCampaignJobComplete(telegram, chatId, job.data.campaignGroupId, job.data.campaignTotal || 5, deliveryPath, '', niche, job.data.userId);
  } else {
    await sendVideoToUser(telegram, chatId, jobId, duration, platform, deliveryPath, niche, storyboard);
  }

  GamificationService.recordGenerate(telegramId, { telegram, chatId, lang: job.data.language || 'id' })
    .catch((err) => logger.warn('Gamification recordGenerate failed (multi-scene)', err));

  for (const sp of sceneVideos) { try { fs.unlinkSync(sp); } catch (_) {} }
}

export { processSingleScene, processExtendedScenes };
