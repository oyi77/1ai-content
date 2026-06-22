/**
 * /download — Download video from any URL (VidBee integration)
 * /sora — Generate video with Open-Sora (text-to-video)
 * /vimax — Generate video from idea using AI agents
 * /script — Generate video script from topic
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import * as downloadService from '@/services/video-download.service';
import * as soraService from '@/services/open-sora.service';
import * as vimaxService from '@/services/vimax.service';

// ── /download <url> ──

export async function downloadCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const url = text.replace(/^\/download(@\w+)?\s*/, '').trim();

  if (!url || !url.startsWith('http')) {
    await ctx.reply(
      '📥 *Download Video*\n\nKirim URL video dari platform manapun:\n\n' +
        'Contoh:\n`/download https://www.tiktok.com/...`\n' +
        '`/download https://www.youtube.com/...`\n' +
        '`/download https://www.instagram.com/...`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const statusMsg = await ctx.reply('⏳ Downloading video...');

  const result = await downloadService.downloadVideo({ url, quality: '720p' });

  if (!result.success) {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      `❌ Download gagal: ${result.error}`,
    );
    return;
  }

  const sizeMB = (result.filesize / (1024 * 1024)).toFixed(1);
  const caption =
    `✅ *Video Downloaded*\n\n` +
    `📹 ${result.title}\n` +
    `⏱ ${result.duration}s | 💾 ${sizeMB}MB\n` +
    `🔗 Job: \`${result.jobId}\``;

  try {
    const fileUrl = await downloadService.getDownloadUrl(result.jobId);
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      caption,
      { parse_mode: 'Markdown' },
    );
    await ctx.replyWithVideo(
      { url: fileUrl },
      { caption: result.title || 'Downloaded video' },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to send downloaded video:', message);
    await ctx.reply(
      `✅ Downloaded: ${result.title}\n📁 File: ${result.jobId}\n\n_Gunakan file ini untuk editing atau posting._`,
      { parse_mode: 'Markdown' },
    );
  }
}

// ── /sora <prompt> ──

export async function soraCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const prompt = text.replace(/^\/sora(@\w+)?\s*/, '').trim();

  if (!prompt) {
    await ctx.reply(
      '🎬 *Open-Sora — AI Video Generation*\n\nBuat video dari text prompt:\n\n' +
        'Contoh:\n`/sora kucing bermain piano di pantai sunset`\n' +
        '`/sora aerial shot of a futuristic city at night`\n\n' +
        '💡 Prompt yang detail = video yang lebih bagus!',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const statusMsg = await ctx.reply('🎬 Generating video with Open-Sora...\n⏳ Proses ini bisa 1-5 menit.');

  const result = await soraService.generateVideo({
    prompt,
    duration: 5,
    resolution: '720p',
    aspectRatio: '16:9',
  });

  if (!result.success) {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      `❌ Open-Sora gagal: ${result.error}`,
    );
    return;
  }

  const caption =
    `✅ *Video Generated (Open-Sora)*\n\n` +
    `📝 ${prompt.slice(0, 100)}\n` +
    `⏱ ${result.duration}s | 📐 ${result.resolution}\n` +
    `🎲 Seed: ${result.seed}`;

  try {
    const fileUrl = await soraService.getVideoUrl(result.jobId);
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      caption,
      { parse_mode: 'Markdown' },
    );
    await ctx.replyWithVideo(
      { url: fileUrl },
      { caption: prompt.slice(0, 200) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to send Sora video:', message);
    await ctx.reply(caption, { parse_mode: 'Markdown' });
  }
}

// ── /vimax <idea> ──

export async function vimaxCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const idea = text.replace(/^\/vimax(@\w+)?\s*/, '').trim();

  if (!idea) {
    await ctx.reply(
      '🎬 *ViMax — AI Video Director*\n\nBuat video lengkap dari ide:\n\n' +
        'Contoh:\n`/vimax motivasi bisnis untuk anak muda`\n' +
        '`/vimax tutorial masak rendang 30 detik`\n' +
        '`/vimax product showcase sepatu Nike`\n\n' +
        '🤖 AI akan jadi Director + Screenwriter + Producer!',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const statusMsg = await ctx.reply('🤖 ViMax AI agents bekerja...\n📝 Director → Screenwriter → Producer');

  const result = await vimaxService.ideaToVideo({
    idea,
    style: 'cinematic',
    duration: 30,
    platform: 'tiktok',
    language: 'id',
  });

  if (!result.success) {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      `❌ ViMax gagal: ${result.error}`,
    );
    return;
  }

  // Format the script output
  const scenes = result.scenes;
  const sceneList = scenes
    .map(
      (s) =>
        `*Scene ${s.sceneNumber}* (${s.duration}s) — ${s.act}\n` +
        `  🎥 ${s.visualPrompt}\n` +
        (s.narration ? `  🎙 ${s.narration}\n` : ''),
    )
    .join('\n');

  const msg =
    `✅ *ViMax — Video Script Generated*\n\n` +
    `💡 Idea: ${idea}\n` +
    `🎬 ${scenes.length} scenes | ⏱ Total: ${scenes.reduce((a, s) => a + s.duration, 0)}s\n\n` +
    `${sceneList}\n` +
    (result.voiceover ? `🎙 *Voiceover:*\n${result.voiceover.slice(0, 500)}` : '');

  await ctx.telegram.editMessageText(
    ctx.chat?.id,
    statusMsg.message_id,
    undefined,
    msg.slice(0, 4000),
    { parse_mode: 'Markdown' },
  );
}

// ── /script <topic> ──

export async function scriptCommand(ctx: BotContext): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const topic = text.replace(/^\/script(@\w+)?\s*/, '').trim();

  if (!topic) {
    await ctx.reply(
      '📝 *Script Generator*\n\nBuat script video dari topik:\n\n' +
        'Contoh:\n`/script tips hemat belanja bulanan`\n' +
        '`/script review iPhone 16 Pro Max`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const statusMsg = await ctx.reply('📝 Generating script...');

  const result = await vimaxService.generateScript({
    topic,
    duration: 30,
    language: 'id',
  });

  if (!result.success) {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      statusMsg.message_id,
      undefined,
      `❌ Script generation gagal: ${result.error}`,
    );
    return;
  }

  const scriptText = result.script.length > 3000
    ? result.script.slice(0, 3000) + '...'
    : result.script;

  await ctx.telegram.editMessageText(
    ctx.chat?.id,
    statusMsg.message_id,
    undefined,
    `✅ *Script Generated*\n\n\`\`\`\n${scriptText}\n\`\`\``,
    { parse_mode: 'Markdown' },
  );
}
