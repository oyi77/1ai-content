/**
 * Storyboard Visual Service
 *
 * Generates visual preview images for storyboard scenes before video creation.
 * Uses existing ImageGenerationService for actual image generation,
 * with retry logic and graceful degradation to text-only.
 */

import { logger } from '@/utils/logger';
import { VideoStoryboardService, NICHE_TEMPLATES } from '@/services/video-storyboard.service';
import { ImageGenerationService } from '@/services/image.service';
import { UNIT_COSTS } from '@/config/pricing';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StoryboardScene {
  scene: number;
  duration: number;
  type: string;
  description: string;
  prompt: string;
}

export interface StoryboardImage {
  scene: number;
  url: string;
}

export interface VisualStoryboard {
  scenes: StoryboardScene[];
  images: StoryboardImage[];
  niche: string;
  totalDuration: number;
  caption: string;
  allImagesGenerated: boolean;
}

export interface StoryboardOptions {
  niche: string;
  duration?: number;
  productDescription?: string;
  customPrompt?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES_PER_SCENE = 2;
const IMAGE_GEN_TIMEOUT_MS = 30_000;
const STORYBOARD_COST = UNIT_COSTS.IMAGE_SET_7_SCENE; // 1.5 credits for full storyboard

// ── Service ────────────────────────────────────────────────────────────────

export const StoryboardVisualService = {
  /**
   * Generate a visual storyboard with images for each scene.
   * Falls back to text-only if image generation fails completely.
   */
  async generate(options: StoryboardOptions): Promise<VisualStoryboard> {
    const { niche, duration = 30, productDescription, customPrompt } = options;

    // Step 1: Generate text storyboard (scenes with prompts)
    const rawStoryboard = await VideoStoryboardService.generateStoryboard({
      niche,
      duration,
      productDescription: productDescription || customPrompt,
    });

    // Step 2: Generate images for each scene (parallel)
    const images: StoryboardImage[] = [];
    const imagePromises = rawStoryboard.scenes.map((scene) =>
      this.generateSceneImage(scene, niche)
    );

    const results = await Promise.allSettled(imagePromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        images.push({ scene: index + 1, url: result.value });
      }
    });

    const allImages = images.length === rawStoryboard.scenes.length;

    logger.info('Storyboard visual generated', {
      niche,
      totalScenes: rawStoryboard.scenes.length,
      imagesGenerated: images.length,
      allImages,
    });

    return {
      scenes: rawStoryboard.scenes,
      images,
      niche,
      totalDuration: rawStoryboard.totalDuration,
      caption: rawStoryboard.caption,
      allImagesGenerated: allImages,
    };
  },

  /**
   * Generate a single image for a storyboard scene.
   * Retries up to MAX_RETRIES_PER_SCENE times.
   */
  async generateSceneImage(
    scene: StoryboardScene,
    niche: string
  ): Promise<string | null> {
    const nicheTemplate =
      NICHE_TEMPLATES[niche as keyof typeof NICHE_TEMPLATES];
    const style = nicheTemplate?.promptStyle || 'professional, cinematic';

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_SCENE; attempt++) {
      try {
        const result = await Promise.race([
          ImageGenerationService.generateImage({
            prompt: scene.prompt,
            style,
            aspectRatio: '9:16',
            category: niche,
            mode: 'text2img',
          }),
          this.timeoutReject(IMAGE_GEN_TIMEOUT_MS),
        ]);

        if (result && 'success' in result && result.success && result.imageUrl) {
          return result.imageUrl;
        }

        logger.warn(`Scene ${scene.scene} image attempt ${attempt} failed`, {
          error: 'error' in result ? result.error : 'unknown',
        });
      } catch (err) {
        logger.warn(`Scene ${scene.scene} image attempt ${attempt} error`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null; // All retries exhausted
  },

  /** Reject after a timeout */
  timeoutReject(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Image gen timed out after ${ms}ms`)), ms)
    );
  },

  /**
   * Format storyboard caption for Telegram message.
   * Includes scene descriptions and costs.
   */
  formatCaption(storyboard: VisualStoryboard): string {
    const { scenes, niche, totalDuration, caption, images } = storyboard;
    const nicheTemplate =
      NICHE_TEMPLATES[niche as keyof typeof NICHE_TEMPLATES];
    const nicheName = nicheTemplate?.name || niche.toUpperCase();

    let text = `📋 *STORYBOARD VISUAL PREVIEW*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `🎬 Niche: ${nicheName}\n`;
    text += `⏱️ Duration: ${totalDuration}s | ${scenes.length} scenes\n\n`;

    scenes.forEach((scene) => {
      const hasImage = images.some((img) => img.scene === scene.scene);
      const emoji = hasImage ? '🖼️' : '📝';
      const sceneType = scene.type.charAt(0).toUpperCase() + scene.type.slice(1);

      text += `*Scene ${scene.scene}* (${scene.duration}s) ${emoji} ${sceneType}\n`;
      text += `└ ${scene.description}\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 ${caption}\n\n`;

    if (images.length < scenes.length) {
      text += `⚠️ ${scenes.length - images.length} scene(s) tampilkan tanpa gambar\n`;
    }

    text += `💰 Biaya storyboard preview: *1.5 kredit*`;
    text += `\n💡 Biaya ini akan dipotong dari total biaya video`;

    return text;
  },

  /**
   * Format Telegram media group for storyboard images.
   */
  formatMediaGroup(storyboard: VisualStoryboard): Array<{
    type: 'photo';
    media: string;
    caption?: string;
  }> {
    const { scenes, images } = storyboard;

    return images
      .sort((a, b) => a.scene - b.scene)
      .map((img) => {
        const scene = scenes.find((s) => s.scene === img.scene);
        return {
          type: 'photo' as const,
          media: img.url,
          caption: scene
            ? `Scene ${scene.scene} — ${scene.type} (${scene.duration}s)\n${scene.description}`
            : undefined,
        };
      });
  },

  /**
   * Calculate cost for storyboard preview in units.
   */
  getCost(): number {
    return STORYBOARD_COST;
  },
};
