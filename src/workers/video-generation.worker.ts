/**
 * Video Generation Worker
 *
 * BullMQ worker that processes video generation jobs off the videoQueue.
 * Supports single-scene (fallback chain) and multi-scene (extended/chaining) flows.
 * On success: updates VideoService, sends video to user via Telegram.
 * On failure: refunds credits, notifies user.
 */

import { Worker, Job } from 'bullmq';
import { redis, bullmqRedis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { runWithCorrelation } from '@/utils/correlation';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { VideoService } from '@/services/video.service';
import { UserService } from '@/services/user.service';
import { GeminiGenService } from '@/services/geminigen.service';
import type { VideoFallbackResult } from "@/services/video-fallback.service";
import { generateVideoWithFallback } from '@/services/video-fallback.service';
import { getVideoCreditCostAsync } from '@/config/pricing';
import { actionableError } from '@/utils/errors';
import { AIConfigService } from '@/services/ai-config.service';
import { promisify } from 'util';
import { execFile as execFileCallback } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Telegram } from 'telegraf';
import {
  MARKETING_HOOKS, MARKETING_CTAS,
  CATEGORY_TO_VOICE, AI_VOICE_PROFILES,
} from '@/config/audio-subtitle-engine';
import { VideoPostProcessing } from '@/services/video-post-processing.service';
import { AudioVOService } from '@/services/audio-vo.service';
import { QualityCheckService } from '@/services/quality-check.service';
import { WatermarkService } from '@/services/watermark.service';
import { GamificationService } from '@/services/gamification.service';
import { prisma } from '@/config/database';
import { getAILabel, getLangConfig } from '@/config/languages';
import { t } from '@/i18n/translations';
import { ConfigError, ProviderError } from '@/utils/app-errors';

const execFile = promisify(execFileCallback);

const VIDEO_DIR = getConfig().VIDEO_DIR;

// ── Progress notification helpers ──

/** Send a silent progress message to the user (no notification sound). */
async function notifyProgress(telegram: Telegram, chatId: number, text: string): Promise<void> {
  try {
    await telegram.sendMessage(chatId, text, { disable_notification: true });
  } catch (err) {
    logger.warn('Failed to send progress notification:', err);
  }
}

/**
 * Start a timeout watcher that sends a "still processing" message
 * if the job exceeds the given threshold (ms). Returns a cancel function.
 */
function startTimeoutWatcher(
  telegram: Telegram,
  chatId: number,
  thresholdMs: number = 4 * 60 * 1000
): () => void {
  const timer = setTimeout(() => {
    notifyProgress(
      telegram,
      chatId,
      '\u23f3 Still processing... Taking longer than usual. We\u2019ll notify you when ready.'
    );
  }, thresholdMs);

  return () => clearTimeout(timer);
}

// ── Job payload type ──

export interface VideoGenerationJobData {
  jobId: string;
  niche: string;
  platform: string;
  duration: number;
  scenes: number;
  storyboard: Array<{ scene: number; duration: number; description: string }>;
  referenceImage?: string | null;
  customPrompt?: string;
  userId: string;   // bigint serialised as string
  chatId: number;
  enableVO?: boolean;
  enableSubtitles?: boolean;
  language?: string;
  campaignGroupId?: string;
  campaignTotal?: number;
  voScript?: string; // Pro mode: user-provided VO script (skip AI generation)
  userImages?: Array<{ sceneIndex: number; url: string }>; // Pro mode: per-scene user images
  correlationId?: string;
  cacheAsTemplate?: boolean; // Signal to cache completed video as niche template
  cacheNiche?: string;
  creditCost?: number; // Actual cost charged at enqueue time; used for accurate refunds
}

// ── Helpers (mirrored from create.ts) ──

function buildPrompt(description: string, platform: string, duration: number, customPrompt?: string): string {
  const base = customPrompt
    ? `${duration}s ${customPrompt}. Scene context: ${description}`
    : `${duration}s ${description}`;
  return `${base}, high quality, ${platform} format, professional style`;
}

function getAspectRatio(platform: string): string {
  const ratios: Record<string, string> = {
    tiktok: '9:16',
    shorts: '9:16',
    reels: '9:16',
    facebook: '16:9',
    youtube: '16:9',
    instagram: '4:5',
    square: '1:1',
  };
  return ratios[platform] || '9:16';
}

function getStyleForNiche(niche: string): string {
  const styles: Record<string, string> = {
    trading: 'professional',
    fitness: 'energetic',
    cooking: 'appetizing',
    tech: 'modern',
    travel: 'cinematic',
    education: 'clear',
  };
  return styles[niche] || 'professional';
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  await execFile('wget', ['-q', '--timeout=60', '--tries=2', '-O', outputPath, url]);
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw new ProviderError("download", `Download failed or produced empty file: ${url.slice(0, 80)}`);
  }
}

/**
 * Concatenate video clips with professional niche-aware transitions.
 * Delegates to VideoPostProcessing which dynamically builds xfade filter
 * chains for ANY number of clips using ffprobe-measured durations.
 * Falls back to simple concat on failure.
 */
async function concatenateVideos(
  inputPaths: string[],
  outputPath: string,
  niche?: string
): Promise<void> {
  await VideoPostProcessing.concatenateWithTransitions(inputPaths, outputPath, {
    niche,
    transitionDuration: 0.5,
  });
}

// ── Voice Over Script Generation ──

/**
 * Generate a VO narration script from the storyboard scene descriptions.
 * Uses Gemini API when available; falls back to a template-based approach.
 */
async function generateVOScript(
  niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  _platform: string,
  totalDuration: number,
  language: string = 'id'
): Promise<string> {
  // Try LLM-based generation first
  try {
    const script = await generateVOScriptWithAI(niche, storyboard, language, totalDuration);
    if (script && script.length > 20) return script;
  } catch (err) {
    logger.warn('AI VO script generation failed, using template fallback:', (err as Error).message);
  }

  // Template fallback
  return generateVOScriptTemplate(niche, storyboard, language);
}

/**
 * Generate a natural-sounding VO script using Gemini.
 */
