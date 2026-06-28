/**
 * TikTok Automation Commands
 *
 * Telegram bot commands for TikTok content automation:
 * - /carousel — Generate TikTok image carousel
 * - /autopilot — Auto-generate & publish content
 * - /calendar — Content calendar management
 * - /abtest — A/B testing for content
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';
import fs from 'fs';

// ══════════════════════════════════════════════════════════════
// /carousel — TikTok Image Carousel Generator
// ══════════════════════════════════════════════════════════════

export async function carouselCommand(ctx: BotContext): Promise<void> {
  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const topic = text.replace(/^\/carousel(?:@\S+)?\s*/, '').trim();

  if (!topic) {
    await ctx.reply(
      '🖼️ *TikTok Carousel Generator*\n\n' +
      'Buat carousel TikTok dari topik apapun.\n\n' +
      '*Contoh:*\n' +
      '• `/carousel Tips hemat belanja online`\n' +
      '• `/carousel 10 makanan viral TikTok`\n' +
      '• `/carousel Cara mulai bisnis online`\n\n' +
      'Atau pilih style di bawah:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Outline', callback_data: 'carousel_style_outline' },
              { text: '🎓 Edukatif', callback_data: 'carousel_style_educational' },
            ],
            [
              { text: '📖 Storytelling', callback_data: 'carousel_style_storytelling' },
              { text: '✨ Minimal', callback_data: 'carousel_style_minimal' },
            ],
            [
              { text: '🎨 Bold', callback_data: 'carousel_style_bold' },
              { text: '🌙 Dark Mode', callback_data: 'carousel_style_dark' },
            ],
          ],
        },
      },
    );
    return;
  }

  await ctx.reply('🖼️ Generating carousel...\n⏳ Mohon tunggu 30-60 detik.');

  try {
    const result = await tiktokAutomation.createCarousel({ topic });

    if (result.success && result.slides && result.slides.length > 0) {
      // Send slides as media group
      const slidePaths = result.slides.filter((p: string) => fs.existsSync(p));

      if (slidePaths.length > 0) {
        // Send cover slide first
        await ctx.replyWithPhoto(
          { source: slidePaths[0] },
          {
            caption: `🖼️ *Carousel: ${result.content?.title ?? topic}*\n\n` +
              `📝 ${result.slide_count ?? slidePaths.length} slides\n` +
              `💬 ${result.caption?.slice(0, 200) ?? ''}...`,
            parse_mode: 'Markdown',
          },
        );

        // Send remaining slides
        for (let i = 1; i < slidePaths.length; i++) {
          await ctx.replyWithPhoto({ source: slidePaths[i] });
        }
      }

      // Show action buttons
      await ctx.reply('Mau posting carousel ini?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Post ke TikTok', callback_data: `carousel_publish_${result.job_id}` }],
            [{ text: '✏️ Edit Caption', callback_data: `carousel_edit_caption_${result.job_id}` }],
            [{ text: '🔄 Buat Ulang', callback_data: 'carousel_regenerate' }],
            [{ text: '🏠 Menu', callback_data: 'menu_main' }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal generate carousel: ${result.error ?? 'Unknown error'}`);
    }
  } catch (err: unknown) {
    logger.error(`[Carousel] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan. Pastikan Content Factory API berjalan.');
  }
}

// ══════════════════════════════════════════════════════════════
// /autopilot — Auto-generate & publish content
// ══════════════════════════════════════════════════════════════

