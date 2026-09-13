/**
 * Video Generation Service - Multi-Provider with Niche/Style Selection
 *
 * Barrel: implementation lives in video-generation/{types,core,dispatch,
 * prompt,demo,providers/*}. Explicit re-exports keep the public surface
 * identical to the pre-split module.
 */
export { getNicheConfig, resolveNicheKey } from "./video-generation/types";
export { NICHES, PROVIDERS } from "./video-generation/types";
export type {
  VideoGenerationResult,
  VideoGenerationParams,
} from "./video-generation/types";
export { generateVideo, getCreditCost, processVideoJob } from "./video-generation/core";
export {
  generatePromptFromNiche,
  generatePromptFromNicheAsync,
  generateStoryboard,
} from "./video-generation/prompt";
