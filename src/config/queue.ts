/**
 * Queue Configuration
 *
 * BullMQ queue initialization
 */

import { Queue, Worker, Job } from "bullmq";
import { bullmqRedis } from "./redis";
import { logger } from "@/utils/logger";
import { SubscriptionService } from "@/services/subscription.service";
import { startCleanupWorker } from "@/workers/cleanup.worker";
import type { VideoGenerationJobData } from "@/workers/video-generation.worker";

// Queue instances
export const videoQueue = new Queue("video-generation", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const paymentQueue = new Queue("payment-processing", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const notificationQueue = new Queue("notifications", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const billingQueue = new Queue("billing", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 30000,
    },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

export const cleanupQueue = new Queue("cleanup-videos", {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 60000,
    },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

/**
 * Initialize queues
 */
export async function initializeQueue(): Promise<void> {
  try {
    // Setup event handlers - BullMQ uses 'on' with proper typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    videoQueue.on("waiting" as any, (jobId: string) => {
      logger.debug(`Video job waiting: ${jobId}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paymentQueue.on("waiting" as any, (jobId: string) => {
      logger.debug(`Payment job waiting: ${jobId}`);
    });

    const billingWorker = new Worker(
      "billing",
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_job: Job) => {
        logger.info("Running billing cycle check...");
        const processed = await SubscriptionService.checkExpiredSubscriptions();
        logger.info(
          `Billing check complete: ${processed} subscriptions processed`,
        );
        return { processed };
      },
      {
        connection: bullmqRedis,
        concurrency: 1,
      },
    );

    billingWorker.on("failed", (job, err) => {
      logger.error(`Billing job ${job?.id} failed:`, err);
    });

    await billingQueue.add(
      "check-billing",
      {},
      {
        repeat: { every: 3600000 },
      },
    );

    // Start cleanup worker and schedule daily cleanup at 3am
    startCleanupWorker();
    await cleanupQueue.add(
      "cleanup-videos",
      {},
      {
        repeat: { pattern: "0 3 * * *" },
      },
    );
    logger.info("Cleanup cron scheduled (daily at 3am)");

    logger.info("✅ Queues initialized successfully");
  } catch (error) {
    logger.error("❌ Queue initialization failed:", error);
    throw error;
  }
}

/**
 * Add video generation job (legacy — prefer enqueueVideoGeneration)
 */
export async function addVideoJob(data: unknown): Promise<Job> {
  return videoQueue.add("generate", data, {
    priority: 1,
  });
}

/**
 * Enqueue a video generation job with typed payload.
 * Returns the BullMQ Job and the queue position.
 */
export async function enqueueVideoGeneration(
  params: VideoGenerationJobData,
): Promise<{ job: Job<VideoGenerationJobData>; position: number }> {
  const job = await videoQueue.add("generate", params, {
    priority: 1,
    jobId: params.jobId, // deduplicate by jobId
  });

  const waitingCount = await videoQueue.getWaitingCount();
  logger.info(`Enqueued video job ${params.jobId} — position #${waitingCount}`);

  return { job, position: waitingCount };
}

/**
 * Add payment processing job
 */
export async function addPaymentJob(data: unknown): Promise<Job> {
  return paymentQueue.add("process", data, {
    priority: 0, // Highest priority
  });
}

/**
 * Add notification job
 */
export async function addNotificationJob(data: unknown): Promise<Job> {
  return notificationQueue.add("send", data, {
    priority: 2,
  });
}

/**
 * Get queue stats
 */
export async function getQueueStats(): Promise<{
  video: { waiting: number; active: number; completed: number; failed: number };
  payment: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  notification: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  billing: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  cleanup: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}> {
  const [videoWaiting, videoActive, videoCompleted, videoFailed] =
    await Promise.all([
      videoQueue.getWaitingCount(),
      videoQueue.getActiveCount(),
      videoQueue.getCompletedCount(),
      videoQueue.getFailedCount(),
    ]);

  const [paymentWaiting, paymentActive, paymentCompleted, paymentFailed] =
    await Promise.all([
      paymentQueue.getWaitingCount(),
      paymentQueue.getActiveCount(),
      paymentQueue.getCompletedCount(),
      paymentQueue.getFailedCount(),
    ]);

  const [
    notificationWaiting,
    notificationActive,
    notificationCompleted,
    notificationFailed,
  ] = await Promise.all([
    notificationQueue.getWaitingCount(),
    notificationQueue.getActiveCount(),
    notificationQueue.getCompletedCount(),
    notificationQueue.getFailedCount(),
  ]);

  const [billingWaiting, billingActive, billingCompleted, billingFailed] =
    await Promise.all([
      billingQueue.getWaitingCount(),
      billingQueue.getActiveCount(),
      billingQueue.getCompletedCount(),
      billingQueue.getFailedCount(),
    ]);

  return {
    video: {
      waiting: videoWaiting,
      active: videoActive,
      completed: videoCompleted,
      failed: videoFailed,
    },
    payment: {
      waiting: paymentWaiting,
      active: paymentActive,
      completed: paymentCompleted,
      failed: paymentFailed,
    },
    notification: {
      waiting: notificationWaiting,
      active: notificationActive,
      completed: notificationCompleted,
      failed: notificationFailed,
    },
    billing: {
      waiting: billingWaiting,
      active: billingActive,
      completed: billingCompleted,
      failed: billingFailed,
    },
    cleanup: {
      waiting: await cleanupQueue.getWaitingCount(),
      active: await cleanupQueue.getActiveCount(),
      completed: await cleanupQueue.getCompletedCount(),
      failed: await cleanupQueue.getFailedCount(),
    },
  };
}