async function generateVOScriptWithAI(
  niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  language: string,
  totalDuration: number
): Promise<string> {
  const GEMINI_API_KEY = getConfig().GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) throw new ConfigError('GEMINI_API_KEY');

  const [promptsCfg, taskCfg] = await Promise.all([
    AIConfigService.getPromptsConfig().catch(() => null),
    AIConfigService.getTaskConfig('voNarration').catch(() => null),
  ]);

  const model = taskCfg?.model || 'llama-3.3-70b-versatile';

  const sceneDescriptions = storyboard.map((s, i) =>
    `Scene ${i + 1} (${s.duration}s): ${s.description}`
  ).join('\n');

  const langLabel = getAILabel(language);
  const wpm = getLangConfig(language).readingSpeedWpm;
  const wordBudget = Math.round((totalDuration * wpm) / 60);

  let prompt: string;
  if (promptsCfg?.voNarration) {
    prompt = promptsCfg.voNarration
      .replace(/{niche}/g, niche)
      .replace(/{duration}/g, String(totalDuration))
      .replace(/{language}/g, langLabel)
      .replace(/{sceneDescriptions}/g, sceneDescriptions)
      .replace(/{wordBudget}/g, String(wordBudget));
  } else {
    prompt = `Generate a ${langLabel} voiceover narration script for a ${niche} marketing video.

Scenes:
${sceneDescriptions}

Total duration: ${totalDuration} seconds.

Requirements:
- Write the narration in ${langLabel}, natural and conversational tone
- Keep it concise — the spoken words must fit within ${totalDuration} seconds (roughly ${wordBudget} words)
- Flow naturally from scene to scene
- Start with an attention hook
- End with a soft call-to-action
- Do NOT include scene labels, timestamps, or stage directions
- Output ONLY the narration text, nothing else`;
  }

  // Use Groq if task is configured for it, otherwise fall back to Gemini
  const provider = taskCfg?.provider || 'groq';
  if (provider === 'groq') {
    const GROQ_API_KEY = getConfig().GROQ_API_KEY || '';
    if (GROQ_API_KEY) {
      const { default: axios } = await import('axios');
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 512,
        },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          timeout: 30000,
        }
      );
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError("groq", "Empty response");
      return text.trim();
    }
    // Fall through to Gemini if no Groq key
  }

  const geminiModel = provider === 'gemini' ? (taskCfg?.model || 'gemini-2.5-flash') : 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;

  const { default: axios } = await import('axios');
  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
  }, { timeout: 30000 });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ProviderError("gemini", "Empty response");

  // Track VO script generation cost
  const usageMeta = response.data?.usageMetadata;
  if (usageMeta) {
    const { trackTokens } = await import('../services/token-tracker.service.js');
    trackTokens({ provider: 'gemini-direct', model: geminiModel, service: 'vo_script_generation', promptTokens: usageMeta.promptTokenCount || 0, completionTokens: usageMeta.candidatesTokenCount || 0 }).catch(err => logger.warn('Token tracking failed', { error: (err as Error).message }));
  }

  return text.trim();
}

/**
 * Template-based VO script fallback when Gemini is unavailable.
 */
function generateVOScriptTemplate(
  _niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  language: string
): string {
  const hook = MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  const cta = MARKETING_CTAS[Math.floor(Math.random() * MARKETING_CTAS.length)];

  if (language === 'en') {
    const sceneNarrations = storyboard.map(s => s.description).filter(Boolean);
    const middle = sceneNarrations.length > 0
      ? sceneNarrations.slice(0, 3).join('. ')
      : 'Discover something special today.';
    return `Check this out. ${middle}. Don't miss it — see the details now.`;
  }

  // Indonesian default
  const sceneNarrations = storyboard.map(s => s.description).filter(Boolean);
  const middle = sceneNarrations.length > 0
    ? sceneNarrations.slice(0, 3).join('. ')
    : 'Temukan sesuatu yang istimewa hari ini.';

  return `${hook.charAt(0).toUpperCase() + hook.slice(1)}. ${middle}. ${cta.charAt(0).toUpperCase() + cta.slice(1)}.`;
}

/**
 * Apply the full VO pipeline to a video file.
 * Resilient: if any step fails, returns the original video path.
 */
async function applyVOPipeline(
  videoPath: string,
  jobId: string,
  niche: string,
  platform: string,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
  totalDuration: number,
  options: { enableVO: boolean; enableSubtitles: boolean; language?: string; voScript?: string },
  telegram: Telegram,
  chatId: number
): Promise<string> {
  try {
    // Use user language preference, fallback to niche-based voice
    const language: string = options.language || (() => {
      const voiceKey = CATEGORY_TO_VOICE[niche] || 'indonesian_female_soft';
      const voiceProfile = AI_VOICE_PROFILES[voiceKey];
      return voiceProfile?.language === 'en' ? 'en' as const : 'id' as const;
    })();

    // Step 1: Generate VO script (or use user-provided one from Pro mode)
    await notifyProgress(telegram, chatId, '\ud83c\udfa4 Generating voice over script...');
    const script = options.voScript || await generateVOScript(niche, storyboard, platform, totalDuration, language);
    logger.info(`VO script generated for ${jobId}: ${script.slice(0, 80)}...`);

    if (options.enableVO && options.enableSubtitles) {
      // Full pipeline: TTS + merge + subtitles
      await notifyProgress(telegram, chatId, '\ud83c\udf99\ufe0f Recording voice over...');
      const result = await AudioVOService.fullVOPipeline(videoPath, script, niche, jobId, { language });
      if (result.success && result.outputPath) {
        await notifyProgress(telegram, chatId, '\ud83c\udfb5 Audio mixing complete!');
        return result.outputPath;
      }
      logger.warn(`Full VO pipeline failed for ${jobId}: ${result.error}. Delivering raw video.`);
      await telegram.sendMessage(chatId, t('worker.vo_failed', options.language || 'id')).catch(() => {});
      return videoPath;
    }

    if (options.enableVO && !options.enableSubtitles) {
      // VO only: TTS + merge, no subtitle burn
      await notifyProgress(telegram, chatId, '\ud83c\udf99\ufe0f Recording voice over...');
      const tts = await AudioVOService.generateTTS(script, niche, jobId, language);
      if (!tts.success || !tts.audioPath) {
        logger.warn(`TTS failed for ${jobId}: ${tts.error}. Delivering raw video.`);
        return videoPath;
      }

      await notifyProgress(telegram, chatId, '\ud83c\udfb5 Mixing audio...');
      const merge = await AudioVOService.mergeAudioVideo(videoPath, tts.audioPath);
      if (merge.success && merge.outputPath) {
        return merge.outputPath;
      }
      logger.warn(`Audio merge failed for ${jobId}: ${merge.error}. Delivering raw video.`);
      return videoPath;
    }

    if (!options.enableVO && options.enableSubtitles) {
      // Subtitles only: TTS for timing data, burn subtitles, but don't merge audio
      await notifyProgress(telegram, chatId, '\ud83d\udcdd Generating subtitles...');
      const tts = await AudioVOService.generateTTS(script, niche, jobId, language);
      if (!tts.success || !tts.subtitleBlocks || tts.subtitleBlocks.length === 0) {
        logger.warn(`TTS/subtitle generation failed for ${jobId}. Delivering raw video.`);
        return videoPath;
      }

      const srtPath = path.join(getConfig().AUDIO_DIR || '/tmp/audio', `${jobId}.srt`);
      AudioVOService.generateSRT(tts.subtitleBlocks, srtPath);

      await notifyProgress(telegram, chatId, '\ud83d\udcdd Burning subtitles...');
      const burn = await AudioVOService.burnSubtitles(videoPath, srtPath);
      if (burn.success && burn.outputPath) {
        return burn.outputPath;
      }
      logger.warn(`Subtitle burn failed for ${jobId}: ${burn.error}. Delivering raw video.`);
      return videoPath;
    }

    // Neither VO nor subtitles enabled
    return videoPath;
  } catch (err) {
    logger.error(`VO pipeline error for ${jobId}: ${(err as Error).message}. Delivering raw video.`);
    await telegram.sendMessage(chatId, t('worker.vo_failed', options.language || 'id')).catch(() => {});
    return videoPath;
  }
}

