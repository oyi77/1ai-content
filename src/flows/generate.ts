/**
 * Create Command v3 — Basic/Smart/Pro Mode
 * 
 * Implements the 3-mode generation flow from Master Document v3.0:
 * - Basic: Full auto (AI picks everything, 6 interactions total)
 * - Smart: Choose preset + platform (8 interactions)
 * - Pro: Full control per-scene (11+ interactions)
 * 
 * Entry: /create or tap "Generate Konten" in main menu
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/config/database';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { UserService } from '@/services/user.service';
import { UNIT_COSTS, creditsToUnits } from '@/config/pricing';
import { detectIndustry, generateVideoScenePrompts, generateScenePromptsWithAI, HPAS_SCENES, DURATION_PRESETS } from '@/config/hpas-engine';
import { CampaignService } from '@/services/campaign.service';
import { ContentAnalysisService } from '@/services/content-analysis.service';
import { ImageGenerationService } from '@/services/image.service';
import { enqueueVideoGeneration } from '@/config/queue';
import { generateVideoAsync } from '@/commands/create';
import { t } from '@/i18n/translations';
import { getConfig } from '@/config/env';
import { getCorrelationId } from '@/utils/correlation';
import { sendAdminAlert } from '@/services/admin-alert.service';
import type { DurationPreset, DurationPresetConfig, SceneId } from '@/config/hpas-engine';
import { getPersonaForUser, isPresetAllowedForPersona } from '@/config/personas';

const execFileAsync = promisify(execFile);
const VIDEO_DIR = getConfig().VIDEO_DIR;

/** Reset all generate-flow session fields and return to DASHBOARD.
 *  Field list kept in sync with cleanup in showGenerateMode(). */
function clearGenerateSession(ctx: BotContext): void {
  if (!ctx.session) return;
  const fields = ['generateMode','generateAction','generatePreset','generatePlatform',
    'generateProductDesc','generatePhotoUrl','generateAspectRatio','generateResolution',
    'generateCampaignSize','generateScenes','generateStoryboardMode',
    'generateManualStoryboard','generateManualTranscript','customPresetConfig',
    'generatePhotos','generatePhotoCount'] as const;
  for (const f of fields) delete (ctx.session as unknown as Record<string, unknown>)[f];
  ctx.session.state = 'DASHBOARD';
}

function getStepIndicator(mode: string, step: number): string {
  const totalSteps: Record<string, number> = { basic: 4, smart: 6, pro: 11 };
  const total = totalSteps[mode] || 6;
  return `[${step}/${total}]`;
}

/** Download a URL to a local file. Returns the local path or null on failure. */
async function downloadToLocal(url: string, filename: string): Promise<string | null> {
  try {
    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });
    const localPath = path.join(VIDEO_DIR, filename);
    await execFileAsync('wget', ['-q', '-O', localPath, url]);
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return localPath;
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (err) {
    logger.warn('downloadToLocal failed:', err);
  }
  return null;
}

type GenerateMode = 'basic' | 'smart' | 'pro';
type GenerateAction = 'image_set' | 'video' | 'clone_style' | 'campaign';
type Platform = 'tiktok' | 'instagram' | 'youtube' | 'square';

// ── Step 3 Handler: Product Input (photo or text) ─────────────────────────────

export async function handleProductInput(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
  try {
    const action = ctx.session?.generateAction as GenerateAction || 'video';
    let productDesc = '';
    let photoUrl: string | undefined;

    // Extract input
    if (message.photo) {
      const photos = message.photo as any[];
      const largest = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(largest.file_id);
      photoUrl = fileLink.toString();

      const lang = ctx.session?.userLang || 'id';
      await ctx.reply(t('gen.analyzing_photo', lang), { parse_mode: 'Markdown' });

      const analysis = await ContentAnalysisService.extractPrompt(photoUrl, 'image');
      productDesc = analysis.success && analysis.prompt ? analysis.prompt : t('gen.photo_fallback_desc', ctx.session?.userLang || 'id');
    } else {
      const text = message.text as string;
      if (text && !text.startsWith('/')) {
        productDesc = text;
      } else {
        await ctx.reply(t('gen.send_photo_or_text', ctx.session?.userLang || 'id'));
        return;
      }
    }

    // Save to session
    if (ctx.session) {
      ctx.session.generateProductDesc = productDesc;
      if (photoUrl) ctx.session.generatePhotoUrl = photoUrl;
      ctx.session.state = 'DASHBOARD';
    }

    const mode = ctx.session?.generateMode as GenerateMode || 'basic';

    // Basic mode → auto-set platform/preset/industry, straight to confirm
    if (mode === 'basic') {
      if (ctx.session) {
        ctx.session.generatePreset = 'standard';
        ctx.session.generatePlatform = 'tiktok';
      }
      // Image set in basic mode: still ask for aspect ratio + resolution
      if (action === 'image_set' && !ctx.session?.generateAspectRatio) {
        await showImageAspectRatio(ctx);
        return;
      }
      if (action === 'image_set' && !ctx.session?.generateResolution) {
        await showImageResolution(ctx);
        return;
      }
      await showConfirmScreen(ctx);
      return;
    }

    // Smart mode → if preset+platform already set (user went through smart flow), go to confirm
    if (mode === 'smart' && action === 'video') {
      if (ctx.session?.generatePreset && ctx.session?.generatePlatform) {
        await showConfirmScreen(ctx);
      } else {
        await showSmartPresetSelection(ctx);
      }
      return;
    }

    // Pro mode → show scene review
    if (mode === 'pro' && action === 'video') {
      await showProSceneReview(ctx, productDesc);
      return;
    }

    // Image set → aspect ratio + resolution before confirm
    if (action === 'image_set') {
      if (!ctx.session?.generateAspectRatio) {
        await showImageAspectRatio(ctx);
        return;
      }
      if (!ctx.session?.generateResolution) {
        await showImageResolution(ctx);
        return;
      }
    }

    // Campaign / others → go to confirm
    await showConfirmScreen(ctx);
  } catch (err) {
    logger.error('handleProductInput error', err);
    await ctx.reply(t('gen.input_failed', ctx.session?.userLang || 'id'));
  }
}

// ── Execution Engine ──────────────────────────────────────────────────────────

