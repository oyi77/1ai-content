import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";
import { Queue } from "bullmq";
import { bullmqRedis } from "@/config/redis";
import type { AvatarTalkJobData } from "@/workers/avatar-talk.worker";

const avatarTalkQueue = new Queue<AvatarTalkJobData>("avatar-talk", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

const TALKING_PHOTO_CREDIT_COST = 0.8;

export async function handleAvatarTalkCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  if (data === "avatar_talk_start") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || "id";
    const telegramId = BigInt(ctx.from!.id);

    const user = await UserService.findByTelegramId(telegramId);
    if (!user || Number(user.creditBalance) < TALKING_PHOTO_CREDIT_COST) {
      await ctx.reply(
        t("cb.insufficient_credits_cost", lang, {
          cost: TALKING_PHOTO_CREDIT_COST,
        }),
      );
      return true;
    }

    await ctx.reply(
      lang === "id"
        ? `🗣️ *Foto Bicara*\n\nKirim foto wajah yang ingin dibuat berbicara.\n\n_Biaya: ${TALKING_PHOTO_CREDIT_COST} kredit_`
        : lang === "ru"
          ? `🗣️ *Говорящее фото*\n\nОтправьте фото лица, которое должно говорить.\n\n_Стоимость: ${TALKING_PHOTO_CREDIT_COST} кредита_`
          : lang === "zh"
            ? `🗣️ *说话照片*\n\n发送要让其说话的人脸照片。\n\n_费用：${TALKING_PHOTO_CREDIT_COST} 积分_`
            : `🗣️ *Talking Photo*\n\nSend a portrait photo to animate.\n\n_Cost: ${TALKING_PHOTO_CREDIT_COST} credits_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.cancel", lang), callback_data: "main_menu" }],
          ],
        },
      },
    );
    ctx.session.state = "avatar_talk_photo";
    return true;
  }

  return false;
}

/**
 * Handle the photo upload step (state: avatar_talk_photo)
 * Called from message handler when state === 'avatar_talk_photo' and a photo is received.
 */
export async function handleAvatarTalkPhoto(
  ctx: BotContext,
  photoUrl: string,
): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  ctx.session.stateData = {
    ...ctx.session.stateData,
    avatarTalkPhotoUrl: photoUrl,
  };
  ctx.session.state = "avatar_talk_text";

  await ctx.reply(
    lang === "id"
      ? "✅ Foto diterima! Sekarang kirim teks yang ingin diucapkan."
      : lang === "ru"
        ? "✅ Фото получено! Теперь отправьте текст для озвучки."
        : lang === "zh"
          ? "✅ 照片已收到！现在发送要说的文字。"
          : "✅ Photo received! Now send the text you want the photo to say.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("btn.cancel", lang), callback_data: "main_menu" }],
        ],
      },
    },
  );
}

/**
 * Handle the text input step (state: avatar_talk_text)
 * Called from message handler when state === 'avatar_talk_text' and text is received.
 */
export async function handleAvatarTalkText(
  ctx: BotContext,
  text: string,
): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  const telegramId = BigInt(ctx.from!.id);
  const photoUrl = ctx.session.stateData?.avatarTalkPhotoUrl as
    | string
    | undefined;

  if (!photoUrl) {
    await ctx.reply(
      lang === "id"
        ? "❌ Foto tidak ditemukan. Mulai ulang dari menu."
        : "❌ Photo not found. Please start over from the menu.",
    );
    ctx.session.state = "DASHBOARD";
    return;
  }

  const user = await UserService.findByTelegramId(telegramId);
  if (!user || Number(user.creditBalance) < TALKING_PHOTO_CREDIT_COST) {
    await ctx.reply(
      t("cb.insufficient_credits_cost", lang, {
        cost: TALKING_PHOTO_CREDIT_COST,
      }),
    );
    ctx.session.state = "DASHBOARD";
    return;
  }

  // Deduct credits upfront
  await UserService.deductCredits(telegramId, TALKING_PHOTO_CREDIT_COST);
  const jobId = `TALK-${Date.now()}-${telegramId}`;
  ctx.session.state = "DASHBOARD";

  // Enqueue heavy work — D-ID polling can take ~90s, well beyond Telegram's 60s webhook timeout
  await avatarTalkQueue.add("generate", {
    telegramId: telegramId.toString(),
    chatId: ctx.from!.id,
    imageUrl: photoUrl,
    text,
    jobId,
    creditsCharged: TALKING_PHOTO_CREDIT_COST,
    lang,
  });

  await ctx.reply(
    lang === "id"
      ? "⏳ Foto bicara sedang dibuat, proses ini membutuhkan hingga 90 detik..."
      : lang === "ru"
        ? "⏳ Говорящее фото создаётся, это займёт до 90 секунд..."
        : lang === "zh"
          ? "⏳ 正在生成说话照片，最多需要90秒..."
          : "⏳ Generating your talking video, please wait ~90 seconds...",
  );

  logger.info(`Talking photo job enqueued: ${jobId}`);
}