// ── Single-scene generation ──

async function processSingleScene(
  job: Job<VideoGenerationJobData>,
  telegram: Telegram
): Promise<void> {
  const { jobId, niche, platform, duration, storyboard, referenceImage, customPrompt, userId, chatId } = job.data;
  const telegramId = BigInt(userId);

  // Guard: if job was already processed (refunded/completed) on a previous attempt, skip
  const existingVideo = await VideoService.getByJobId(jobId);
  if (existingVideo && (existingVideo.status === 'failed' || existingVideo.status === 'completed')) {
    logger.warn(`Job ${jobId} already ${existingVideo.status} — skipping retry to prevent free generation`);
    return;
  }

  const cancelTimeout = startTimeoutWatcher(telegram, chatId);

  await job.updateProgress(10);

  // Send initial progress after a short delay so user knows work started
  const initialTimer = setTimeout(() => {
    notifyProgress(telegram, chatId, '\ud83c\udfac Generating your video... This usually takes 1-3 minutes.');
  }, 30_000);

  const scene = storyboard[0];
  const prompt = buildPrompt(scene.description, platform, duration, customPrompt);

  const result = await generateVideoWithFallback({
    prompt,
    duration,
    aspectRatio: getAspectRatio(platform),
    style: getStyleForNiche(niche),
    niche,
    referenceImage,
  });

  clearTimeout(initialTimer);
  await job.updateProgress(60);

  if (!result.success || !result.videoUrl) {
    cancelTimeout();
    // Check if already refunded (prevent double refund on BullMQ retry)
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') {
      logger.warn(`Job ${jobId} already failed/refunded — skipping duplicate refund`);
      return;
    }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', result.error);
    // Atomic lock to prevent double-refund on BullMQ retry
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) {
      logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`);
    } else {
      await UserService.refundCredits(telegramId, creditCost, jobId, result.error || 'Generation failed');
    }
    const userMessage = actionableError(result.error || 'Generation failed', { jobId });
    const { t: tFail } = await import('../i18n/translations.js');
    const failLang = job.data.language || 'id';
    await telegram.sendMessage(
      chatId,
      `${tFail('gen.video_failed_refund', failLang)}\n\nJob ID: ${jobId}\n${userMessage}`,
    );
    return;
  }

  logger.info(`Video generated via ${result.provider} for job ${jobId}`);
  await job.updateProgress(80);

  await notifyProgress(telegram, chatId, '\u2705 Video generated! Downloading and processing...');

  const localPath = path.join(VIDEO_DIR, `${jobId}.mp4`);
  await downloadVideo(result.videoUrl, localPath);

  // Watermark removal: detect and clean any provider watermarks (free: Gemini + FFmpeg)
  try {
    const cleanedPath = await WatermarkService.cleanVideo(localPath);
    if (cleanedPath !== localPath) {
      // Replace original with cleaned version
      fs.unlinkSync(localPath);
      fs.renameSync(cleanedPath, localPath);
      logger.info(`🧹 Video watermark removed for ${jobId}`);
    }
  } catch (wmErr) {
    logger.warn(`🧹 Watermark removal skipped: ${(wmErr as Error).message}`);
  }

  // Quality check: score the video before delivery (max 1 retry)
  try {
    await notifyProgress(telegram, chatId, '\ud83d\udd0d Running quality check...');
    const qcResult = await QualityCheckService.scoreVideo(localPath, niche, duration, !!referenceImage);

    // Store quality score in video metadata (best-effort)
    try {
      // prisma imported at top level
      await prisma.video.update({
        where: { jobId },
        data: { generationMetadata: { qualityScore: qcResult.score, qualityIssues: qcResult.issues } },
      });
    } catch (_) { /* metadata update is best-effort */ }

    // Check if this is already a retry (tracked via Redis key)
    const qcAttemptKey = `qc_retry:${jobId}`;
    const isRetry = await redis.get(qcAttemptKey);

    if (!qcResult.passable && !isRetry) {
      logger.warn(`[QualityCheck] Video ${jobId} scored ${qcResult.score}/10 -- retrying with different provider`);
      await redis.set(qcAttemptKey, '1', 'EX', 600);

      // Clean up low-quality video
      try { fs.unlinkSync(localPath); } catch (_) { /* ignore */ }

      // Retry generation with enhanced prompt
      await notifyProgress(telegram, chatId, '\ud83d\udd04 Improving quality... Regenerating video.');
      const retryResult = await generateVideoWithFallback({
        prompt: `High quality commercial ${niche} content. ${buildPrompt(storyboard[0].description, platform, duration, customPrompt)}`,
        duration,
        aspectRatio: getAspectRatio(platform),
        style: getStyleForNiche(niche),
        niche,
        referenceImage,
      });

      if (retryResult.success && retryResult.videoUrl) {
        await downloadVideo(retryResult.videoUrl, localPath);
        logger.info(`[QualityCheck] Retry succeeded via ${retryResult.provider} for job ${jobId}`);
      } else {
        // Retry failed -- re-download original
        logger.warn(`[QualityCheck] Retry failed for ${jobId}, delivering original`);
        await downloadVideo(result.videoUrl, localPath);
      }
    } else {
      logger.info(`[QualityCheck] Video ${jobId} passed with score ${qcResult.score}/10`);
    }
  } catch (qcErr) {
    logger.warn(`[QualityCheck] Quality check error for ${jobId}, delivering as-is:`, (qcErr as Error).message);
  }

  // Apply Voice Over pipeline (if enabled)
  const enableVO = job.data.enableVO !== false;    // default ON
  const enableSubtitles = job.data.enableSubtitles !== false; // default ON
  let deliveryPath = localPath;

  if (enableVO || enableSubtitles) {
    deliveryPath = await applyVOPipeline(
      localPath, jobId, niche, platform, storyboard, duration,
      { enableVO, enableSubtitles, language: job.data.language, voScript: job.data.voScript },
      telegram, chatId
    );
  } else {
    await notifyProgress(telegram, chatId, '\ud83d\udce6 Almost ready! Preparing delivery...');
  }

  await VideoService.setOutput(jobId, { videoUrl: result.videoUrl, downloadUrl: deliveryPath });
  await job.updateProgress(100);

  cancelTimeout();

  // Cache as template if flagged (first free trial per niche — zero cost for future users)
  if (job.data.cacheAsTemplate && job.data.cacheNiche) {
    try {
      const { TemplateVideoService } = await import('../services/template-video.service.js');
      await TemplateVideoService.cacheGeneratedVideo(
        job.data.cacheNiche,
        result.videoUrl || deliveryPath,
        undefined,
        duration,
      );
      logger.info(`Cached template video for niche: ${job.data.cacheNiche}`);
    } catch (cacheErr) {
      logger.warn('Failed to cache template video', { error: (cacheErr as Error).message });
    }
  }

  if (job.data.campaignGroupId) {
    await handleCampaignJobComplete(
      telegram, chatId,
      job.data.campaignGroupId, job.data.campaignTotal || 5,
      deliveryPath, result.videoUrl || '', niche, job.data.userId,
    );
  } else {
    await sendVideoToUser(telegram, chatId, jobId, duration, platform, deliveryPath, niche, storyboard);
  }

  // Record generate for gamification (streak + badges) — best-effort
  GamificationService.recordGenerate(telegramId, {
    telegram,
    chatId,
    lang: job.data.language || 'id',
  }).catch((err) => logger.warn('Gamification recordGenerate failed (single-scene)', err));
}

// ── Multi-scene (extended) generation ──

async function processExtendedScenes(
  job: Job<VideoGenerationJobData>,
  telegram: Telegram
): Promise<void> {
  const { jobId, niche, platform, duration, scenes, storyboard, referenceImage, customPrompt, userId, chatId } = job.data;
  const telegramId = BigInt(userId);

  // Guard: if job was already processed on a previous attempt, skip
  const existingVideoExt = await VideoService.getByJobId(jobId);
  if (existingVideoExt && (existingVideoExt.status === 'failed' || existingVideoExt.status === 'completed')) {
    logger.warn(`Extended job ${jobId} already ${existingVideoExt.status} — skipping retry`);
    return;
  }

  const cancelTimeout = startTimeoutWatcher(telegram, chatId);

  const sceneVideos: string[] = new Array(scenes).fill('');

  // Helper: generate a single scene with 1 retry on failure
  async function generateSceneWithRetry(sceneIndex: number, useExtend: boolean, lastUuidRef: string | null): Promise<{ result: VideoFallbackResult | import("@/services/geminigen.service").VideoGenerationResult; scenePath: string }> {
    const scene = storyboard[sceneIndex];
    const scenePath = path.join(VIDEO_DIR, `${jobId}_scene_${sceneIndex + 1}.mp4`);
    const prompt = buildPrompt(scene.description, platform, scene.duration, customPrompt);

    logger.info(`Generating scene ${sceneIndex + 1}/${scenes} for job ${jobId}: ${scene.description}`);

    let result: VideoFallbackResult | import("@/services/geminigen.service").VideoGenerationResult;

    // Use per-scene generated image as reference if available (from image_set flow)
    const sceneRef = job.data.userImages?.find(u => u.sceneIndex === sceneIndex)?.url || referenceImage;

    // First attempt
    if (sceneIndex === 0) {
      result = await generateVideoWithFallback({
        prompt,
        duration: scene.duration,
        aspectRatio: getAspectRatio(platform),
        style: getStyleForNiche(niche),
        niche,
        referenceImage: sceneRef,
      });
    } else if (useExtend && lastUuidRef) {
      try {
        result = await GeminiGenService.generateExtend({ prompt, refHistory: lastUuidRef });
      } catch (extendErr) {
        logger.warn(`Scene ${sceneIndex + 1} extend failed, falling back to standalone: ${(extendErr as Error).message}`);
        result = await generateVideoWithFallback({
          prompt,
          duration: scene.duration,
          aspectRatio: getAspectRatio(platform),
          style: getStyleForNiche(niche),
          niche,
          referenceImage: sceneRef,
        });
      }
    } else {
      result = await generateVideoWithFallback({
        prompt,
        duration: scene.duration,
        aspectRatio: getAspectRatio(platform),
        style: getStyleForNiche(niche),
        niche,
        referenceImage: sceneRef,
      });
    }

    // If first attempt failed, retry once (skip GeminiGen extend on retry)
    if (!result.success || !result.videoUrl) {
      logger.warn(`Scene ${sceneIndex + 1}/${scenes} failed on first attempt: ${result.error}. Retrying...`);
      result = await generateVideoWithFallback({
        prompt,
        duration: scene.duration,
        aspectRatio: getAspectRatio(platform),
        style: getStyleForNiche(niche),
        niche,
        referenceImage: sceneRef,
      });
    }

    if (!result.success || !result.videoUrl) {
      throw new ProviderError("scene-generation", `Scene ${sceneIndex + 1} failed after 2 attempts: ${result.error}`);
    }

    try {
      await downloadVideo(result.videoUrl, scenePath);
    } catch (downloadErr) {
      logger.warn(`Scene ${sceneIndex + 1} download failed, cleaning up partial file:`, downloadErr);
      try { fs.unlinkSync(scenePath); } catch { /* ignore */ }
      throw downloadErr;
    }
    return { result, scenePath };
  }

  // ── Scene 0: generate first (may use referenceImage / GeminiGen extend) ──
  try {
    const { result: _result, scenePath } = await generateSceneWithRetry(0, false, null);
    sceneVideos[0] = scenePath;

    const progress = Math.round((1 / scenes) * 80);
    await job.updateProgress(progress);
    await VideoService.updateProgress(jobId, progress);
    const percent = Math.round((1 / scenes) * 100);
    await notifyProgress(telegram, chatId, `\ud83c\udfac Scene 1/${scenes} complete (${percent}%)`);
  } catch (err) {
    cancelTimeout();
    // Check if already refunded (prevent double refund on BullMQ retry)
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') {
      logger.warn(`Job ${jobId} already failed/refunded (scene 1) — skipping duplicate refund`);
      return;
    }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', (err as Error).message);
    // Atomic lock to prevent double-refund on BullMQ retry
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) {
      logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`);
    } else {
      await UserService.refundCredits(telegramId, creditCost, jobId, (err as Error).message);
    }
    const sceneUserMessage = actionableError((err as Error).message, { jobId });
    await telegram.sendMessage(
      chatId,
      `Video generation failed (scene 1)\n\nJob ID: ${jobId}\n${sceneUserMessage}\n\nCredits refunded.`,
    );
    return;
  }

  // ── Remaining scenes: batched parallel (3 concurrent) ──
  // Skip GeminiGen extend for parallel scenes (requires sequential lastUuid)
  const BATCH_SIZE = 3;
  for (let batchStart = 1; batchStart < scenes; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes);
    const batchPromises: Promise<{ sceneIndex: number; result: VideoFallbackResult | import("@/services/geminigen.service").VideoGenerationResult; scenePath: string }>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(
        generateSceneWithRetry(i, false, null).then(({ result, scenePath }) => ({
          sceneIndex: i,
          result,
          scenePath,
        }))
      );
    }

    const batchResults = await Promise.allSettled(batchPromises);

    // Process results — skip failed scenes instead of aborting the whole job
    let batchFailures = 0;
    for (const settled of batchResults) {
      if (settled.status === 'rejected') {
        batchFailures++;
        logger.warn(`Batch scene failed (will skip): ${settled.reason?.message}`);
        // Leave sceneVideos[sceneIndex] as empty string — filtered out before concat
        continue;
      }
      const { sceneIndex, scenePath } = settled.value;
      sceneVideos[sceneIndex] = scenePath;
    }
    if (batchFailures > 0) {
      await notifyProgress(telegram, chatId, `⚠️ ${batchFailures} scene(s) skipped — continuing with remaining scenes.`);
    }

    // Notify progress for all scenes completed in this batch
    const completedCount = batchEnd;
    const progress = Math.round((completedCount / scenes) * 80);
    await job.updateProgress(progress);
    await VideoService.updateProgress(jobId, progress);

    for (let i = batchStart; i < batchEnd; i++) {
      const percent = Math.round(((i + 1) / scenes) * 100);
      await notifyProgress(telegram, chatId, `\ud83c\udfac Scene ${i + 1}/${scenes} complete (${percent}%)`);
    }
  }

  // Concatenate scenes with professional niche-aware transitions
  await notifyProgress(telegram, chatId, `\u2702\ufe0f Combining ${scenes} scenes...`);

  const rawConcatPath = path.join(VIDEO_DIR, `${jobId}_raw.mp4`);
  const finalPath = path.join(VIDEO_DIR, `${jobId}.mp4`);
  const successfulScenes = sceneVideos.filter(p => p && fs.existsSync(p));
  if (successfulScenes.length === 0) {
    cancelTimeout();
    // Check if already refunded (prevent double refund on BullMQ retry)
    const existingVideo = await VideoService.getByJobId(jobId);
    if (existingVideo?.status === 'failed') {
      logger.warn(`Job ${jobId} already failed/refunded (all scenes) — skipping duplicate refund`);
      return;
    }
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    await VideoService.updateStatus(jobId, 'failed', 'All scenes failed');
    // Atomic lock to prevent double-refund on BullMQ retry
    const refundLockKey = `refund-lock:${jobId}`;
    const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
    if (!lockAcquired) {
      logger.warn(`Refund lock already held for job ${jobId} — skipping duplicate refund`);
    } else {
      await UserService.refundCredits(telegramId, creditCost, jobId, 'All scenes failed');
    }
    const workerLangFail = job.data.language || 'id';
    const { t } = await import('../i18n/translations.js');
    await telegram.sendMessage(chatId, t('gen.video_failed_refund', workerLangFail));
    return;
  }
  // Proportional refund for failed scenes
  const failedSceneCount = scenes - successfulScenes.length;
  if (failedSceneCount > 0) {
    const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(duration);
    const refundAmount = Math.round((creditCost * failedSceneCount / scenes) * 100) / 100;
    if (refundAmount > 0) {
      // Atomic lock to prevent double-refund on BullMQ retry
      const partialRefundLockKey = `refund-lock:${jobId}:partial`;
      const partialLockAcquired = await redis.set(partialRefundLockKey, '1', 'EX', 3600, 'NX');
      if (!partialLockAcquired) {
        logger.warn(`Partial refund lock already held for job ${jobId} — skipping duplicate partial refund`);
      } else {
        await UserService.refundCredits(telegramId, refundAmount, jobId, `${failedSceneCount}/${scenes} scenes failed`)
          .catch((err) => logger.error('CRITICAL: partial scene refund failed', { jobId, refundAmount, err }));
      }
      const workerLang = job.data.language || 'id';
      await telegram.sendMessage(chatId,
        t('worker.partial_refund', workerLang, { amount: refundAmount, count: failedSceneCount })
      ).catch(() => {});
    }
  }

  logger.info(`Concatenating ${successfulScenes.length}/${scenes} scenes for job ${jobId} (niche: ${niche})...`);
  await concatenateVideos(successfulScenes, rawConcatPath, niche);

  // Watermark removal on raw concatenated video
  try {
    const cleanedConcat = await WatermarkService.cleanVideo(rawConcatPath);
    if (cleanedConcat !== rawConcatPath) {
      fs.unlinkSync(rawConcatPath);
      fs.renameSync(cleanedConcat, rawConcatPath);
      logger.info(`🧹 Multi-scene watermark removed for ${jobId}`);
    }
  } catch (wmErr) {
    logger.warn(`🧹 Multi-scene watermark removal skipped: ${(wmErr as Error).message}`);
  }

  // Post-processing: color grading
  await notifyProgress(telegram, chatId, '\ud83c\udfa8 Applying color grading...');
  try {
    await VideoPostProcessing.postProcess(rawConcatPath, finalPath, {
      niche,
      platform,
      colorGrade: true,
    });
    logger.info(`Post-processing complete for job ${jobId}`);
  } catch (ppErr) {
    logger.warn(`Post-processing failed for job ${jobId}, using raw concat: ${(ppErr as Error).message}`);
    // Fallback: use raw concatenated video
    if (fs.existsSync(rawConcatPath)) {
      fs.copyFileSync(rawConcatPath, finalPath);
    }
  }

  // Cleanup raw concat temp file
  try { fs.unlinkSync(rawConcatPath); } catch (_) { /* ignore */ }

  // Quality check on final concatenated video
  try {
    await notifyProgress(telegram, chatId, '\ud83d\udd0d Running quality check...');
    const qcResult = await QualityCheckService.scoreVideo(finalPath, niche, duration, !!referenceImage);

    // Store quality score in video metadata (best-effort)
    try {
      // prisma imported at top level
      await prisma.video.update({
        where: { jobId },
        data: { generationMetadata: { qualityScore: qcResult.score, qualityIssues: qcResult.issues } },
      });
    } catch (_) { /* metadata update is best-effort */ }

    if (!qcResult.passable) {
      logger.warn(`[QualityCheck] Multi-scene video ${jobId} scored ${qcResult.score}/10 -- delivering as-is (no retry for multi-scene)`);
    } else {
      logger.info(`[QualityCheck] Multi-scene video ${jobId} passed with score ${qcResult.score}/10`);
    }
  } catch (qcErr) {
    logger.warn(`[QualityCheck] Quality check error for multi-scene ${jobId}:`, (qcErr as Error).message);
  }

  // Apply Voice Over pipeline (if enabled)
  const enableVO = job.data.enableVO !== false;    // default ON
  const enableSubtitles = job.data.enableSubtitles !== false; // default ON
  let deliveryPath = finalPath;

  if (enableVO || enableSubtitles) {
    deliveryPath = await applyVOPipeline(
      finalPath, jobId, niche, platform, storyboard, duration,
      { enableVO, enableSubtitles, language: job.data.language, voScript: job.data.voScript },
      telegram, chatId
    );
  } else {
    await notifyProgress(telegram, chatId, '\ud83d\udce6 Almost ready!');
  }

  // Persist the delivery path to DB so download route can serve it
  await VideoService.setOutput(jobId, { downloadUrl: deliveryPath });
  await job.updateProgress(100);

  cancelTimeout();

  if (job.data.campaignGroupId) {
    await handleCampaignJobComplete(
      telegram, chatId,
      job.data.campaignGroupId, job.data.campaignTotal || 5,
      deliveryPath, '', niche, job.data.userId,
    );
  } else {
    await sendVideoToUser(telegram, chatId, jobId, duration, platform, deliveryPath, niche, storyboard);
  }

  // Record generate for gamification (streak + badges) — best-effort
  GamificationService.recordGenerate(telegramId, {
    telegram,
    chatId,
    lang: job.data.language || 'id',
  }).catch((err) => logger.warn('Gamification recordGenerate failed (multi-scene)', err));

  // Cleanup scene files
  for (const sp of sceneVideos) {
    try { fs.unlinkSync(sp); } catch (_) { /* ignore */ }
  }
}

