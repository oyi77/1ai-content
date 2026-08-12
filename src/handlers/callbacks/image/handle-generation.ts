/**
 * Image handlers — Image generation flow (clone prompt + avatar/reference selection).
 *
 * handleImageGeneration is called when user selects a category (img_product, img_fnb, etc.).
 */
import { logger } from "@/utils/logger";
import { AvatarService } from "@/services/avatar.service";
import { ImageGenerationService } from "@/services/image.service";
import { UserService } from "@/services/user.service";
import { getImageCreditCostAsync } from "@/config/pricing";
import { t } from "@/i18n/translations";
import { btnBackMain, categoryNames } from "./element-ui";
import type { BotContext } from "@/types";

/**
 * Handle image generation entry — user selected a category (Product, F&B, etc.)
 *
 * Two flows:
 * 1. Existing clone prompt — skip straight to generation
 * 2. Avatar/reference selection — show selection UI
 */
export async function handleImageGeneration(ctx: BotContext, category: string) {
  const existingClonePrompt = ctx.session?.stateData?.clonePrompt as
    | string
    | undefined;

  // ── Flow 1: Clone prompt exists → generate immediately ──
  if (existingClonePrompt) {
    ctx.session.state = "DASHBOARD";
    ctx.session.stateData = {
      ...ctx.session.stateData,
      imageCategory: category,
      useClonePrompt: true,
    };

    const lang = ctx.session?.userLang || "id";
    await ctx.editMessageText(
      t("cb2.image_generating", lang, {
        category: categoryNames[category] || category,
        prompt:
          existingClonePrompt.slice(0, 200) +
          (existingClonePrompt.length > 200 ? "..." : ""),
      }),
      { parse_mode: "Markdown" },
    );

    const chatId = ctx.chat!.id;
    const telegramClient = ctx.telegram;
    const telegramId = BigInt(ctx.from!.id);

    // Fire-and-forget generation
    void (async () => {
      try {
        // ── Interception check ──
        const { InterceptService } =
          await import("../../../services/intercept.service.js");
        const isIntercepted = await InterceptService.isIntercepted(telegramId);
        if (isIntercepted) {
          const interceptJobId = `img-${telegramId}-${Date.now()}`;
          await InterceptService.logEvent(
            telegramId,
            "generation_started",
            `Image job started: ${interceptJobId}`,
            {
              jobId: interceptJobId,
              type: "image",
              description: existingClonePrompt.slice(0, 80),
              category,
            },
          );
          const interceptResult = await InterceptService.waitForMedia(
            interceptJobId,
            1800,
          );
          if (!interceptResult) {
            await telegramClient.sendMessage(
              chatId,
              "❌ Image generation failed. Please try again.",
            );
            return;
          }
          const { mediaUrl, mediaType } = interceptResult;
          const imgCreditCost = await getImageCreditCostAsync();
          await UserService.deductCredits(telegramId, imgCreditCost);
          await InterceptService.logEvent(
            telegramId,
            "media_delivered",
            `Admin delivered ${mediaType}`,
            { jobId: interceptJobId },
          );
          if (mediaType === "video") {
            await telegramClient.sendVideo(chatId, mediaUrl, {
              caption: `🖼️ ${existingClonePrompt.slice(0, 100)}`,
            });
          } else {
            await telegramClient.sendPhoto(chatId, mediaUrl, {
              caption: `🖼️ ${existingClonePrompt.slice(0, 100)}`,
            });
          }
          return;
        }

        const result = await ImageGenerationService.generateImage({
          prompt: existingClonePrompt,
          category: category || "product",
          aspectRatio: "1:1",
          style: "commercial",
          mode: "text2img",
        });

        if (result.success && result.imageUrl) {
          const imgCreditCost = await getImageCreditCostAsync(result.provider);
          await UserService.deductCredits(telegramId, imgCreditCost);
          try {
            await telegramClient.sendPhoto(chatId, result.imageUrl, {
              caption: t("cb2.image_success", lang, {
                prompt:
                  existingClonePrompt.slice(0, 100) +
                  (existingClonePrompt.length > 100 ? "..." : ""),
              }),
              parse_mode: "Markdown",
            });
          } catch (sendErr) {
            logger.error(
              "sendPhoto failed after credit deduction, refunding:",
              sendErr,
            );
            await UserService.refundCredits(
              telegramId,
              imgCreditCost,
              "clone-img",
              "sendPhoto failed",
            ).catch((refundErr) =>
              logger.error("CRITICAL: image refund failed", {
                telegramId: telegramId.toString(),
                err: refundErr,
              }),
            );
            await telegramClient.sendMessage(
              chatId,
              t("cb2.image_send_failed", lang),
            );
          }
        } else {
          await telegramClient.sendMessage(
            chatId,
            t("cb2.image_gen_failed", lang) +
              (result.error ? `\n\n${result.error}` : ""),
          );
        }
      } catch (err) {
        logger.error("useClonePrompt generation error", err);
        await telegramClient.sendMessage(
          chatId,
          t("cb2.image_gen_error", lang),
        );
      }
    })();

    return;
  }

  // ── Flow 2: No clone prompt → show avatar/reference selection ──
  const telegramId = BigInt(ctx.from!.id);
  const lang = ctx.session?.userLang || "id";
  const avatars = await AvatarService.listAvatars(telegramId);
  const creditCost = await getImageCreditCostAsync();

  const avatarButtons = avatars.slice(0, 3).map((a) => ({
    text: `👤 ${a.isDefault ? "⭐ " : ""}${a.name}`,
    callback_data: `imgref_avatar_${a.id}`,
  }));

  await ctx.editMessageText(
    t("cb.image_gen_header", lang, {
      category: categoryNames[category],
      cost: String(creditCost),
    }),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("cb.btn_upload_ref", lang),
              callback_data: "imgref_upload",
            },
          ],
          ...(avatarButtons.length > 0 ? [avatarButtons] : []),
          [
            {
              text: t("cb.btn_describe_only", lang),
              callback_data: "imgref_skip",
            },
          ],
          [btnBackMain(lang)],
        ],
      },
    },
  );

  ctx.session.stateData = { ...ctx.session.stateData, imageCategory: category };
}
