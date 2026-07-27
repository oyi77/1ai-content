/**
 * Generate Flow — Input Handlers & Routing
 *
 * Handles user text/photo input and routes to the appropriate UI.
 * Extracted from generate.ts to break up the god object.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';
import { ContentAnalysisService } from '@/services/content-analysis.service';
import {
  showImagePreference,
  showImageAspectRatio,
  showImageResolution,
  showConfirmScreen,
  showSmartPresetSelection,
  showProSceneReview,
  showProImageUpload,
  showPromptSourceSelection,
  showProStoryboardChoice,
  showProStoryboardEditor,
  showSmartPlatformSelection,
} from './generate.ui';
import type { GenerateMode, GenerateAction } from './generate.types';
import { clearGenerateSession } from './generate.types';

// ── Step 3 Handler: Product Input (photo or text) ─────────────────────────────

export async function handleProductInput(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
  try {
    const action = ctx.session?.generateAction as GenerateAction || 'video';
    let productDesc = '';
    let photoUrl: string | undefined;

    // Extract input
    if (message.photo) {
      const photos = message.photo as Array<{ file_id: string }>;
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

// ── Step 3: Input Prompt Routing ──────────────────────────────────────────────

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
        `🔄 *Clone Style*\\n\\nKirim foto **referensi gaya** yang ingin ditiru.\\n(Setelah itu kirim foto produk kamu)`,
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

// ── Pro Mode: Multi-Image Upload Handler ──────────────────────────────────────

/** Handle multi-image upload in Pro mode */
export async function handleMultiImageUpload(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
  if (!message.photo) {
    await ctx.reply(t('msg.send_photo_or_skip', ctx.session?.userLang || 'id'));
    return;
  }

  const photos = message.photo as Array<{ file_id: string }>;
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

// ── Pro Mode: Storyboard Editor Handler ───────────────────────────────────────

export async function handleStoryboardEdit(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
  const text = (message.text as string)?.trim();
  if (!text) return;

  const sceneIndex = (ctx.session?.stateData as any)?.storyboardEditIndex ?? 0;
  const lang = ctx.session?.userLang || 'id';
  const preset = (ctx.session?.generatePreset as string) || 'standard';
  const { DURATION_PRESETS: durs, HPAS_SCENES: scenes } = await import('@/config/hpas-engine.js');
  const presetConfig = durs[preset];
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

// ── Pro Mode: Transcript Input Handler ────────────────────────────────────────

/** Handle manual transcript input */
export async function handleTranscriptInput(ctx: BotContext, message: Record<string, unknown>): Promise<void> {
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
  const { showSmartPresetSelection } = await import('./generate.ui.js');
  await showSmartPresetSelection(ctx);
}
