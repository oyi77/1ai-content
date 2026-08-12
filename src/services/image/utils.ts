/**
 * Image Generation — Utility functions
 */
import { getConfig } from "@/config/env";
import { RESOLUTION_MULTIPLIERS } from "./constants";
import type { ImageGenerationMode, ImageGenerationParams } from "./types";

/** Read dynamically so tests can toggle it */
export function isDemoMode(): boolean {
  return getConfig().DEMO_MODE;
}

/** Auto-detect generation mode from params */
export function detectMode(params: ImageGenerationParams): ImageGenerationMode {
  if (params.mode) return params.mode;
  if (params.avatarImageUrl || params.avatarImagePath) return "ip_adapter";
  if (params.referenceImageUrl || params.referenceImagePath) return "img2img";
  return "text2img";
}

const BASE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 576, height: 1024 },
  "16:9": { width: 1024, height: 576 },
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 896, height: 1120 },
};

/** Get pixel dimensions for given aspect ratio and resolution tier */
export function getImageDimensions(
  aspectRatio: string = "1:1",
  resolution: string = "standard",
): { width: number; height: number } {
  const mult = RESOLUTION_MULTIPLIERS[resolution] || 1;
  const dims = BASE_DIMENSIONS[aspectRatio] || BASE_DIMENSIONS["1:1"];
  return { width: dims.width * mult, height: dims.height * mult };
}

const ASPECT_SIZES: Record<string, string> = {
  "9:16": "w=576&h=1024",
  "16:9": "w=1024&h=576",
  "4:5": "w=820&h=1024",
  "1:1": "w=1024&h=1024",
};

/** Build a sized demo image URL for given aspect ratio */
export function buildDemoUrl(demoImage: string, aspectRatio?: string): string {
  const sizeParams = ASPECT_SIZES[aspectRatio || "1:1"] || "w=1024";
  return demoImage.replace("w=1024", sizeParams);
}
