/**
 * Content Analysis Service — BARREL
 *
 * Re-exports ContentAnalysisService from the split sub-module.
 * Consumers importing from "@/services/content-analysis.service" keep working.
 */
export { ContentAnalysisService } from "./content-analysis/index";
export type {
  AnalysisResult,
  ViralTrend,
  Storyboard,
  StoryboardScene,
} from "./content-analysis/types";