export async function executeGeneration(ctx: BotContext): Promise<void> {
  const session = ctx.session;
  if (!session) return;

  const telegramId = BigInt(ctx.from!.id);

  // Idempotency lock: prevent double-click from deducting credits twice
  const { redis } = await import('../config/redis.js');
  const lockKey = `generating:${telegramId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
  if (lockAcquired !== 'OK') {
    await ctx.reply(t('gen.already_processing', ctx.session?.userLang || 'id'));
    return;
  }

  const action = session.generateAction as GenerateAction || 'video';
  const productDesc = session.generateProductDesc as string || '';
  const rawPhotoUrl = session.generatePhotoUrl as string | undefined;
  const preset = (session.generatePreset as DurationPreset) || 'standard';
  const platform = session.generatePlatform as Platform || 'tiktok';

  // Download reference image to local file so providers can read it (they check fs.existsSync)
  let photoUrl: string | undefined;
  if (rawPhotoUrl) {
    const localRef = await downloadToLocal(rawPhotoUrl, `ref_${telegramId}_${Date.now()}.jpg`);
    photoUrl = localRef || rawPhotoUrl; // Fall back to URL if download fails
  }

  const presetConfig = preset === 'custom' && session.customPresetConfig
    ? session.customPresetConfig as unknown as DurationPresetConfig
    : DURATION_PRESETS[preset];
  const industry = detectIndustry(productDesc);

  try {
    const user = await UserService.findByTelegramId(telegramId);
    if (!user) { await ctx.reply(t('gen.user_not_found', 'id')); return; }

    const lang = user.language || 'id';
    if (ctx.session) ctx.session.userLang = lang;

    if (user.isBanned) {
      await ctx.reply(t('error.account_banned', lang));
      clearGenerateSession(ctx);
      return;
    }

    // Check daily generation limit for subscribers
    if (user.tier !== 'free') {
      try {
        const { SubscriptionService } = await import('../services/subscription.service.js');
        const limitCheck = await SubscriptionService.canGenerate(BigInt(user.telegramId));
        if (limitCheck && !limitCheck.allowed && limitCheck.reason?.includes('Daily limit')) {
          await ctx.reply(t('gen.daily_limit_reached', lang, { limit: String(limitCheck.reason.match(/\d+/)?.[0] || ''), reset: '24h' }), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }]] },
          });
          clearGenerateSession(ctx);
          return;
        }
      } catch { /* if check fails, allow generation */ }
    }

    const unitBalance = creditsToUnits(Number(user.creditBalance));

    // Cost check — use admin-configured pricing (falls back to static UNIT_COSTS if DB empty)
    const { getUnitCostAsync } = await import('../config/pricing.js');
    let cost = 0;
    if (action === 'image_set') cost = await getUnitCostAsync('IMAGE_SET_7_SCENE');
    else if (action === 'video') cost = await getUnitCostAsync(presetConfig.totalSeconds <= 15 ? 'VIDEO_15S' : presetConfig.totalSeconds <= 30 ? 'VIDEO_30S' : presetConfig.totalSeconds <= 60 ? 'VIDEO_60S' : 'VIDEO_120S');
    else if (action === 'clone_style') cost = await getUnitCostAsync('CLONE_STYLE');
    else if (action === 'campaign') cost = await CampaignService.getCampaignCost((session.generateCampaignSize as 5 | 10) || 5);

    // Free trial check for image_set and video (welcome bonus / daily free)
    let useFreeSlot = false;
    if (unitBalance < cost && (action === 'image_set' || action === 'video')) {
      // For video, only allow free trial for 15s (quick preset)
      if (action === 'video' && presetConfig.totalSeconds > 15) {
        useFreeSlot = false;
      } else {
        const { canUseWelcomeBonus, getNextDailyFreeReset } = await import('../config/free-trial.js');
        if (canUseWelcomeBonus(user)) {
          // Atomic check-and-set to prevent double-claim on concurrent requests
          const updated = await prisma.user.updateMany({
            where: { id: user.id, welcomeBonusUsed: false },
            data: { welcomeBonusUsed: true },
          });
          if (updated.count > 0) {
            useFreeSlot = true;
          }
        }
        if (!useFreeSlot) {
          const dailyClaimed = await prisma.user.updateMany({
            where: { id: user.id, dailyFreeUsed: false },
            data: { dailyFreeUsed: true, dailyFreeResetAt: getNextDailyFreeReset() },
          });
          if (dailyClaimed.count > 0) useFreeSlot = true;
        }
      }
    }

    if (unitBalance < cost && !useFreeSlot) {
      const costCredits = cost / 10;
      const balCredits = unitBalance / 10;
      await ctx.reply(
        t('gen.insufficient_credits', lang, { cost: costCredits, balance: balCredits }),
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]] } }
      );
      clearGenerateSession(ctx);
      return;
    }

    // Serve cached template video for free trial — zero token cost
    if (useFreeSlot) {
      const { TemplateVideoService } = await import('../services/template-video.service.js');
      const userNiche = user.selectedNiche || 'general';
      const template = await TemplateVideoService.getRandom(userNiche);

      if (template) {
        try {
          await ctx.replyWithVideo(template.videoUrl, {
            caption: t('gen.free_trial_video', lang, { niche: userNiche }),
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [
              [{ text: t('btn.create_own', lang), callback_data: 'generate_start' }],
              [{ text: t('btn.topup', lang), callback_data: 'topup' }],
            ]},
          });
        } catch {
          // If video send fails, try as URL link
          await ctx.reply(t('gen.free_trial_video', lang, { niche: userNiche }) + `\n\n[Download](${template.videoUrl})`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [
              [{ text: t('btn.create_own', lang), callback_data: 'generate_start' }],
              [{ text: t('btn.topup', lang), callback_data: 'topup' }],
            ]},
          });
        }
        // Mark welcome bonus as used
        await prisma.user.updateMany({
          where: { telegramId, welcomeBonusUsed: false },
          data: { welcomeBonusUsed: true },
        });
        clearGenerateSession(ctx);
        await redis.del(lockKey).catch(() => {});
        return;
      }
      // No template for this niche — generate one, cache it, and serve it
      // First user per niche pays the cost; all future users get the cached version
      await ctx.reply(t('gen.generating_trial', lang), { parse_mode: 'Markdown' });

      // Generate a 15s video, then cache it as template
      let trialScenes: any[];
      try {
        trialScenes = await generateScenePromptsWithAI(productDesc || userNiche, 'quick', lang === 'en' ? 'en' : 'id');
      } catch {
        trialScenes = generateVideoScenePrompts(industry, productDesc || userNiche, 'quick', (lang === 'en' ? 'en' : 'id'));
      }
      const trialStoryboard = trialScenes.map((s, i: number) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }));

      try {
        const { VideoService: TrialVS } = await import('../services/video.service.js');
        const trialVideo = await TrialVS.createJob({
          userId: telegramId,
          niche: userNiche,
          platform: 'tiktok',
          duration: 15,
          scenes: trialStoryboard.length,
        });

        const { enqueueVideoGeneration } = await import('../config/queue.js');
        await enqueueVideoGeneration({
          jobId: trialVideo.jobId,
          userId: telegramId.toString(),
          chatId: ctx.chat!.id,
          niche: userNiche,
          platform: 'tiktok',
          duration: 15,
          scenes: trialStoryboard.length,
          storyboard: trialStoryboard,
          enableVO: false,
          enableSubtitles: true,
          language: lang,
          cacheAsTemplate: true,
          cacheNiche: userNiche,
        });

        await ctx.reply(t('gen.trial_queued', lang), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
          ]},
        });
      } catch (trialErr) {
        logger.error('Free trial generation failed', { error: trialErr });
        await ctx.reply(t('gen.trial_failed', lang));
      }

      // Mark welcome bonus as used regardless of outcome
      await prisma.user.updateMany({
        where: { telegramId, welcomeBonusUsed: false },
        data: { welcomeBonusUsed: true },
      });
      clearGenerateSession(ctx);
      await redis.del(lockKey).catch(() => {});
      return;
    }

    await ctx.reply(t('gen.generating', lang), { parse_mode: 'Markdown' });

    // Image Set → Video Pipeline (generate 7 scene images, then queue video)
    if (action === 'image_set') {
      let scenes: any[];
      try {
        scenes = await generateScenePromptsWithAI(productDesc, 'standard', lang === 'en' ? 'en' : 'id');
      } catch {
        scenes = generateVideoScenePrompts(industry, productDesc, 'standard', (lang === 'en' ? 'en' : 'id'));
      }
      const creditCost = cost / 10;

      // ── Phase A: Silent image generation with 3x retry per scene ──
      const isLocalRef = photoUrl && !photoUrl.startsWith('http');
      const selectedAR = (session.generateAspectRatio as string) || '9:16';
      const selectedRes = (session.generateResolution || 'standard') as 'standard' | 'hd' | 'ultra';
      const imgParams = {
        category: industry,
        aspectRatio: selectedAR,
        style: 'commercial',
        resolution: selectedRes,
        referenceImageUrl: photoUrl && !isLocalRef ? photoUrl : undefined,
        referenceImagePath: isLocalRef ? photoUrl : undefined,
        mode: (photoUrl ? 'img2img' : 'text2img') as 'img2img' | 'text2img' | 'ip_adapter',
      };

      const userImages: Array<{ sceneIndex: number; url: string }> = [];
      const MAX_RETRIES = 3;

      for (let i = 0; i < Math.min(scenes.length, 7); i++) {
        const scene = scenes[i];
        let scenePrompt = scene.prompt;
        if (photoUrl && productDesc) {
          scenePrompt = `${productDesc}. ${scene.prompt}. IMPORTANT: maintain the exact same product/subject appearance, colors, shape, branding, and details as the reference image.`;
        }

        // Silent retry — no per-scene messages to user
        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          const result = await ImageGenerationService.generateImage({ prompt: scenePrompt, ...imgParams });
          if (result.success && result.imageUrl) {
            userImages.push({ sceneIndex: i, url: result.imageUrl });
            success = true;
            break;
          }
          if (attempt < MAX_RETRIES) logger.warn(`Image scene ${i + 1} attempt ${attempt}/${MAX_RETRIES} failed, retrying silently...`);
        }
        if (!success) logger.error(`Image scene ${i + 1} failed after ${MAX_RETRIES} attempts, skipping`);
      }

      if (userImages.length === 0) {
        await ctx.reply(t('gen.all_scenes_failed', lang));
        clearGenerateSession(ctx);
        return;
      }

      // ── Phase B: Immediately enqueue video job with generated images ──
      const { VideoService: VS } = await import('../services/video.service.js');
      const video = await VS.createJob({
        userId: telegramId,
        niche: industry,
        platform,
        duration: DURATION_PRESETS['standard'].totalSeconds,
        scenes: scenes.length,
        title: `Video ${new Date().toLocaleDateString('id-ID')}`,
      });

      const storyboard = scenes.map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }));

      let imageSetJob: unknown;
      try {
        const enqueueResult = await enqueueVideoGeneration({
          jobId: video.jobId,
          niche: industry,
          platform,
          duration: DURATION_PRESETS['standard'].totalSeconds,
          scenes: scenes.length,
          storyboard,
          referenceImage: photoUrl || null,
          userImages,
          userId: telegramId.toString(),
          chatId: ctx.chat!.id,
          enableVO: true,
          enableSubtitles: true,
          language: user.language || 'id',
          correlationId: getCorrelationId(),
          creditCost,
        });
        imageSetJob = enqueueResult.job || null;
        try {
          await UserService.deductCredits(telegramId, creditCost);
        } catch (deductErr) {
          if (imageSetJob) await (imageSetJob as any).remove().catch(() => {});
          throw deductErr;
        }
        const position = enqueueResult.position;

        // ── Phase C: Non-blocking preview offer ──
        await ctx.reply(
          t('gen.imgset_preview_offer', lang, { count: userImages.length, position }),
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: t('gen.btn_preview_images', lang), callback_data: `imgset_preview_${video.jobId}` }],
                [{ text: t('gen.btn_skip_preview', lang), callback_data: 'imgset_skip' }],
              ],
            },
          },
        );

        // Store image URLs in session for preview callback
        if (ctx.session) {
          ctx.session.stateData = { ...ctx.session.stateData, imgsetPreviewUrls: userImages.map(u => u.url) };
        }
      } catch (enqueueErr) {
        logger.error('Image set video enqueue failed, falling back to direct send:', enqueueErr);
        // Fallback: generate video directly (like the video action fallback)
        generateVideoAsync(ctx, video.jobId, industry, platform, DURATION_PRESETS['standard'].totalSeconds,
          storyboard).catch(async (err) => {
          logger.error('Video generateVideoAsync failed:', err);
          await UserService.refundCredits(telegramId, creditCost, video.jobId, err?.message || 'fallback failure').catch(async (refundErr) => {
            logger.error('CRITICAL: refundCredits failed', { telegramId: telegramId.toString(), creditCost, err: refundErr });
            await UserService.queueRefundRetry(telegramId, creditCost, 'generate-imgset-fallback', String(refundErr));
            sendAdminAlert('critical', 'Refund Failed', { userId: telegramId.toString(), amount: creditCost, error: String(refundErr) });
          });
          await ctx.telegram.sendMessage(ctx.chat!.id, t('gen.video_failed_refund', lang)).catch(() => {});
        });
        await ctx.reply(t('gen.video_processing', lang));
      }
      return;
    }

    // Video generation
    if (action === 'video') {
      // Use manual storyboard if Pro mode provided it, otherwise auto-generate
      const useManualStoryboard = session.generateStoryboardMode === 'manual' && session.generateManualStoryboard?.length;
      let scenes: any[];
      if (useManualStoryboard) {
        scenes = session.generateManualStoryboard!;
      } else {
        try {
          scenes = await generateScenePromptsWithAI(productDesc, preset, lang === 'en' ? 'en' : 'id');
        } catch {
          scenes = generateVideoScenePrompts(industry, productDesc, preset, (lang === 'en' ? 'en' : 'id'));
        }
      }
      const creditCost = cost / 10;

      const { VideoService: VS } = await import('../services/video.service.js');
      const video = await VS.createJob({
        userId: telegramId,
        niche: industry,
        platform,
        duration: presetConfig.totalSeconds,
        scenes: scenes.length,
        title: `Video ${new Date().toLocaleDateString('id-ID')}`,
      });

      const storyboard = useManualStoryboard
        ? scenes.map((s, i: number) => ({ scene: i + 1, duration: s.durationSeconds, description: s.description }))
        : scenes.map((s, i: number) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }));

      try {
        const { job: enqueuedJob, position } = await enqueueVideoGeneration({
          jobId: video.jobId,
          niche: industry,
          platform,
          duration: presetConfig.totalSeconds,
          scenes: scenes.length,
          storyboard,
          referenceImage: photoUrl || null,
          userId: telegramId.toString(),
          chatId: ctx.chat!.id,
          enableVO: true,
          enableSubtitles: true,
          language: user.language || 'id',
          voScript: session.generateManualTranscript || undefined,
          correlationId: getCorrelationId(),
          creditCost,
        });
        try {
          await UserService.deductCredits(telegramId, creditCost);
        } catch (deductErr) {
          await enqueuedJob.remove().catch(() => {});
          throw deductErr;
        }
        await ctx.reply(t('gen.video_queued', lang, { position }));
      } catch {
        generateVideoAsync(ctx, video.jobId, industry, platform, presetConfig.totalSeconds, scenes.map((s, i: number) => ({ scene: i + 1, duration: s.durationSeconds, description: useManualStoryboard ? s.description : s.prompt }))).catch(async (err) => {
          logger.error('Video generateVideoAsync failed:', err);
          await UserService.refundCredits(telegramId, creditCost, video.jobId, err?.message || 'fallback failure').catch(async (refundErr) => { logger.error('CRITICAL: refundCredits failed', { telegramId: telegramId.toString(), creditCost, err: refundErr }); await UserService.queueRefundRetry(telegramId, creditCost, 'generate-fallback', String(refundErr)); sendAdminAlert('critical', 'Refund Failed', { userId: telegramId.toString(), amount: creditCost, error: String(refundErr) }); });
          await ctx.telegram.sendMessage(ctx.chat!.id, t('gen.video_failed_refund', lang)).catch(() => {});
        });
        await ctx.reply(t('gen.video_processing', lang));
      }
      await showPostDelivery(ctx);
      return;
    }

    // Clone Style — extract style from reference photo and queue a video
    if (action === 'clone_style') {
      const creditCost = cost / 10;
      let styleHint = '';

      if (photoUrl) {
        try {
          const analysis = await ContentAnalysisService.extractPrompt(photoUrl, 'image');
          styleHint = analysis.success && analysis.prompt ? `, ${analysis.prompt}` : '';
        } catch {
          // Non-fatal: proceed without style hint
        }
      }

      const combinedPrompt = `${productDesc}${styleHint}`;
      let scenes: any[];
      try {
        scenes = await generateScenePromptsWithAI(combinedPrompt, 'standard', lang === 'en' ? 'en' : 'id');
      } catch {
        scenes = generateVideoScenePrompts(industry, combinedPrompt, 'standard', (lang === 'en' ? 'en' : 'id'));
      }

      const { VideoService: VS2 } = await import('../services/video.service.js');
      const video2 = await VS2.createJob({
        userId: telegramId,
        niche: industry,
        platform,
        duration: DURATION_PRESETS['standard'].totalSeconds,
        scenes: scenes.length,
        title: `Clone Style — ${new Date().toLocaleDateString('id-ID')}`,
      });

      let cloneJob: unknown;
      try {
        const cloneEnqueueResult = await enqueueVideoGeneration({
          jobId: video2.jobId,
          niche: industry,
          platform,
          duration: DURATION_PRESETS['standard'].totalSeconds,
          scenes: scenes.length,
          storyboard: scenes.map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt })),
          referenceImage: photoUrl || null,
          userId: telegramId.toString(),
          chatId: ctx.chat!.id,
          enableVO: true,
          enableSubtitles: true,
          language: user.language || 'id',
          correlationId: getCorrelationId(),
          creditCost,
        });
        cloneJob = cloneEnqueueResult.job || null;
        try {
          await UserService.deductCredits(telegramId, creditCost);
        } catch (deductErr) {
          if (cloneJob) await (cloneJob as any).remove().catch(() => {});
          throw deductErr;
        }
        const position = cloneEnqueueResult.position;
        await ctx.reply(t('gen.video_queued', lang, { position }));
      } catch {
        generateVideoAsync(ctx, video2.jobId, industry, platform, DURATION_PRESETS['standard'].totalSeconds, scenes.map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }))).catch(async (err) => {
          logger.error('Clone style generateVideoAsync failed:', err);
          await UserService.refundCredits(telegramId, creditCost, video2.jobId, err?.message || 'fallback failure').catch(async (refundErr) => { logger.error('CRITICAL: refundCredits failed', { telegramId: telegramId.toString(), creditCost, err: refundErr }); await UserService.queueRefundRetry(telegramId, creditCost, 'generate-fallback', String(refundErr)); sendAdminAlert('critical', 'Refund Failed', { userId: telegramId.toString(), amount: creditCost, error: String(refundErr) }); });
          await ctx.telegram.sendMessage(ctx.chat!.id, t('gen.video_failed_refund', lang)).catch(() => {});
        });
        await ctx.reply(t('gen.video_processing', lang));
      }
      await showPostDelivery(ctx);
      return;
    }

    // Campaign — 1 video with N hook-variation scenes (NOT N separate videos)
    if (action === 'campaign') {
      const campSize = (session.generateCampaignSize as 5 | 10) || 5;
      const creditCost = cost / 10;
      const hookVariations = CampaignService.getHookVariations(campSize);

      // Build a single storyboard: each scene = a different hook variation
      const storyboard = hookVariations.map((hookVar, i) => {
        const hookPrompt = hookVar.promptTemplate
          .replace('{product}', productDesc)
          .replace('{problem}', `masalah ${industry}`);
        return { scene: i + 1, duration: 5, description: `[${hookVar.name}] ${hookPrompt}` };
      });

      const totalDuration = storyboard.reduce((s, sc) => s + sc.duration, 0);

      const { VideoService: VS3 } = await import('../services/video.service.js');
      try {
        const vid = await VS3.createJob({
          userId: telegramId,
          niche: industry,
          platform,
          duration: totalDuration,
          scenes: campSize,
          title: `Campaign ${campSize} Scene — ${productDesc.slice(0, 40)}`,
        });

        let campaignJob: unknown;
        try {
          const enqueueResult2 = await enqueueVideoGeneration({
            jobId: vid.jobId,
            niche: industry,
            platform,
            duration: totalDuration,
            scenes: campSize,
            storyboard,
            referenceImage: photoUrl || null,
            userId: telegramId.toString(),
            chatId: ctx.chat!.id,
            enableVO: true,
            enableSubtitles: true,
            language: user.language || 'id',
            correlationId: getCorrelationId(),
            creditCost,
          });
          campaignJob = enqueueResult2.job || null;
          try {
            await UserService.deductCredits(telegramId, creditCost);
          } catch (deductErr) {
            if (campaignJob) await (campaignJob as any).remove().catch(() => {});
            throw deductErr;
          }
          const position = enqueueResult2.position;
          await ctx.reply(
            t('gen.campaign_processing', lang, { size: campSize, position }),
            { parse_mode: 'Markdown' },
          );
        } catch {
          generateVideoAsync(ctx, vid.jobId, industry, platform, totalDuration, storyboard).catch(async (err) => {
            logger.error('Campaign generateVideoAsync failed:', err);
            await UserService.refundCredits(telegramId, creditCost, vid.jobId, err?.message || 'campaign failure').catch(async (refundErr) => { logger.error('CRITICAL: refundCredits failed', { telegramId: telegramId.toString(), creditCost, err: refundErr }); await UserService.queueRefundRetry(telegramId, creditCost, 'generate-fallback', String(refundErr)); sendAdminAlert('critical', 'Refund Failed', { userId: telegramId.toString(), amount: creditCost, error: String(refundErr) }); });
            await ctx.telegram.sendMessage(ctx.chat!.id, t('gen.campaign_failed', lang)).catch(() => {});
          });
          await ctx.reply(t('gen.video_processing', lang));
        }
      } catch (jobErr) {
        logger.error('Campaign job creation failed:', jobErr);
        await ctx.reply(t('gen.campaign_failed', lang), { parse_mode: 'Markdown' });
        clearGenerateSession(ctx);
        return;
      }
      await showPostDelivery(ctx);
      return;
    }

  } catch (err) {
    logger.error('executeGeneration error', err);
    clearGenerateSession(ctx);
    await ctx.reply(t('gen.generation_failed', ctx.session?.userLang || 'id'));
  } finally {
    // Release idempotency lock
    await redis.del(lockKey).catch(err => logger.warn('Redis cleanup failed', { error: err.message }));
    // Cleanup temp reference image file
    if (photoUrl && !photoUrl.startsWith('http') && fs.existsSync(photoUrl)) {
      try { fs.unlinkSync(photoUrl); } catch { /* ignore */ }
    }
  }
}

// ── Step 1: Mode Selection ────────────────────────────────────────────────────

export async function showGenerateMode(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    // Clear stale session from previous incomplete flows — UNLESS prompt was
    // intentionally pre-filled from prompt library (stateData.selectedPrompt).
    const fromLibrary = !!(ctx.session?.stateData as any)?.selectedPrompt;
    if (!fromLibrary && ctx.session) {
      delete ctx.session.generateMode;
      delete ctx.session.generateAction;
      delete ctx.session.generatePreset;
      delete ctx.session.generatePlatform;
      delete ctx.session.generatePhotoUrl;
      delete ctx.session.generateScenes;
      delete ctx.session.generateCampaignSize;
      delete ctx.session.customPresetConfig;
      delete ctx.session.generateAspectRatio;
      delete ctx.session.generateResolution;
      delete ctx.session.generatePhotos;
      delete ctx.session.generatePhotoCount;
      delete ctx.session.generatePhotoUploadDone;
      delete ctx.session.generateStoryboardMode;
      delete ctx.session.generateManualStoryboard;
      delete ctx.session.generateTranscriptMode;
      delete ctx.session.generateManualTranscript;
      // Only clear prompt if NOT from library
      if (!ctx.session.generateProductDesc || !fromLibrary) {
        delete ctx.session.generateProductDesc;
      }
    }

    // Cache userMode for persona-aware filtering downstream
    if (ctx.session && !ctx.session.userMode) {
      try {
        const { UserService } = await import('@/services/user.service.js');
        const u = await UserService.findByTelegramId(BigInt(ctx.from!.id));
        ctx.session.userMode = u?.userMode || 'content_creator';
      } catch { ctx.session.userMode = 'content_creator'; }
    }

    const lang = ctx.session?.userLang || 'id';
    const prefilledPrompt = ctx.session?.generateProductDesc;
    const text = prefilledPrompt
      ? `🎬 *${t('gen.title', lang)}*\n\nPrompt: \`${prefilledPrompt.slice(0, 50)}${prefilledPrompt.length > 50 ? '...' : ''}\`\n\n${t('gen.select_mode', lang)}`
      : `🎬 *${t('gen.title', lang)}*\n\n${t('gen.select_mode', lang)}`;

    const markup = {
      inline_keyboard: [
        [{ text: t('gen.mode_basic', lang), callback_data: 'mode_basic' }],
        [{ text: t('gen.mode_smart', lang), callback_data: 'mode_smart' }],
        [{ text: t('gen.mode_pro', lang), callback_data: 'mode_pro' }],
        [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
      ],
    };

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    }
  } catch (err) {
    logger.error('showGenerateMode error', err);
  }
}

