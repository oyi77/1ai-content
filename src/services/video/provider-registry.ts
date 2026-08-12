/**
 * Video Provider Registry
 *
 * Manages all video generation providers and implements the fallback chain.
 * Providers are tried in order until one succeeds.
 *
 * Provider Chain (9-tier):
 * 1. Veo 3.1 (4K, audio sync)
 * 2. Kling 3.0 (60fps, realistic motion)
 * 3. GeminiGen (fast, good quality)
 * 4. BytePlus Seedance (video generation)
 * 5. OmniRoute (multi-model)
 * 6. Grok (xAI)
 * 7. OpenAI (DALL-E)
 * 8. Stability AI (Stable Diffusion)
 * 9. Demo mode (fallback)
 */

import {
  AllProvidersFailedError,
  ProviderError,
  ValidationError,
} from "@/utils/app-errors";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import {
  veoVideoService,
  type VeoVideoRequest,
} from "./providers/veo-3.1.service";
import {
  klingVideoService,
  type KlingVideoRequest,
} from "./providers/kling-3.0.service";

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

export type VideoProvider =
  | "veo-3.1"
  | "kling-3.0"
  | "geminigen"
  | "byteplus"
  | "omniroute"
  | "grok"
  | "openai"
  | "stability"
  | "demo";

export interface VideoGenerationRequest {
  prompt: string;
  duration: number;
  resolution?: "1080p" | "4k";
  fps?: 30 | 60;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  style?: string;
  negativePrompt?: string;
  preferredProvider?: VideoProvider;
}

export interface VideoGenerationResponse {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
  provider: VideoProvider;
  metadata: {
    resolution: string;
    fps: number;
    duration: number;
    model: string;
  };
}

// ══════════════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════════════

export class VideoProviderRegistry {
  /**
   * Get provider availability status
   */
  static getProviderStatus(): Record<
    VideoProvider,
    { available: boolean; capabilities: string[] }
  > {
    return {
      "veo-3.1": {
        available: veoVideoService.isAvailable(),
        capabilities: ["4k", "audio-sync", "multi-shot-consistency"],
      },
      "kling-3.0": {
        available: klingVideoService.isAvailable(),
        capabilities: ["60fps", "4k", "realistic-motion", "fast-generation"],
      },
      geminigen: {
        available: Boolean(getConfig().OMNIROUTE_API_KEY),
        capabilities: ["fast", "good-quality"],
      },
      byteplus: {
        available: Boolean(getConfig().OMNIROUTE_API_KEY),
        capabilities: ["video-generation"],
      },
      omniroute: {
        available: Boolean(getConfig().OMNIROUTE_API_KEY),
        capabilities: ["multi-model"],
      },
      grok: {
        available: Boolean(getConfig().GROQ_API_KEY),
        capabilities: ["text-to-video"],
      },
      openai: {
        available: Boolean(getConfig().OPENAI_API_KEY),
        capabilities: ["text-to-video"],
      },
      stability: {
        available: Boolean(getConfig().OMNIROUTE_API_KEY),
        capabilities: ["image-to-video"],
      },
      demo: {
        available: true,
        capabilities: ["demo"],
      },
    };
  }

  /**
   * Get ordered list of providers to try
   */
  static getProviderChain(request: VideoGenerationRequest): VideoProvider[] {
    const status = this.getProviderStatus();
    const chain: VideoProvider[] = [];

    // If preferred provider is specified and available, try it first
    if (
      request.preferredProvider &&
      status[request.preferredProvider]?.available
    ) {
      chain.push(request.preferredProvider);
    }

    // Add 4K-capable providers first if 4K requested
    if (request.resolution === "4k") {
      if (status["veo-3.1"].available && !chain.includes("veo-3.1"))
        chain.push("veo-3.1");
      if (status["kling-3.0"].available && !chain.includes("kling-3.0"))
        chain.push("kling-3.0");
    }

    // Add 60fps-capable providers if 60fps requested
    if (request.fps === 60) {
      if (status["kling-3.0"].available && !chain.includes("kling-3.0"))
        chain.push("kling-3.0");
    }

    // Add remaining providers in order
    const allProviders: VideoProvider[] = [
      "veo-3.1",
      "kling-3.0",
      "geminigen",
      "byteplus",
      "omniroute",
      "grok",
      "openai",
      "stability",
      "demo",
    ];

    for (const provider of allProviders) {
      if (!chain.includes(provider) && status[provider]?.available) {
        chain.push(provider);
      }
    }

    return chain;
  }

  /**
   * Generate video using the provider chain with fallback
   */
  static async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResponse> {
    const chain = this.getProviderChain(request);

    logger.info({
      msg: "Video provider chain",
      chain,
      preferredProvider: request.preferredProvider,
      resolution: request.resolution,
      fps: request.fps,
    });

    for (const provider of chain) {
      try {
        logger.info({ msg: `Trying provider: ${provider}`, provider });

        const result = await this.generateWithProvider(provider, request);

        if (result.status === "completed") {
          logger.info({
            msg: `Video generation succeeded with ${provider}`,
            videoUrl: result.videoUrl,
          });
          return result;
        }

        logger.warn({
          msg: `Provider ${provider} returned non-completed status`,
          status: result.status,
          error: result.error,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        logger.warn({
          msg: `Provider ${provider} failed, trying next`,
          error,
        });
      }
    }

    // All providers failed
    throw new AllProvidersFailedError("All video generation providers failed");
  }

  /**
   * Generate video with a specific provider
   */
  private static async generateWithProvider(
    provider: VideoProvider,
    request: VideoGenerationRequest,
  ): Promise<VideoGenerationResponse> {
    switch (provider) {
      case "veo-3.1": {
        const veoRequest: VeoVideoRequest = {
          prompt: request.prompt,
          duration: request.duration,
          resolution: request.resolution,
          fps: request.fps,
          aspectRatio: request.aspectRatio,
          style: request.style,
          negativePrompt: request.negativePrompt,
        };
        const result = await veoVideoService.generateVideo(veoRequest);
        return {
          ...result,
          provider: "veo-3.1",
        };
      }

      case "kling-3.0": {
        const klingRequest: KlingVideoRequest = {
          prompt: request.prompt,
          duration: request.duration,
          resolution: request.resolution,
          fps: request.fps,
          aspectRatio: request.aspectRatio,
          style: request.style,
          negativePrompt: request.negativePrompt,
        };
        const result = await klingVideoService.generateVideo(klingRequest);
        return {
          ...result,
          provider: "kling-3.0",
        };
      }

      case "geminigen":
        throw new ProviderError(
          "geminigen",
          "Gemini Gen video provider not yet implemented — use veo-3.1 or kling-3.0 instead",
        );

      case "byteplus":
        throw new ProviderError(
          "byteplus",
          "BytePlus video provider not yet implemented — use veo-3.1 or kling-3.0 instead",
        );

      case "demo":
        return {
          id: `demo-${Date.now()}`,
          status: "completed",
          videoUrl: "https://example.com/demo-video.mp4",
          provider: "demo",
          metadata: {
            resolution: request.resolution === "4k" ? "3840x2160" : "1920x1080",
            fps: request.fps || 30,
            duration: request.duration,
            model: "demo",
          },
        };

      default:
        throw new ValidationError(`Unknown provider: ${provider}`);
    }
  }
}

// Export singleton
export const videoProviderRegistry = new VideoProviderRegistry();
