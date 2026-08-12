/**
 * GeminiGen Video Generation Service
 *
 * Handles AI video generation via GeminiGen.ai API
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import axios from "axios";
import FormData from "form-data";
import * as fs from "fs";
import * as path from "path";

function getApiKey() {
  return getConfig().GEMINIGEN_API_KEY || "";
}
const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

export interface VideoGenerationResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  jobId?: string;
}

export interface VideoGenerationParams {
  prompt: string;
  duration: number;
  aspectRatio: string;
  style?: string;
  model?: string;
  resolution?: string;
  referenceImage?: string | null;
}

export interface VideoExtendParams {
  prompt: string;
  refHistory: string;
}

export class GeminiGenService {
  static async generateExtend(
    params: VideoExtendParams,
  ): Promise<VideoGenerationResult> {
    return generateExtend(params);
  }

  static async generateVideo(
    params: VideoGenerationParams,
  ): Promise<VideoGenerationResult> {
    return generateVideo(params);
  }

  static async generateFromImages(
    imageUrls: string[],
    params: {
      niche: string;
      platform: string;
      duration: number;
      brief?: string;
    },
  ): Promise<VideoGenerationResult> {
    return generateFromImages(imageUrls, params);
  }
}

export async function generateVideo(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  try {
    logger.info(
      `🎬 Starting video generation: ${params.prompt.slice(0, 50)}...`,
    );

    if (!getApiKey()) {
      return { success: false, error: "getApiKey() not configured" };
    }

    const formData = new FormData();
    formData.append("prompt", params.prompt);
    formData.append("model", "grok-3");
    formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio));

    const allowedDurations = [6, 10, 15];
    const duration = allowedDurations.reduce(
      (prev, curr) =>
        Math.abs(curr - params.duration) < Math.abs(prev - params.duration)
          ? curr
          : prev,
      allowedDurations[0],
    );
    formData.append("duration", duration.toString());

    if (params.referenceImage) {
      if (
        !fs.existsSync(params.referenceImage) ||
        fs.statSync(params.referenceImage).size === 0
      ) {
        logger.warn(
          `Reference image missing or empty, skipping: ${params.referenceImage}`,
        );
      } else {
        const imgBuffer = fs.readFileSync(params.referenceImage);
        formData.append("ref_image", imgBuffer, {
          filename: path.basename(params.referenceImage),
          contentType: "image/jpeg",
        });
      }
    }

    const response = await axios.post(
      `${GEMINIGEN_API_BASE}/video-gen/grok`,
      formData,
      {
        headers: {
          "x-api-key": getApiKey(),
          ...formData.getHeaders(),
        },
        timeout: 30000,
      },
    );

    const { uuid, status } = response.data;
    logger.info(`📋 Video generation started: ${uuid}, status: ${status}`);

    const result = await pollForCompletion(uuid);

    if (result.success && result.videoUrl) {
      return {
        success: true,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        jobId: uuid,
      };
    }

    return {
      success: false,
      error: result.error || "Video generation failed",
      jobId: uuid,
    };
  } catch (error) {
    logger.error(
      "Video generation failed:",
      (error as any).response?.data || (error as Error).message,
    );
    return {
      success: false,
      error:
        (error as any).response?.data?.detail?.error_message ||
        (error as Error).message,
    };
  }
}

async function pollForCompletion(
  uuid: string,
  maxAttempts = 60,
): Promise<VideoGenerationResult> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${GEMINIGEN_API_BASE}/history/${uuid}`,
        { headers: { "x-api-key": getApiKey() }, timeout: 10000 },
      );

      const {
        status,
        status_percentage,
        generated_video,
        thumbnail_url,
        error_message,
      } = response.data;
      logger.info(`⏳ Video status: ${status_percentage}% (${status})`);

      if (status === 2 && generated_video && generated_video.length > 0) {
        const videoUrl =
          generated_video[0].video_url || generated_video[0].video_uri;
        return { success: true, videoUrl, thumbnailUrl: thumbnail_url || "" };
      }

      if (status === 3) {
        return {
          success: false,
          error: error_message || "Video generation failed",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      logger.error(`Poll attempt ${i + 1} failed:`, (error as Error).message);
    }
  }

  return { success: false, error: "Video generation timeout after 5 minutes" };
}

function mapAspectRatio(ratio: string): string {
  const ratioMap: Record<string, string> = {
    "16:9": "landscape",
    "9:16": "portrait",
    "1:1": "square",
    "3:2": "3:2",
    "2:3": "2:3",
  };
  return ratioMap[ratio] || "landscape";
}

export async function generateFromImages(
  imageUrls: string[],
  params: { niche: string; platform: string; duration: number; brief?: string },
): Promise<VideoGenerationResult> {
  const prompt = buildVideoPrompt(
    params.niche,
    params.platform,
    params.duration,
    params.brief,
  );
  const aspectRatio = getAspectRatio(params.platform);

  return generateVideo({
    prompt,
    duration: params.duration,
    aspectRatio,
    style: getStyleForNiche(params.niche),
  });
}

function buildVideoPrompt(
  niche: string,
  platform: string,
  duration: number,
  brief?: string,
): string {
  const nicheStyles: Record<string, string> = {
    fnb: "appetizing food photography, steam, fresh ingredients, warm lighting, close-up shots, restaurant quality",
    beauty:
      "soft lighting, before-after transformation, professional results, elegant presentation",
    retail:
      "product showcase, unboxing style, lifestyle context, clean background, premium feel",
    services:
      "professional service, process showcase, customer satisfaction, trust-building",
    professional:
      "corporate professional, educational content, expert demonstration",
    hospitality:
      "room tour, luxury ambience, relaxing atmosphere, premium experience",
  };

  const style = nicheStyles[niche] || nicheStyles.retail;
  let prompt = `Create a ${duration}-second marketing video. Style: ${style}.`;
  if (brief) prompt += ` Message: ${brief}.`;
  prompt += " High quality, cinematic, engaging, viral potential.";
  return prompt;
}

function getAspectRatio(platform: string): string {
  const ratios: Record<string, string> = {
    tiktok: "9:16",
    instagram: "9:16",
    youtube: "9:16",
    facebook: "4:5",
    twitter: "1:1",
    linkedin: "1:1",
  };
  return ratios[platform] || "9:16";
}

function getStyleForNiche(niche: string): string {
  const styles: Record<string, string> = {
    fnb: "cinematic food",
    beauty: "beauty commercial",
    retail: "product showcase",
  };
  return styles[niche] || "cinematic";
}

export async function generateExtend(
  params: VideoExtendParams,
): Promise<VideoGenerationResult> {
  try {
    logger.info(`🎬 Starting video extend with ref: ${params.refHistory}`);

    if (!getApiKey()) {
      return { success: false, error: "getApiKey() not configured" };
    }

    // Download the reference video and extract last frame
    const refFramePath = await extractLastFrameFromHistory(params.refHistory);
    if (!refFramePath) {
      return { success: false, error: "Failed to extract reference frame" };
    }

    const formData = new FormData();
    formData.append("prompt", params.prompt);
    formData.append("ref_history", params.refHistory);
    if (!fs.existsSync(refFramePath) || fs.statSync(refFramePath).size === 0) {
      return {
        success: false,
        error: "Extracted reference frame is missing or empty",
      };
    }
    const frameBuffer = fs.readFileSync(refFramePath);
    formData.append("ref_image", frameBuffer, {
      filename: "ref_frame.png",
      contentType: "image/png",
    });

    const response = await axios.post(
      `${GEMINIGEN_API_BASE}/video-extend/grok`,
      formData,
      {
        headers: {
          "x-api-key": getApiKey(),
          ...formData.getHeaders(),
        },
        timeout: 60000,
      },
    );

    const { uuid, status } = response.data;
    logger.info(`📋 Video extend started: ${uuid}, status: ${status}`);

    const result = await pollForCompletion(uuid);

    if (result.success && result.videoUrl) {
      return {
        success: true,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        jobId: uuid,
      };
    }

    return {
      success: false,
      error: result.error || "Video extend failed",
      jobId: uuid,
    };
  } catch (error) {
    logger.error(
      "Video extend failed:",
      (error as any).response?.data || (error as Error).message,
    );
    return {
      success: false,
      error:
        (error as any).response?.data?.detail?.error_message ||
        (error as Error).message,
    };
  }
}

/**
 * Extract last frame from a reference video by polling its history
 */
