/**
 * YouTube Workflow Queue Configuration
 *
 * BullMQ queues for the YouTube multi-niche pipeline (v4.0).
 * Separate from the existing video-generation queue — these are
 * workflow orchestration queues, not direct video rendering.
 */

import { Queue, QueueEvents } from "bullmq";
import { bullmqRedis } from "./redis";
import { logger } from "@/utils/logger";

const defaultOpts = { connection: bullmqRedis, prefix: "yt" };

// --- Workflow Phase Queues ---

/** FASE 0B: Niche + CPM research (monthly cron) */
export const nicheCpmResearchQueue = new Queue("yt-niche-cpm-research", defaultOpts);

/** FASE 1: Content ideation */
export const ideationQueue = new Queue("yt-ideation", defaultOpts);

/** FASE 2: Production pipeline (script → voice → visual → thumbnail → seo) */
export const productionQueue = new Queue("yt-production", defaultOpts);

/** FASE 3: YouTube upload + scheduling */
export const publishQueue = new Queue("yt-publish", defaultOpts);

/** FASE 4: Performance monitoring (hourly analytics check) */
export const monitorQueue = new Queue("yt-monitor", defaultOpts);

/** FASE 4B: Video triage (10-day check) */
export const triageQueue = new Queue("yt-triage", defaultOpts);

/** FASE 5: Breakout analysis */
export const optimizeQueue = new Queue("yt-optimize", defaultOpts);

/** FASE 5B: Re-optimizer (title/thumbnail update) */
export const reoptimizeQueue = new Queue("yt-reoptimize", defaultOpts);

/** FASE 7: Quarantine lifecycle */
export const quarantineQueue = new Queue("yt-quarantine", defaultOpts);

// --- Queue Event Listeners (for logging / monitoring) ---

const queueNames = [
  "yt-niche-cpm-research",
  "yt-ideation",
  "yt-production",
  "yt-publish",
  "yt-monitor",
  "yt-triage",
  "yt-optimize",
  "yt-reoptimize",
  "yt-quarantine",
] as const;

const events: QueueEvents[] = [];

export function initYtQueueEvents(): void {
  for (const name of queueNames) {
    const ev = new QueueEvents(name, { connection: bullmqRedis, prefix: "yt" });
    ev.on("failed", ({ jobId, failedReason }) => {
      logger.error(`[yt-queue:${name}] Job ${jobId} failed: ${failedReason}`);
    });
    ev.on("completed", ({ jobId }) => {
      logger.info(`[yt-queue:${name}] Job ${jobId} completed`);
    });
    events.push(ev);
  }
}

export function closeYtQueueEvents(): Promise<void[]> {
  return Promise.all(events.map((ev) => ev.close()));
}
