/**
 * Generate Flow — Callback Router
 *
 * Handles callbacks from the generate flow's inline keyboards.
 * This is called ONLY for `generate_start_*` and `generate_confirm` callbacks
 * (routed from handlers/callbacks/generation.ts).
 * Extracted from generate.ts to break up the god object.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import type { DurationPreset } from '@/config/hpas-engine';
import { clearGenerateSession } from './generate.types';
import type { Platform, GenerateMode } from './generate.types';
import { showGenerateMode, showGenerateAction, showSmartPresetSelection, showSmartPlatformSelection, showConfirmScreen } from './generate.ui';
import { requestProductInput } from './generate.input';
import { executeGeneration } from './generate.execution';

// ── Callback Router ───────────────────────────────────────────────────────────

export async function handleGenerateCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('generate_') && !data.startsWith('mode_') && !data.startsWith('action_') && !data.startsWith('preset_') && !data.startsWith('platform_') && !data.startsWith('campaign_size') && data !== 'generate_confirm') return false;

  try {
    if (data === 'generate_start') { await showGenerateMode(ctx); return true; }

    // Mode selection
    if (data === 'mode_basic' || data === 'mode_smart' || data === 'mode_pro') {
      const modeMap: Record<string, string> = { mode_basic: 'basic', mode_smart: 'smart', mode_pro: 'pro' };
      if (ctx.session) ctx.session.generateMode = modeMap[data] as 'basic' | 'smart' | 'pro';
      await showGenerateAction(ctx);
      return true;
    }

    // Action selection
    if (data === 'action_image_set') { await requestProductInput(ctx, 'image_set'); return true; }
    if (data === 'action_clone_style') { await requestProductInput(ctx, 'clone_style'); return true; }
    if (data === 'action_campaign') { await requestProductInput(ctx, 'campaign'); return true; }
    if (data === 'action_video') {
      const mode = ctx.session?.generateMode as GenerateMode || 'basic';
      if (mode === 'smart') { await showSmartPresetSelection(ctx); return true; }
      await requestProductInput(ctx, 'video');
      return true;
    }

    // Smart mode: duration preset
    if (data.startsWith('preset_')) {
      const preset = data.replace('preset_', '') as DurationPreset;
      if (ctx.session) ctx.session.generatePreset = preset;
      await showSmartPlatformSelection(ctx);
      return true;
    }

    // Platform selection
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