// ── Caption generation ──

interface GeneratedCaption {
  text: string;
  hashtags: string;
}

const NICHE_HASHTAGS: Record<string, string[]> = {
  fnb: ['foodie', 'foodtok', 'kuliner', 'makananenak', 'resep', 'foodlover'],
  food_culinary: ['foodie', 'foodtok', 'kuliner', 'makananenak', 'resep', 'foodlover'],
  realestate: ['properti', 'rumah', 'realestate', 'investasi', 'homedecor'],
  product: ['produk', 'review', 'unboxing', 'belanja', 'shopee', 'tokopedia'],
  beauty: ['skincare', 'beauty', 'glowup', 'beautytips', 'makeup'],
  beauty_skincare: ['skincare', 'beauty', 'glowup', 'beautytips', 'makeup'],
  fashion: ['ootd', 'fashion', 'style', 'outfit', 'fashiontok'],
  fashion_lifestyle: ['ootd', 'fashion', 'style', 'outfit', 'fashiontok'],
  tech: ['tech', 'gadget', 'teknologi', 'review', 'unboxing'],
  tech_gadgets: ['tech', 'gadget', 'teknologi', 'review', 'unboxing'],
  travel: ['travel', 'jalan2', 'liburan', 'wisata', 'explore'],
  travel_adventure: ['travel', 'jalan2', 'liburan', 'wisata', 'explore'],
  fitness: ['fitness', 'workout', 'gym', 'health', 'fitnesstips'],
  fitness_health: ['fitness', 'workout', 'gym', 'health', 'fitnesstips'],
  education: ['edukasi', 'belajar', 'tips', 'tutorial', 'knowledge'],
  education_knowledge: ['edukasi', 'belajar', 'tips', 'tutorial', 'knowledge'],
  trading: ['trading', 'saham', 'crypto', 'investasi', 'finansial'],
  business_finance: ['bisnis', 'entrepreneur', 'bisnismuda', 'tips', 'sukses'],
  home_decor: ['homedecor', 'rumah', 'interior', 'dekorasi', 'aesthetic'],
};

