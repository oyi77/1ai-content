/**
 * /repurpose & /regen — Content Repurpose (Anti-Copyright Remix)
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';

export async function repurposeCommand(ctx: BotContext): Promise<void> {
  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/(?:repurpose|regen)(?:@\S+)?\s*/, '').trim();

  if (!args) {
    await ctx.reply(
      '🔄 *Content Repurpose Engine*\n\n' +
      'Download beberapa konten dari niche yang sama, ' +
      'split jadi segments, lalu gabung jadi video baru dengan:\n' +
      '• Scene detection (FFmpeg)\n' +
      '• Color grading (cinematic/warm/cool/vibrant/vintage)\n' +
      '• Transitions (crossfade/fade/wipe/zoom)\n' +
      '• Text overlays & watermark\n' +
      '• Audio remix (BGM + voiceover)\n' +
      '• Subtitles (karaoke/bold/minimal)\n' +
      '• Platform-optimized output\n' +
      '• Metadata baru (anti-copyright)\n\n' +
      '*Cara pakai:*\n' +
      '`/repurpose <url1> <url2> [url3] ...`\n\n' +
      '*Opsi lengkap:*\n' +
      '• `--duration 180` — target durasi (detik)\n' +
      '• `--platform tiktok` — tiktok/instagram_reels/youtube_shorts/square\n' +
      '• `--niche tech tips` — untuk SEO metadata\n' +
      '• `--style viral` — educational/viral/storytelling/minimal\n' +
      '• `--color cinematic` — cinematic/warm/cool/vibrant/vintage/dark_moody\n' +
      '• `--transition crossfade` — crossfade/fade_black/wipe_left/zoom_in/none\n' +
      '• `--overlay @brandname` — text overlay\n' +
      '• `--watermark @username` — watermark\n' +
      '• `--bgm music.mp3` — background music\n' +
      '• `--subtitles` — add subtitles\n\n' +
      '*Contoh:*\n' +
      '`/repurpose https://tiktok.com/v1 https://tiktok.com/v2 --duration 120 --color warm --watermark @mybrand`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Parse args
  const urls: string[] = [];
  const opts: Record<string, string | number | boolean> = {};

  const parts = args.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '--duration' && parts[i + 1]) { opts.duration = parseInt(parts[i + 1], 10) || 180; i++; }
    else if (p === '--platform' && parts[i + 1]) { opts.platform = parts[i + 1]; i++; }
    else if (p === '--niche' && parts[i + 1]) { opts.niche = parts[i + 1]; i++; }
    else if (p === '--style' && parts[i + 1]) { opts.style = parts[i + 1]; i++; }
    else if (p === '--color' && parts[i + 1]) { opts.color = parts[i + 1]; i++; }
    else if (p === '--transition' && parts[i + 1]) { opts.transition = parts[i + 1]; i++; }
    else if (p === '--overlay' && parts[i + 1]) { opts.overlay = parts[i + 1]; i++; }
    else if (p === '--watermark' && parts[i + 1]) { opts.watermark = parts[i + 1]; i++; }
    else if (p === '--bgm' && parts[i + 1]) { opts.bgm = parts[i + 1]; i++; }
    else if (p === '--subtitles') { opts.subtitles = true; i++; }
    else if (p.startsWith('http')) { urls.push(p); }
  }

  if (urls.length < 2) {
    await ctx.reply('❌ Minimal 2 URL diperlukan.\n\nContoh: `/repurpose <url1> <url2>`', { parse_mode: 'Markdown' });
    return;
  }

  const duration = Number(opts.duration ?? 180);
  await ctx.reply(
    `🔄 *Content Repurpose Started*\n\n` +
    `📥 Sources: ${urls.length} video\n` +
    `⏱️ Target: ${Math.floor(duration / 60)}m ${duration % 60}s\n` +
    `🎯 Niche: ${String(opts.niche ?? 'general')}\n` +
    `🎨 Style: ${String(opts.style ?? 'educational')}\n` +
    `🎬 Color: ${String(opts.color ?? 'cinematic')}\n` +
    `🔗 Transitions: ${String(opts.transition ?? 'crossfade')}\n` +
    `${opts.overlay ? `🖼️ Overlay: ${opts.overlay}\n` : ''}` +
    `${opts.watermark ? `💧 Watermark: ${opts.watermark}\n` : ''}` +
    `\n⏳ Proses ini butuh 2-5 menit...`,
    { parse_mode: 'Markdown' },
  );

  try {
    const result = await tiktokAutomation.repurposeContent({
      sources: urls,
      targetDuration: duration,
      platform: String(opts.platform ?? 'tiktok'),
      niche: String(opts.niche ?? 'general'),
      style: String(opts.style ?? 'educational'),
      colorPreset: String(opts.color ?? 'cinematic'),
      transitionStyle: String(opts.transition ?? 'crossfade'),
      overlayText: opts.overlay ? String(opts.overlay) : undefined,
      watermarkText: opts.watermark ? String(opts.watermark) : undefined,
      bgmPath: opts.bgm ? String(opts.bgm) : undefined,
      addSubtitles: opts.subtitles === true,
    });

    if (result.success) {
      const videoPath = result.video_path as string;
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const segments = result.segments_used as Array<Record<string, unknown>> | undefined;
      const hashtags = Array.isArray(metadata?.hashtags) ? (metadata.hashtags as string[]).slice(0, 5).join(' ') : '';

      if (videoPath && require('fs').existsSync(videoPath)) {
        await ctx.replyWithVideo(
          { source: videoPath },
          {
            caption: `✅ *Content Repurposed!*\n\n` +
              `🎬 ${segments?.length ?? 0} segments dari ${urls.length} sources\n` +
              `⏱️ Durasi: ${Math.floor(duration / 60)}m ${duration % 60}s\n` +
              `📱 Platform: ${String(result.platform ?? 'tiktok')}\n\n` +
              `*Metadata Baru:*\n` +
              `📝 ${String(metadata?.title ?? '').slice(0, 100)}\n\n` +
              `#️⃣ ${hashtags}`,
            parse_mode: 'Markdown',
          },
        );
      }

      await ctx.reply('Mau generate lagi?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Repurpose Lagi', callback_data: 'create_regen' }],
            [{ text: '🏠 Menu', callback_data: 'menu_main' }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal repurpose: ${String(result.error ?? 'Unknown error')}`);
    }
  } catch (err: unknown) {
    logger.error(`[Repurpose] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan saat repurpose content.');
  }
}

/** Backward compat alias */
export const regenCommand = repurposeCommand;
