// Shared types + catalog consts (split from video-generation.service.ts).
import { getConfig } from "@/config/env";
import { NICHE_CONFIG } from "@/config/niches";
export { getNicheConfig, resolveNicheKey } from "@/config/niches";

export const NICHES: Record<
  string,
  { name: string; emoji: string; styles: string[] }
> = Object.fromEntries(
  Object.keys(NICHE_CONFIG).map((k) => {
    const v = NICHE_CONFIG[k as keyof typeof NICHE_CONFIG];
    return [
      k,
      {
        name: v.name,
        emoji: v.emoji,
        styles: (v.keywords as string[]).slice(0, 3),
      },
    ];
  }),
);

export const PROVIDERS = {
  geminigen: {
    name: "GeminiGen",
    apiKey: getConfig().GEMINIGEN_API_KEY || "",
    priority: 1,
    maxDuration: 5,
  },
  byteplus: {
    name: "BytePlus Seedance",
    apiKey: getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || "",
    priority: 2,
    maxDuration: 5,
  },
  demo: {
    name: "Demo",
    apiKey: "demo",
    priority: 99,
    maxDuration: 300,
  },
};

export interface VideoGenerationResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  provider?: string;
  jobId?: string;
}

export interface VideoGenerationParams {
  prompt?: string;
  niche?: string;
  styles?: string[];
  duration: number;
  aspectRatio?: string;
  style?: string;
  referenceImageUrl?: string;
  scenes?: number;
  userId?: bigint;
  jobId?: string;
  _forceProvider?: string;
}

/**
 * Map aspect ratio string to provider format
 */
export function mapAspectRatio(aspectRatio: string): string {
  const map: Record<string, string> = {
    "9:16": "portrait",
    "16:9": "landscape",
    "1:1": "square",
    "4:5": "portrait",
  };
  return map[aspectRatio] || "portrait";
}