const PLATFORM_HASHTAG_COUNT: Record<string, number> = {
  tiktok: 8,
  shorts: 5,
  reels: 6,
  instagram: 6,
  youtube: 4,
  facebook: 4,
};

function generateCaption(
  niche: string,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
  platform: string
): GeneratedCaption {
  // Pick a random hook and CTA from marketing engine
  const hook = MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  const cta = MARKETING_CTAS[Math.floor(Math.random() * MARKETING_CTAS.length)];

  // Build description from storyboard scenes (first 2-3 relevant ones)
  const sceneDescriptions = storyboard
    .slice(0, 3)
    .map((s) => s.description)
    .filter(Boolean);

  const sceneText = sceneDescriptions.length > 0
    ? sceneDescriptions[0].charAt(0).toUpperCase() + sceneDescriptions[0].slice(1)
    : '';

  const captionText = sceneText
    ? `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n${sceneText}\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`
    : `${hook.charAt(0).toUpperCase() + hook.slice(1)} \u2728\n\n\ud83d\udc49 ${cta.charAt(0).toUpperCase() + cta.slice(1)}`;

  // Build hashtags based on niche and platform
  const nicheKey = niche.toLowerCase();
  const nicheTags = NICHE_HASHTAGS[nicheKey] || ['viral', 'fyp', 'trending'];
  const baseTags = ['fyp', 'viral'];
  const allTags = [...new Set([...baseTags, ...nicheTags])];

  const maxTags = PLATFORM_HASHTAG_COUNT[platform] || 6;
  const selectedTags = allTags.slice(0, maxTags);
  const hashtags = selectedTags.map((t) => `#${t}`).join(' ');

  return { text: captionText, hashtags };
}

