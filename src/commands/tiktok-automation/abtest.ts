/**
 * /abtest — A/B Testing
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';

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
