/**
 * /calendar — Content Calendar Management
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';

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
      const parts = scheduleArgs.split('|').map((p) => p.trim());
      const topic = parts[0];
      const scheduledAt = parts[1] ?? '';

      if (!topic) {
        await ctx.reply('❌ Format: `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>`', { parse_mode: 'Markdown' });
        return;
      }

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
