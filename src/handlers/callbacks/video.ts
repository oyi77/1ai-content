import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { VideoService } from "@/services/video.service";
import {
  videosCommand,
  viewVideo,
  copyVideoUrl,
  deleteVideo,
} from "@/commands/videos";
import { generateCaption } from "@/commands/create";
import { NICHES } from "@/services/video-generation.service";
import { t } from "@/i18n/translations";

export async function handleVideoCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  // ── Favorites list ─────────────────────────────────────────────────────
  if (data === "videos_favorites") {
    const lang = ctx.session?.userLang || "id";
    const userId = ctx.from?.id ? BigInt(ctx.from.id) : null;
    if (!userId) return true;

    const favorites = await VideoService.getUserFavorites(userId);
    if (favorites.length === 0) {
      await ctx.editMessageText(t("cb2.favorites_empty", lang), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.back", lang), callback_data: "videos_back" }],
          ],
        },
      });
      return true;
    }

    const buttons = favorites.map((v) => [
      {
        text: `${v.niche} — ${v.platform} (${v.duration}s)`,
        callback_data: `video_view_${v.jobId}`,
      },
    ]);
    buttons.push([{ text: t("btn.back", lang), callback_data: "videos_back" }]);
    await ctx.editMessageText(
      t("cb2.favorites_title", lang) + `\n\n${favorites.length} video`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } },
    );
    return true;
  }

  // ── Trash list ─────────────────────────────────────────────────────────
  if (data === "videos_trash") {
    const lang = ctx.session?.userLang || "id";
    const userId = ctx.from?.id ? BigInt(ctx.from.id) : null;
    if (!userId) return true;

    const trash = await VideoService.getUserTrash(userId);
    if (trash.length === 0) {
      await ctx.editMessageText(t("cb2.trash_empty", lang), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.back", lang), callback_data: "videos_back" }],
          ],
        },
      });
      return true;
    }

    const buttons = trash.map((v) => [
      {
        text: `🗑️ ${v.niche} — ${v.platform}`,
        callback_data: `video_restore_${v.jobId}`,
      },
    ]);
    buttons.push([{ text: t("btn.back", lang), callback_data: "videos_back" }]);
    await ctx.editMessageText(
      t("cb2.trash_title", lang) + `\n\n${trash.length} video`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } },
    );
    return true;
  }

  // ── Toggle favorite ────────────────────────────────────────────────────
  if (data.startsWith("video_fav_")) {
    const jobId = data.replace("video_fav_", "");
    const lang = ctx.session?.userLang || "id";
    const video = await VideoService.getByJobId(jobId);
    if (!video || (ctx.from && video.userId !== BigInt(ctx.from.id))) {
      await ctx.answerCbQuery(t("cb.access_denied", lang));
      return true;
    }
    const isFav = await VideoService.toggleFavorite(jobId);
    await ctx.answerCbQuery(
      isFav ? "⭐ Added to favorites" : "☆ Removed from favorites",
    );
    await viewVideo(ctx, jobId);
    return true;
  }

  // ── Restore from trash ─────────────────────────────────────────────────
  if (data.startsWith("video_restore_")) {
    const jobId = data.replace("video_restore_", "");
    const lang = ctx.session?.userLang || "id";
    const video = await VideoService.getByJobId(jobId);
    if (!video || (ctx.from && video.userId !== BigInt(ctx.from.id))) {
      await ctx.answerCbQuery(t("cb.access_denied", lang));
      return true;
    }
    await VideoService.restoreVideo(jobId);
    await ctx.answerCbQuery(t("cb2.video_restored", lang));
    // Refresh trash list
    await handleVideoCallbacks(ctx, "videos_trash");
    return true;
  }

  if (data === "videos_prev" || data === "videos_next") {
    const sessionExt = ctx.session as unknown as Record<string, unknown>;
    const currentPage = parseInt(sessionExt?.videosPage as string) || 0;
    const newPage =
      data === "videos_next" ? currentPage + 1 : Math.max(0, currentPage - 1);
    if (ctx.session) sessionExt.videosPage = String(newPage);
    await videosCommand(ctx);
    return true;
  }

  if (data === "videos_page") {
    await ctx.answerCbQuery().catch(() => {});
    return true;
  }

  if (data === "videos_back" || data === "videos_list") {
    await ctx.deleteMessage().catch(() => {});
    await videosCommand(ctx);
    return true;
  }

  if (data.startsWith("video_view_")) {
    const jobId = data.replace("video_view_", "");
    await viewVideo(ctx, jobId);
    return true;
  }

  if (data.startsWith("video_copy_")) {
    const jobId = data.replace("video_copy_", "");
    await copyVideoUrl(ctx, jobId);
    return true;
  }

  if (data.startsWith("video_delete_")) {
    const jobId = data.replace("video_delete_", "");
    await deleteVideo(ctx, jobId);
    return true;
  }

  if (data.startsWith("video_confirm_delete_")) {
    await ctx.answerCbQuery();
    const jobId = data.replace("video_confirm_delete_", "");
    const videoToDelete = await VideoService.getByJobId(jobId);
    if (
      !videoToDelete ||
      (ctx.from && videoToDelete.userId !== BigInt(ctx.from.id))
    ) {
      const lang = ctx.session?.userLang || "id";
      await ctx.editMessageText(t("cb.access_denied_video", lang));
      return true;
    }
    await VideoService.deleteVideo(jobId);
    await ctx.editMessageText(
      t("cb2.video_moved_trash", ctx.session?.userLang || "id"),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  if (data.startsWith("video_retry_")) {
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(t("cb.retrying_video", lang));
    const { createCommand } = await import("../../commands/create.js");
    await createCommand(ctx);
    return true;
  }

  if (data.startsWith("copy_caption_")) {
    const jobId = data.replace("copy_caption_", "");
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(t("cb.caption_copied", lang));

    try {
      const video = await VideoService.getByJobId(jobId);
      if (video && ctx.from && video.userId !== BigInt(ctx.from.id)) {
        await ctx.reply(t("cb.access_denied", lang));
        return true;
      }
      const niche =
        ctx.session?.selectedNiche ||
        ctx.session?.videoCreation?.niche ||
        (video as unknown as Record<string, unknown>)?.niche ||
        "product";
      const storyboard = ctx.session?.videoCreation?.storyboard;
      const videoRecord = video as unknown as Record<string, unknown>;
      const nicheVal = String(videoRecord?.niche || niche);
      const platform = String(videoRecord?.platform || "tiktok");

      const scenes =
        storyboard && storyboard.length > 0
          ? storyboard
          : [{ description: String(videoRecord?.prompt || niche) }];
      const caption = generateCaption(nicheVal, scenes, platform);

      await ctx.reply(`${caption.text}\n\n${caption.hashtags}`);
    } catch (err) {
      logger.error("Failed to generate caption for copy:", err);
      await ctx.reply(t("cb.caption_failed", lang));
    }
    return true;
  }

  if (data.startsWith("create_similar_")) {
    const jobId = data.replace("create_similar_", "");
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(t("cb.loading_settings", lang));

    try {
      const video = await VideoService.getByJobId(jobId);
      if (!video) {
        await ctx.reply(t("cb.video_not_found_create", lang));
        return true;
      }

      if (ctx.from && video.userId !== BigInt(ctx.from.id)) {
        await ctx.reply(t("cb.access_denied", lang));
        return true;
      }

      const nicheKey = video.niche || "fnb";
      const nicheConfig = NICHES[nicheKey as keyof typeof NICHES];

      ctx.session.selectedNiche = nicheKey;

      const videoStyles =
        video.styles && video.styles.length > 0
          ? video.styles
          : nicheConfig?.styles
            ? [nicheConfig.styles[0]]
            : ["professional"];
      ctx.session.selectedStyles = videoStyles as string[];

      const videoStoryboard = (video as unknown as Record<string, unknown>)
        .storyboard as Array<{
        scene: number;
        duration: number;
        description: string;
      }> | null;
      const videoDuration = video.duration || 30;
      const videoScenes =
        video.scenes ||
        (videoStoryboard
          ? videoStoryboard.length
          : Math.ceil(videoDuration / 5));

      ctx.session.videoCreation = {
        niche: nicheKey,
        totalDuration: videoDuration,
        scenes: videoScenes,
        storyboard: videoStoryboard || undefined,
        waitingForImage: true,
      };

      const storyboardInfo = videoStoryboard
        ? `${videoStoryboard.length} scenes`
        : `${videoScenes} scenes`;

      await ctx.editMessageText(
        t("cb2.creating_similar", lang, {
          nicheInfo: `${nicheConfig?.emoji || ""} ${nicheConfig?.name || nicheKey}`,
          duration: videoDuration,
          storyboardInfo,
          style: videoStyles[0],
        }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t("cb2.skip_ref_image", lang),
                  callback_data: `duration_${videoDuration}_${videoScenes}`,
                },
              ],
              [
                {
                  text: t("cb2.change_niche_style", lang),
                  callback_data: "create_video_new",
                },
              ],
            ],
          },
        },
      );
    } catch (error) {
      logger.error("Create similar error:", error);
      await ctx.reply(
        t("cb2.create_similar_failed", ctx.session?.userLang || "id"),
      );
    }
    return true;
  }

  // Video quality feedback
  if (data.startsWith("feedback_good_")) {
    const { redis } = await import("../../config/redis.js");
    const jobId = data.replace("feedback_good_", "");
    await ctx.answerCbQuery();
    try {
      await redis.set(`feedback:${jobId}`, "good", "EX", 86400 * 30);
    } catch (_) {
      /* Redis optional */
    }
    const feedbackUser = ctx.from
      ? await (
          await import("../../services/user.service.js")
        ).UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const feedbackLang = feedbackUser?.language || "id";
    await ctx.reply(t("feedback.thanks_good", feedbackLang));
    return true;
  }

  if (data.startsWith("feedback_bad_")) {
    const { redis } = await import("../../config/redis.js");
    const jobId = data.replace("feedback_bad_", "");
    await ctx.answerCbQuery();
    try {
      await redis.set(`feedback:${jobId}`, "bad", "EX", 86400 * 30);
    } catch (_) {
      /* Redis optional */
    }
    const feedbackUser = ctx.from
      ? await (
          await import("../../services/user.service.js")
        ).UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const feedbackLang = feedbackUser?.language || "id";
    await ctx.reply(t("feedback.thanks_bad", feedbackLang), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("btn.try_again", feedbackLang),
              callback_data: "back_prompts",
            },
          ],
        ],
      },
    });
    return true;
  }

  // Multi-photo video creation
  if (data === "generate_video_now") {
    await ctx.answerCbQuery();

    if (!ctx.session?.videoCreation?.waitingForImage) {
      const lang = ctx.session?.userLang || "id";
      await ctx.reply(t("error.no_session", lang));
      return true;
    }

    const uploadedPhotos = ctx.session.videoCreation.uploadedPhotos || [];
    if (uploadedPhotos.length === 0) {
      await ctx.reply(t("cb2.no_photos_yet", ctx.session?.userLang || "id"));
      return true;
    }

    const { handleVideoElementPrecheck } = await import("../message.js");
    await handleVideoElementPrecheck(ctx, uploadedPhotos);
    return true;
  }

  if (data === "add_more_photos") {
    await ctx.answerCbQuery();
    const count = ctx.session?.videoCreation?.uploadedPhotos?.length || 0;
    const remaining = 5 - count;
    await ctx.reply(
      t("cb2.add_more_photos", ctx.session?.userLang || "id", { remaining }),
    );
    return true;
  }

  if (data === "skip_reference_image") {
    await ctx.answerCbQuery();
    const { handleSkipImageReference } = await import("../message.js");
    await handleSkipImageReference(ctx);
    return true;
  }

  return false;
}
