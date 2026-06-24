/**
 * Cron Jobs Setup
 *
 * Schedules all recurring background tasks:
 * - Retention check (every 6 hours)
 * - Subscription renewal (daily 00:05 WIB)
 * - Credit expiry (daily 00:00 WIB)
 * - Refund retry (every 5 minutes)
 */

import cron from "node-cron";
import { logger } from "@/utils/logger";
import { retentionQueue } from "@/workers/retention.worker";
import { SubscriptionService } from "@/services/subscription.service";
import { UserService } from "@/services/user.service";
import type { Telegraf } from "telegraf";

/**
 * Schedule all cron jobs
 */
export function scheduleCronJobs(bot: Telegraf): void {
  // Retention cron: push check jobs every 6 hours
  try {
    cron.schedule("0 */6 * * *", async () => {
      logger.info("⏰ Running scheduled retention check...");
      await retentionQueue.add("scheduled_check", {
        type: "all",
        triggeredBy: "cron",
      });
    });
    logger.info("✅ Retention cron scheduled (every 6h)");
  } catch (cronErr) {
    logger.warn("⚠️ Retention cron failed to start:", cronErr);
  }

  // Subscription renewal cron: run daily at 00:05 WIB (17:05 UTC)
  try {
    cron.schedule("5 17 * * *", async () => {
      logger.info("⏰ Running subscription renewal/expiry check...");
      const count = await SubscriptionService.checkExpiredSubscriptions();
      if (count > 0) logger.info(`✅ Processed ${count} subscription(s)`);
    });
    logger.info("✅ Subscription renewal cron scheduled (daily 00:05 WIB)");
  } catch (cronErr) {
    logger.warn("⚠️ Subscription cron failed to start:", cronErr);
  }

  // Credit expiry cron: run daily at 00:00 WIB (17:00 UTC)
  try {
    cron.schedule("0 17 * * *", async () => {
      logger.info("⏰ Running credit expiry check...");
      const count = await UserService.expireStaleCredits(bot.telegram);
      if (count > 0) logger.info(`✅ Expired credits for ${count} user(s)`);
    });
    logger.info("✅ Credit expiry cron scheduled (daily 00:00 WIB)");
  } catch (cronErr) {
    logger.warn("⚠️ Credit expiry cron failed to start:", cronErr);
  }

  // Refund retry cron: process failed refunds every 5 minutes
  try {
    cron.schedule("*/5 * * * *", async () => {
      const count = await UserService.processRefundRetries();
      if (count > 0) logger.info(`✅ Processed ${count} refund retry(s)`);
    });
    logger.info("✅ Refund retry cron scheduled (every 5 min)");
  } catch (cronErr) {
    logger.warn("⚠️ Refund retry cron failed to start:", cronErr);
  }
}
