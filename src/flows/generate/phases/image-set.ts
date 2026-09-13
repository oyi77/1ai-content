// Image-set branch: generate 7 scene images, enqueue video, offer preview.
// Split from generate.execution.ts.
import { t } from "@/i18n/translations";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { ImageGenerationService } from "@/services/image.service";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  DURATION_PRESETS,
  generateVideoScenePrompts,
  generateScenePromptsWithAI,
} from "@/config/hpas-engine";
import { getCorrelationId } from "@/utils/correlation";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { clearGenerateSession } from "../../generate.types";
import type { GeneratedSceneData } from "../../generate.types";
import type { ExecPhaseCtx } from "./types";

export async function runImageSet(c: ExecPhaseCtx): Promise<void> {
    let scenes: GeneratedSceneData[];
    try {
      scenes = await generateScenePromptsWithAI(
        c.productDesc,
        "standard",
        c.lang === "en" ? "en" : "id",
      );
    } catch {
      scenes = generateVideoScenePrompts(
        c.industry,
        c.productDesc,
        "standard",
        c.lang === "en" ? "en" : "id",
      );
    }
    const creditCost = c.cost / 10;

    // ── Phase A: Silent image generation with 3x retry per scene ──
    const isLocalRef = c.photoUrl && !c.photoUrl.startsWith("http");
    const selectedAR = (c.session.generateAspectRatio as string) || "9:16";
    const selectedRes = (c.session.generateResolution || "standard") as
      | "standard"
      | "hd"
      | "ultra";
    const imgParams = {
      category: c.industry,
      aspectRatio: selectedAR,
      style: "commercial",
      resolution: selectedRes,
      referenceImageUrl: c.photoUrl && !isLocalRef ? c.photoUrl : undefined,
      referenceImagePath: isLocalRef ? c.photoUrl : undefined,
      mode: (c.photoUrl ? "img2img" : "text2img") as
        | "img2img"
        | "text2img"
        | "ip_adapter",
    };

    const userImages: Array<{ sceneIndex: number; url: string }> = [];
    const MAX_RETRIES = 3;

    for (let i = 0; i < Math.min(scenes.length, 7); i++) {
      const scene = scenes[i];
      let scenePrompt = scene.prompt;
      if (c.photoUrl && c.productDesc) {
        scenePrompt = `${c.productDesc}. ${scene.prompt}. IMPORTANT: maintain the exact same product/subject appearance, colors, shape, branding, and details as the reference image.`;
      }

      // Silent retry — no per-scene messages to c.user
      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await ImageGenerationService.generateImage({
          prompt: scenePrompt,
          ...imgParams,
        });
        if (result.success && result.imageUrl) {
          userImages.push({ sceneIndex: i, url: result.imageUrl });
          success = true;
          break;
        }
        if (attempt < MAX_RETRIES)
          logger.warn(
            `Image scene ${i + 1} attempt ${attempt}/${MAX_RETRIES} failed, retrying silently...`,
          );
      }
      if (!success)
        logger.error(
          `Image scene ${i + 1} failed after ${MAX_RETRIES} attempts, skipping`,
        );
    }

    if (userImages.length === 0) {
      await c.ctx.reply(t("gen.all_scenes_failed", c.lang));
      clearGenerateSession(c.ctx);
      return;
    }

    // ── Phase B: Immediately enqueue video job with generated images ──
    const { VideoService: VS } = await import("../../../services/video.service.js");
    const video = await VS.createJob({
      userId: c.telegramId,
      niche: c.industry,
      platform: c.platform,
      duration: DURATION_PRESETS["standard"].totalSeconds,
      scenes: scenes.length,
      title: `Video ${new Date().toLocaleDateString("id-ID")}`,
    });

    const storyboard = scenes.map((s, i) => ({
      scene: i + 1,
      duration: s.durationSeconds,
      description: s.prompt,
    }));

    let imageSetJob: unknown;
    try {
      const enqueueResult = await enqueueVideoGeneration({
        jobId: video.jobId,
        niche: c.industry,
        platform: c.platform,
        duration: DURATION_PRESETS["standard"].totalSeconds,
        scenes: scenes.length,
        storyboard,
        referenceImage: c.photoUrl || null,
        userImages,
        userId: c.telegramId.toString(),
        chatId: c.ctx.chat!.id,
        enableVO: true,
        enableSubtitles: true,
        language: c.user.language || "id",
        correlationId: getCorrelationId(),
        creditCost,
      });
      imageSetJob = enqueueResult.job || null;
      try {
        await UserService.deductCredits(c.telegramId, creditCost);
      } catch (deductErr) {
        if (imageSetJob) await (imageSetJob as any).remove().catch(() => {});
        throw deductErr;
      }
      const position = enqueueResult.position;

      // ── Phase C: Non-blocking preview offer ──
      await c.ctx.reply(
        t("gen.imgset_preview_offer", c.lang, {
          count: userImages.length,
          position,
        }),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t("gen.btn_preview_images", c.lang),
                  callback_data: `imgset_preview_${video.jobId}`,
                },
              ],
              [
                {
                  text: t("gen.btn_skip_preview", c.lang),
                  callback_data: "imgset_skip",
                },
              ],
            ],
          },
        },
      );

      // Store image URLs in c.session for preview callback
      if (c.ctx.session) {
        c.ctx.session.stateData = {
          ...c.ctx.session.stateData,
          imgsetPreviewUrls: userImages.map((u) => u.url),
        };
      }
    } catch (enqueueErr) {
      logger.error(
        "Image set video enqueue failed, falling back to direct send:",
        enqueueErr,
      );
      // Fallback: generate video directly
      const { generateVideoAsync } = await import("../../../commands/create.js");
      generateVideoAsync(
        c.ctx,
        video.jobId,
        c.industry,
        c.platform,
        DURATION_PRESETS["standard"].totalSeconds,
        storyboard,
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
            "generate-imgset-fallback",
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
    return;
}
