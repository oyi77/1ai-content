// Provider dispatch (split from video-generation.service.ts).
import { logger } from "@/utils/logger";
import { generateWithGeminiGen } from "./providers/geminigen";
import { generateWithByteplus } from "./providers/byteplus";
import type { VideoGenerationParams, VideoGenerationResult } from "./types";

export async function dispatchToProvider(
  providerKey: string,
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  switch (providerKey) {
    case "geminigen":
      return generateWithGeminiGen(params);
    case "byteplus":
      return generateWithByteplus(params);
    default:
      logger.warn(`No implementation for provider: ${providerKey}`);
      return {
        success: false,
        error: `Provider ${providerKey} not yet implemented`,
      };
  }
}
