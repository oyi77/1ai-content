/**
 * Video Generation Worker — Shared Types
 *
 * Job payload type and caption interface.
 * Extracted from video-generation.worker.ts.
 */

// ── Job payload type ──

export interface VideoGenerationJobData {
  jobId: string;
  niche: string;
  platform: string;
  duration: number;
  scenes: number;
  storyboard: Array<{ scene: number; duration: number; description: string }>;
  referenceImage?: string | null;
  customPrompt?: string;
  userId: string;   // bigint serialised as string
  chatId: number;
  enableVO?: boolean;
  enableSubtitles?: boolean;
  language?: string;
  campaignGroupId?: string;
  campaignTotal?: number;
  voScript?: string;
  userImages?: Array<{ sceneIndex: number; url: string }>;
  correlationId?: string;
  cacheAsTemplate?: boolean;
  cacheNiche?: string;
  creditCost?: number;
}

// ── Caption Interface ──

export interface GeneratedCaption {
  text: string;
  hashtags: string;
}
