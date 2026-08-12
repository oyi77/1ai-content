/**
 * Cleanup Worker
 *
 * Scheduled daily at 3am to:
 *   1. Delete local video files older than 7 days from /tmp/videos/
 *   2. Hard-delete DB video records with status 'deleted' older than 7 days
 *   3. Clean up orphaned quality-check frames from /tmp/quality_check_frames/
 *   4. Mark stuck "processing" videos (>30 min) as failed, refund credits, notify user
 *   5. Mark expired pending payment transactions (>2 hours) as failed
 *
 * Safety: never deletes files for videos that are still processing.
 */

import { Worker, Job } from "bullmq";
import { bullmqRedis } from "@/config/redis";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { UserService } from "@/services/user.service";
import { getVideoCreditCost } from "@/config/pricing";
import * as fs from "fs";
import * as path from "path";
import type { Telegram } from "telegraf";

const VIDEO_DIR = getConfig().VIDEO_DIR;
const FRAME_DIR = "/tmp/quality_check_frames";
const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface CleanupResult {
  filesDeleted: number;
  freedMB: number;
  dbRecordsDeleted: number;
  framesDeleted: number;
}

/**
 * Clean up old video files from the local filesystem.
 * Skips files whose jobId corresponds to a video that is still processing.
 */
async function cleanupLocalFiles(): Promise<{
  filesDeleted: number;
  freedBytes: number;
}> {
  let filesDeleted = 0;
  let freedBytes = 0;

  if (!fs.existsSync(VIDEO_DIR)) {
    return { filesDeleted, freedBytes };
  }

  const cutoff = Date.now() - RETENTION_MS;

  // Get all actively processing job IDs to avoid deleting their files
  const activeVideos = await prisma.video.findMany({
    where: { status: { in: ["processing", "queued"] } },
    select: { jobId: true },
  });
  const activeJobIds = new Set(activeVideos.map((v) => v.jobId));

  const files = fs.readdirSync(VIDEO_DIR);

  for (const file of files) {
    const filePath = path.join(VIDEO_DIR, file);

    try {
      const stat = fs.statSync(filePath);

      // Skip if not a file
      if (!stat.isFile()) continue;

      // Skip if file is newer than retention period
      if (stat.mtimeMs > cutoff) continue;

      // Extract jobId from filename pattern: VID-xxx.mp4 or VID-xxx_scene_N.mp4
      const jobIdMatch = file.match(/^(VID-[^_.]+)/);
      const jobId = jobIdMatch ? jobIdMatch[1] : null;

      // Skip if this file belongs to an actively processing video
      if (jobId && activeJobIds.has(jobId)) {
        logger.debug(`[Cleanup] Skipping active job file: ${file}`);
        continue;
      }

      freedBytes += stat.size;
      fs.unlinkSync(filePath);
      filesDeleted++;
    } catch (err) {
      logger.warn(
        `[Cleanup] Failed to process file ${file}:`,
        (err as Error).message,
      );
    }
  }

  return { filesDeleted, freedBytes };
}

/**
 * Hard-delete DB records that were soft-deleted more than 7 days ago.
 */
