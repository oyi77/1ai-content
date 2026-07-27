/**
 * Storyboard Callback Handlers
 *
 * Handles approve/reject/regenerate for visual storyboard preview.
 * Callback prefixes: sba_* (Storyboard Approve)
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { t } from '@/i18n/translations';

import { UserService } from '@/services/user.service';
import { VideoService } from '@/services/video.service';
import { StoryboardVisualService } from '@/services/storyboard-visual.service';
import { enqueueVideoGeneration } from '@/config/queue';
import { CREDIT_TO_UNIT, getUnitCostAsync } from '@/config/pricing';

const btnBackMain = (lang: string) => ({
  text: t('btn.main_menu', lang),
  callback_data: 'main_menu',
});

/**
 * Handle all storyboard-related callbacks.
 * Returns true if the callback was handled, false otherwise.
 */
export async function handleStoryboardCallbacks(
  ctx: BotContext,
  data: string
): Promise<boolean> {
  const lang = ctx.session?.userLang || 'id';

  // ── Approve storyboard → queue video generation ──────────────────────
  if (data.startsWith('sba_approve')) {
    try {
      await ctx.answerCbQuery('⏳ Generating video dari storyboard...');

      const sbData = ctx.session?.stateData?.storyboardVisual as any;
      if (!sbData || !sbData.scenes?.length) {
        await ctx.reply(t('cb.storyboard_failed', lang));
        return true;
      }

      const telegramId = ctx.from?.id;
      if (!telegramId) return true;

      // Check & deduct credits
      const unitCost = await getUnitCostAsync('VIDEO_30S');
      const creditCost = unitCost / CREDIT_TO_UNIT;
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (!dbUser || Number(dbUser.creditBalance) < creditCost) {
        await ctx.editMessageText(
          `❌ *Kredit Tidak Cukup*\n\nKamu butuh *${creditCost}* kredit untuk generate video.\n\nSilahkan topup dulu ya!`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💰 Topup Kredit', callback_data: 'topup' }],
                [btnBackMain(lang)],
              ],
            },
          }
        );
        return true;
      }

      // Deduct credits via proper service
      await UserService.deductCredits(BigInt(telegramId), creditCost);

      // Create video record
      const video = await VideoService.createJob({
        userId: BigInt(telegramId),
        niche: sbData.niche,
        platform: 'tiktok',
        duration: sbData.totalDuration || 30,
        scenes: sbData.scenes.length,
        title: `Storyboard Video ${new Date().toLocaleDateString('id-ID')}`,
      });

      // Build storyboard for video generation worker
      const storyboard = sbData.scenes.map((s: Record<string, unknown>, i: number) => ({
        scene: i + 1,
        duration: s.duration,
        description: s.description,
      }));

      // Enqueue video generation with required chatId
      const { job, position } = await enqueueVideoGeneration({
        jobId: video.jobId,
        niche: sbData.niche,
        platform: 'tiktok',
        duration: sbData.totalDuration || 30,
        scenes: sbData.scenes.length,
        storyboard,
        referenceImage: sbData.images?.[0]?.url || null,
        userId: telegramId.toString(),
        chatId: telegramId,
      });

      // Clear storyboard session state
      ctx.session.state = 'DASHBOARD';
      ctx.session.stateData = {};

      await ctx.editMessageText(
        `✅ *Video Dari Storyboard — Dalam Antrian*\n\n` +
        `🎬 Job: \`${video.jobId}\`\n` +
        `📊 Posisi antrian: *${position}*\n` +
        `💰 Kredit terpakai: *${creditCost}*\n\n` +
        `⏳ Estimasi: 1-3 menit\n` +
        `Kamu akan diberitahu begitu video selesai!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Status Video', callback_data: `video_status_${video.jobId}` }],
              [btnBackMain(lang)],
            ],
          },
        }
      );

      logger.info('Video queued from storyboard approve', {
        userId: telegramId,
        jobId: video.jobId,
        position,
        creditCost,
      });

      return true;
    } catch (err) {
      logger.error('Storyboard approve error', err);
      await ctx.reply(t('cb.storyboard_failed', lang));
      return true;
    }
  }

  // ── Reject storyboard → back to prompt ───────────────────────────────
  if (data === 'sba_reject') {
    ctx.session.state = 'STORYBOARD_AWAITING_PROMPT';
    ctx.session.stateData = {};

    await ctx.editMessageText(
      `✏️ *Edit Storyboard*\n\nKirim prompt baru untuk video kamu:\n\n` +
      `Contoh:\n• "Promo nasi goreng pedas, close-up sambal"\n• "Tour rumah minimalis 2 lantai"\n• "Before-after skincare glowing"`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[btnBackMain(lang)]] },
      }
    );
    return true;
  }

  // ── Regenerate storyboard → new images ───────────────────────────────
  if (data.startsWith('sba_regenerate')) {
    try {
      await ctx.answerCbQuery('🔄 Regenerating storyboard...');

      const sbData = ctx.session?.stateData?.storyboardVisual as any;
      if (!sbData || !sbData.scenes?.length) {
        await ctx.reply(t('cb.storyboard_failed', lang));
        return true;
      }

      // Generate new images for existing scenes
      await ctx.editMessageText(
        '🔄 *Regenerating storyboard images...*\n\n⏳ Ini butuh 15-30 detik',
        { parse_mode: 'Markdown' }
      );

      const images = [];
      for (const scene of sbData.scenes) {
        const url = await StoryboardVisualService.generateSceneImage(
          scene,
          sbData.niche
        );
        if (url) images.push({ scene: scene.scene, url });
      }

      const updatedStoryboard = {
        ...sbData,
        images,
        allImagesGenerated: images.length === sbData.scenes.length,
      };

      ctx.session.stateData.storyboardVisual = updatedStoryboard;

      // Send new images as media group
      if (images.length > 0) {
        const mediaGroup = StoryboardVisualService.formatMediaGroup(
          updatedStoryboard as any
        );
        try {
          await ctx.replyWithMediaGroup(mediaGroup);
        } catch (mediaErr) {
          logger.warn('Failed to send regenerated storyboard media group', mediaErr);
        }
      }

      const caption = StoryboardVisualService.formatCaption(
        updatedStoryboard as any
      );

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Setuju & Generate Video', callback_data: 'sba_approve' },
              { text: '✏️ Edit Prompt', callback_data: 'sba_reject' },
            ],
            [
              { text: '🔄 Regenerate Lagi', callback_data: 'sba_regenerate' },
            ],
            [btnBackMain(lang)],
          ],
        },
      });

      return true;
    } catch (err) {
      logger.error('Storyboard regenerate error', err);
      await ctx.answerCbQuery('❌ Gagal regenerate, coba lagi');
      return true;
    }
  }

  return false;
}
