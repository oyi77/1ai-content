/**
 * Google Veo 3.1 Video Generation Provider
 *
 * Generates 4K cinematic video using Google's Veo 3.1 API.
 * Features:
 * - Native 4K (3840x2160) video generation
 * - 48kHz audio-video synchronization
 * - Superior prompt adherence
 * - Multi-shot consistency
 *
 * API: Google Generative Language API (Gemini)
 * Docs: https://ai.google.dev/gemini-api/docs/video
 */

import axios, { type AxiosResponse } from "axios";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { redis } from "@/config/redis";

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

export interface VeoVideoRequest {
  prompt: string;
  duration: number; // seconds (max 60)
  resolution?: "1080p" | "4k";
  fps?: 30 | 60;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  style?: string;
  negativePrompt?: string;
}

export interface VeoVideoResponse {
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

export interface VeoOperation {
  name: string;
  done: boolean;
  response?: {
    videoUri: string;
    mimeType: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const PROVIDER_NAME = "veo-3.1";
const CACHE_PREFIX = "veo:operation:";
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

// ══════════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════════

export class VeoVideoService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    const config = getConfig();
    this.apiKey = config.VEO_API_KEY || "";
    this.apiUrl = config.VEO_API_URL;
    this.model = config.VEO_MODEL;
  }

  /**
   * Check if Veo 3.1 is configured and available
   */
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generate 4K video using Veo 3.1
   */
  async generateVideo(request: VeoVideoRequest): Promise<VeoVideoResponse> {
    if (!this.isAvailable()) {
      throw new Error("Veo 3.1 API key not configured");
    }

    const resolution = request.resolution || "4k";
    const fps = request.fps || 30;
    const aspectRatio = request.aspectRatio || "16:9";

    logger.info({
      msg: "Veo 3.1: Starting video generation",
      resolution,
      fps,
      duration: request.duration,
      aspectRatio,
    });

    try {
      // Step 1: Submit generation request
      const operation = await this.submitGeneration(request);

      // Step 2: Cache operation for tracking
      await redis.setex(
        `${CACHE_PREFIX}${operation.name}`,
        600, // 10 min TTL
        JSON.stringify({ status: "processing", startedAt: Date.now() })
      );

      // Step 3: Poll for completion
      const result = await this.pollForCompletion(operation.name);

      logger.info({
        msg: "Veo 3.1: Video generation completed",
        videoUrl: result.videoUrl,
        resolution,
        fps,
      });

      return {
        id: operation.name,
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
      logger.error({ msg: "Veo 3.1: Video generation failed", error });

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
   * Submit video generation request to Veo API
   */
  private async submitGeneration(request: VeoVideoRequest): Promise<VeoOperation> {
    const resolution = request.resolution || "4k";
    const fps = request.fps || 30;
    const aspectRatio = request.aspectRatio || "16:9";

    // Build prompt with style and negative prompt
    let fullPrompt = request.prompt;
    if (request.style) {
      fullPrompt = `${request.style} style: ${fullPrompt}`;
    }
    if (request.negativePrompt) {
      fullPrompt += `\nNegative: ${request.negativePrompt}`;
    }

    const response: AxiosResponse<VeoOperation> = await axios.post(
      `${this.apiUrl}/models/${this.model}:generateVideo`,
      {
        contents: [
          {
            parts: [
              {
                text: fullPrompt,
              },
            ],
          },
        ],
        generationConfig: {
          durationSeconds: request.duration,
          resolution: resolution === "4k" ? "RESOLUTION_4K" : "RESOLUTION_1080P",
          fps,
          aspectRatio: this.mapAspectRatio(aspectRatio),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return response.data;
  }

  /**
   * Poll for video generation completion
   */
  private async pollForCompletion(operationName: string): Promise<{ videoUrl: string }> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.sleep(POLL_INTERVAL_MS);

      const response: AxiosResponse<VeoOperation> = await axios.get(
        `${this.apiUrl}/${operationName}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      const operation = response.data;

      if (operation.done) {
        if (operation.error) {
          throw new Error(`Veo operation failed: ${operation.error.message}`);
        }

        if (operation.response?.videoUri) {
          // Download and cache the video
          const videoUrl = await this.downloadVideo(operation.response.videoUri);
          return { videoUrl };
        }

        throw new Error("Veo operation completed but no video URL returned");
      }

      // Update cache with progress
      await redis.setex(
        `${CACHE_PREFIX}${operationName}`,
        600,
        JSON.stringify({
          status: "processing",
          attempt,
          startedAt: Date.now(),
        })
      );

      logger.debug({
        msg: "Veo 3.1: Polling for completion",
        attempt,
        operationName,
      });
    }

    throw new Error("Veo video generation timed out after 10 minutes");
  }

  /**
   * Download video from Veo storage and return accessible URL
   */
  private async downloadVideo(videoUri: string): Promise<string> {
    // In production, this would download to your own storage (S3, GCS, etc.)
    // For now, return the Veo URI directly
    // TODO: Implement proper video download and storage
    return videoUri;
  }

  /**
   * Map aspect ratio to Veo API format
   */
  private mapAspectRatio(ratio: string): string {
    const mapping: Record<string, string> = {
      "16:9": "ASPECT_RATIO_16_9",
      "9:16": "ASPECT_RATIO_9_16",
      "1:1": "ASPECT_RATIO_1_1",
    };
    return mapping[ratio] || "ASPECT_RATIO_16_9";
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
    pricing: { resolution: string; costMultiplier: number }[];
  } {
    return {
      name: PROVIDER_NAME,
      available: this.isAvailable(),
      capabilities: ["4k", "audio-sync", "multi-shot-consistency"],
      pricing: [
        { resolution: "1080p", costMultiplier: 1 },
        { resolution: "4k", costMultiplier: 2 },
      ],
    };
  }
}

// Singleton instance
export const veoVideoService = new VeoVideoService();
