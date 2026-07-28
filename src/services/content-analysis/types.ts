/**
 * Content Analysis — Shared Types
 */

export interface AnalysisResult {
  success: boolean;
  prompt?: string;
  style?: string;
  elements?: string[];
  storyboard?: Array<{ scene: number; duration: number; description: string }>;
  error?: string;
}

export interface ViralTrend {
  niche: string;
  patterns: string[];
  hashtags: string[];
  audioTypes: string[];
  editStyles: string[];
  topPerformers: string[];
}

export interface StoryboardScene {
  time: string;
  description: string;
  text: string;
}

export interface Storyboard {
  scenes: StoryboardScene[];
  caption: string;
}