// ── Step 2: Action Selection ──────────────────────────────────────────────────

export async function showGenerateAction(ctx: BotContext, mode: GenerateMode): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || 'id';

    // Fix 2.5: Pre-creation credit check
    const dbUser = await UserService.findByTelegramId(BigInt(ctx.from!.id));
    if (dbUser) {
      const balance = creditsToUnits(Number(dbUser.creditBalance));
      const minCost = UNIT_COSTS.IMAGE_UNIT; // cheapest possible action
      const { canUseWelcomeBonus, canUseDailyFree } = await import('../config/free-trial.js');
      const hasFreeSlot = canUseWelcomeBonus(dbUser) || canUseDailyFree(dbUser);
      if (balance < minCost && !hasFreeSlot) {
        await ctx.reply(t('gen.no_credits_early', lang, { balance: balance / 10 }), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }], [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }]] },
        });
        return;
      }
    }

    const modeLabel = mode === 'basic' ? '⚡ Basic' : mode === 'smart' ? '🎯 Smart' : '👑 Pro';

    if (ctx.session) {
      ctx.session.generateMode = mode;
    }

    // Fix 2.6: Dynamic credit costs
    const { getUnitCostAsync } = await import('../config/pricing.js');
    const [imgSetCost, videoCost, cloneCost, camp5Cost, camp10Cost] = await Promise.all([
      getUnitCostAsync('IMAGE_SET_7_SCENE'),
      getUnitCostAsync('VIDEO_15S'),
      getUnitCostAsync('CLONE_STYLE'),
      getUnitCostAsync('CAMPAIGN_5_VIDEO'),
      getUnitCostAsync('CAMPAIGN_10_VIDEO'),
    ]);

    const balanceDisplay = dbUser ? ` (${t('gen.balance_label', lang)}: ${creditsToUnits(Number(dbUser.creditBalance)) / 10} cr)` : '';
    const text = `${getStepIndicator(mode, 2)} ${modeLabel} Mode${balanceDisplay}\n\n${t('gen.select_action', lang)}`;

    const markup = {
      inline_keyboard: [
        [{ text: t('gen.action_image_set', lang, { cost: imgSetCost / 10 }), callback_data: 'action_image_set' }],
        [{ text: t('gen.action_video', lang, { cost: videoCost / 10 }), callback_data: 'action_video' }],
        [{ text: t('gen.action_clone_style', lang, { cost: cloneCost / 10 }), callback_data: 'action_clone_style' }],
        [{ text: t('gen.action_campaign', lang, { cost5: camp5Cost / 10, cost10: camp10Cost / 10 }), callback_data: 'action_campaign' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
        [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showGenerateAction error', err);
  }
}

// ── Step 3: Input Prompt ──────────────────────────────────────────────────────

export async function requestProductInput(ctx: BotContext, action: GenerateAction): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    if (ctx.session) {
      ctx.session.generateAction = action;
    }

    const mode = ctx.session?.generateMode as GenerateMode || 'basic';
    const lang = ctx.session?.userLang || 'id';

    // Clone style has its own flow — skip image preference & prompt source
    if (action === 'clone_style') {
      if (ctx.session) ctx.session.state = 'AWAITING_PRODUCT_INPUT';
      await ctx.reply(
        `🔄 *Clone Style*\n\nKirim foto **referensi gaya** yang ingin ditiru.\n(Setelah itu kirim foto produk kamu)`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // ── BASIC MODE: skip all intermediate steps, just ask for input ──
    if (mode === 'basic') {
      if (ctx.session) ctx.session.state = 'AWAITING_PRODUCT_INPUT';
      const text = t('gen.basic_send_input', lang);
      try {
        if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown' });
        else await ctx.reply(text, { parse_mode: 'Markdown' });
      } catch { await ctx.reply(text, { parse_mode: 'Markdown' }); }
      return;
    }

    // ── PRO MODE: multi-image upload flow ──
    if (mode === 'pro') {
      await showProImageUpload(ctx);
      return;
    }

    // ── SMART MODE: if prompt pre-filled → image preference → confirm ──
    const prefilledPrompt = ctx.session?.generateProductDesc;
    if (prefilledPrompt) {
      if (ctx.session) ctx.session.state = 'DASHBOARD';
      if (ctx.session?.generatePhotoUrl) {
        await continueAfterImagePreference(ctx);
      } else {
        await showImagePreference(ctx);
      }
      return;
    }

    // Smart mode (no prompt yet): show image preference first, then prompt source
    if (ctx.session?.generatePhotoUrl) {
      await showPromptSourceSelection(ctx);
    } else {
      await showImagePreference(ctx);
    }
  } catch (err) {
    logger.error('requestProductInput error', err);
  }
}

// ── Image Preference (for prompt library / pre-filled prompts) ────────────────

/** Show image preference screen: user can upload a reference image or skip */
export async function showImagePreference(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || 'id';
    const text = t('gen.image_pref_title', lang);

    const markup = {
      inline_keyboard: [
        [{ text: t('gen.btn_upload_ref', lang), callback_data: 'image_pref_upload' }],
        [{ text: t('gen.btn_skip_ref', lang), callback_data: 'image_pref_skip' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showImagePreference error', err);
  }
}

/** Continue the flow after image preference has been resolved (uploaded or skipped) */
export async function continueAfterImagePreference(ctx: BotContext): Promise<void> {
  const prefilledPrompt = ctx.session?.generateProductDesc as string || '';

  // No prompt yet → ask user to choose prompt source (library or custom)
  if (!prefilledPrompt) {
    await showPromptSourceSelection(ctx);
    return;
  }

  // Prompt exists → continue to preset/confirm based on mode
  const mode = ctx.session?.generateMode as GenerateMode || 'basic';
  const action = ctx.session?.generateAction as GenerateAction || 'video';

  // Image set: route to aspect ratio → resolution → confirm
  if (action === 'image_set') {
    if (!ctx.session?.generateAspectRatio) {
      await showImageAspectRatio(ctx);
    } else if (!ctx.session?.generateResolution) {
      await showImageResolution(ctx);
    } else {
      await showConfirmScreen(ctx);
    }
    return;
  }

  if (mode === 'basic') {
    await showConfirmScreen(ctx);
    return;
  }
  if (mode === 'smart' && action === 'video') {
    if (ctx.session?.generatePreset && ctx.session?.generatePlatform) {
      await showConfirmScreen(ctx);
    } else {
      await showSmartPresetSelection(ctx);
    }
    return;
  }
  if (mode === 'pro' && action === 'video') {
    // Pro: prompt → storyboard choice → transcript choice → duration → platform → scene review → confirm
    await showProStoryboardChoice(ctx);
    return;
  }
  await showConfirmScreen(ctx);
}

/** Show prompt source selection: library or custom input */
export async function showPromptSourceSelection(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || 'id';
    const action = ctx.session?.generateAction as GenerateAction || 'video';
    const actionLabel = action === 'image_set' ? 'gambar' : action === 'campaign' ? 'campaign' : 'video';

    const text = t('gen.prompt_source_title', lang, { action: actionLabel });

    const markup = {
      inline_keyboard: [
        [{ text: t('gen.btn_auto_prompt', lang), callback_data: 'prompt_source_auto' }],
        [{ text: t('gen.btn_prompt_library', lang), callback_data: 'prompt_source_library' }],
        [{ text: t('gen.btn_custom_prompt', lang), callback_data: 'prompt_source_custom' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showPromptSourceSelection error', err);
  }
}

// ── Image Options: Aspect Ratio + Resolution ────────────────────────────────

/** Show aspect ratio selection for image_set action */
export async function showImageAspectRatio(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || 'id';
    const mode = ctx.session?.generateMode as string || 'basic';

    const text = `${getStepIndicator(mode, 3)} ${t('gen.select_aspect_ratio', lang)}`;
    const markup = {
      inline_keyboard: [
        [
          { text: '📱 9:16 (TikTok/Reels)', callback_data: 'img_ar_9:16' },
          { text: '⬛ 1:1 (Feed)', callback_data: 'img_ar_1:1' },
        ],
        [
          { text: '🖥️ 16:9 (Banner/YT)', callback_data: 'img_ar_16:9' },
          { text: '📷 4:5 (IG Post)', callback_data: 'img_ar_4:5' },
        ],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showImageAspectRatio error', err);
  }
}

/** Show resolution selection for image_set action */
export async function showImageResolution(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || 'id';
    const mode = ctx.session?.generateMode as string || 'basic';

    const text = `${getStepIndicator(mode, 4)} ${t('gen.select_resolution', lang)}`;
    const markup = {
      inline_keyboard: [
        [{ text: t('gen.res_standard', lang), callback_data: 'img_res_standard' }],
        [{ text: t('gen.res_hd', lang), callback_data: 'img_res_hd' }],
        [{ text: t('gen.res_ultra', lang), callback_data: 'img_res_ultra' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showImageResolution error', err);
  }
}

// ── Pro Mode: Multi-Image Upload ─────────────────────────────────────────────

export async function showProImageUpload(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || 'id';
    const total = 7; // HPAS 7-scene standard
    const current = ctx.session?.generatePhotos?.length || 0;

    if (ctx.session) {
      ctx.session.generatePhotoCount = total;
      ctx.session.state = 'AWAITING_MULTI_IMAGE_UPLOAD';
    }

    const text = t('gen.multi_image_title', lang, { n: current, total });
    const markup = {
      inline_keyboard: [
        ...(current > 0 ? [[{ text: t('gen.btn_complete_ai', lang), callback_data: 'pro_image_complete_ai' }]] : []),
        [{ text: t('gen.btn_skip_images', lang), callback_data: 'pro_image_skip' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showProImageUpload error', err);
  }
}

/** Handle multi-image upload in Pro mode */
export async function handleMultiImageUpload(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
  if (!message.photo) {
    await ctx.reply(t('msg.send_photo_or_skip', ctx.session?.userLang || 'id'));
    return;
  }

  const photos = message.photo as any[];
  const largest = photos[photos.length - 1];
  const fileLink = await ctx.telegram.getFileLink(largest.file_id);
  const url = fileLink.toString();
  const lang = ctx.session?.userLang || 'id';

  if (!ctx.session?.generatePhotos) {
    if (ctx.session) ctx.session.generatePhotos = [];
  }

  const current = ctx.session!.generatePhotos!.length;
  const total = ctx.session?.generatePhotoCount || 7;

  ctx.session!.generatePhotos!.push({ sceneIndex: current, fileId: largest.file_id, url });
  const newCount = ctx.session!.generatePhotos!.length;

  await ctx.reply(t('gen.multi_image_received', lang, { n: newCount, total }));

  if (newCount >= total) {
    // All images uploaded — proceed to prompt source
    if (ctx.session) ctx.session.state = 'DASHBOARD';
    await showPromptSourceSelection(ctx);
  }
  // Otherwise stay in AWAITING_MULTI_IMAGE_UPLOAD, user can send more or tap "Complete with AI"
}

// ── Pro Mode: Storyboard Choice ─────────────────────────────────────────────

export async function showProStoryboardChoice(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || 'id';

    const text = t('gen.storyboard_choice', lang);
    const markup = {
      inline_keyboard: [
        [{ text: t('gen.btn_storyboard_auto', lang), callback_data: 'pro_storyboard_auto' }],
        [{ text: t('gen.btn_storyboard_manual', lang), callback_data: 'pro_storyboard_manual' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showProStoryboardChoice error', err);
  }
}

/** Pro storyboard per-scene manual editor */
export async function showProStoryboardEditor(ctx: BotContext, sceneIndex: number): Promise<void> {
  const lang = ctx.session?.userLang || 'id';
  const preset = (ctx.session?.generatePreset as DurationPreset) || 'standard';
  const presetConfig = DURATION_PRESETS[preset];
  const sceneIds = presetConfig.scenesIncluded;

  if (sceneIndex >= sceneIds.length) {
    // All scenes done — proceed to transcript choice
    if (ctx.session) ctx.session.state = 'DASHBOARD';
    await showProTranscriptChoice(ctx);
    return;
  }

  const sceneId = sceneIds[sceneIndex];
  const sceneName = HPAS_SCENES[sceneId]?.nameId || sceneId;

  if (ctx.session) {
    ctx.session.state = 'AWAITING_STORYBOARD_EDIT';
    ctx.session.stateData = { ...(ctx.session.stateData || {}), storyboardEditIndex: sceneIndex };
  }

  await ctx.reply(t('gen.storyboard_edit_scene', lang, { n: sceneIndex + 1, name: sceneName }), { parse_mode: 'Markdown' });
}

export async function handleStoryboardEdit(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
/** Handle storyboard scene text input */
  const text = (message.text as string)?.trim();
  if (!text) return;

  const sceneIndex = (ctx.session?.stateData as any)?.storyboardEditIndex ?? 0;
  const lang = ctx.session?.userLang || 'id';
  const preset = (ctx.session?.generatePreset as DurationPreset) || 'standard';
  const presetConfig = DURATION_PRESETS[preset];
  const sceneIds = presetConfig.scenesIncluded;
  const sceneId = sceneIds[sceneIndex] || 'hook';

  if (!ctx.session?.generateManualStoryboard) {
    if (ctx.session) ctx.session.generateManualStoryboard = [];
  }

  ctx.session!.generateManualStoryboard!.push({
    sceneId,
    description: text,
    durationSeconds: presetConfig.sceneDurations[sceneId] || 5,
  });

  const remaining = sceneIds.length - (sceneIndex + 1);
  await ctx.reply(t('gen.storyboard_scene_saved', lang, { n: sceneIndex + 1, remaining }));

  // Advance to next scene
  await showProStoryboardEditor(ctx, sceneIndex + 1);
}

// ── Pro Mode: Transcript Choice ─────────────────────────────────────────────

export async function showProTranscriptChoice(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const lang = ctx.session?.userLang || 'id';

    const text = t('gen.transcript_choice', lang);
    const markup = {
      inline_keyboard: [
        [{ text: t('gen.btn_transcript_auto', lang), callback_data: 'pro_transcript_auto' }],
        [{ text: t('gen.btn_transcript_manual', lang), callback_data: 'pro_transcript_manual' }],
        [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showProTranscriptChoice error', err);
  }
}

export async function handleTranscriptInput(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
/** Handle manual transcript input */
  const text = (message.text as string)?.trim();
  if (!text) return;

  const lang = ctx.session?.userLang || 'id';
  if (ctx.session) {
    ctx.session.generateManualTranscript = text;
    ctx.session.generateTranscriptMode = 'manual';
    ctx.session.state = 'DASHBOARD';
  }

  await ctx.reply(t('gen.transcript_saved', lang));

  // Proceed to duration selection (Pro uses same Smart duration picker)
  await showSmartPresetSelection(ctx);
}

// ── Smart Mode: Preset Selection ──────────────────────────────────────────────

export async function showSmartPresetSelection(ctx: BotContext): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const lang = ctx.session?.userLang || 'id';
    const mode = ctx.session?.generateMode as string || 'smart';
    const text = `${getStepIndicator(mode, 3)} ${t('gen.smart_select_duration', lang)}`;

    const persona = getPersonaForUser(ctx.session?.userMode);
    const allPresets = [
      { text: `⚡ Quick — 15s (${UNIT_COSTS.VIDEO_15S / 10} cr)`, callback_data: 'preset_quick', key: 'quick' },
      { text: `🎯 Standard — 30s (${UNIT_COSTS.VIDEO_30S / 10} cr)`, callback_data: 'preset_standard', key: 'standard' },
      { text: `📽️ Extended — 60s (${UNIT_COSTS.VIDEO_60S / 10} cr)`, callback_data: 'preset_extended', key: 'extended' },
      { text: '⏱️ Custom', callback_data: 'preset_custom', key: 'custom' },
    ];
    const filteredPresets = allPresets.filter(p => isPresetAllowedForPersona(persona, p.key));
    const markup = {
      inline_keyboard: [
        ...filteredPresets.map(p => [{ text: p.text, callback_data: p.callback_data }]),
        [{ text: t('btn.back', lang), callback_data: 'action_video' }],
        [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showSmartPresetSelection error', err);
  }
}

export async function showSmartPlatformSelection(ctx: BotContext, preset: DurationPreset): Promise<void> {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    if (ctx.session) {
      ctx.session.generatePreset = preset;
    }

    const lang = ctx.session?.userLang || 'id';
    const text = t('gen.select_platform', lang);

    const markup = {
      inline_keyboard: [
        [{ text: '🎵 TikTok (9:16)', callback_data: 'platform_tiktok' }],
        [{ text: '📸 Instagram (9:16)', callback_data: 'platform_instagram' }],
        [{ text: '▶️ YouTube (16:9)', callback_data: 'platform_youtube' }],
        [{ text: '⬛ Square (1:1)', callback_data: 'platform_square' }],
        [{ text: t('btn.back', lang), callback_data: 'action_video' }],
        [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
      ],
    };
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: markup });
      else await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup });
    } catch { await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: markup }); }
  } catch (err) {
    logger.error('showSmartPlatformSelection error', err);
  }
}

// ── Pro Mode: Scene Review ────────────────────────────────────────────────────

export async function showProSceneReview(
  ctx: BotContext,
  productDescription: string
): Promise<void> {
  try {
    const lang = ctx.session?.userLang || 'id';
    const industry = detectIndustry(productDescription);
    let scenes: any[];
    try {
      scenes = await generateScenePromptsWithAI(productDescription, 'standard', lang === 'en' ? 'en' : 'id');
    } catch {
      scenes = generateVideoScenePrompts(industry, productDescription, 'standard', (lang === 'en' ? 'en' : 'id'));
    }

    if (ctx.session) {
      ctx.session.generateScenes = scenes;
    }

    const sceneList = scenes
      .map((s, i) => `${i + 1}. *${HPAS_SCENES[s.sceneId as SceneId].nameId}* (${s.durationSeconds}s)\n   ${s.prompt.slice(0, 200)}${s.prompt.length > 200 ? '...' : ''}`)
      .join('\n\n');

    const text = t('gen.pro_scene_review', lang, { industry, scenes: sceneList });

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          ...scenes.map((s, i) => [{ text: `✏️ Edit Scene ${i + 1}: ${HPAS_SCENES[s.sceneId as SceneId].nameId}`, callback_data: `edit_scene_${s.sceneId}` }]),
          [{ text: t('gen.btn_pro_continue', lang), callback_data: 'pro_select_duration' }],
          [{ text: t('btn.back', lang), callback_data: 'action_video' }],
          [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
        ],
      },
    });
  } catch (err) {
    logger.error('showProSceneReview error', err);
  }
}

// ── Confirm Screen ────────────────────────────────────────────────────────────

export async function showConfirmScreen(ctx: BotContext): Promise<void> {
  try {
    const session = ctx.session;
    if (!session) return;

    const mode = session.generateMode as GenerateMode || 'basic';
    const action = session.generateAction as GenerateAction || 'video';
    const preset = (session.generatePreset as DurationPreset) || 'standard';
    const platform = session.generatePlatform as Platform || 'tiktok';
    const productDesc = session.generateProductDesc as string || '';

    const presetConfig = preset === 'custom' && session.customPresetConfig
      ? session.customPresetConfig as unknown as DurationPresetConfig
      : DURATION_PRESETS[preset];
    const industry = detectIndustry(productDesc);

    let cost = 0;
    let actionLabel = '';

    const resMultipliers: Record<string, number> = { standard: 1, hd: 2, ultra: 4 };
    const resMult = resMultipliers[(session.generateResolution as string) || 'standard'] || 1;
    const { getUnitCostAsync: getConfirmCost } = await import('../config/pricing.js');
    if (action === 'image_set') { cost = (await getConfirmCost('IMAGE_SET_7_SCENE')) * resMult; actionLabel = '📸 Image Set 7 Scene'; }
    else if (action === 'video') { cost = await getConfirmCost(presetConfig.totalSeconds <= 15 ? 'VIDEO_15S' : presetConfig.totalSeconds <= 30 ? 'VIDEO_30S' : presetConfig.totalSeconds <= 60 ? 'VIDEO_60S' : 'VIDEO_120S'); actionLabel = `🎥 Video ${presetConfig.totalSeconds}s`; }
    else if (action === 'clone_style') { cost = await getConfirmCost('CLONE_STYLE'); actionLabel = '🔄 Clone Style'; }
    else if (action === 'campaign') {
      const campSize = (session.generateCampaignSize as 5 | 10) || 5;
      cost = await CampaignService.getCampaignCost(campSize);
      actionLabel = `📦 Campaign ${campSize} Video`;
    }

    const modeLabel = mode === 'basic' ? '⚡ Basic' : mode === 'smart' ? '🎯 Smart' : '👑 Pro';
    const platformLabel: Record<Platform, string> = { tiktok: '🎵 TikTok 9:16', instagram: '📸 Instagram 9:16', youtube: '▶️ YouTube 16:9', square: '⬛ Square 1:1' };

    const resLabels: Record<string, string> = { standard: '📐 Standard (1024px)', hd: '🖼️ HD (2048px)', ultra: '✨ Ultra HD (4096px)' };
    const selectedAR = (session.generateAspectRatio as string) || '';
    const selectedRes = (session.generateResolution as string) || '';

    const lang = ctx.session?.userLang || 'id';
    const totalSteps: Record<string, number> = { basic: 4, smart: 6, pro: 11 };
    const confirmStep = totalSteps[mode] || 6;
    let text = `${getStepIndicator(mode, confirmStep)} ${t('gen.confirm_title', lang)}` + `\n\n` +
      `Mode: ${modeLabel}\n` +
      `Aksi: ${actionLabel}\n`;

    if (action === 'image_set' && selectedAR) {
      text += `Rasio: ${selectedAR}\n`;
      text += `Resolusi: ${resLabels[selectedRes] || selectedRes}\n`;
    } else {
      text += `Platform: ${platformLabel[platform]}\n`;
    }

    text += `Industri: ${industry}\n` +
      `Produk: ${productDesc.slice(0, 60)}${productDesc.length > 60 ? '...' : ''}\n\n` +
      t('gen.confirm_cost', lang, { cost: cost / 10 });

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('gen.btn_generate_now', lang, { cost: cost / 10 }), callback_data: 'generate_confirm' }],
          [{ text: t('btn.back', lang), callback_data: 'generate_start' }],
          [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
        ],
      },
    });
  } catch (err) {
    logger.error('showConfirmScreen error', err);
  }
}

// ── Post-Delivery Nagih Loop ──────────────────────────────────────────────────

export async function showPostDelivery(ctx: BotContext): Promise<void> {
  try {
    // Clear session fields from previous generation to prevent stale data leaking into next flow
    if (ctx.session) {
      delete ctx.session.generateProductDesc;
      delete ctx.session.generatePhotoUrl;
      delete ctx.session.generatePreset;
      delete ctx.session.generatePlatform;
      delete ctx.session.generateAction;
      delete ctx.session.generateScenes;
      delete ctx.session.generateMode;
      delete ctx.session.generateCampaignSize;
      delete ctx.session.customPresetConfig;
      delete ctx.session.generateAspectRatio;
      delete ctx.session.generateResolution;
      delete ctx.session.generatePhotos;
      delete ctx.session.generatePhotoCount;
      delete ctx.session.generatePhotoUploadDone;
      delete ctx.session.generateStoryboardMode;
      delete ctx.session.generateManualStoryboard;
      delete ctx.session.generateTranscriptMode;
      delete ctx.session.generateManualTranscript;
      // Clear prompt library selection marker
      if (ctx.session.stateData && typeof ctx.session.stateData === 'object') {
        delete (ctx.session.stateData as unknown as Record<string, unknown>).selectedPrompt;
        delete (ctx.session.stateData as unknown as Record<string, unknown>).selectedPromptId;
      }
    }

    const lang = ctx.session?.userLang || 'id';
    const text = t('gen.post_delivery', lang);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('btn.variation', lang), callback_data: 'generate_start' },
            { text: t('btn.campaign', lang), callback_data: 'action_campaign' },
          ],
          [
            { text: '⭐ Rate', callback_data: 'generate_rate' },
            { text: '👥 Refer', callback_data: 'referral_menu' },
          ],
          [{ text: t('btn.main_menu', lang), callback_data: 'main_menu' }],
        ],
      },
    });
  } catch (err) {
    logger.error('showPostDelivery error', err);
  }
}

// ── Callback Router ───────────────────────────────────────────────────────────

export async function handleGenerateCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('generate_') || data.startsWith('mode_') || data.startsWith('action_') || data.startsWith('preset_') || data.startsWith('platform_') || data.startsWith('campaign_size')) return false;

  try {
    if (data === 'generate_start') { await showGenerateMode(ctx); return true; }

    // Mode selection
    if (data === 'mode_basic') { await showGenerateAction(ctx, 'basic'); return true; }
    if (data === 'mode_smart') { await showGenerateAction(ctx, 'smart'); return true; }
    if (data === 'mode_pro') { await showGenerateAction(ctx, 'pro'); return true; }

    // Action selection
    if (data === 'action_image_set') { await requestProductInput(ctx, 'image_set'); return true; }
    if (data === 'action_clone_style') { await requestProductInput(ctx, 'clone_style'); return true; }
    if (data === 'action_campaign') { await requestProductInput(ctx, 'campaign'); return true; }
    if (data === 'action_video') {
      const mode = ctx.session?.generateMode as GenerateMode || 'basic';
      if (mode === 'smart') { await showSmartPresetSelection(ctx); return true; }
      if (mode === 'basic') { await requestProductInput(ctx, 'video'); return true; }
      await requestProductInput(ctx, 'video');
      return true;
    }

    // Smart mode
    if (data.startsWith('preset_')) {
      const preset = data.replace('preset_', '') as DurationPreset;
      await showSmartPlatformSelection(ctx, preset);
      return true;
    }

    if (data.startsWith('platform_')) {
      const platform = data.replace('platform_', '') as Platform;
      if (ctx.session) ctx.session.generatePlatform = platform;
      await requestProductInput(ctx, 'video');
      return true;
    }

    // Campaign size
    if (data === 'campaign_size_5') { if (ctx.session) ctx.session.generateCampaignSize = 5; await showConfirmScreen(ctx); return true; }
    if (data === 'campaign_size_10') { if (ctx.session) ctx.session.generateCampaignSize = 10; await showConfirmScreen(ctx); return true; }

    // Confirm → execute
    if (data === 'generate_confirm') {
      await ctx.answerCbQuery?.('⏳ Memproses...');
      await executeGeneration(ctx);
      return true;
    }
  } catch (err) {
    logger.error('handleGenerateCallback error', err);
  }

  return false;
}
