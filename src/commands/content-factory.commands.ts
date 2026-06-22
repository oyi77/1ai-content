/**
 * Content Factory Commands
 *
 * Telegram bot commands for 1AI-Content Factory services:
 * - /suno — Generate music via Suno AI
 * - /voice — Generate voiceover (TTS)
 * - /music — Generate background music
 * - /loop — Create looping video from audio
 * - /analyze — Analyze YouTube/TikTok channel
 * - /publish — Post to social media via CloakBrowser
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { contentFactoryService } from '@/services/content-factory.service';
import fs from 'fs';
import path from 'path';

// ── Helper: send audio file to Telegram ───────────────────────

async function sendAudioFile(ctx: BotContext, filePath: string, title?: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      await ctx.reply('❌ File audio tidak ditemukan.');
      return;
    }
    await ctx.replyWithAudio(
      { source: filePath },
      { title: title || path.basename(filePath) },
    );
  } catch (err: unknown) {
    logger.error(`[ContentFactory] Send audio error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Gagal mengirim file audio.').catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════════
// /suno — Suno AI Music Generation
// ══════════════════════════════════════════════════════════════

export async function sunoCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const prompt = text.replace(/^\/suno(?:@\S+)?\s*/, '').trim();

  if (!prompt) {
    await ctx.reply(
      '🎵 *Suno AI Music Generator*\n\n' +
      'Generate lagu/instrumental dari prompt text.\n\n' +
      '*Contoh:*\n' +
      '• `/suno lo-fi chill beats`\n' +
      '• `/suno romantic piano instrumental`\n' +
      '• `/suno upbeat corporate background music`\n' +
      '• `/suno dark cinematic trailer music`\n\n' +
      'Atau pilih preset di bawah:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🎵 Lo-Fi Chill', callback_data: 'suno_preset_lofi' },
              { text: '🎹 Piano Romantic', callback_data: 'suno_preset_piano' },
            ],
            [
              { text: '🎸 Upbeat Corporate', callback_data: 'suno_preset_corporate' },
              { text: '🎬 Cinematic', callback_data: 'suno_preset_cinematic' },
            ],
            [
              { text: '🧘 Meditation', callback_data: 'suno_preset_meditation' },
              { text: '🎮 8-bit Retro', callback_data: 'suno_preset_retro' },
            ],
          ],
        },
      },
    );
    return;
  }

  await ctx.reply('🎵 Generating music via Suno AI...\n⏳ Mohon tunggu, proses ini 1-2 menit.');

  try {
    const result = await contentFactoryService.generateSunoMusic(prompt, { instrumental: true });

    if (result.success && result.audio_path) {
      await ctx.reply('✅ Music generated!');
      await sendAudioFile(ctx, result.audio_path, `Suno: ${prompt}`);
      // Show publish button
      await ctx.reply('Mau posting ke sosmed?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Publish ke Sosmed', callback_data: `publish_audio_${path.basename(result.audio_path)}` }],
            [{ text: '🔁 Buat Looping Video', callback_data: `loop_from_${path.basename(result.audio_path)}` }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal generate music: ${result.error || 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Suno] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan.');
  }
}

// ══════════════════════════════════════════════════════════════
// /voice — Text-to-Speech
// ══════════════════════════════════════════════════════════════

export async function voiceCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const input = text.replace(/^\/voice(?:@\S+)?\s*/, '').trim();

  if (!input) {
    await ctx.reply(
      '🎙️ *AI Voiceover Generator*\n\n' +
      'Buat voiceover dari text menggunakan Edge TTS.\n\n' +
      '*Contoh:*\n' +
      '• `/voice Beli sekarang di Shopee! Diskon 50%!`\n' +
      '• `/voice Welcome to our channel!`\n' +
      '• `/voice Promo spesial hari ini, jangan sampai kelewatan!`\n\n' +
      '*Voice Options:*\n' +
      '• Default Indonesia: `id-ID-ArdiNeural` (male)\n' +
      '• Indonesia Female: `id-ID-GadisNeural`\n' +
      '• English Male: `en-US-GuyNeural`\n' +
      '• English Female: `en-US-JennyNeural`\n\n' +
      'Ketik langsung atau pilih voice:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇮🇩 Male ID', callback_data: 'voice_select_id_male' },
              { text: '🇮🇩 Female ID', callback_data: 'voice_select_id_female' },
            ],
            [
              { text: '🇺🇸 Male EN', callback_data: 'voice_select_en_male' },
              { text: '🇺🇸 Female EN', callback_data: 'voice_select_en_female' },
            ],
          ],
        },
      },
    );
    return;
  }

  // Auto-detect language
  const isIndonesian = /[a-z]/i.test(input) && !/^[\x00-\x7F]*$/.test(input) ||
    /yang|dan|di|ke|dari|untuk|dengan|ini|itu|adalah|bisa|akan|sudah|tidak|juga|ada|saya|kamu|kita/.test(input.toLowerCase());

  const language = isIndonesian ? 'id' : 'en';
  const voice = language === 'id' ? 'id-ID-ArdiNeural' : 'en-US-GuyNeural';

  await ctx.reply(`🎙️ Generating voiceover...\n🗣️ Voice: \`${voice}\``, { parse_mode: 'Markdown' });

  try {
    const result = await contentFactoryService.synthesizeSpeech(input, { language, voice });

    if (result.success && result.audio_path) {
      await ctx.reply('✅ Voiceover generated!');
      await sendAudioFile(ctx, result.audio_path, `Voiceover`);
      await ctx.reply('Mau pakai di video?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎬 Tambah ke Video', callback_data: 'main_menu' }],
            [{ text: '🔄 Regenerate', callback_data: `voice_regenerate` }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal generate voiceover: ${result.error || 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Voice] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan.');
  }
}

