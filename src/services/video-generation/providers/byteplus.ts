// BytePlus Seedance video provider (split from video-generation.service.ts).
import { getConfig } from "@/config/env";
import axios from "axios";
import { logger } from "@/utils/logger";
import { mapAspectRatio } from "../types";
import type { VideoGenerationParams, VideoGenerationResult } from "../types";

/**
 * Generate video using BytePlus Seedance via AIML API
 */
export async function generateWithByteplus(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const payload = {
    model: "bytedance/seedance-1-0-lite-t2v",
    prompt: params.prompt || "",
    resolution: "480p",
    duration: 5,
    aspect_ratio: mapAspectRatio(params.aspectRatio || "9:16"),
    watermark: false,
  };

  try {
    const response = await axios.post(
      "https://api.aimlapi.com/v2/video/generations",
      payload,
      {
        headers: {
          Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || ""}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const { id, status } = response.data;
    logger.info(`📋 BytePlus job started: ${id}, status: ${status}`);

    // Poll for completion
    const result = await pollByteplus(id, 60);
    return result;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Poll BytePlus for video completion
 */
async function pollByteplus(
  jobId: string,
  maxAttempts: number,
): Promise<VideoGenerationResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `https://queue.fal.run/fal-ai/bytedance-seedance/requests/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || ""}`,
          },
          timeout: 10000,
        },
      );

      const { status, output } = response.data;

      if (status === "completed" && output?.video_url) {
        logger.info(`✅ BytePlus video completed: ${output.video_url}`);
        return {
          success: true,
          videoUrl: output.video_url,
          thumbnailUrl: output.thumbnail_url,
          jobId,
        };
      }

      if (status === "failed") {
        return {
          success: false,
          error: `BytePlus job failed: ${output?.error || "Unknown error"}`,
        };
      }

      logger.info(
        `⏳ BytePlus still processing... (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      logger.error(`Error polling BytePlus: ${(error as Error).message}`);
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
    error: "BytePlus polling timeout",
  };
}
