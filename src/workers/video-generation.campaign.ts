/**
 * Video Generation Worker — Campaign Merge
 *
 * Tracks campaign completion via Redis, merges videos when all done.
 * Extracted from video-generation.worker.ts.
 */

import * as fs from "fs";
import * as path from "path";
import type { Telegram } from "telegraf";
import { logger } from "@/utils/logger";
import { redis } from "@/config/redis";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";
import {
  VIDEO_DIR,
  downloadVideo,
  concatenateVideos,
} from "./video-generation.helpers";

export async function handleCampaignJobComplete(
  telegram: Telegram,
  chatId: number,
  campaignGroupId: string,
  campaignTotal: number,
  localPath: string,
  videoUrl: string,
  niche?: string,
  userId?: string,
): Promise<void> {
  const urlsKey = `campaign_grp:${campaignGroupId}:urls`;
  const mergeKey = `campaign_grp:${campaignGroupId}:merging`;

  await redis.rpush(urlsKey, JSON.stringify({ localPath, videoUrl }));
  await redis.expire(urlsKey, 86400);

  const completedCount = await redis.llen(urlsKey);
  if (completedCount < campaignTotal) {
    logger.info(
      `Campaign ${campaignGroupId}: ${completedCount}/${campaignTotal} jobs done`,
    );
    return;
  }

  const lockAcquired = await redis.set(mergeKey, "1", "EX", 3600, "NX");
  if (lockAcquired !== "OK") return;

  try {
    const rawEntries = await redis.lrange(urlsKey, 0, -1);
    const tmpPaths: string[] = [];

    for (let i = 0; i < rawEntries.length; i++) {
      let entry: { localPath?: string; videoUrl?: string };
      try {
        entry = JSON.parse(rawEntries[i]);
      } catch {
        continue;
      }

      if (entry.localPath && fs.existsSync(entry.localPath)) {
        tmpPaths.push(entry.localPath);
        continue;
      }
      if (entry.videoUrl) {
        const dlPath = path.join(
          VIDEO_DIR,
          `campaign_${campaignGroupId}_dl${i}.mp4`,
        );
        try {
          await downloadVideo(entry.videoUrl, dlPath);
          tmpPaths.push(dlPath);
        } catch (dlErr) {
          logger.warn(
            `Campaign ${campaignGroupId}: failed to download part ${i}:`,
            dlErr,
          );
        }
      }
    }

    if (tmpPaths.length === 0) {
      const { t: tCampaign } = await import("../i18n/translations.js");
      await telegram.sendMessage(
        chatId,
        tCampaign("gen.campaign_failed", "id"),
      );
      return;
    }

    const dbUserForLang =
      userId && userId !== "0"
        ? await UserService.findByTelegramId(BigInt(userId))
        : null;
    const lang = dbUserForLang?.language || "id";

    if (tmpPaths.length === 1) {
      await telegram.sendVideo(
        chatId,
        { source: tmpPaths[0] },
        {
          caption: t("gen.campaign_done_single", lang, {
            count: "1",
            total: String(campaignTotal),
          }),
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎬 Buat Lagi", callback_data: "create_video_new" }],
            ],
          },
        },
      );
    } else {
      const mergedPath = path.join(
        VIDEO_DIR,
        `campaign_merged_${campaignGroupId}.mp4`,
      );
      try {
        await concatenateVideos(tmpPaths, mergedPath, niche);
        await telegram.sendVideo(
          chatId,
          { source: mergedPath },
          {
            caption: t("gen.campaign_done_all", lang, {
              total: String(tmpPaths.length),
            }),
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🎬 Buat Campaign Lagi",
                    callback_data: "action_campaign",
                  },
                ],
                [{ text: "🏠 Menu Utama", callback_data: "main_menu" }],
              ],
            },
          },
        );
      } catch (mergeErr) {
        logger.error(`Campaign merge failed for ${campaignGroupId}:`, mergeErr);
        await telegram.sendVideo(
          chatId,
          { source: tmpPaths[0] },
          {
            caption:
              "✅ Campaign selesai — mengirim video pertama (merge gagal).",
            parse_mode: "Markdown",
          },
        );
      } finally {
        try {
          fs.unlinkSync(mergedPath);
        } catch (_) {
          /* file may not exist */
        }
      }
    }
  } finally {
    await redis
      .del(urlsKey)
      .catch((err) =>
        logger.warn("Redis cleanup failed", { error: (err as Error).message }),
      );
    await redis
      .del(mergeKey)
      .catch((err) =>
        logger.warn("Redis cleanup failed", { error: (err as Error).message }),
      );
  }
}