// ══════════════════════════════════════════════════════════════
// /music — Background Music Generator
// ══════════════════════════════════════════════════════════════

export async function musicCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const prompt = text.replace(/^\/music(?:@\S+)?\s*/, '').trim();

  if (!prompt) {
    await ctx.reply(
      '🎶 *Background Music Generator*\n\n' +
      'Generate background music untuk video.\n\n' +
      '*Contoh:*\n' +
      '• `/music corporate upbeat`\n' +
      '• `/music chill lo-fi study beats`\n' +
      '• `/music dramatic cinematic trailer`\n' +
      '• `/music tropical house summer vibes`\n\n' +
      'Atau pilih preset:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏢 Corporate', callback_data: 'music_preset_corporate' },
              { text: '😌 Chill Lo-Fi', callback_data: 'music_preset_chill' },
            ],
            [
              { text: '🎬 Dramatic', callback_data: 'music_preset_dramatic' },
              { text: '☀️ Upbeat', callback_data: 'music_preset_upbeat' },
            ],
          ],
        },
      },
    );
    return;
  }

  await ctx.reply('🎶 Generating background music...\n⏳ Mohon tunggu...');

  try {
    const result = await contentFactoryService.generateMusic(prompt, { duration: 60 });

    if (result.success && result.audio_path) {
      await ctx.reply('✅ Background music generated!');
      await sendAudioFile(ctx, result.audio_path, `BGM: ${prompt}`);
      await ctx.reply('Mau kombinasikan dengan video?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔁 Buat Looping Video', callback_data: `loop_from_${path.basename(result.audio_path)}` }],
            [{ text: '📤 Publish', callback_data: `publish_audio_${path.basename(result.audio_path)}` }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal generate music: ${result.error || 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Music] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan.');
  }
}

// ══════════════════════════════════════════════════════════════
// /loop — Looping Video Creator
// ══════════════════════════════════════════════════════════════

export async function loopCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const args = text.replace(/^\/loop(?:@\S+)?\s*/, '').trim();

  if (!args) {
    await ctx.reply(
      '🔁 *Looping Video Creator*\n\n' +
      'Buat video looping seamless dari audio file.\n' +
      'Cocok untuk YouTube music channels (passive income AdSense).\n\n' +
      '*Cara pakai:*\n' +
      '1. Kirim file audio (.mp3, .wav) ke bot\n' +
      '2. Ketik `/loop` lalu pilih visual type\n\n' +
      '*Visual Types:*\n' +
      '• `gradient` — Animated color gradient\n' +
      '• `stars` — Starfield background\n' +
      '• `waves` — Wave animation\n' +
      '• `solid` — Solid color\n' +
      '• `image` — Ken Burns effect on image\n\n' +
      'Kirim audio dulu, lalu ketik /loop',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🎨 Gradient', callback_data: 'loop_type_gradient' },
              { text: '⭐ Stars', callback_data: 'loop_type_stars' },
            ],
            [
              { text: '🌊 Waves', callback_data: 'loop_type_waves' },
              { text: '🖼️ Image', callback_data: 'loop_type_image' },
            ],
          ],
        },
      },
    );
    return;
  }

  // If audio path is provided directly
  await ctx.reply(
    '🔁 Pilih visual type untuk looping video:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🎨 Gradient', callback_data: `loop_create_gradient` },
            { text: '⭐ Stars', callback_data: `loop_create_stars` },
          ],
          [
            { text: '🌊 Waves', callback_data: `loop_create_waves` },
            { text: '🌈 Solid', callback_data: `loop_create_solid` },
          ],
        ],
      },
    },
  );
}

