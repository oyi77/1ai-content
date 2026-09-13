// Free-trial branch: serve a cached template video or generate + cache one.
// Split from generate.execution.ts — true = handled, caller must return.
import { t } from "@/i18n/translations";
import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from "@/config/hpas-engine";
import { clearGenerateSession } from "../../generate.types";
import type { GeneratedSceneData } from "../../generate.types";
import type { ExecPhaseCtx } from "./types";

export async function runFreeTrial(c: ExecPhaseCtx): Promise<void> {
    const { TemplateVideoService } =
      await import("../../../services/template-video.service.js");
    const userNiche = c.user.selectedNiche || "general";
    const template = await TemplateVideoService.getRandom(userNiche);

    if (template) {
      try {
        await c.ctx.replyWithVideo(template.videoUrl, {
          caption: t("gen.free_trial_video", c.lang, { niche: userNiche }),
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t("btn.create_own", c.lang),
                  callback_data: "generate_start",
                },
              ],
              [{ text: t("btn.topup", c.lang), callback_data: "topup" }],
            ],
          },
        });
      } catch {
        // If video send fails, try as URL link
        await c.ctx.reply(
          t("gen.free_trial_video", c.lang, { niche: userNiche }) +
            `\n\n[Download](${template.videoUrl})`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t("btn.create_own", c.lang),
                    callback_data: "generate_start",
                  },
                ],
                [{ text: t("btn.topup", c.lang), callback_data: "topup" }],
              ],
            },
          },
        );
      }
      // Mark welcome bonus as used
      await prisma.user.updateMany({
        where: { telegramId: c.telegramId, welcomeBonusUsed: false },
        data: { welcomeBonusUsed: true },
      });
      clearGenerateSession(c.ctx);
      await c.redis.del(c.lockKey).catch(() => {});
      return;
    }
    // No template for this niche — generate one, cache it, and serve it
    // First c.user per niche pays the c.cost; all future users get the cached version
    await c.ctx.reply(t("gen.generating_trial", c.lang), {
      parse_mode: "Markdown",
    });

    // Generate a 15s video, then cache it as template
    let trialScenes: GeneratedSceneData[];
    try {
      trialScenes = await generateScenePromptsWithAI(
        c.productDesc || userNiche,
        "quick",
        c.lang === "en" ? "en" : "id",
      );
    } catch {
      trialScenes = generateVideoScenePrompts(
        c.industry,
        c.productDesc || userNiche,
        "quick",
        c.lang === "en" ? "en" : "id",
      );
    }
    const trialStoryboard = trialScenes.map((s, i) => ({
      scene: i + 1,
      duration: s.durationSeconds,
      description: s.prompt,
    }));

    try {
      const { VideoService: TrialVS } =
        await import("../../../services/video.service.js");
      const trialVideo = await TrialVS.createJob({
        userId: c.telegramId,
        niche: userNiche,
        platform: "tiktok",
        duration: 15,
        scenes: trialStoryboard.length,
      });

      const { enqueueVideoGeneration } = await import("../../../config/queue.js");
      await enqueueVideoGeneration({
        jobId: trialVideo.jobId,
        userId: c.telegramId.toString(),
        chatId: c.ctx.chat!.id,
        niche: userNiche,
        platform: "tiktok",
        duration: 15,
        scenes: trialStoryboard.length,
        storyboard: trialStoryboard,
        enableVO: false,
        enableSubtitles: true,
        language: c.lang,
        cacheAsTemplate: true,
        cacheNiche: userNiche,
      });

      await c.ctx.reply(t("gen.trial_queued", c.lang), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.main_menu", c.lang), callback_data: "main_menu" }],
          ],
        },
      });
    } catch (trialErr) {
      logger.error("Free trial generation failed", { error: trialErr });
      await c.ctx.reply(t("gen.trial_failed", c.lang));
    }

    // Mark welcome bonus as used regardless of outcome
    await prisma.user.updateMany({
      where: { telegramId: c.telegramId, welcomeBonusUsed: false },
      data: { welcomeBonusUsed: true },
    });
    clearGenerateSession(c.ctx);
    await c.redis.del(c.lockKey).catch(() => {});
    return;
}
