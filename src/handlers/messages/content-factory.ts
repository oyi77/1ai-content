/**
 * Content Factory Message Handlers
 *
 * Handles text/file input for content factory states:
 * - VOICE_TEXT_WAITING → generate TTS from typed text
 * - LOOP_AUDIO_WAITING → create looping video from uploaded audio
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { contentFactoryService } from '@/services/content-factory.service';
import fs from 'fs';

/**
 * Handle VOICE_TEXT_WAITING state — user typed text for voiceover.
 */
export async function handleVoiceTextWaiting(ctx: BotContext): Promise<boolean> {
  if (ctx.session?.state !== 'VOICE_TEXT_WAITING') return false;

  const message = ctx.message;
  if (!message || !('text' in message) || !message.text) return false;

  const text = message.text;
  const voice = (ctx.session.stateData?.voice as string) || 'id-ID-ArdiNeural';
  const language = (ctx.session.stateData?.language as string) || 'id';

  ctx.session.state = 'DASHBOARD';
  ctx.session.stateData = {};

  await ctx.reply(`🎙️ Generating voiceover...\n🗣️ Voice: \`${voice}\``, { parse_mode: 'Markdown' });

  try {
    const result = await contentFactoryService.synthesizeSpeech(text, { language, voice });

    if (result.success && result.audio_path) {
      await ctx.reply('✅ Voiceover generated!');
      if (fs.existsSync(result.audio_path)) {
        await ctx.replyWithAudio(
          { source: result.audio_path },
          { title: 'Voiceover' },
        );
      }
      await ctx.reply('Mau generate lagi?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎙️ /voice Lagi', callback_data: 'main_menu' }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal generate voiceover: ${result.error || 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Voice Text] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan.');
  }

  return true;
}

/**
 * Handle LOOP_AUDIO_WAITING state — user sent audio file for looping video.
 */
export async function handleLoopAudioWaiting(ctx: BotContext): Promise<boolean> {
  if (ctx.session?.state !== 'LOOP_AUDIO_WAITING') return false;

  const message = ctx.message;
  if (!message) return false;

  // Check for audio/voice/document file
  let fileId: string | undefined;
  if ('audio' in message && message.audio) {
    fileId = message.audio.file_id;
  } else if ('voice' in message && message.voice) {
    fileId = message.voice.file_id;
  } else if ('document' in message && message.document) {
    const mime = message.document.mime_type || '';
    if (mime.startsWith('audio/')) {
      fileId = message.document.file_id;
    }
  }

  if (!fileId) {
    await ctx.reply('⚠️ Kirim file audio (.mp3/.wav) untuk dijadikan looping video.');
    return true;
  }

  const visualType = (ctx.session.stateData?.visualType as string) || 'gradient';
  ctx.session.state = 'DASHBOARD';
  ctx.session.stateData = {};

  await ctx.reply(`🔁 Downloading audio & creating loop...\n🎨 Visual: ${visualType}\n⏳ Proses ini butuh beberapa menit...`);

  try {
    // Download file from Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const ext = fileLink.pathname.endsWith('.wav') ? '.wav' : '.mp3';
    const tmpPath = `/tmp/loop_input_${Date.now()}${ext}`;

    // Download via fetch
    const resp = await fetch(fileLink.href);
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    const result = await contentFactoryService.createLoop(tmpPath, {
      durationMinutes: 60,
      visualType,
    });

    // Cleanup input file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    if (result.success && result.video_path) {
      await ctx.reply('✅ Looping video created!');
      if (fs.existsSync(result.video_path)) {
        await ctx.replyWithVideo(
          { source: result.video_path },
          { caption: `🔁 Looping video (${result.duration || 60} min) — ${visualType}` },
        );
      }
    } else {
      await ctx.reply(`❌ ${result.error || 'Gagal membuat looping video'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Loop Audio] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan saat membuat looping video.');
  }

  return true;
}