// ══════════════════════════════════════════════════════════════
// /analyze — Channel Analysis
// ══════════════════════════════════════════════════════════════

export async function analyzeCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const channelInput = text.replace(/^\/analyze(?:@\S+)?\s*/, '').trim();

  if (!channelInput) {
    await ctx.reply(
      '📊 *Channel Analyzer*\n\n' +
      'Analisa channel YouTube/TikTok untuk riset kompetitor.\n\n' +
      '*Contoh:*\n' +
      '• `/analyze @lofigirl`\n' +
      '• `/analyze https://youtube.com/@channel`\n' +
      '• `/analyze https://tiktok.com/@user`\n\n' +
      '*Yang didapat:*\n' +
      '• 📈 Performance metrics (views, engagement)\n' +
      '• 🏷️ Content patterns (titles, topics)\n' +
      '• 🎯 Strategy recommendations\n' +
      '• 📅 30-day content calendar\n\n' +
      'Ketik URL atau @username channel:',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Normalize channel URL
  let channelUrl = channelInput;
  if (channelInput.startsWith('@')) {
    channelUrl = `https://youtube.com/${channelInput}`;
  }

  await ctx.reply(
    `📊 Analyzing channel: \`${channelUrl}\`\n⏳ Proses ini butuh 1-3 menit (tergantung jumlah video)...`,
    { parse_mode: 'Markdown' },
  );

  try {
    const result = await contentFactoryService.analyzeChannel(channelUrl, { limit: 50 });

    if (result.success && result.channel) {
      const ch = result.channel;
      const perf = (result.performance ?? {}) as Record<string, unknown>;
      const strategy = (result.strategy ?? {}) as Record<string, unknown>;

      // Format analysis report
      let report = `📊 *Channel Analysis Report*\n\n`;
      report += `*Channel:* ${ch.name}\n`;
      report += `*Subscribers:* ${(ch.subscribers || 0).toLocaleString()}\n`;
      report += `*Videos Analyzed:* ${result.videos_analyzed || 0}\n\n`;

      if (perf.avg_views) {
        report += `📈 *Performance*\n`;
        report += `• Avg Views: ${Number(perf.avg_views).toLocaleString()}\n`;
        report += `• Max Views: ${Number(perf.max_views || 0).toLocaleString()}\n`;
        report += `• Engagement Rate: ${perf.engagement_rate || 'N/A'}%\n\n`;
      }

      if (strategy.what_works) {
        report += `🎯 *What Works*\n`;
        const items = Array.isArray(strategy.what_works) ? strategy.what_works : [strategy.what_works];
        for (const item of items.slice(0, 3)) {
          report += `• ${item}\n`;
        }
        report += `\n`;
      }

      if (strategy.content_ideas) {
        report += `💡 *Content Ideas*\n`;
        const ideas = Array.isArray(strategy.content_ideas) ? strategy.content_ideas : [strategy.content_ideas];
        for (const idea of ideas.slice(0, 5)) {
          report += `• ${idea}\n`;
        }
      }

      // Split long messages (Telegram limit: 4096)
      if (report.length > 4000) {
        const parts = report.match(/[\s\S]{1,4000}/g) || [report];
        for (const part of parts) {
          await ctx.reply(part, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(report, { parse_mode: 'Markdown' });
      }

      await ctx.reply('Mau buat konten serupa?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎬 Buat Video Serupa', callback_data: 'storyboard_create' }],
            [{ text: '🏭 Factory Mode (Bulk)', callback_data: 'factory_mode' }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal menganalisa channel: ${result.error || 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Analyze] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan dan yt-dlp terinstall.');
  }
}

// ══════════════════════════════════════════════════════════════
// /publish — Post to Social Media
// ══════════════════════════════════════════════════════════════

export async function publishCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    '📤 *Publish ke Sosmed*\n\n' +
    'Pilih platform tujuan:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📘 Facebook', callback_data: 'publish_select_fb' },
            { text: '🐦 X/Twitter', callback_data: 'publish_select_x' },
          ],
          [
            { text: '📸 Instagram', callback_data: 'publish_select_ig' },
            { text: '🎵 TikTok', callback_data: 'publish_select_tiktok' },
          ],
          [
            { text: '▶️ YouTube', callback_data: 'publish_select_yt' },
            { text: '💼 LinkedIn', callback_data: 'publish_select_linkedin' },
          ],
          [
            { text: '📤 Publish Semua', callback_data: 'publish_select_all' },
          ],
        ],
      },
    },
  );
}