// ── Campaign merge helper ──

/**
 * Called after each campaign job completes instead of notifying the user directly.
 * Tracks completion via Redis. When all jobs are done it merges all videos into one
 * and sends the merged result to the user.
 */
async function handleCampaignJobComplete(
  telegram: Telegram,
  chatId: number,
  campaignGroupId: string,
  campaignTotal: number,
  localPath: string,
  videoUrl: string,
  niche?: string,
  userId?: string,
): Promise<void> {
  const urlsKey = `campaign_grp:${campaignGroupId}:urls`;
  const mergeKey = `campaign_grp:${campaignGroupId}:merging`;

  // Store this job's result (prefer local path which includes VO/subtitles)
  await redis.rpush(urlsKey, JSON.stringify({ localPath, videoUrl }));
  await redis.expire(urlsKey, 86400);

  const completedCount = await redis.llen(urlsKey);
  if (completedCount < campaignTotal) {
    logger.info(`Campaign ${campaignGroupId}: ${completedCount}/${campaignTotal} jobs done`);
    return;
  }

  // All jobs done — acquire merge lock (prevents duplicate merge if race condition)
  // Acquire merge lock — only the first worker to set the key proceeds
  const lockAcquired = await redis.set(mergeKey, '1', 'EX', 3600, 'NX');
  if (lockAcquired !== 'OK') return; // another worker is already merging

  try {
    const rawEntries = await redis.lrange(urlsKey, 0, -1);
    const tmpPaths: string[] = [];

    for (let i = 0; i < rawEntries.length; i++) {
      let entry: { localPath?: string; videoUrl?: string };
      try { entry = JSON.parse(rawEntries[i]); } catch { continue; }

      // Prefer local file (still has VO+subs processing)
      if (entry.localPath && fs.existsSync(entry.localPath)) {
        tmpPaths.push(entry.localPath);
        continue;
      }
      // Fall back to downloading from CDN
      if (entry.videoUrl) {
        const dlPath = path.join(VIDEO_DIR, `campaign_${campaignGroupId}_dl${i}.mp4`);
        try {
          await downloadVideo(entry.videoUrl, dlPath);
          tmpPaths.push(dlPath);
        } catch (dlErr) {
          logger.warn(`Campaign ${campaignGroupId}: failed to download part ${i}:`, dlErr);
        }
      }
    }

    if (tmpPaths.length === 0) {
      const { t: tCampaign } = await import('../i18n/translations.js');
      await telegram.sendMessage(chatId, tCampaign('gen.campaign_failed', 'id'));
      return;
    }

    const dbUserForLang = userId && userId !== '0' ? await UserService.findByTelegramId(BigInt(userId)) : null;
    const lang = dbUserForLang?.language || 'id';

    if (tmpPaths.length === 1) {
      await telegram.sendVideo(chatId, { source: tmpPaths[0] }, {
        caption: t('gen.campaign_done_single', lang, { count: '1', total: String(campaignTotal) }),
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🎬 Buat Lagi', callback_data: 'create_video_new' }]] },
      });
    } else {
      const mergedPath = path.join(VIDEO_DIR, `campaign_merged_${campaignGroupId}.mp4`);
      try {
        await concatenateVideos(tmpPaths, mergedPath, niche);
        await telegram.sendVideo(chatId, { source: mergedPath }, {
          caption: t('gen.campaign_done_all', lang, { total: String(tmpPaths.length) }),
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎬 Buat Campaign Lagi', callback_data: 'action_campaign' }],
              [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }],
            ],
          },
        });
      } catch (mergeErr) {
        logger.error(`Campaign merge failed for ${campaignGroupId}:`, mergeErr);
        await telegram.sendVideo(chatId, { source: tmpPaths[0] }, {
          caption: `✅ Campaign selesai — mengirim video pertama (merge gagal).`,
          parse_mode: 'Markdown',
        });
      } finally {
        try { fs.unlinkSync(mergedPath); } catch (_) { /* file may not exist */ }
      }
    }
  } finally {
    // Cleanup Redis
    await redis.del(urlsKey).catch(err => logger.warn('Redis cleanup failed', { error: (err as Error).message }));
    await redis.del(mergeKey).catch(err => logger.warn('Redis cleanup failed', { error: (err as Error).message }));
  }
}

