/**
 * Worker Initialization
 *
 * Starts all background workers:
 * - Video generation worker
 * - Avatar talk worker
 * - Startup cleanup
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { startVideoWorker } from "@/workers/video-generation.worker";
import { startAvatarTalkWorker } from "@/workers/avatar-talk.worker";
import {
  cleanupStuckVideos,
  setCleanupTelegram,
} from "@/workers/cleanup.worker";
import { setAlertTelegram, sendAdminAlert as sendGroupAlert } from "@/services/admin-alert.service";
import type { Telegraf } from "telegraf";

/**
 * Start all background workers
 */
export async function startWorkers(bot: Telegraf): Promise<void> {
  const config = getConfig();
  const isPlaceholderToken =
    !config.BOT_TOKEN || config.BOT_TOKEN.startsWith("placeholder");

  // Start video generation worker
  if (isPlaceholderToken) {
    logger.warn("⚠️ Skipping video worker (placeholder BOT_TOKEN)");
  } else {
    try {
      startVideoWorker(bot);
      logger.info("✅ Video generation worker started");
    } catch {
      logger.warn("⚠️ Video worker failed to start, falling back to direct async");
    }
  }

  // Start avatar talk worker
  if (isPlaceholderToken) {
    logger.warn("⚠️ Skipping avatar talk worker (placeholder BOT_TOKEN)");
  } else {
    try {
      startAvatarTalkWorker(bot);
      logger.info("✅ Avatar talk worker started");
    } catch {
      logger.warn("⚠️ Avatar talk worker failed to start");
    }
  }

  // Set telegram instance for cleanup notifications and admin alerts
  if (!isPlaceholderToken) {
    setCleanupTelegram(bot.telegram);
    setAlertTelegram(bot.telegram);
  }

  if (config.ADMIN_ALERT_CHAT_ID && !isPlaceholderToken) {
    sendGroupAlert("info", "Bot Started", {
      version: "v3.0",
      env: config.NODE_ENV,
    });
  }

  // Run startup cleanup
  if (!isPlaceholderToken) {
    try {
      const stuckCount = await Promise.race([
        cleanupStuckVideos(bot.telegram),
        new Promise<number>((resolve) => { setTimeout(() => resolve(0), 10000); }),
      ]);
      if (stuckCount > 0) {
        logger.info(`✅ Startup cleanup: resolved ${stuckCount} stuck videos`);
      }
    } catch {
      logger.warn("⚠️ Startup stuck video cleanup failed");
    }
  } else {
    logger.warn("⚠️ Skipping startup cleanup (placeholder BOT_TOKEN)");
  }
}