async function cleanupDatabaseRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const result = await prisma.video.deleteMany({
    where: {
      status: "deleted",
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}

/**
 * Clean up orphaned quality check frames from the temp directory.
 */
async function cleanupFrames(): Promise<number> {
  let framesDeleted = 0;

  if (!fs.existsSync(FRAME_DIR)) {
    return framesDeleted;
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Frames older than 1 day
  const files = fs.readdirSync(FRAME_DIR);

  for (const file of files) {
    try {
      const filePath = path.join(FRAME_DIR, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        framesDeleted++;
      }
    } catch (_) {
      /* ignore individual file errors */
    }
  }

  return framesDeleted;
}

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// Store telegram instance for sending stuck video notifications
let telegramInstance: Telegram | null = null;

/**
 * Set the Telegram instance for sending notifications.
 */
export function setCleanupTelegram(telegram: Telegram): void {
  telegramInstance = telegram;
}

/**
 * Find videos stuck in "processing" for more than 30 minutes,
 * mark them as failed, refund credits, and notify the user.
 */
export async function cleanupStuckVideos(
  telegram?: Telegram | null,
): Promise<number> {
  const tg = telegram || telegramInstance;
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuckVideos = await prisma.video.findMany({
    where: {
      status: "processing",
      createdAt: { lt: cutoff },
    },
  });

  if (stuckVideos.length === 0) return 0;

  logger.info(
    `[Cleanup] Found ${stuckVideos.length} stuck videos (processing > 30 min)`,
  );

  for (const video of stuckVideos) {
    try {
      await prisma.video.update({
        where: { id: video.id },
        data: { status: "failed", errorMessage: "Timed out after 30 minutes" },
      });

      const creditCost =
        Number(video.creditsUsed) || getVideoCreditCost(video.duration);
      await UserService.refundCredits(
        BigInt(video.userId.toString()),
        creditCost,
        video.jobId,
        "Video stuck in processing > 30 min",
      );

      if (tg) {
        try {
          await tg.sendMessage(
            video.userId.toString(),
            `⚠️ Video generation timed out\n\nJob: ${video.jobId}\n` +
              `Your ${creditCost} credits have been refunded.\n\n` +
              `Please try again — if this keeps happening, contact /support.`,
          );
        } catch (sendErr) {
          logger.warn(
            `[Cleanup] Failed to notify user ${video.userId}:`,
            sendErr,
          );
        }
      }

      logger.info(
        `[Cleanup] Marked video ${video.jobId} as failed, refunded ${creditCost} credits`,
      );
    } catch (err) {
      logger.error(
        `[Cleanup] Failed to clean up stuck video ${video.jobId}:`,
        err,
      );
    }
  }

  return stuckVideos.length;
}

/**
 * Mark pending payment transactions older than 2 hours as failed.
 * These are abandoned payments where the user never completed the flow.
 */
async function cleanupExpiredTransactions(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours

  const result = await prisma.transaction.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
    },
    data: { status: "failed" },
  });

  if (result.count > 0) {
    logger.info(
      `[Cleanup] Expired ${result.count} abandoned pending transactions`,
    );
  }

  return result.count;
}

/**
 * Mark pending transactions whose expiredAt timestamp has passed as 'expired'.
 * These are gateway-issued payment links that have hit their own deadline.
 */
async function cleanupGatewayExpiredTransactions(): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: {
      status: "pending",
      expiredAt: { lt: new Date() },
    },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    logger.info(`Marked ${result.count} expired pending transactions`);
  }
}

/**
 * Main cleanup job processor.
 */
async function processCleanup(_job: Job): Promise<CleanupResult> {
  logger.info("[Cleanup] Starting scheduled cleanup...");

  const [
    localResult,
    dbRecordsDeleted,
    framesDeleted,
    stuckCleaned,
    expiredTxns,
  ] = await Promise.all([
    cleanupLocalFiles(),
    cleanupDatabaseRecords(),
    cleanupFrames(),
    cleanupStuckVideos(),
    cleanupExpiredTransactions(),
  ]);

  await cleanupGatewayExpiredTransactions();

  const freedMB =
    Math.round((localResult.freedBytes / (1024 * 1024)) * 100) / 100;

  const result: CleanupResult = {
    filesDeleted: localResult.filesDeleted,
    freedMB,
    dbRecordsDeleted,
    framesDeleted,
  };

  logger.info(
    `[Cleanup] Cleaned up ${result.filesDeleted} files, freed ${result.freedMB} MB, ` +
      `hard-deleted ${result.dbRecordsDeleted} DB records, removed ${result.framesDeleted} temp frames, ` +
      `${stuckCleaned} stuck videos resolved, ${expiredTxns} expired transactions cleared`,
  );

  return result;
}

// ── Worker instance ──

let cleanupWorkerInstance: Worker | null = null;

/**
 * Start the cleanup worker.
 * Called from queue initialization.
 */
export function startCleanupWorker(): Worker {
  if (cleanupWorkerInstance) {
    logger.warn("Cleanup worker already running, returning existing instance");
    return cleanupWorkerInstance;
  }

  cleanupWorkerInstance = new Worker("cleanup-videos", processCleanup, {
    connection: bullmqRedis,
    concurrency: 1,
  });

  cleanupWorkerInstance.on("completed", (job, result: CleanupResult) => {
    logger.info(
      `Cleanup worker: job ${job.id} completed — ${result.filesDeleted} files, ${result.freedMB} MB freed`,
    );
  });

  cleanupWorkerInstance.on("failed", (job, err) => {
    logger.error(`Cleanup worker: job ${job?.id} failed:`, err);
  });

  cleanupWorkerInstance.on("error", (err) => {
    logger.error("Cleanup worker error:", err);
  });

  logger.info("Cleanup worker started");
  return cleanupWorkerInstance;
}