// ── Notification helper ──

async function sendVideoToUser(
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
    // Build download URL
    const webhookUrl = getConfig().WEBHOOK_URL.replace(/\/webhook.*$/, '');
    const video = await VideoService.getByJobId(jobId);
    const userId = video?.userId?.toString() || '0';
    const jwtSecret = getConfig().JWT_SECRET;
    if (!jwtSecret) throw new ConfigError('JWT_SECRET');
    const downloadToken = (await import('jsonwebtoken')).default.sign(
      { telegramId: userId, jobId },
      jwtSecret,
      { expiresIn: '30d' },
    );
    const downloadUrl = `${webhookUrl}/video/${jobId}/download?token=${downloadToken}`;

    // Look up user language for localized notification
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
        [
          { text: t('video.btn_good', lang), callback_data: `feedback_good_${jobId}` },
          { text: t('video.btn_needs_work', lang), callback_data: `feedback_bad_${jobId}` },
        ],
        [
          { text: t('video.btn_create_another', lang), callback_data: 'create_video_new' },
          { text: t('video.btn_my_videos', lang), callback_data: 'videos_list' },
        ],
      ],
    };

    if (fs.existsSync(localPath)) {
      // Send local file directly via Telegram
      await telegram.sendVideo(chatId, { source: localPath }, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });
    } else if (video?.videoUrl) {
      // Local file gone but CDN URL available — stream via URL
      try {
        await telegram.sendVideo(chatId, video.videoUrl, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
        });
      } catch {
        // Telegram rejected the CDN URL — send caption with download button only (no provider URL exposed)
        await telegram.sendMessage(
          chatId,
          caption,
          { parse_mode: 'Markdown', reply_markup: replyMarkup },
        );
      }
    } else {
      // No file and no CDN URL — send download link only
      await telegram.sendMessage(
        chatId,
        caption,
        { parse_mode: 'Markdown', reply_markup: replyMarkup },
      );
    }

    // Send first-video beginner tips (Sprint 3.3)
    if (dbUser) {
      const videoCount = await prisma.video.count({ where: { userId: dbUser.telegramId } });
      if (videoCount <= 1) {
        const tips = t('video.first_video_tips', lang);
        await telegram.sendMessage(chatId, tips, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }

    // Send auto-generated caption as a follow-up message
    if (niche && storyboard) {
      try {
        const caption = generateCaption(niche, storyboard, platform);
        await telegram.sendMessage(
          chatId,
          `\ud83d\udccb Suggested Caption:\n\n${caption.text}\n\n${caption.hashtags}\n\n\ud83d\udca1 Copy and paste this when posting!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '\ud83d\udccb Copy Caption', callback_data: `copy_caption_${jobId}` }],
              ],
            },
          }
        );
      } catch (captionErr) {
        logger.warn(`Failed to generate caption for job ${jobId}:`, captionErr);
      }
    }
  } catch (sendErr) {
    logger.error(`Failed to send video notification for job ${jobId}:`, sendErr);
  }
}

// ── Worker initialisation ──

let workerInstance: Worker<VideoGenerationJobData> | null = null;

/**
 * Start the BullMQ video generation worker.
 * Pass the bot instance so the worker can send Telegram notifications.
 * Returns the Worker so callers can listen to events if needed.
 */
export function startVideoWorker(bot: { telegram: Telegram }): Worker<VideoGenerationJobData> {
  if (workerInstance) {
    logger.warn('Video worker already running, returning existing instance');
    return workerInstance;
  }

  // Ensure video directory exists
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
            // Timeout — refund and notify user
            const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(job.data.duration);
            await VideoService.updateStatus(job.data.jobId, 'failed', 'Generation timed out');
            const refundLockKey = `refund-lock:${job.data.jobId}`;
            const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
            if (lockAcquired) {
              await UserService.refundCredits(telegramId, creditCost, job.data.jobId, 'Generation timed out');
            }
            await telegram.sendMessage(job.data.chatId, '❌ Video generation failed. Your credits have been refunded. Please try again.');
            return;
          }

          // Deliver admin-provided media to user
          const { mediaUrl, mediaType } = result;
          await VideoService.upsertForInterception(job.data.jobId, telegramId, mediaUrl);

          const caption = `✅ Video selesai!\n\n📱 Platform: ${job.data.platform.toUpperCase()}\n⏱ Durasi: ${job.data.duration}s\n\nSiap untuk dipublikasikan!`;
          const replyMarkup = {
            inline_keyboard: [
              [{ text: '🎬 Buat Video Lagi', callback_data: 'create_video_new' }],
              [{ text: '📂 Video Saya', callback_data: 'videos_list' }],
            ],
          };

          if (mediaType === 'image') {
            await telegram.sendPhoto(job.data.chatId, mediaUrl, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup });
          } else {
            await telegram.sendVideo(job.data.chatId, mediaUrl, { caption, parse_mode: 'Markdown', reply_markup: replyMarkup });
          }

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

        // Last-resort refund and notification
        try {
          // Check if already refunded (prevent double refund on BullMQ retry)
          const existingVideo = await VideoService.getByJobId(job.data.jobId);
          if (existingVideo?.status === 'failed') {
            logger.warn(`Job ${job.data.jobId} already failed/refunded (catch) — skipping duplicate refund`);
          } else {
            const telegramId = BigInt(job.data.userId);
            const creditCost = job.data.creditCost ?? await getVideoCreditCostAsync(job.data.duration);
            await VideoService.updateStatus(job.data.jobId, 'failed', (error as Error).message);
            // Atomic lock to prevent double-refund on BullMQ retry
            const refundLockKey = `refund-lock:${job.data.jobId}`;
            const lockAcquired = await redis.set(refundLockKey, '1', 'EX', 3600, 'NX');
            if (!lockAcquired) {
              logger.warn(`Refund lock already held for job ${job.data.jobId} — skipping duplicate refund`);
            } else {
              await UserService.refundCredits(telegramId, creditCost, job.data.jobId, (error as Error).message);
            }
            const workerUserMessage = actionableError((error as Error).message, { jobId: job.data.jobId });
            await telegram.sendMessage(
              job.data.chatId,
              `Video generation failed\n\nJob ID: ${job.data.jobId}\n${workerUserMessage}\n\nCredits refunded.`,
            );
          }
        } catch (refundErr) {
          logger.error('Failed to handle job failure cleanup:', refundErr);
        }

        throw error; // Let BullMQ handle retry logic
      }
    }, job.data.correlationId),
    {
      connection: bullmqRedis,
      concurrency: 3,
    }
  );

  workerInstance.on('completed', (job) => {
    logger.info(`Video worker: job ${job.id} completed`);
  });

  workerInstance.on('failed', (job, err) => {
    logger.error(`Video worker: job ${job?.id} failed:`, err);
    sendAdminAlert('critical', 'Video Generation Failed', {
      jobId: job?.id, error: (err as Error)?.message?.slice(0, 300),
    });
  });

  workerInstance.on('error', (err) => {
    logger.error('Video worker error:', err);
    sendAdminAlert('warning', 'Video Worker Error', { error: (err as Error)?.message?.slice(0, 300) });
  });

  logger.info('Video generation worker started (concurrency: 3)');
  return workerInstance;
}