export async function autopilotCommand(ctx: BotContext): Promise<void> {
  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/autopilot(?:@\S+)?\s*/, '').trim();

  // /autopilot status
  if (args === 'status' || args === '') {
    try {
      const status = await tiktokAutomation.getAutoPilotStatus();

      const lines = [
        '🤖 *AutoPilot Status*\n',
        `📊 Active Jobs: ${status.active_jobs}`,
        `📋 Total Jobs: ${status.total_jobs}`,
        `🕐 Last Run: ${status.last_run ?? 'Never'}\n`,
      ];

      if (status.jobs.length > 0) {
        lines.push('*Jobs:*');
        for (const job of status.jobs) {
          lines.push(`• ${job.name} — ${job.status} (${job.config.content_type})`);
        }
      }

      lines.push('\nPilih aksi:');
      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '▶️ Run Now', callback_data: 'autopilot_run' }],
            [{ text: '➕ Create Job', callback_data: 'autopilot_create' }],
            [{ text: '📊 Detailed Status', callback_data: 'autopilot_detailed' }],
          ],
        },
      });
    } catch (err: unknown) {
      logger.error(`[AutoPilot] Status error: ${err instanceof Error ? err.message : String(err)}`);
      await ctx.reply('❌ Gagal mengambil status autopilot.');
    }
    return;
  }

  // /autopilot create <niche>
  if (args.startsWith('create ')) {
    const niche = args.replace('create ', '').trim();
    await ctx.reply(
      `🤖 *Create AutoPilot Job*\n\nNiche: ${niche}\n\nPilih tipe konten:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🎬 Video', callback_data: `ap_create_video_${niche}` },
              { text: '🖼️ Carousel', callback_data: `ap_create_carousel_${niche}` },
            ],
            [
              { text: '🔀 Mixed', callback_data: `ap_create_mixed_${niche}` },
            ],
          ],
        },
      },
    );
    return;
  }

  // /autopilot help
  await ctx.reply(
    '🤖 *AutoPilot Commands*\n\n' +
    '• `/autopilot` — Lihat status\n' +
    '• `/autopilot create <niche>` — Buat job baru\n' +
    '• `/autopilot status` — Status detail\n\n' +
    'AutoPilot akan otomatis generate & publish konten sesuai jadwal.',
    { parse_mode: 'Markdown' },
  );
}

// ══════════════════════════════════════════════════════════════
// /calendar — Content Calendar Management
// ══════════════════════════════════════════════════════════════

export async function calendarCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) {
    await ctx.reply('❌ Tidak bisa mengidentifikasi user.');
    return;
  }

  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/calendar(?:@\S+)?\s*/, '').trim();

  try {
    // /calendar — show today & upcoming
    if (!args) {
      const entries = await tiktokAutomation.getCalendarEntries(user.id);
      const today = new Date().toISOString().slice(0, 10);
      const todayEntries = entries.filter((e) => e.scheduled_at.startsWith(today));
      const upcoming = entries.filter((e) => e.scheduled_at > today && e.status === 'scheduled');

      const lines = [
        '📅 *Content Calendar*\n',
        `📌 Hari ini: ${todayEntries.length} postingan`,
        `📆 Mendatang: ${upcoming.length} postingan\n`,
      ];

      if (todayEntries.length > 0) {
        lines.push('*Hari ini:*');
        for (const e of todayEntries.slice(0, 5)) {
          const time = e.scheduled_at.slice(11, 16);
          const emoji = e.content_type === 'carousel' ? '🖼️' : '🎬';
          lines.push(`• ${time} ${emoji} ${e.topic.slice(0, 40)}`);
        }
      }

      if (upcoming.length > 0) {
        lines.push('\n*Mendatang:*');
        for (const e of upcoming.slice(0, 5)) {
          const date = e.scheduled_at.slice(5, 10);
          const time = e.scheduled_at.slice(11, 16);
          const emoji = e.content_type === 'carousel' ? '🖼️' : '🎬';
          lines.push(`• ${date} ${time} ${emoji} ${e.topic.slice(0, 40)}`);
        }
      }

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ Schedule Content', callback_data: 'cal_schedule' },
              { text: '📊 Stats', callback_data: 'cal_stats' },
            ],
            [
              { text: '📋 All Entries', callback_data: 'cal_list_all' },
              { text: '🔄 Sync AutoPilot', callback_data: 'cal_sync_autopilot' },
            ],
          ],
        },
      });
      return;
    }

    // /calendar schedule <topic> <datetime>
    if (args.startsWith('schedule ')) {
      const scheduleArgs = args.replace('schedule ', '').trim();
      // Simple parsing: topic | datetime
      const parts = scheduleArgs.split('|').map((p) => p.trim());
      const topic = parts[0];
      const scheduledAt = parts[1] ?? '';

      if (!topic) {
        await ctx.reply('❌ Format: `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>`', { parse_mode: 'Markdown' });
        return;
      }

      // Show content type selection
      ctx.session.stateData = { ...ctx.session.stateData, calendarTopic: topic, calendarDate: scheduledAt };
      await ctx.reply(
        `📅 *Schedule: ${topic}*\n${scheduledAt ? `Waktu: ${scheduledAt}` : 'Pilih waktu:'}\n\nPilih tipe konten:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎬 Video', callback_data: 'cal_type_video' },
                { text: '🖼️ Carousel', callback_data: 'cal_type_carousel' },
              ],
            ],
          },
        },
      );
      return;
    }
  } catch (err: unknown) {
    logger.error(`[Calendar] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan pada calendar.');
  }
}

// ══════════════════════════════════════════════════════════════
// /abtest — A/B Testing
// ══════════════════════════════════════════════════════════════

export async function abtestCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) {
    await ctx.reply('❌ Tidak bisa mengidentifikasi user.');
    return;
  }

  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/abtest(?:@\S+)?\s*/, '').trim();

  try {
    // /abtest — show tests
    if (!args) {
      const tests = await tiktokAutomation.getABTests(user.id);
      const running = tests.filter((t) => t.status === 'running');
      const completed = tests.filter((t) => t.status === 'completed');

      const lines = [
        '🧪 *A/B Testing*\n',
        `▶️ Running: ${running.length}`,
        `✅ Completed: ${completed.length}`,
        `📊 Total: ${tests.length}\n`,
      ];

      if (running.length > 0) {
        lines.push('*Running Tests:*');
        for (const t of running.slice(0, 3)) {
          lines.push(`• ${t.name} — ${t.platform} (${t.content_type})`);
        }
      }

      if (completed.length > 0) {
        lines.push('\n*Recent Results:*');
        for (const t of completed.slice(0, 3)) {
          const winner = t.winner === 'tie' ? '🤝 Tie' : `🏆 Variant ${t.winner}`;
          lines.push(`• ${t.name} → ${winner}`);
        }
      }

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ New Test', callback_data: 'ab_new' }],
            [
              { text: '▶️ Running', callback_data: 'ab_list_running' },
              { text: '✅ Results', callback_data: 'ab_list_completed' },
            ],
          ],
        },
      });
      return;
    }

    // /abtest create <topic>
    if (args.startsWith('create ')) {
      const topic = args.replace('create ', '').trim();
      ctx.session.stateData = { ...ctx.session.stateData, abTopic: topic };
      await ctx.reply(
        `🧪 *Create A/B Test*\n\nTopic: ${topic}\n\nPilih tipe konten:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📝 Caption', callback_data: 'ab_type_caption' },
                { text: '🎬 Video', callback_data: 'ab_type_video' },
              ],
              [
                { text: '🖼️ Carousel', callback_data: 'ab_type_carousel' },
              ],
            ],
          },
        },
      );
      return;
    }
  } catch (err: unknown) {
    logger.error(`[ABTest] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan pada A/B testing.');
  }
}

// ══════════════════════════════════════════════════════════════
// /regen — Content Regeneration (Anti-Copyright Remix)
// ══════════════════════════════════════════════════════════════

export async function regenCommand(ctx: BotContext): Promise<void> {
  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/regen(?:@\S+)?\s*/, '').trim();

  if (!args) {
    await ctx.reply(
      '🔄 *Content Regenerator*\n\n' +
      'Download beberapa konten dari niche yang sama, ' +
      'split jadi segments, lalu gabung jadi video baru 1-5 menit ' +
      'dengan metadata baru (anti-copyright).\n\n' +
      '*Cara pakai:*\n' +
      '`/regen <url1> <url2> [url3] ...`\n\n' +
      '*Contoh:*\n' +
      '`/regen https://tiktok.com/... https://tiktok.com/...`\n\n' +
      '*Opsi:*\n' +
      '• Tambah `--duration 180` untuk durasi target (detik)\n' +
      '• Tambah `--niche tech tips` untuk SEO metadata\n' +
      '• Tambah `--style viral` untuk style overlay',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Parse args
  const urls: string[] = [];
  let duration = 180;
  let niche = 'general';
  let style = 'educational';

  const parts = args.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--duration' && parts[i + 1]) {
      duration = parseInt(parts[i + 1], 10) || 180;
      i++;
    } else if (parts[i] === '--niche' && parts[i + 1]) {
      niche = parts[i + 1];
      i++;
    } else if (parts[i] === '--style' && parts[i + 1]) {
      style = parts[i + 1];
      i++;
    } else if (parts[i].startsWith('http')) {
      urls.push(parts[i]);
    }
  }

  if (urls.length < 2) {
    await ctx.reply('❌ Minimal 2 URL diperlukan.\n\nContoh: `/regen <url1> <url2>`', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply(
    `🔄 *Content Regeneration Started*\n\n` +
    `📥 Sources: ${urls.length} video\n` +
    `⏱️ Target: ${Math.floor(duration / 60)}m ${duration % 60}s\n` +
    `🎯 Niche: ${niche}\n` +
    `🎨 Style: ${style}\n\n` +
    `⏳ Proses ini butuh 2-5 menit...`,
    { parse_mode: 'Markdown' },
  );

  try {
    const result = await tiktokAutomation.regenerateContent({
      sources: urls,
      targetDuration: duration,
      niche,
      style,
    });

    if (result.success) {
      const videoPath = result.video_path as string;
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const segmentsUsed = result.segments_used as unknown[] | undefined;

      // Send video
      if (videoPath && require('fs').existsSync(videoPath)) {
        await ctx.replyWithVideo(
          { source: videoPath },
          {
            caption: `✅ *Content Regenerated!*\n\n` +
              `🎬 ${segmentsUsed?.length ?? 0} segments dipakai\n` +
              `⏱️ Durasi: ${Math.floor(duration / 60)}m ${duration % 60}s\n\n` +
              `*Metadata Baru:*\n` +
              `📝 ${String(metadata?.title ?? '').slice(0, 100)}\n\n` +
              `#️⃣ ${Array.isArray(metadata?.hashtags) ? (metadata.hashtags as string[]).slice(0, 5).join(' ') : ''}`,
            parse_mode: 'Markdown',
          },
        );
      }

      // Show action buttons
      await ctx.reply('Mau publish video ini?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Publish ke TikTok', callback_data: 'regen_publish' }],
            [{ text: '🔄 Regenerate Lagi', callback_data: 'regen_again' }],
            [{ text: '🏠 Menu', callback_data: 'menu_main' }],
          ],
        },
      });
    } else {
      await ctx.reply(`❌ Gagal regenerate: ${String(result.error ?? 'Unknown error')}`);
    }
  } catch (err: unknown) {
    logger.error(`[Regen] Error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan saat regenerate content.');
  }
}

// ══════════════════════════════════════════════════════════════
// Callback Handlers
// ══════════════════════════════════════════════════════════════

export async function handleTikTokAutomationCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  const user = ctx.from;
  if (!user) return false;

  try {
    // ── Carousel Regenerate (from dashboard) ──────────────
    if (data === 'carousel_regenerate') {
      await ctx.answerCbQuery();
      ctx.session.stateData = { ...ctx.session.stateData, waitingForCarouselTopic: true };
      await ctx.reply(
        '🖼️ *Buat TikTok Carousel*\n\nKirim topik untuk carousel:',
        { parse_mode: 'Markdown' },
      );
      return true;
    }
    if (data.startsWith('carousel_style_')) {
      const style = data.replace('carousel_style_', '');
      const topic = String(ctx.session.stateData?.calendarTopic ?? ctx.session.stateData?.carouselTopic ?? '');
      if (!topic) {
        ctx.session.stateData = { ...ctx.session.stateData, waitingForCarouselTopic: true, carouselStyle: style };
        await ctx.answerCbQuery();
        await ctx.reply(`🖼️ Style: *${style}*\n\nKirim topik carousel:`, { parse_mode: 'Markdown' });
        return true;
      }

      await ctx.answerCbQuery('🖼️ Generating...');
      const result = await tiktokAutomation.createCarousel({ topic, style });
      if (result.success && result.slides) {
        for (const slidePath of result.slides) {
          if (fs.existsSync(slidePath)) {
            await ctx.replyWithPhoto({ source: slidePath });
          }
        }
      }
      return true;
    }

    // ── AutoPilot Create ───────────────────────────────────
    if (data.startsWith('ap_create_')) {
      const parts = data.replace('ap_create_', '').split('_');
      const contentType = parts[0] ?? 'video';
      const niche = parts.slice(1).join('_');
      await ctx.answerCbQuery('🤖 Creating job...');

      const job = await tiktokAutomation.createAutoPilotJob({
        name: `${niche} - ${contentType}`,
        niche,
        contentType,
      });

      await ctx.reply(
        `✅ *AutoPilot Job Created*\n\n` +
        `📛 Name: ${job.name}\n` +
        `🎯 Niche: ${job.config.niche}\n` +
        `📦 Type: ${job.config.content_type}\n` +
        `⏰ Times: ${job.config.posting_times.join(', ')}\n` +
        `📤 Auto-publish: ${job.config.auto_publish ? 'Yes' : 'No'}`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── AutoPilot Run Now ──────────────────────────────────
    if (data === 'autopilot_run') {
      await ctx.answerCbQuery('▶️ Running...');
      const result = await tiktokAutomation.runAutoPilot();
      await ctx.reply(`✅ Ran ${result.jobs_run} job(s).`);
      return true;
    }

    // ── A/B Test Type Selection ────────────────────────────
    if (data.startsWith('ab_type_')) {
      const contentType = data.replace('ab_type_', '');
      const topic = String(ctx.session.stateData?.abTopic ?? '');
      if (!topic) {
        await ctx.answerCbQuery();
        await ctx.reply('❌ Topik tidak ditemukan. Gunakan `/abtest create <topic>`', { parse_mode: 'Markdown' });
        return true;
      }

      await ctx.answerCbQuery('🧪 Creating test...');
      const test = await tiktokAutomation.createABTest({
        userId: user.id,
        name: `Test: ${topic.slice(0, 30)}`,
        topic,
        contentType,
      });

      const variantA = typeof test.variant_a === 'object' && test.variant_a !== null
        ? JSON.stringify(test.variant_a).slice(0, 200)
        : String(test.variant_a ?? '');
      const variantB = typeof test.variant_b === 'object' && test.variant_b !== null
        ? JSON.stringify(test.variant_b).slice(0, 200)
        : String(test.variant_b ?? '');

      await ctx.reply(
        `🧪 *A/B Test Created*\n\n` +
        `📛 Name: ${test.name}\n` +
        `📦 Type: ${test.content_type}\n\n` +
        `*Variant A:*\n${variantA}\n\n` +
        `*Variant B:*\n${variantB}\n\n` +
        `Status: ${test.status}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶️ Start Test', callback_data: `ab_start_${test.id}` }],
            ],
          },
        },
      );
      return true;
    }

    // ── A/B Test Start ─────────────────────────────────────
    if (data.startsWith('ab_start_')) {
      const testId = data.replace('ab_start_', '');
      await ctx.answerCbQuery('▶️ Starting...');
      const test = await tiktokAutomation.startABTest(user.id, testId);
      if (test) {
        await ctx.reply(`✅ Test "${test.name}" started! Publish both variants and track metrics.`);
      }
      return true;
    }

    // ── Create Menu Callbacks ────────────────────────────────
    if (data === 'create_voice') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🎤 *Voiceover AI*\n\nPilih bahasa & gender:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🇮🇩 Male', callback_data: 'voice_select_id_male' },
                { text: '🇮🇩 Female', callback_data: 'voice_select_id_female' },
              ],
              [
                { text: '🇺🇸 Male', callback_data: 'voice_select_en_male' },
                { text: '🇺🇸 Female', callback_data: 'voice_select_en_female' },
              ],
              [{ text: '🔙 Kembali', callback_data: 'menu_create' }],
            ],
          },
        },
      );
      return true;
    }

    if (data === 'create_music') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🎵 *Musik AI (Suno)*\n\nPilih genre atau ketik prompt sendiri:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎵 Lo-Fi', callback_data: 'suno_preset_lofi' },
                { text: '🎹 Piano', callback_data: 'suno_preset_piano' },
              ],
              [
                { text: '🎸 Corporate', callback_data: 'suno_preset_corporate' },
                { text: '🎬 Cinematic', callback_data: 'suno_preset_cinematic' },
              ],
              [
                { text: '🧘 Meditation', callback_data: 'suno_preset_meditation' },
                { text: '🎮 Retro', callback_data: 'suno_preset_retro' },
              ],
              [{ text: '🔙 Kembali', callback_data: 'menu_create' }],
            ],
          },
        },
      );
      return true;
    }

    if (data === 'create_loop') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔁 *Video Loop*\n\nBuat video looping dari audio.\n\n' +
 'Ketik: `/loop <audio_file>`\n\n' +
        'Atau kirim file audio langsung ke bot.',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'create_storyboard') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📋 *Storyboard AI*\n\nBuat storyboard dari prompt.\n\n' +
 'Ketik: `/storyboard <deskripsi>`\n\n' +
        'Contoh: `/storyboard Produk skincare dengan model di pantai`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'create_from_link') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔗 *Video dari Link*\n\nDownload & rework video dari URL.\n\n' +
 'Ketik: `/clip <url>`\n\n' +
        'Contoh: `/clip https://tiktok.com/...`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'create_from_file') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📄 *Video dari File*\n\nKirim video langsung ke bot, lalu ketik `/edit` untuk edit.',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'create_regen') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔄 *Content Regenerator*\n\n' +
        'Download beberapa konten dari niche yang sama, ' +
        'split jadi segments, gabung jadi video baru dengan metadata baru.\n\n' +
        'Ketik: `/regen <url1> <url2> [url3] ...`\n\n' +
        'Opsi:\n' +
        '• `--duration 180` (detik)\n' +
        '• `--niche tech tips`\n' +
        '• `--style viral`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }


    // ── Prompts Menu Callbacks ───────────────────────────────
    if (data === 'prompts_trending') {
      await ctx.answerCbQuery();
      const { trendingCommand } = await import('@/commands/prompts.js');
      await trendingCommand(ctx);
      return true;
    }

    if (data === 'prompts_daily') {
      await ctx.answerCbQuery();
      const { dailyCommand } = await import('@/commands/prompts.js');
      await dailyCommand(ctx);
      return true;
    }

    if (data === 'prompts_fingerprint') {
      await ctx.answerCbQuery();
      const { fingerprintCommand } = await import('@/commands/prompts.js');
      await fingerprintCommand(ctx);
      return true;
    }

    // ── Videos Menu Callbacks ────────────────────────────────
    if (data === 'videos_list' || data === 'videos_favorites') {
      await ctx.answerCbQuery();
      const { videosCommand } = await import('@/commands/videos.js');
      await videosCommand(ctx);
      return true;
    }

    // ── Settings Menu Callbacks ──────────────────────────────
    if (data === 'settings_language') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🌐 *Bahasa*\n\nPilih bahasa:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🇮🇩 Indonesia', callback_data: 'set_lang_id' },
                { text: '🇺🇸 English', callback_data: 'set_lang_en' },
              ],
              [{ text: '🔙 Kembali', callback_data: 'menu_settings' }],
            ],
          },
        },
      );
      return true;
    }

    if (data === 'settings_notifications') {
      await ctx.answerCbQuery();
      await ctx.reply('🔔 Notifikasi sudah aktif secara default.\n\nUntuk menonaktifkan: ketik `/settings`', { parse_mode: 'Markdown' });
      return true;
    }

    if (data === 'settings_delete_account') {
      await ctx.answerCbQuery();
      await ctx.reply('🗑️ Ketik `/delete_account` untuk menghapus akun.\n\n⚠️ Tindakan ini tidak dapat dibatalkan.', { parse_mode: 'Markdown' });
      return true;
    }

    // ── Support Menu Callbacks ───────────────────────────────
    if (data === 'support_chat') {
      await ctx.answerCbQuery();
      await ctx.reply('💬 Ketik `/support` untuk menghubungi admin.');
      return true;
    }

    if (data === 'support_faq') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📖 *FAQ*\n\n' +
        '❓ *Cara buat video?*\nKetik `/create` atau klik 🎬 Buat Video\n\n' +
 '❓ *Cara buat carousel?*\nKetik `/carousel <topik>`\n\n' +
 '❓ *Cara schedule konten?*\nKetik `/calendar schedule <topik> | <tanggal>`\n\n' +
 '❓ *Cara A/B test?*\nKetik `/abtest create <topik>`\n\n' +
 '❓ *Cara dapat bantuan?*\nKetik `/support` untuk chat admin',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── Viral Scan Callback ──────────────────────────────────
    if (data === 'viral_scan') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔥 *Viral Scanner*\n\nCari konten viral di YouTube/TikTok.\n\n' +
 'Ketik: `/viral <niche>`\n\n' +
        'Contoh: `/viral fitness`\n`/viral food review`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── Calendar Menu Callbacks ────────────────────────────────
    if (data === 'cal_list_all') {
      await ctx.answerCbQuery();
      const calEntries = await tiktokAutomation.getCalendarEntries(user.id);
      if (calEntries.length === 0) {
        await ctx.reply('📅 Belum ada jadwal konten.\n\nKetik `/calendar schedule <topic>` untuk mulai.', { parse_mode: 'Markdown' });
      } else {
        const lines = ['📅 *Semua Jadwal Konten*\n'];
        for (const e of calEntries.slice(0, 10)) {
          const emoji = e.content_type === 'carousel' ? '🖼️' : '🎬';
          const status = e.status === 'published' ? '✅' : e.status === 'scheduled' ? '⏰' : '📝';
          lines.push(`${status} ${emoji} ${e.topic.slice(0, 35)} — ${e.scheduled_at}`);
        }
        if (calEntries.length > 10) lines.push(`\n... dan ${calEntries.length - 10} lainnya`);
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      }
      return true;
    }

    if (data === 'cal_stats') {
      await ctx.answerCbQuery();
      const calAll = await tiktokAutomation.getCalendarEntries(user.id);
      const scheduled = calAll.filter((e) => e.status === 'scheduled').length;
      const published = calAll.filter((e) => e.status === 'published').length;
      await ctx.reply(
        `📊 *Calendar Stats*\n\n` +
        `📅 Total: ${calAll.length}\n` +
        `⏰ Scheduled: ${scheduled}\n` +
        `✅ Published: ${published}`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'cal_schedule') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📅 *Schedule Content*\n\nKetik dengan format:\n`/calendar schedule <topic> | <YYYY-MM-DD HH:MM>`\n\n' +
 'Contoh:\n`/calendar schedule Tips coding | 2026-06-28 11:00`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── A/B Test Menu Callbacks ────────────────────────────────
    if (data === 'ab_new') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🧪 *Create A/B Test*\n\nKetik: `/abtest create <topic>`\n\nContoh:\n`/abtest create Tips hemat belanja online`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'ab_list_running') {
      await ctx.answerCbQuery();
      const abTests = await tiktokAutomation.getABTests(user.id, 'running');
      if (abTests.length === 0) {
        await ctx.reply('🧪 Tidak ada test yang sedang berjalan.');
      } else {
        const lines = ['🧪 *Running Tests*\n'];
        for (const t of abTests) {
          lines.push(`• ${t.name} — ${t.platform} (${t.content_type})`);
        }
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      }
      return true;
    }

    if (data === 'ab_list_completed') {
      await ctx.answerCbQuery();
      const abDone = await tiktokAutomation.getABTests(user.id, 'completed');
      if (abDone.length === 0) {
        await ctx.reply('🧪 Belum ada test yang selesai.');
      } else {
        const lines = ['🧪 *Completed Tests*\n'];
        for (const t of abDone) {
          const winner = t.winner === 'tie' ? '🤝 Tie' : `🏆 Variant ${t.winner}`;
          lines.push(`• ${t.name} → ${winner}`);
        }
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      }
      return true;
    }

    if (data === 'ab_stats') {
      await ctx.answerCbQuery();
      const allAb = await tiktokAutomation.getABTests(user.id);
      const running = allAb.filter((t) => t.status === 'running').length;
      const completed = allAb.filter((t) => t.status === 'completed').length;
      const winsA = allAb.filter((t) => t.winner === 'A').length;
      const winsB = allAb.filter((t) => t.winner === 'B').length;
      await ctx.reply(
        `📊 *A/B Test Stats*\n\n` +
        `🧪 Total: ${allAb.length}\n` +
        `▶️ Running: ${running}\n` +
        `✅ Completed: ${completed}\n` +
 `🏆 A wins: ${winsA} | B wins: ${winsB}`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── AutoPilot Menu Callbacks ───────────────────────────────
    if (data === 'autopilot_create') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🤖 *Create AutoPilot Job*\n\nKetik: `/autopilot create <niche>`\n\nContoh:\n`/autopilot create tech tips`',
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'autopilot_detailed') {
      await ctx.answerCbQuery();
      const apStatus = await tiktokAutomation.getAutoPilotStatus();
      const lines = [
        '🤖 *AutoPilot Detailed Status*\n',
        `📊 Active: ${apStatus.active_jobs}`,
        `📋 Total: ${apStatus.total_jobs}`,
        `🕐 Last: ${apStatus.last_run ?? 'Never'}\n`,
      ];
      if (apStatus.jobs.length > 0) {
        lines.push('*All Jobs:*');
        for (const job of apStatus.jobs) {
          lines.push(`• ${job.name} — ${job.status} (${job.config.content_type}) — ${job.config.posting_times.join(', ')}`);
        }
      }
      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      return true;
    }





    // ── Trending Scan & Generate ─────────────────────────────
    if (data === 'trending_scan_generate') {
      await ctx.answerCbQuery('🔥 Scanning trends...');
      const trends = await tiktokAutomation.scanTrending();
      const items: string[] = [];
      if (trends.youtube) {
        for (const t of trends.youtube.slice(0, 5)) {
          if (t && typeof t === 'object' && 'title' in t) {
            items.push(String(t.title));
          }
        }
      }
      if (items.length === 0) {
        await ctx.reply('📊 Tidak ada trending ditemukan saat ini.');
        return true;
      }
      ctx.session.stateData = { ...ctx.session.stateData, trendingTopics: items };
      const buttons = items.slice(0, 5).map((title, i) => [{
        text: `🔥 ${title.slice(0, 40)}`,
        callback_data: `trending_gen_${i}`,
      }]);
      await ctx.reply(
        '🔥 *Trending Topics Found*\n\nPilih topik untuk generate konten:',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        },
      );
      return true;
    }

    if (data.startsWith('trending_gen_')) {
      const idx = parseInt(data.replace('trending_gen_', ''), 10);
      const topics = ctx.session.stateData?.trendingTopics;
      if (!Array.isArray(topics) || idx >= topics.length) {
        await ctx.answerCbQuery('❌ Topik tidak ditemukan');
        return true;
      }
      const topic = String(topics[idx]);
      await ctx.answerCbQuery('🎬 Generating...');
      ctx.session.stateData = { ...ctx.session.stateData, carouselTopic: topic };
      await ctx.reply(
        `🔥 *Topic: ${topic}*\n\nPilih tipe konten:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎬 Video', callback_data: `trending_video_${idx}` },
                { text: '🖼️ Carousel', callback_data: `carousel_style_outline` },
              ],
            ],
          },
        },
      );
      return true;
    }

    if (data.startsWith('trending_video_')) {
      const idx = parseInt(data.replace('trending_video_', ''), 10);
      const topics = ctx.session.stateData?.trendingTopics;
      if (!Array.isArray(topics) || idx >= topics.length) {
        await ctx.answerCbQuery('❌ Topik tidak ditemukan');
        return true;
      }
      const topic = String(topics[idx]);
      await ctx.answerCbQuery('🎬 Generating video...');
      const result = await tiktokAutomation.generateFromTrending({ topic, contentType: 'video' });
      if (result.success) {
        await ctx.reply(`✅ Video generated dari trending: *${topic}*`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`❌ Gagal generate: ${result.error ?? 'Unknown error'}`);
      }
      return true;
    }

    return false;
  } catch (err: unknown) {
    logger.error(`[TikTokAutomation] Callback error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('❌ Terjadi kesalahan.').catch(() => {});
    return true;
  }
}
