/**
 * TikTok Social Service
 *
 * Client for 1ai-social's TikTok upload API.
 * 1ai-content generates content → sends to 1ai-social → 1ai-social uploads to TikTok.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";

interface TikTokUploadParams {
  videoPath: string;
  caption: string;
  hashtags?: string[];
}

interface TikTokUploadResult {
  success: boolean;
  message?: string;
  error?: string;
}

const SOCIAL_API_BASE = getConfig().SOCIAL_API_URL;

export async function uploadToTikTok(
  params: TikTokUploadParams,
): Promise<TikTokUploadResult> {
  try {
    const response = await fetch(
      `${SOCIAL_API_BASE}/api/v1/social/tiktok/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: params.videoPath,
          caption: params.caption,
          hashtags: params.hashtags || [],
        }),
        signal: AbortSignal.timeout(180_000), // 3 min timeout for upload
      },
    );

    if (!response.ok) {
      const text = await response.text();
      logger.error(`TikTok upload failed: ${response.status} ${text}`);
      return { success: false, error: `API error: ${response.status}` };
    }

    const result = (await response.json()) as TikTokUploadResult;
    logger.info(`TikTok upload result: ${result.success} - ${result.message}`);
    return result;
  } catch (err) {
    logger.error(`TikTok upload error: ${(err as Error).message}`);
    return { success: false, error: (err as Error).message };
  }
}

export async function uploadCarouselToTikTok(
  videoPath: string,
  caption: string,
  hashtags: string[],
): Promise<TikTokUploadResult> {
  return uploadToTikTok({ videoPath, caption, hashtags });
}
