// Clone-style branch: style-hint extraction from reference photo, queue video.
// Split from generate.execution.ts.
import { t } from "@/i18n/translations";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { ContentAnalysisService } from "@/services/content-analysis.service";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  DURATION_PRESETS,
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from "@/config/hpas-engine";
import { getCorrelationId } from "@/utils/correlation";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { showPostDelivery } from "../../generate.ui";
import type { GeneratedSceneData } from "../../generate.types";
import type { ExecPhaseCtx } from "./types";

export async function runCloneStyle(c: ExecPhaseCtx): Promise<void> {
  const creditCost = c.cost / 10;
  let styleHint = "";

  if (c.photoUrl) {
    try {
      const analysis = await ContentAnalysisService.extractPrompt(
        c.photoUrl,
        "image",
      );
      styleHint =
        analysis.success && analysis.prompt ? `, ${analysis.prompt}` : "";
    } catch {
      // Non-fatal: proceed without style hint
    }
  }

  const combinedPrompt = `${c.productDesc}${styleHint}`;
  let scenes: GeneratedSceneData[];
  try {
    scenes = await generateScenePromptsWithAI(
      combinedPrompt,
      "standard",
      c.lang === "en" ? "en" : "id",
    );
  } catch {
    scenes = generateVideoScenePrompts(
      c.industry,
      combinedPrompt,
      "standard",
      c.lang === "en" ? "en" : "id",
    );
  }

  const { VideoService: VS2 } =
    await import("../../../services/video.service.js");
  const video2 = await VS2.createJob({
    userId: c.telegramId,
    niche: c.industry,
    platform: c.platform,
    duration: DURATION_PRESETS["standard"].totalSeconds,
    scenes: scenes.length,
    title: `Clone Style — ${new Date().toLocaleDateString("id-ID")}`,
  });

  let cloneJob: unknown;
  try {
    const cloneEnqueueResult = await enqueueVideoGeneration({
      jobId: video2.jobId,
      niche: c.industry,
      platform: c.platform,
      duration: DURATION_PRESETS["standard"].totalSeconds,
      scenes: scenes.length,
      storyboard: scenes.map((s, i) => ({
        scene: i + 1,
        duration: s.durationSeconds,
        description: s.prompt,
      })),
      referenceImage: c.photoUrl || null,
      userId: c.telegramId.toString(),
      chatId: c.ctx.chat!.id,
      enableVO: true,
      enableSubtitles: true,
      language: c.user.language || "id",
      correlationId: getCorrelationId(),
      creditCost,
    });
    cloneJob = cloneEnqueueResult.job || null;
    try {
      await UserService.deductCredits(c.telegramId, creditCost);
    } catch (deductErr) {
      if (cloneJob) await (cloneJob as any).remove().catch(() => {});
      throw deductErr;
    }
    const position = cloneEnqueueResult.position;
    await c.ctx.reply(t("gen.video_queued", c.lang, { position }));
  } catch {
    const { generateVideoAsync } = await import("../../../commands/create.js");
    generateVideoAsync(
      c.ctx,
      video2.jobId,
      c.industry,
      c.platform,
      DURATION_PRESETS["standard"].totalSeconds,
      scenes.map((s, i) => ({
        scene: i + 1,
        duration: s.durationSeconds,
        description: s.prompt,
      })),
    ).catch(async (err) => {
      logger.error("Clone style generateVideoAsync failed:", err);
      await UserService.refundCredits(
        c.telegramId,
        creditCost,
        video2.jobId,
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
