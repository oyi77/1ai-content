import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { ContentAnalysisService } from '@/services/content-analysis.service';
import { detectImageElements, renderElementSelectionKeyboard, buildElementSelectionMessage } from './image';
import { t } from '@/i18n/translations';

export async function handleMediaIntentCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('media_intent_') && data !== 't2v_confirm_contextless') return false;

  await ctx.answerCbQuery().catch(() => {});

  const lang = ctx.session?.userLang || 'id';
  const pendingUrl = (ctx.session.stateData as Record<string, unknown>)?.pendingMediaUrl as string | undefined;
  const pendingUrls = (ctx.session.stateData as Record<string, unknown>)?.pendingMediaUrls as string[] | undefined;
  const pendingPrompt = (ctx.session.stateData as Record<string, unknown>)?.pendingPrompt as string | undefined;

  // ── Ignore ──────────────────────────────────────────────────────────────────
  if (data === 'media_intent_ignore') {
    ctx.session.state = 'DASHBOARD';
    ctx.session.stateData = {};
    await ctx.editMessageText('_Diabaikan._', { parse_mode: 'Markdown' });
    return true;
  }

  // ── i2i — Edit Gambar ────────────────────────────────────────────────────────
  if (data === 'media_intent_i2i') {
    if (!pendingUrl) {
      await ctx.editMessageText('❌ Foto tidak ditemukan. Coba upload lagi.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    await ctx.editMessageText('🔍 _Menganalisis gambar..._', { parse_mode: 'Markdown' });

    let analysisResult: { hasCharacter: boolean; hasProduct: boolean; characterDesc: string; productDesc: string; backgroundDesc: string } | null = null;
    try {
      const analysis = await ContentAnalysisService.extractPrompt(pendingUrl, 'image');
      if (analysis.success && analysis.prompt) {
        analysisResult = detectImageElements(analysis.prompt);
      }
    } catch (err) {
      logger.warn('media_intent_i2i analysis failed:', err);
    }

    if (analysisResult) {
      const defaultSel = {
        keepProduct: analysisResult.hasProduct,
        keepCharacter: analysisResult.hasProduct ? false : analysisResult.hasCharacter,
        keepBackground: false,
      };

      ctx.session.state = 'IMAGE_ELEMENT_SELECTION';
      ctx.session.stateData = {
        ...ctx.session.stateData,
        referenceImageUrl: pendingUrl,
        mode: 'img2img',
        imageCategory: 'product',
        pendingPrompt,
        imageAnalysisResult: {
          hasProduct: analysisResult.hasProduct,
          hasCharacter: analysisResult.hasCharacter,
          productDesc: analysisResult.productDesc,
          characterDesc: analysisResult.characterDesc,
          backgroundDesc: analysisResult.backgroundDesc,
        },
        imageElementSelection: defaultSel,
      };

      await ctx.editMessageText(
        buildElementSelectionMessage(analysisResult, analysisResult.characterDesc, analysisResult.productDesc),
        {
          parse_mode: 'Markdown',
          reply_markup: renderElementSelectionKeyboard(defaultSel),
        },
      );
    } else {
      ctx.session.state = 'IMAGE_GENERATION_WAITING';
      ctx.session.stateData = {
        ...ctx.session.stateData,
        referenceImageUrl: pendingUrl,
        mode: 'img2img',
        imageCategory: 'product',
      };
      await ctx.editMessageText(
        t('cb.describe_image', lang, { hint: '' }),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: t('btn.back', lang), callback_data: 'image_generate' }]] },
        },
      );
    }
    return true;
  }

  // ── i2v — Jadikan Video ──────────────────────────────────────────────────────
  if (data === 'media_intent_i2v' || data === 'media_intent_batch_i2v') {
    if (!pendingUrl) {
      await ctx.editMessageText('❌ Foto tidak ditemukan. Coba upload lagi.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    await ctx.editMessageText('🔍 _Menganalisis gambar untuk video..._', { parse_mode: 'Markdown' });

    const photos = pendingUrls || [pendingUrl];
    ctx.session.state = 'VIDEO_ELEMENT_SELECTION';
    ctx.session.stateData = {
      ...ctx.session.stateData,
      referenceImageUrl: pendingUrl,
      mode: 'i2v',
      imageCategory: 'product',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Session videoCreation dynamic init
    if (!ctx.session.videoCreation) ctx.session.videoCreation = {} as any;
    (ctx.session.videoCreation as Record<string, unknown>).pendingPhotos = photos.map((url: string) => ({ fileId: '', url }));

    let analysisResult: { hasCharacter: boolean; hasProduct: boolean; characterDesc: string; productDesc: string; backgroundDesc: string } | null = null;
    try {
      const analysis = await ContentAnalysisService.extractPrompt(pendingUrl, 'image');
      if (analysis.success && analysis.prompt) {
        analysisResult = detectImageElements(analysis.prompt);
      }
    } catch (err) {
      logger.warn('media_intent_i2v analysis failed:', err);
    }

    if (analysisResult) {
      const defaultSel = {
        keepProduct: analysisResult.hasProduct,
        keepCharacter: analysisResult.hasProduct ? false : analysisResult.hasCharacter,
        keepBackground: false,
      };
      ctx.session.stateData = {
        ...ctx.session.stateData,
        imageAnalysisResult: {
          hasProduct: analysisResult.hasProduct,
          hasCharacter: analysisResult.hasCharacter,
          productDesc: analysisResult.productDesc,
          characterDesc: analysisResult.characterDesc,
          backgroundDesc: analysisResult.backgroundDesc,
        },
        imageElementSelection: defaultSel,
      };
      await ctx.editMessageText(
        buildElementSelectionMessage(analysisResult, analysisResult.characterDesc, analysisResult.productDesc),
        {
          parse_mode: 'Markdown',
          reply_markup: renderElementSelectionKeyboard(defaultSel),
        },
      );
    } else {
      ctx.session.state = 'CUSTOM_PROMPT_INPUT';
      await ctx.editMessageText(
        '🎬 *Deskripsikan video yang kamu inginkan:*\n\ne.g.: _"close-up produk kopi dengan latar belakang kafe, dramatic lighting"_',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '◀️ Kembali', callback_data: 'main_menu' }]] },
        },
      );
    }
    return true;
  }

  // ── i2t — Dapatkan Deskripsi ─────────────────────────────────────────────────
  if (data === 'media_intent_i2t') {
    if (!pendingUrl) {
      await ctx.editMessageText('❌ Foto tidak ditemukan.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    await ctx.editMessageText('🔍 _Menganalisis gambar..._', { parse_mode: 'Markdown' });

    try {
      const analysis = await ContentAnalysisService.extractPrompt(pendingUrl, 'image');
      ctx.session.state = 'DASHBOARD';
      ctx.session.stateData = {};

      if (analysis.success && analysis.prompt) {
        const elements = detectImageElements(analysis.prompt);
        const detected: string[] = [];
        if (elements.hasProduct) detected.push(`📦 Produk: _${elements.productDesc || 'terdeteksi'}_`);
        if (elements.hasCharacter) detected.push(`👤 Orang: _${elements.characterDesc || 'terdeteksi'}_`);
        if (elements.backgroundDesc) detected.push(`🖼️ Background: _${elements.backgroundDesc}_`);

        const detectedText = detected.length > 0 ? detected.join('\n') : '_Tidak ada elemen khusus terdeteksi_';

        await ctx.editMessageText(
          `📝 *Deskripsi Gambar*\n\n${detectedText}\n\n*Prompt AI:*\n\`${analysis.prompt.slice(0, 300)}\``,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🖼️ Edit Gambar', callback_data: 'media_intent_i2i' },
                  { text: '🎬 Jadikan Video', callback_data: 'media_intent_i2v' },
                ],
                [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }],
              ],
            },
          },
        );
        // Restore pending state for follow-up actions
        ctx.session.state = 'MEDIA_INTENT_SELECTION';
        ctx.session.stateData = { pendingMediaUrl: pendingUrl, pendingMediaType: 'photo' };
      } else {
        await ctx.editMessageText('❌ Tidak bisa menganalisis gambar. Coba lagi.');
      }
    } catch (err) {
      logger.error('media_intent_i2t failed:', err);
      ctx.session.state = 'DASHBOARD';
      await ctx.editMessageText('❌ Analisis gagal. Coba lagi.');
    }
    return true;
  }

  // ── v2v — Buat Video Serupa ──────────────────────────────────────────────────
  if (data === 'media_intent_v2v') {
    if (!pendingUrl) {
      await ctx.editMessageText('❌ Video tidak ditemukan.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    await ctx.editMessageText('🔍 _Menganalisis video..._', { parse_mode: 'Markdown' });
    ctx.session.state = 'DASHBOARD';
    ctx.session.stateData = {};

    const chatId = ctx.chat!.id;
    const telegram = ctx.telegram;
    const userId = ctx.from!.id;

    void (async () => {
      try {
        const result = await ContentAnalysisService.cloneVideo(pendingUrl);
        if (result.success && result.prompt) {
          const cleanPrompt = result.prompt
            .replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '')
            .slice(0, 1500);

          const { updateSessionDirectly } = await import('../message.js');
          await updateSessionDirectly(userId, (session) => {
            session.stateData = { ...session.stateData, clonePrompt: result.prompt, cloneStyle: result.style };
          });

          await telegram.sendMessage(chatId,
            `✅ *Analisis video selesai!*\n\n*Gaya:* ${result.style || 'Modern/Dynamic'}\n\n*Prompt:*\n_${cleanPrompt.slice(0, 400)}_`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎬 Buat Video Serupa', callback_data: 'create_video_new' }],
                  [{ text: '✏️ Edit Deskripsi', callback_data: 'clone_edit_desc' }],
                  [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }],
                ],
              },
            },
          );
        } else {
          await telegram.sendMessage(chatId, '❌ Tidak bisa menganalisis video. Coba lagi.');
        }
      } catch (err) {
        logger.error('media_intent_v2v failed:', err);
        await telegram.sendMessage(chatId, '❌ Analisis video gagal.');
      }
    })();
    return true;
  }

  // ── v2t — Analisis Video ──────────────────────────────────────────────────────
  if (data === 'media_intent_v2t') {
    if (!pendingUrl) {
      await ctx.editMessageText('❌ Video tidak ditemukan.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    await ctx.editMessageText('🔍 _Menganalisis video... (bisa sampai 30 detik)_', { parse_mode: 'Markdown' });
    ctx.session.state = 'DASHBOARD';
    ctx.session.stateData = {};

    const chatId = ctx.chat!.id;
    const telegram = ctx.telegram;

    void (async () => {
      try {
        const result = await ContentAnalysisService.extractPrompt(pendingUrl, 'video');
        if (result.success && result.prompt) {
          await telegram.sendMessage(
            chatId,
            `📝 *Deskripsi Video*\n\n\`${result.prompt.slice(0, 500)}\``,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]],
              },
            },
          );
        } else {
          await telegram.sendMessage(chatId, '❌ Tidak bisa menganalisis video.');
        }
      } catch (err) {
        logger.error('media_intent_v2t failed:', err);
        await telegram.sendMessage(chatId, '❌ Analisis video gagal.');
      }
    })();
    return true;
  }

  // ── t2v contextless confirm ───────────────────────────────────────────────────
  if (data === 't2v_confirm_contextless') {
    await ctx.answerCbQuery();
    const videoPrompt = ctx.session.stateData?.pendingVideoPrompt as string | undefined;
    if (!videoPrompt) {
      await ctx.editMessageText('❌ Prompt tidak ditemukan. Coba lagi.');
      ctx.session.state = 'DASHBOARD';
      return true;
    }

    ctx.session.state = 'DASHBOARD';
    ctx.session.stateData = { ...ctx.session.stateData, pendingVideoPrompt: undefined };

    const { enqueueVideoGeneration } = await import('../../config/queue.js');
    const { UserService } = await import('../../services/user.service.js');
    const { getVideoCreditCostAsync } = await import('../../config/pricing.js');
    const { prisma } = await import('../../config/database.js');
    const { generateStoryboard } = await import('../../services/video-generation.service.js');

    const telegramId = BigInt(ctx.from!.id);
    const creditCost = await getVideoCreditCostAsync(15);
    const user = await UserService.findByTelegramId(telegramId);

    if (!user || Number(user.creditBalance) < creditCost) {
      await ctx.editMessageText('❌ Kredit tidak cukup untuk membuat video. Top up terlebih dahulu.', {
        reply_markup: { inline_keyboard: [[{ text: '💳 Top Up', callback_data: 'topup_menu' }]] },
      });
      return true;
    }

    await ctx.editMessageText('⏳ _Menambahkan ke antrian video..._', { parse_mode: 'Markdown' });

    const chatId = ctx.chat!.id;
    const telegram = ctx.telegram;

    try {
      const storyboard = generateStoryboard('general', ['cinematic'], 15, 3);
      const jobId = `T2V-CTX-${Date.now()}-${telegramId}`;
      await prisma.video.create({
        data: {
          userId: telegramId,
          jobId,
          niche: 'general',
          platform: 'reels',
          duration: 15,
          scenes: storyboard.length,
          status: 'processing',
          creditsUsed: creditCost,
          storyboard,
        },
      });
      await UserService.deductCredits(telegramId, creditCost);
      const { position } = await enqueueVideoGeneration({
        jobId,
        niche: 'general',
        platform: 'reels',
        duration: 15,
        scenes: storyboard.length,
        storyboard,
        userId: telegramId.toString(),
        chatId,
        customPrompt: videoPrompt,
        enableVO: false,
        enableSubtitles: false,
        language: 'id',
        creditCost,
      });

      await telegram.sendMessage(chatId,
        `✅ *Video masuk antrian!*\n\nPrompt: _${videoPrompt.slice(0, 100)}_\n\nPosisi antrian: #${position}\nEstimasi: ~2-5 menit`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]] } },
      );
    } catch (err) {
      logger.error('t2v_confirm_contextless failed:', err);
      await telegram.sendMessage(chatId, '❌ Gagal menambah ke antrian. Coba lagi.');
    }
    return true;
  }

  return false;
}
