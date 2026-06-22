/**
 * YouTube Workflow Types
 *
 * Shared type definitions for the YouTube multi-niche pipeline.
 * All interfaces here are pure data shapes — no business logic.
 */

// --- Channel ---

export interface YtChannelCreate {
  channelId: string;
  gmailAccount?: string;
  adsensePubId?: string;
  nicheVertical: string;
  nicheName?: string;
  productionFormat: "narrated_slideshow" | "music_visualizer";
  targetCountry?: string;
  targetLanguage?: string;
  cpmTier?: string;
  ytOauthToken?: string;
}

export interface YtChannelUpdate {
  tier?: string;
  totalPublished?: number;
  channelAgeDays?: number;
  trafficStatus?: string;
  trafficScore?: number;
  quarantineStarted?: Date | null;
  setupComplete?: boolean;
}

// --- Idea ---

export interface YtIdeaCreate {
  channelId: string;
  nicheVertical?: string;
  productionFormat?: string;
  batchId?: string;
  titleDraft?: string;
  nicheCategory?: string;
  subNiche?: string;
  hookType?: string;
  toneVariant?: string;
  summary?: string;
  genre?: string;
  mood?: string;
  visualStyle?: string;
  useCase?: string;
  durationMinutes?: number;
  potentialScore?: string;
  conflictVersions?: boolean;
  breakoutBias?: Record<string, unknown>;
  priority?: string;
}

// --- Published Video ---

export interface YtPublishedVideoCreate {
  videoId: string;
  channelId: string;
  ideaId?: string;
  nicheVertical?: string;
  productionFormat?: string;
  title?: string;
  durationMinutes?: number;
  tier?: string;
  toneVariant?: string;
}

// --- Video Metrics ---

export interface YtVideoMetricsCreate {
  videoId: string;
  checkAt: string;
  views?: number;
  ctr?: number;
  avgViewPct?: number;
  avdSeconds?: number;
  trafficSrc?: Record<string, unknown>;
}

// --- Production Pipeline ---

export interface YtVideoPackage {
  ideaId: string;
  channelId: string;
  nicheVertical: string;
  productionFormat: "narrated_slideshow" | "music_visualizer";

  /** Pipeline A outputs */
  scriptPath?: string;
  narrationPath?: string;
  narrationTimestampsPath?: string;
  openingVideoPath?: string;
  slideshowPath?: string;

  /** Pipeline B outputs */
  audioTrackPath?: string;
  visualLoopPath?: string;

  /** Shared outputs */
  finalVideoPath: string;
  thumbnailPath: string;
  seoPackage: YtSeoPackage;
}

export interface YtSeoPackage {
  title: string;
  description: string;
  tags: string[];
  titleCandidates?: string[];
  ctrEstimate?: number;
}

// --- Quality Gate ---

export interface YtQualityGateResult {
  passed: boolean;
  checks: string[];
  blockingFailures: string[];
  warnings: string[];
}

// --- Triage ---

export type YtTriageDecision = "DELETE" | "KEEP" | "TRANSFER_CANDIDATE";

export interface YtTriageResult {
  videoId: string;
  decision: YtTriageDecision;
  views10d: number;
  ctr10d: number;
  avgViewPct: number;
}

// --- Quarantine ---

export interface YtQuarantineEligibility {
  eligible: boolean;
  trigger?: string;
  confidence?: "HIGH" | "MEDIUM";
  channelAgeDays?: number;
  trafficDropPct?: number;
  note?: string;
}

// --- Breakout ---

export interface YtBreakoutCluster {
  primaryElement: string;
  secondaryElements: string[];
  storyType?: string;
  genreMood?: string;
  toneVariant?: string;
  trafficDriver: "search" | "suggested" | "shorts";
  bestDurationTier: string;
  recommendedAngleVariations: YtAngleVariation[];
  relatedOldVideos: string[];
  revisitScheduleWeeks: number;
}

export interface YtAngleVariation {
  angle: string;
  hookType?: string;
  toneVariant?: string;
  titleDraft: string;
}

// --- CPM Research ---

export interface YtCpmSnapshot {
  [country: string]: {
    cpmUsd: number;
    trend: "rising" | "stable" | "falling";
    seasonNote?: string;
  };
}

export interface YtNicheOpportunity {
  country: string;
  tier: string;
  language: string;
  subNiche: string;
  searchDemand: "HIGH" | "MEDIUM" | "LOW";
  competitionLevel: "HIGH" | "MEDIUM" | "LOW";
  topCompetitors: string[];
  recommendedTopics: string[];
  priorityScore: number;
}

// --- Telegram Notifications ---

export interface YtNotificationPayload {
  type: string;
  channelId?: string;
  videoId?: string;
  title?: string;
  message: string;
  actions?: string[];
}
