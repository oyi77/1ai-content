/**
 * /carousel — TikTok Image Carousel Generator
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { tiktokAutomation } from '@/services/tiktok-automation.service';
import fs from 'fs';

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
