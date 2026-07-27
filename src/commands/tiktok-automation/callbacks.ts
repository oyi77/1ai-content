/**
 * TikTok Automation — Callback Handlers
 *
 * Routes callback_query data for TikTok automation features:
 * carousel_*, autopilot_*, ap_create_*, cal_*, ab_*, trending_*
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';
import fs from 'fs';

export async function handleTikTokAutomationCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  const user = ctx.from;
  if (!user) return false;

  try {
    // ── Carousel ──────────────────────────────────────────────
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

    // ── AutoPilot ─────────────────────────────────────────────
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

    if (data === 'autopilot_run') {
      await ctx.answerCbQuery('▶️ Running...');
      const result = await tiktokAutomation.runAutoPilot();
      await ctx.reply(`✅ Ran ${result.jobs_run} job(s).`);
      return true;
    }

    // ── A/B Test ──────────────────────────────────────────────
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

    if (data.startsWith('ab_start_')) {
      const testId = data.replace('ab_start_', '');
      await ctx.answerCbQuery('▶️ Starting...');
      const test = await tiktokAutomation.startABTest(user.id, testId);
      if (test) {
        await ctx.reply(`✅ Test "${test.name}" started! Publish both variants and track metrics.`);
      }
      return true;
    }

    // ── Calendar ──────────────────────────────────────────────
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

    // ── A/B Test Menu ─────────────────────────────────────────
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

    // ── AutoPilot Menu ────────────────────────────────────────
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

    // ── Trending Scan & Generate ──────────────────────────────
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
                { text: '🖼️ Carousel', callback_data: 'carousel_style_outline' },
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
