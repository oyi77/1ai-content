/**
 * Video Analysis Service — BARREL
 *
 * Re-exports the public API from the split sub-module.
 * Consumers importing from "@/services/video-analysis.service" keep working.
 */
export { VideoAnalysisService } from "./video-analysis/index";
export type {
  AnalyzedScene,
  VideoAnalysisResult,
} from "./video-analysis/types";