async function extractLastFrameFromHistory(
  refHistory: string,
): Promise<string | null> {
  try {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(
        `${GEMINIGEN_API_BASE}/history/${refHistory}`,
        { headers: { "x-api-key": getApiKey() }, timeout: 10000 },
      );

      const { status, generated_video } = response.data;

      if (status === 2 && generated_video && generated_video.length > 0) {
        const videoUrl =
          generated_video[0].video_url || generated_video[0].video_uri;
        if (videoUrl) {
          // Download video and extract last frame
          const tmpDir = "/tmp/geminigen_frames";
          const { mkdirSync, existsSync } = await import("fs");
          const { join } = await import("path");
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);

          mkdirSync(tmpDir, { recursive: true });
          const videoPath = join(tmpDir, `${refHistory}.mp4`);
          const framePath = join(tmpDir, `${refHistory}_lastframe.png`);

          if (!existsSync(videoPath)) {
            const { execFile: execFileCb } = await import("child_process");
            const { promisify: prom } = await import("util");
            await prom(execFileCb)("wget", ["-q", "-O", videoPath, videoUrl]);
          }

          if (existsSync(videoPath)) {
            await execAsync(
              `ffmpeg -y -sseof -1 -i "${videoPath}" -frames:v 1 "${framePath}" 2>/dev/null`,
            );
            if (existsSync(framePath)) {
              return framePath;
            }
          }
        }
      }

      if (status === 3) {
        logger.error(
          `Ref video generation failed: ${response.data.error_message}`,
        );
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  } catch (error) {
    logger.error(
      "Failed to extract reference frame:",
      (error as Error).message,
    );
    return null;
  }
}
