/**
 * Kling AI 3.0 Video Generation Provider
 *
 * Generates high-quality video with 60fps support using Kling AI 3.0.
 * Features:
 * - 4K/60fps video generation
 * - Realistic human motion
 * - Vertical social content optimization
 * - Fast generation speed
 *
 * API: Kling AI API
 * Docs: https://docs.klingai.com
 */

import axios, { type AxiosResponse } from "axios";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { redis } from "@/config/redis";
import { ConfigError, ProviderError } from "@/utils/app-errors";

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

export interface KlingVideoRequest {
  prompt: string;
  duration: number; // seconds (max 120)
  resolution?: "1080p" | "4k";
  fps?: 30 | 60;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  style?: string;
  negativePrompt?: string;
  motionStrength?: number; // 0-1, higher = more motion
}

export interface KlingVideoResponse {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
  metadata: {
    resolution: string;
    fps: number;
    duration: number;
    model: string;
  };
}

export interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_result?: {
    video_url: string;
    video_id: string;
  };
  task_error?: {
    code: number;
    message: string;
  };
}

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const PROVIDER_NAME = "kling-3.0";
const CACHE_PREFIX = "kling:task:";
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 144; // 12 minutes max

// ══════════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════════

export class KlingVideoService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    const config = getConfig();
    this.apiKey = config.KLING_API_KEY || "";
    this.apiUrl = config.KLING_API_URL;
    this.model = config.KLING_MODEL;
  }

  /**
   * Check if Kling 3.0 is configured and available
   */
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generate 60fps video using Kling 3.0
   */
  async generateVideo(request: KlingVideoRequest): Promise<KlingVideoResponse> {
    if (!this.isAvailable()) {
      throw new ConfigError("KLING_API_KEY");
    }

    const resolution = request.resolution || "4k";
    const fps = request.fps || 60; // Default 60fps for Kling
    const aspectRatio = request.aspectRatio || "16:9";

    logger.info({
      msg: "Kling 3.0: Starting video generation",
      resolution,
      fps,
      duration: request.duration,
      aspectRatio,
    });

    try {
      // Step 1: Submit generation request
      const task = await this.submitGeneration(request);

      // Step 2: Cache task for tracking
      await redis.setex(
        `${CACHE_PREFIX}${task.task_id}`,
        720, // 12 min TTL
        JSON.stringify({ status: "processing", startedAt: Date.now() })
      );

      // Step 3: Poll for completion
      const result = await this.pollForCompletion(task.task_id);

      logger.info({
        msg: "Kling 3.0: Video generation completed",
        videoUrl: result.videoUrl,
        resolution,
        fps,
      });

      return {
        id: task.task_id,
        status: "completed",
        videoUrl: result.videoUrl,
        metadata: {
          resolution: resolution === "4k" ? "3840x2160" : "1920x1080",
          fps,
          duration: request.duration,
          model: this.model,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      logger.error({ msg: "Kling 3.0: Video generation failed", error });

      return {
        id: `failed-${Date.now()}`,
        status: "failed",
        error,
        metadata: {
          resolution: resolution === "4k" ? "3840x2160" : "1920x1080",
          fps,
          duration: request.duration,
          model: this.model,
        },
      };
    }
  }

  /**
   * Submit video generation request to Kling API
   */
  private async submitGeneration(request: KlingVideoRequest): Promise<KlingTask> {
    const resolution = request.resolution || "4k";
    const fps = request.fps || 60;
    const aspectRatio = request.aspectRatio || "16:9";

    // Build prompt with style and negative prompt
    let fullPrompt = request.prompt;
    if (request.style) {
      fullPrompt = `${request.style} style: ${fullPrompt}`;
    }
    if (request.negativePrompt) {
      fullPrompt += `\nNegative: ${request.negativePrompt}`;
    }

    const response: AxiosResponse<{ task_id: string }> = await axios.post(
      `${this.apiUrl}/video/generations`,
      {
        model: this.model,
        prompt: fullPrompt,
        duration: request.duration,
        resolution: resolution === "4k" ? "3840x2160" : "1920x1080",
        fps,
        aspect_ratio: this.mapAspectRatio(aspectRatio),
        motion_strength: request.motionStrength || 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return {
      task_id: response.data.task_id,
      task_status: "submitted",
    };
  }

  /**
   * Poll for video generation completion
   */
  private async pollForCompletion(taskId: string): Promise<{ videoUrl: string }> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.sleep(POLL_INTERVAL_MS);

      const response: AxiosResponse<KlingTask> = await axios.get(
        `${this.apiUrl}/video/generations/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      const task = response.data;

      if (task.task_status === "succeed") {
        if (task.task_result?.video_url) {
          return { videoUrl: task.task_result.video_url };
        }
        throw new ProviderError("kling", "Task completed but no video URL returned");
      }
      if (task.task_status === "failed") {
        throw new ProviderError("kling", `Task failed: ${task.task_error?.message || "Unknown error"}`);
      }

      // Update cache with progress
      await redis.setex(
        `${CACHE_PREFIX}${taskId}`,
        720,
        JSON.stringify({
          status: "processing",
          attempt,
          startedAt: Date.now(),
        })
      );

      logger.debug({
        msg: "Kling 3.0: Polling for completion",
        attempt,
        taskId,
      });
    }

    throw new ProviderError("kling", "Video generation timed out after 12 minutes");
  }

  /**
   * Map aspect ratio to Kling API format
   */
  private mapAspectRatio(ratio: string): string {
    const mapping: Record<string, string> = {
      "16:9": "landscape",
      "9:16": "portrait",
      "1:1": "square",
    };
    return mapping[ratio] || "landscape";
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Get provider info for admin dashboard
   */
  getInfo(): {
    name: string;
    available: boolean;
    capabilities: string[];
    pricing: { fps: string; costMultiplier: number }[];
  } {
    return {
      name: PROVIDER_NAME,
      available: this.isAvailable(),
      capabilities: ["60fps", "4k", "realistic-motion", "fast-generation"],
      pricing: [
        { fps: "30fps", costMultiplier: 1 },
        { fps: "60fps", costMultiplier: 1.5 },
      ],
    };
  }
}

// Singleton instance
export const klingVideoService = new KlingVideoService();
