/**
 * Storyboard Image Service
 *
 * Generates images for each storyboard scene using ImageGenerationService
 * with retry logic and graceful fallback to text-only on failure.
 */

import { ImageGenerationService, ImageGenerationResult } from "@/services/image.service";
import { logger } from "@/utils/logger";

export interface StoryboardImageResult {
  scene: number;
  duration: number;
  type: string;
  description: string;
  prompt: string;
  imageUrl?: string;
}

export interface StoryboardImageResponse {
  scenes: StoryboardImageResult[];
  totalDuration: number;
  caption: string;
  allImagesFailed: boolean;
  imagesGenerated: number;
  imagesTotal: number;
}

interface SceneInput {
  scene: number;
  duration: number;
  type: string;
  description: string;
  prompt: string;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Pause execution for a given duration (promise-based sleep).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to generate an image for a single scene.
 * Retries up to MAX_RETRIES times with exponential backoff.
 * Returns the image URL on success, or undefined if all retries fail.
 */
async function generateSceneImage(
  scene: SceneInput,
  niche: string,
  aspectRatio: string = "9:16",
  resolution: "standard" | "hd" | "ultra" = "standard",
): Promise<string | undefined> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result: ImageGenerationResult = await ImageGenerationService.generateImage({
        prompt: scene.prompt,
        category: niche,
        aspectRatio,
        resolution,
        style: "cinematic",
      });

      if (result.success && result.imageUrl) {
        logger.info(
          `[StoryboardImageService] Scene ${scene.scene} image generated (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        return result.imageUrl;
      }

      // Provider returned success=false
      logger.warn(
        `[StoryboardImageService] Scene ${scene.scene} attempt ${attempt + 1}/${MAX_RETRIES} failed: ${result.error || "unknown"}`,
      );
    } catch (err) {
      logger.warn(
        `[StoryboardImageService] Scene ${scene.scene} attempt ${attempt + 1}/${MAX_RETRIES} threw: ${(err as Error).message}`,
      );
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS * (attempt + 1)); // linear backoff
    }
  }

  logger.warn(`[StoryboardImageService] All ${MAX_RETRIES} attempts failed for scene ${scene.scene} — using text-only`);
  return undefined;
}

/**
 * StoryboardImageService — generates images for each storyboard scene.
 *
 * Usage:
 *   const result = await StoryboardImageService.generateSceneImages({
 *     scenes: [...],
 *     totalDuration: 30,
 *     caption: "...",
 *     niche: "product",
 *   });
 */
export class StoryboardImageService {
  /**
   * Generate images for all storyboard scenes in parallel batches.
   *
   * @param params.scenes - Array of storyboard scenes (from VideoStoryboardService)
   * @param params.totalDuration - Total video duration
   * @param params.caption - Generated video caption
   * @param params.niche - Content niche (fnb, product, realestate, car, beauty, services)
   * @param params.aspectRatio - Image aspect ratio (default: "9:16")
   * @param params.resolution - Image quality tier (default: "standard")
   * @returns StoryboardImageResponse with per-scene image URLs
   */
  static async generateSceneImages(params: {
    scenes: SceneInput[];
    totalDuration: number;
    caption: string;
    niche: string;
    aspectRatio?: string;
    resolution?: "standard" | "hd" | "ultra";
  }): Promise<StoryboardImageResponse> {
    const {
      scenes,
      totalDuration,
      caption,
      niche,
      aspectRatio = "9:16",
      resolution = "standard",
    } = params;

    logger.info(
      `[StoryboardImageService] Generating images for ${scenes.length} scenes (niche: ${niche})`,
    );

    // Generate all scene images in parallel (each scene runs its own retries)
    const imageUrls: (string | undefined)[] = await Promise.all(
      scenes.map((scene) =>
        generateSceneImage(scene, niche, aspectRatio, resolution),
      ),
    );

    // Combine scenes with their generated image URLs
    const resultScenes: StoryboardImageResult[] = scenes.map((scene, idx) => ({
      scene: scene.scene,
      duration: scene.duration,
      type: scene.type,
      description: scene.description,
      prompt: scene.prompt,
      imageUrl: imageUrls[idx],
    }));

    const imagesGenerated = imageUrls.filter(Boolean).length;
    const allImagesFailed = imagesGenerated === 0;

    logger.info(
      `[StoryboardImageService] Done: ${imagesGenerated}/${scenes.length} images generated${allImagesFailed ? " (ALL FAILED — text-only fallback)" : ""}`,
    );

    return {
      scenes: resultScenes,
      totalDuration,
      caption,
      allImagesFailed,
      imagesGenerated,
      imagesTotal: scenes.length,
    };
  }
}
