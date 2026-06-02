/**
 * Vilona Animation Service
 * Text-based animated loading — clean, fast, no background artifacts
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';

// Loading text frames — Vilona "running" via emoji + text
const LOADING_FRAMES: Record<string, string[]> = {
  start: [
    '🏃‍♀️💨 _Loading..._',
    '⚡ _Menyiapkan dashboard..._',
    '✨ _Hampir siap!_',
  ],
  generate: [
    '🎬 _Vilona sprint ke server AI..._',
    '⚡ _AI providers diaktifkan..._',
    '🎨 _Prompt sedang diproses..._',
    '✨ _Hampir jadi! Sabar ya..._',
  ],
  thinking: [
    '💭 _Vilona lagi mikir..._',
    '🧠 _AI sedang bekerja..._',
    '✨ _Bentar, hampir selesai!_',
  ],
  searching: [
    '🔍 _Vilona nyari data..._',
    '📊 _Scanning trending content..._',
    '✨ _Ketemu!_',
  ],
};

/**
 * Send animated text loading indicator.
 * Sends one message, edits it through frames, returns message_id.
 */
export async function sendVilonaLoading(
  ctx: BotContext,
  type: 'start' | 'generate' | 'thinking' | 'searching' = 'thinking'
): Promise<number | null> {
  try {
    const frames = LOADING_FRAMES[type];
    const first = frames[0];

    const sent = await ctx.reply(first, { parse_mode: 'Markdown' });

    // Animate through remaining frames
    for (let i = 1; i < frames.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        sent.message_id,
        undefined,
        frames[i],
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    return sent.message_id;
  } catch (err) {
    logger.debug('Vilona animation error (non-critical):', err);
    return null;
  }
}

/**
 * Send loading then auto-delete after delay.
 */
export async function sendVilonaLoadingAutoDelete(
  ctx: BotContext,
  type: 'start' | 'generate' | 'thinking' | 'searching' = 'thinking',
  deleteAfterMs = 2000
): Promise<void> {
  const msgId = await sendVilonaLoading(ctx, type);
  if (msgId) {
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, msgId);
      } catch (err) { logger.debug("Vilona: delete already deleted:", err); }
    }, deleteAfterMs);
  }
}

/**
 * Welcome animation for /start — quick animated text, auto-delete.
 */
export async function sendVilonaWelcomeAnimation(ctx: BotContext): Promise<void> {
  try {
    const welcomeFrames = [
      '🏃‍♀️💨 _Vilona masuk..._',
      '🏃‍♀️✨ _Hampir siap!_',
      '👋✨ _Halo! Vilona siap bantu kamu!_',
    ];

    const sent = await ctx.reply(welcomeFrames[0], { parse_mode: 'Markdown' });

    for (let i = 1; i < welcomeFrames.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        sent.message_id,
        undefined,
        welcomeFrames[i],
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 600));
    await ctx.telegram.deleteMessage(ctx.chat!.id, sent.message_id).catch(() => {});
  } catch (err) { logger.debug("Vilona: non-critical error:", err); }
}
