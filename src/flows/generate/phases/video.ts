// Video branch: storyboard (manual or AI), create job, enqueue or fallback.
// Split from generate.execution.ts.
import { t } from "@/i18n/translations";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from "@/config/hpas-engine";
import { getCorrelationId } from "@/utils/correlation";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { showPostDelivery } from "../../generate.ui";
import type {
  GeneratedSceneData,
  ManualSceneData,
} from "../../generate.types";
import type { ExecPhaseCtx } from "./types";

export async function runVideo(c: ExecPhaseCtx): Promise<void> {
    // Use manual storyboard if Pro mode provided it, otherwise auto-generate
    const useManualStoryboard =
      c.session.generateStoryboardMode === "manual" &&
      c.session.generateManualStoryboard?.length;
    let scenes: GeneratedSceneData[] | ManualSceneData[];
    if (useManualStoryboard) {
      scenes = c.session.generateManualStoryboard!;
    } else {
      try {
        scenes = await generateScenePromptsWithAI(
          c.productDesc,
          c.preset,
          c.lang === "en" ? "en" : "id",
        );
      } catch {
        scenes = generateVideoScenePrompts(
          c.industry,
          c.productDesc,
          c.preset,
          c.lang === "en" ? "en" : "id",
        );
      }
    }
    const creditCost = c.cost / 10;

    const { VideoService: VS } = await import("../../../services/video.service.js");
    const video = await VS.createJob({
      userId: c.telegramId,
      niche: c.industry,
      platform: c.platform,
      duration: c.presetConfig.totalSeconds,
      scenes: scenes.length,
      title: `Video ${new Date().toLocaleDateString("id-ID")}`,
    });

    const storyboard = useManualStoryboard
      ? (scenes as ManualSceneData[]).map((s, i) => ({
          scene: i + 1,
          duration: s.durationSeconds,
          description: s.description,
        }))
      : (scenes as GeneratedSceneData[]).map((s, i) => ({
          scene: i + 1,
          duration: s.durationSeconds,
          description: s.prompt,
        }));

    try {
      const { job: enqueuedJob, position } = await enqueueVideoGeneration({
        jobId: video.jobId,
        niche: c.industry,
        platform: c.platform,
        duration: c.presetConfig.totalSeconds,
        scenes: scenes.length,
        storyboard,
        referenceImage: c.photoUrl || null,
        userId: c.telegramId.toString(),
        chatId: c.ctx.chat!.id,
        enableVO: true,
        enableSubtitles: true,
        language: c.user.language || "id",
        voScript: c.session.generateManualTranscript || undefined,
        correlationId: getCorrelationId(),
        creditCost,
      });
      try {
        await UserService.deductCredits(c.telegramId, creditCost);
      } catch (deductErr) {
        await enqueuedJob.remove().catch(() => {});
        throw deductErr;
      }
      await c.ctx.reply(t("gen.video_queued", c.lang, { position }));
    } catch {
      const { generateVideoAsync } = await import("../../../commands/create.js");
      generateVideoAsync(
        c.ctx,
        video.jobId,
        c.industry,
        c.platform,
        c.presetConfig.totalSeconds,
        scenes.map((s, i) => ({
          scene: i + 1,
          duration: s.durationSeconds,
          description: useManualStoryboard
            ? (s as ManualSceneData).description
            : (s as GeneratedSceneData).prompt,
        })),
      ).catch(async (err) => {
        logger.error("Video generateVideoAsync failed:", err);
        await UserService.refundCredits(
          c.telegramId,
          creditCost,
          video.jobId,
          err?.message || "fallback failure",
        ).catch(async (refundErr) => {
          logger.error("CRITICAL: refundCredits failed", {
            telegramId: c.telegramId.toString(),
            creditCost,
            err: refundErr,
          });
          await UserService.queueRefundRetry(
            c.telegramId,
            creditCost,
            "generate-fallback",
            String(refundErr),
          );
          sendAdminAlert("critical", "Refund Failed", {
            userId: c.telegramId.toString(),
            amount: creditCost,
            error: String(refundErr),
          });
        });
        await c.ctx.telegram
          .sendMessage(c.ctx.chat!.id, t("gen.video_failed_refund", c.lang))
          .catch(() => {});
      });
      await c.ctx.reply(t("gen.video_processing", c.lang));
    }
    await showPostDelivery(c.ctx);
    return;
}
