/**
 * ContentAnalysisService — facade class.
 *
 * Reassembles the public API of ContentAnalysisService from focused sub-modules.
 * All methods are static, matching the original caller contract.
 */
import type { AnalysisResult, ViralTrend } from "./types";
import { extractPrompt } from "./vision-chain";
import { cloneVideo, cloneImage } from "./clone.service";
import { getViralTrends, generateStoryboard } from "./trends.service";

export class ContentAnalysisService {
  /** Extract prompt from video/image — config-driven fallback chain. */
  static extractPrompt = extractPrompt;

  /** Clone video style using Gemini Vision analysis. */
  static cloneVideo = cloneVideo;

  /** Clone image style using Gemini Vision analysis. */
  static cloneImage = cloneImage;

  /** Get viral trends for a niche. */
  static getViralTrends = getViralTrends;

  /** Generate storyboard from analysis. */
  static generateStoryboard = generateStoryboard;
}

export type { AnalysisResult, ViralTrend };
