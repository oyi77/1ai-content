/**
 * Generate Flow — Execution Engine
 *
 * The core generation pipeline: handles credit checks, free trial, scene generation,
 * image set creation, video queuing, clone style, and campaign flows.
 * Extracted from generate.ts to break up the god object.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';
import { prisma } from '@/config/database';
import { UserService } from '@/services/user.service';
import { ContentAnalysisService } from '@/services/content-analysis.service';
import { ImageGenerationService } from '@/services/image.service';
import { enqueueVideoGeneration } from '@/config/queue';
import { detectIndustry, generateVideoScenePrompts, generateScenePromptsWithAI, DURATION_PRESETS } from '@/config/hpas-engine';
import { creditsToUnits } from '@/config/pricing';
import { CampaignService } from '@/services/campaign.service';
import { getCorrelationId } from '@/utils/correlation';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { clearGenerateSession, downloadToLocal } from './generate.types';
import { showPostDelivery } from './generate.ui';
import type { GenerateMode, GenerateAction, Platform } from './generate.types';
import type { DurationPreset, DurationPresetConfig } from '@/config/hpas-engine';
import type { GeneratedSceneData, ManualSceneData } from './generate.types';

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
          await ctx.reply(t('gen.free_trial_video', lang, { niche: userNiche }) + `\\n\\n[Download](${template.videoUrl})`, {
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
      let trialScenes: GeneratedSceneData[];
      try {
        trialScenes = await generateScenePromptsWithAI(productDesc || userNiche, 'quick', lang === 'en' ? 'en' : 'id');
      } catch {
        trialScenes = generateVideoScenePrompts(industry, productDesc || userNiche, 'quick', (lang === 'en' ? 'en' : 'id'));
      }
      const trialStoryboard = trialScenes.map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }));

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
      let scenes: GeneratedSceneData[];
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
        // Fallback: generate video directly
        const { generateVideoAsync } = await import('../commands/create.js');
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
      let scenes: GeneratedSceneData[] | ManualSceneData[];
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
        ? (scenes as ManualSceneData[]).map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.description }))
        : (scenes as GeneratedSceneData[]).map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: s.prompt }));

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
        const { generateVideoAsync } = await import('../commands/create.js');
        generateVideoAsync(ctx, video.jobId, industry, platform, presetConfig.totalSeconds, scenes.map((s, i) => ({ scene: i + 1, duration: s.durationSeconds, description: useManualStoryboard ? (s as ManualSceneData).description : (s as GeneratedSceneData).prompt }))).catch(async (err) => {
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
      let scenes: GeneratedSceneData[];
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
        const { generateVideoAsync } = await import('../commands/create.js');
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
          const { generateVideoAsync } = await import('../commands/create.js');
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
    if (photoUrl && !photoUrl.startsWith('http') && require('fs').existsSync(photoUrl)) {
      try { require('fs').unlinkSync(photoUrl); } catch { /* ignore */ }
    }
  }
}
