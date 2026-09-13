// GeminiGen video provider (split from video-generation.service.ts).
import { getConfig } from "@/config/env";
import axios from "axios";
import FormData from "form-data";
import { logger } from "@/utils/logger";
import { mapAspectRatio } from "../types";
import type { VideoGenerationParams, VideoGenerationResult } from "../types";

const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

/**
 * Generate video using GeminiGen.ai
 */
export async function generateWithGeminiGen(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const formData = new FormData();
  formData.append("prompt", params.prompt || "");
  formData.append("model", "grok-3");
  formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio || "9:16"));
  formData.append("duration", Math.min(5, params.duration).toString());

  try {
    const response = await axios.post(
      `${GEMINIGEN_API_BASE}/video-gen/grok`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
        },
        timeout: 30000,
      },
    );

    const { uuid, status } = response.data;
    logger.info(`📋 GeminiGen job started: ${uuid}, status: ${status}`);

    // Poll for completion
    const result = await pollGeminiGen(uuid, 60);
    return result;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Poll GeminiGen for video completion
 */
async function pollGeminiGen(
  jobId: string,
  maxAttempts: number,
): Promise<VideoGenerationResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `${GEMINIGEN_API_BASE}/history/${jobId}`,
        {
          headers: {
            "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
          },
          timeout: 10000,
        },
      );

      const { status, data } = response.data;

      if (status === "completed" && data?.video_url) {
        logger.info(`✅ GeminiGen video completed: ${data.video_url}`);
        return {
          success: true,
          videoUrl: data.video_url,
          thumbnailUrl: data.thumbnail_url,
          jobId,
        };
      }

      if (status === "failed") {
        return {
          success: false,
          error: `GeminiGen job failed: ${data?.error || "Unknown error"}`,
        };
      }

      logger.info(
        `⏳ GeminiGen still processing... (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await new Promise((r) => setTimeout(r, 2000)); // Wait 2s before retry
    } catch (error) {
      logger.error(`Error polling GeminiGen: ${(error as Error).message}`);
      if (attempt === maxAttempts - 1) {
        return {
          success: false,
          error: `Polling failed: ${(error as Error).message}`,
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    success: false,
    error: "GeminiGen polling timeout",
  };
}
