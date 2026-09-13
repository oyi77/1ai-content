// Campaign branch: single video with N hook-variation scenes.
// Split from generate.execution.ts.
import { t } from "@/i18n/translations";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { enqueueVideoGeneration } from "@/config/queue";
import { CampaignService } from "@/services/campaign.service";
import { getCorrelationId } from "@/utils/correlation";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { clearGenerateSession } from "../../generate.types";
import { showPostDelivery } from "../../generate.ui";
import type { ExecPhaseCtx } from "./types";

export async function runCampaign(c: ExecPhaseCtx): Promise<void> {
  const campSize = (c.session.generateCampaignSize as 5 | 10) || 5;
  const creditCost = c.cost / 10;
  const hookVariations = CampaignService.getHookVariations(campSize);

  // Build a single storyboard: each scene = a different hook variation
  const storyboard = hookVariations.map((hookVar, i) => {
    const hookPrompt = hookVar.promptTemplate
      .replace("{product}", c.productDesc)
      .replace("{problem}", `masalah ${c.industry}`);
    return {
      scene: i + 1,
      duration: 5,
      description: `[${hookVar.name}] ${hookPrompt}`,
    };
  });

  const totalDuration = storyboard.reduce((s, sc) => s + sc.duration, 0);

  const { VideoService: VS3 } =
    await import("../../../services/video.service.js");
  try {
    const vid = await VS3.createJob({
      userId: c.telegramId,
      niche: c.industry,
      platform: c.platform,
      duration: totalDuration,
      scenes: campSize,
      title: `Campaign ${campSize} Scene — ${c.productDesc.slice(0, 40)}`,
    });

    let campaignJob: unknown;
    try {
      const enqueueResult2 = await enqueueVideoGeneration({
        jobId: vid.jobId,
        niche: c.industry,
        platform: c.platform,
        duration: totalDuration,
        scenes: campSize,
        storyboard,
        referenceImage: c.photoUrl || null,
        userId: c.telegramId.toString(),
        chatId: c.ctx.chat!.id,
        enableVO: true,
        enableSubtitles: true,
        language: c.user.language || "id",
        correlationId: getCorrelationId(),
        creditCost,
      });
      campaignJob = enqueueResult2.job || null;
      try {
        await UserService.deductCredits(c.telegramId, creditCost);
      } catch (deductErr) {
        if (campaignJob)
          await (campaignJob as any).remove().catch(() => {});
        throw deductErr;
      }
      const position = enqueueResult2.position;
      await c.ctx.reply(
        t("gen.campaign_processing", c.lang, { size: campSize, position }),
        { parse_mode: "Markdown" },
      );
    } catch {
      const { generateVideoAsync } = await import("../../../commands/create.js");
      generateVideoAsync(
        c.ctx,
        vid.jobId,
        c.industry,
        c.platform,
        totalDuration,
        storyboard,
      ).catch(async (err) => {
        logger.error("Campaign generateVideoAsync failed:", err);
        await UserService.refundCredits(
          c.telegramId,
          creditCost,
          vid.jobId,
          err?.message || "campaign failure",
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
          .sendMessage(c.ctx.chat!.id, t("gen.campaign_failed", c.lang))
          .catch(() => {});
      });
      await c.ctx.reply(t("gen.video_processing", c.lang));
    }
  } catch (jobErr) {
    logger.error("Campaign job creation failed:", jobErr);
    await c.ctx.reply(t("gen.campaign_failed", c.lang), {
      parse_mode: "Markdown",
    });
    clearGenerateSession(c.ctx);
    return;
  }
  await showPostDelivery(c.ctx);
  return;
}
