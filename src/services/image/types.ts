/**
 * Image Generation — Shared Types
 */

export type ImageGenerationMode = "text2img" | "img2img" | "ip_adapter";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  provider?: string;
  mode?: ImageGenerationMode;
  metadata?: Record<string, any>;
}

export interface ImageGenerationParams {
  prompt: string;
  style?: string;
  aspectRatio?: string;
  category: string;
  referenceImageUrl?: string;
  referenceImagePath?: string;
  avatarImageUrl?: string;
  avatarImagePath?: string;
  mode?: ImageGenerationMode;
  resolution?: "standard" | "hd" | "ultra";
  elementSelection?: {
    keepProduct: boolean;
    keepCharacter: boolean;
    keepBackground: boolean;
  };
  elementAnalysis?: {
    productDesc: string;
    characterDesc: string;
    backgroundDesc: string;
  };
  _forceProvider?: string;
}
