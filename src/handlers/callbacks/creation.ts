import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { VideoService } from "@/services/video.service";
import { t } from "@/i18n/translations";
import { ProviderError } from '@/utils/app-errors';

export async function handleLegacyCreationCallback(ctx: BotContext, data: string): Promise<boolean> {
    // ── Legacy vcreate_* → redirect to V3 flow ───────────────────────────────
    if (data.startsWith("vcreate_") && data !== "vcreate_confirm") {
      const { showGenerateMode } = await import("../../flows/generate.js");
      await showGenerateMode(ctx);
      return true;
    }

    if (data === "vcreate_confirm") {
      await ctx.answerCbQuery();

      if (
        !ctx.session?.videoCreationNew ||
        !ctx.session.videoCreationNew.template
      ) {
        await ctx.reply(t('error.no_session', ctx.session?.userLang || 'id'));
        return true;
      }

      const { getTemplateById } = await import("../../config/templates.js");
      const template = getTemplateById(ctx.session.videoCreationNew.template);

      if (!template) {
        await ctx.reply(t('cb.prompt_not_found', ctx.session?.userLang || 'id'));
        return true;
      }

      const user = ctx.from;
      if (!user) return true;

      const telegramId = BigInt(user.id);
      const dbUser = await UserService.findByTelegramId(telegramId);

      if (!dbUser || Number(dbUser.creditBalance) < template.creditCost) {
        const lang = ctx.session?.userLang || 'id';
        await ctx.editMessageText(
          t('creation.insufficient_credits', lang, { cost: template.creditCost, balance: Number(dbUser?.creditBalance || 0) }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: t('btn.buy_credits', lang), callback_data: "topup" }],
                [{ text: t('btn.main_menu', lang), callback_data: "main_menu" }],
              ],
            },
          },
        );
        return true;
      }

      // Build prompt from template + user input
      const textInput = ctx.session.videoCreationNew.textInput || "";

      let prompt = `Create a ${template.name} video with ${template.sceneCount} scenes. `;
      prompt += `Theme: ${template.theme}, Vibe: ${template.vibe}, Mood: ${template.mood}. `;
      prompt += `Lighting: ${template.lighting}, Colors: ${template.colors.join(", ")}. `;
      if (textInput) {
        prompt += `User description: ${textInput}`;
      }

      const niche = template.theme;
      const duration = template.sceneCount * 5; // 5 sec per scene

      // Queue video generation job — deduct credits AFTER createJob succeeds
      try {
        const video = await VideoService.createJob({
          userId: telegramId,
          niche,
          platform: "tiktok",
          duration,
          scenes: template.sceneCount,
          title: `${template.name} - ${new Date().toLocaleDateString("id-ID")}`,
        });

        const actualJobId = video.jobId;

        // Deduct credits now that the job record exists (worker refunds on failure)
        await UserService.deductCredits(telegramId, template.creditCost);

        // Trigger actual video generation
        const { generateVideoWithFallback } =
          await import("../../services/video-fallback.service.js");

        // Download reference image if uploaded
        let referenceImageUrl: string | null = null;
        if (
          ctx.session.videoCreationNew.uploadedPhotos &&
          ctx.session.videoCreationNew.uploadedPhotos.length > 0
        ) {
          try {
            const fileId =
              ctx.session.videoCreationNew.uploadedPhotos[0].fileId;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            referenceImageUrl = fileLink.toString();
            logger.info(`📸 Reference image downloaded: ${referenceImageUrl}`);
          } catch (err) {
            logger.error("Failed to download reference image:", err);
          }
        }

        // Start generation in background
        generateVideoWithFallback({
          prompt,
          duration,
          aspectRatio: "9:16",
          style: template.vibe,
          niche: template.theme,
          referenceImage: referenceImageUrl,
        })
          .then(async (result) => {
            if (result.success && result.videoUrl) {
              // Update video record
              await prisma.video.update({
                where: { jobId: actualJobId },
                data: {
                  status: "completed",
                  progress: 100,
                  videoUrl: result.videoUrl,
                  thumbnailUrl: result.thumbnailUrl,
                },
              });

              // Send video to user with action buttons
              const vLang = ctx.session?.userLang || 'id';
              await ctx.telegram.sendVideo(ctx.chat!.id, result.videoUrl, {
                caption: t('creation.video_done', vLang, { name: template.name, scenes: template.sceneCount, duration }),
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '⬇️ Download', url: result.videoUrl }],
                    [{ text: '📤 Publish to Social Media', callback_data: `publish_video_${actualJobId}` }],
                    [
                      { text: '👍 Good', callback_data: `feedback_good_${actualJobId}` },
                      { text: '👎 Needs Work', callback_data: `feedback_bad_${actualJobId}` },
                    ],
                    [
                      { text: '🎬 Create Another', callback_data: 'create_video_new' },
                      { text: '📁 My Videos', callback_data: 'videos_list' },
                    ],
                  ],
                },
              });
            } else {
              throw new ProviderError("generation", result.error || "Generation failed");
            }
          })
          .catch(async (error) => {
            logger.error("Video generation failed:", error);
            await UserService.refundCredits(
              telegramId,
              template.creditCost,
              actualJobId,
              error.message,
            );
            const rfLang = ctx.session?.userLang || 'id';
            await ctx.telegram.sendMessage(
              ctx.chat!.id,
              t('creation.credits_refunded', rfLang, { jobId: actualJobId, error: error.message }),
              { parse_mode: "Markdown" },
            );
          });

        const gLang = ctx.session?.userLang || 'id';
        await ctx.editMessageText(
          t('creation.generating', gLang, { name: template.name, scenes: template.sceneCount, duration, cost: template.creditCost }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: t('videos.btn_my_videos', gLang), callback_data: "videos_list" }],
                [{ text: t('btn.main_menu', gLang), callback_data: "main_menu" }],
              ],
            },
          },
        );

        // Clear session
        if (ctx.session) {
          ctx.session.videoCreationNew = undefined;
          ctx.session.state = "DASHBOARD";
        }
      } catch (error: any) {
        logger.error("Video generation failed:", error);
        // Credits are only deducted after createJob succeeds, so only refund
        // if this error was thrown after the deduction point (i.e. actualJobId exists).
        // If createJob itself threw, no credits were charged — no refund needed.
        const efLang = ctx.session?.userLang || 'id';
        await ctx.reply(
          t('creation.generation_failed_refund', efLang, { error: error.message }),
          { parse_mode: "Markdown" },
        );
      }
      return true;
    }

    if (data === "create_image_new") {
      const ciLang = ctx.session?.userLang || 'id';
      await ctx.answerCbQuery(t('creation.image_flow_coming', ciLang));
      // Fallback to old flow
      await ctx.editMessageText(
        t('creation.image_generate_title', ciLang),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t('creation.btn_product_photo', ciLang), callback_data: "img_product" }],
              [{ text: t('creation.btn_fnb', ciLang), callback_data: "img_fnb" }],
              [{ text: t('creation.btn_realestate', ciLang), callback_data: "img_realestate" }],
              [{ text: t('creation.btn_car', ciLang), callback_data: "img_car" }],
              [{ text: t('creation.btn_avatar', ciLang), callback_data: "avatar_manage" }],
              [{ text: t('btn.main_menu', ciLang), callback_data: "main_menu" }],
            ],
          },
        },
      );
      return true;
    }
    
    return false;
}
