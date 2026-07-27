/**
 * Generate Flow — UI / Display Functions
 *
 * All show* functions that present Telegram inline keyboards and messages to the user.
 * Extracted from generate.ts to break up the god object.
 * Pure presentation layer — no execution logic.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';
import { UNIT_COSTS, creditsToUnits } from '@/config/pricing';
import {
  HPAS_SCENES,
  DURATION_PRESETS,
  detectIndustry,
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from '@/config/hpas-engine';
import type { DurationPreset, DurationPresetConfig, SceneConfig, SceneId } from '@/config/hpas-engine';
import { getPersonaForUser, isPresetAllowedForPersona } from '@/config/personas';
import { CampaignService } from '@/services/campaign.service';
import { UserService } from '@/services/user.service';
import { clearGenerateSession, getStepIndicator } from './generate.types';
import type { GenerateMode, GenerateAction, Platform } from './generate.types';

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
    const text = `${getStepIndicator(mode, 2)} ${modeLabel} Mode${balanceDisplay}\\n\\n${t('gen.select_action', lang)}`;

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

// ── Prompt Source Selection ───────────────────────────────────────────────────

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

// ── Pro Mode: Storyboard ────────────────────────────────────────────────────

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

// ── Smart Mode: Platform Selection ───────────────────────────────────────────

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

// ── Pro Mode: Scene Review ──────────────────────────────────────────────────

export async function showProSceneReview(
  ctx: BotContext,
  productDescription: string
): Promise<void> {
  try {
    const lang = ctx.session?.userLang || 'id';
    const industry = detectIndustry(productDescription);
    let scenes: import('./generate.types').GeneratedSceneData[];
    try {
      scenes = await generateScenePromptsWithAI(productDescription, 'standard', lang === 'en' ? 'en' : 'id');
    } catch {
      scenes = generateVideoScenePrompts(industry, productDescription, 'standard', (lang === 'en' ? 'en' : 'id'));
    }

    if (ctx.session) {
      ctx.session.generateScenes = scenes;
    }

    const sceneList = scenes
      .map((s, i) => `${i + 1}. *${HPAS_SCENES[s.sceneId as SceneId].nameId}* (${s.durationSeconds}s)\\n   ${s.prompt.slice(0, 200)}${s.prompt.length > 200 ? '...' : ''}`)
      .join('\\n\\n');

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
    let text = `${getStepIndicator(mode, confirmStep)} ${t('gen.confirm_title', lang)}` + `\\n\\n` +
      `Mode: ${modeLabel}\\n` +
      `Aksi: ${actionLabel}\\n`;

    if (action === 'image_set' && selectedAR) {
      text += `Rasio: ${selectedAR}\\n`;
      text += `Resolusi: ${resLabels[selectedRes] || selectedRes}\\n`;
    } else {
      text += `Platform: ${platformLabel[platform]}\\n`;
    }

    text += `Industri: ${industry}\\n` +
      `Produk: ${productDesc.slice(0, 60)}${productDesc.length > 60 ? '...' : ''}\\n\\n` +
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
