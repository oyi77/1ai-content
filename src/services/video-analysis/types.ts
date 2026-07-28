/**
 * Video Analysis — Shared Types
 */

export interface AnalyzedScene {
  scene: number;
  startTime: number;
  duration: number;
  description: string;
  prompt: string;
}

export interface VideoAnalysisResult {
  success: boolean;
  niche?: string;
  style?: string;
  totalDuration?: number;
  transcript?: string;
  storyboard?: AnalyzedScene[];
  keyFramePaths?: string[];
  error?: string;
}
