import { Worker, Job } from "bullmq";
import { bullmqRedis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { AvatarService } from "@/services/avatar.service";
import { UserService } from "@/services/user.service";
import type { Telegram } from "telegraf";

export interface AvatarTalkJobData {
  telegramId: string; // bigint serialised as string
  chatId: number;
  imageUrl: string;
  text: string;
  jobId: string;
  creditsCharged: number;
  lang?: string;
}

let workerInstance: Worker<AvatarTalkJobData> | null = null;

export function startAvatarTalkWorker(bot: {
  telegram: Telegram;
}): Worker<AvatarTalkJobData> {
  if (workerInstance) {
    logger.warn(
      "Avatar talk worker already running, returning existing instance",
    );
    return workerInstance;
  }

  const telegram = bot.telegram;

  workerInstance = new Worker<AvatarTalkJobData>(
    "avatar-talk",
    async (job: Job<AvatarTalkJobData>) => {
      const {
        telegramId,
        chatId,
        imageUrl,
        text,
        jobId,
        creditsCharged,
        lang = "id",
      } = job.data;

      logger.info(`Processing avatar-talk job ${jobId}`);

      try {
        const resultUrl = await AvatarService.generateTalkingVideo(
          imageUrl,
          text,
        );

        await telegram.sendVideo(chatId, resultUrl, {
          caption:
            lang === "id"
              ? "🗣️ Foto bicara selesai!"
              : lang === "ru"
                ? "🗣️ Говорящее фото готово!"
                : lang === "zh"
                  ? "🗣️ 说话照片完成！"
                  : "🗣️ Your talking photo is ready!",
        });

        logger.info(`Talking photo generated: ${jobId}`);
      } catch (err) {
        logger.error(`Talking photo generation failed: ${jobId}`, err);

        await UserService.refundCredits(
          BigInt(telegramId),
          creditsCharged,
          jobId,
          "D-ID generation failed",
        ).catch((refundErr) =>
          logger.error("CRITICAL: talking photo refund failed", {
            jobId,
            refundErr,
          }),
        );

        await telegram
          .sendMessage(
            chatId,
            lang === "id"
              ? "❌ Gagal membuat foto bicara. Kredit dikembalikan."
              : lang === "ru"
                ? "❌ Ошибка создания говорящего фото. Кредиты возвращены."
                : lang === "zh"
                  ? "❌ 生成失败，积分已退还。"
                  : "❌ Failed to generate talking photo. Credits have been refunded.",
          )
          .catch(() => {});

        throw err; // let BullMQ handle retry
      }
    },
    {
      connection: bullmqRedis,
      concurrency: 2,
    },
  );

  workerInstance.on("completed", (job) => {
    logger.info(`Avatar talk worker: job ${job.id} completed`);
  });

  workerInstance.on("failed", (job, err) => {
    logger.error(`Avatar talk worker: job ${job?.id} failed:`, err);
  });

  workerInstance.on("error", (err) => {
    logger.error("Avatar talk worker error:", err);
  });

  logger.info("Avatar talk worker started (concurrency: 2)");
  return workerInstance;
}
