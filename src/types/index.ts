/**
 * Type Definitions
 *
 * Centralized TypeScript type definitions
 */

import { Context } from "telegraf";

// =============================================================================
// BOT CONTEXT
// =============================================================================

// Use a simple session augmentation instead of extending Context
declare module "telegraf" {
  interface Context {
    session: SessionData;
  }
}

export type BotContext = Context;

export interface SessionData {
  state: BotState;
  stateData: Record<string, unknown>;
  lastActivity: Date;
  creditBalance?: number;
  tier?: string;
  videoCreation?: {
    mode?: string;
    niche?: string;
    platform?: string;
    totalDuration?: number;
    scenes?: number;
    storyboard?: Array<any>;
    jobId?: string;
    waitingForImage?: boolean;
    waitingForCustomPrompt?: boolean;
    customPrompt?: string;
    referenceImage?: string | null;
    uploadedPhotos?: Array<{ fileId: string; localPath?: string }>;
    visionAnalysis?: string;
    enableVO?: boolean;
    enableSubtitles?: boolean;
    pendingPhotos?: Array<{ fileId: string; localPath?: string }>;
    videoElementSelection?: { keepProduct: boolean; keepCharacter: boolean; keepBackground: boolean };
    videoAnalysisResult?: { hasProduct: boolean; hasCharacter: boolean; productDesc: string; characterDesc: string; backgroundDesc: string };
  };
  videoCreationNew?: {
    step: number;
    source: string | null;
    contentType: string | null;
    theme: string | null;
    vibe: string | null;
    sceneCount: number | null;
    template: string | null;
    uploadedPhotos?: Array<{ fileId: string; localPath?: string }>;
    textInput?: string;
    cloneUrl?: string;
  };
  selectedNiche?: string;
  selectedStyles?: string[];
  selectedPlatforms?: number[];
  currentJobId?: string;
  caption?: string;
  connectingPlatform?: string;

  // v3.0 Basic/Smart/Pro mode state
  generateMode?: "basic" | "smart" | "pro";
  generateAction?: "image_set" | "video" | "clone_style" | "campaign";
  generatePreset?: "quick" | "standard" | "extended" | "custom";
  generatePlatform?: "tiktok" | "instagram" | "youtube" | "square";
  generateProductDesc?: string;
  generateCampaignSize?: 5 | 10;
  generateScenes?: Array<{
    sceneId: string;
    prompt: string;
    durationSeconds: number;
  }>;
  generatePhotoUrl?: string;
  generateLastImageUrl?: string; // URL of last generated image for "Make Video" flow
  customPresetConfig?: any; // DurationPresetConfig for custom durations
  cloneRefUrl?: string;
  userLang?: string; // Cached user language for i18n (set during generation flows)
  userMode?: string; // Cached user persona/mode (set during /create and generation flows)

  // Pro mode: multi-image upload
  generatePhotos?: Array<{ sceneIndex: number; fileId: string; url: string }>;
  generatePhotoCount?: number;
  generatePhotoUploadDone?: boolean;
  // Image generation options
  generateAspectRatio?: "9:16" | "1:1" | "16:9" | "4:5";
  generateResolution?: "standard" | "hd" | "ultra";
  // Pro mode: storyboard auto/manual
  generateStoryboardMode?: "auto" | "manual";
  generateManualStoryboard?: Array<{
    sceneId: string;
    description: string;
    durationSeconds: number;
  }>;
  // Pro mode: transcript auto/manual
  generateTranscriptMode?: "auto" | "manual";
  generateManualTranscript?: string;

  // Ebook generation state
  ebookIdea?: string;
  ebookTitle?: string;
  ebookChapters?: number;
  ebookLanguage?: string;
  ebookMode?: string;
  ebookProjectId?: number;
}

export type BotState =
  | "START"
  | "ONBOARDING_LANGUAGE"
  | "ONBOARDING_PERSONA"
  | "DASHBOARD"
  | "CREATE_VIDEO_UPLOAD"
  | "CREATE_VIDEO_NICHE"
  | "CUSTOM_DURATION_INPUT"
  | "CUSTOM_DURATION_INPUT_V3"
  | "CUSTOM_PROMPT_INPUT"
  | "CLONE_VIDEO_WAITING"
  | "CLONE_EDIT_DESC_WAITING"
  | "CLONE_IMAGE_WAITING"
  | "DISASSEMBLE_WAITING"
  | "REPURPOSE_VIDEO_URL"
  | "REPURPOSE_CONFIRM"
  | "IMAGE_GENERATION_WAITING"
  | "IMAGE_REFERENCE_WAITING"
  | "AVATAR_UPLOAD_WAITING"
  | "AVATAR_NAME_WAITING"
  | "WAITING_ACCOUNT_ID"
  | "CUSTOMIZING_PROMPT"
  | "CUSTOM_PROMPT_CREATION"
  | "AWAITING_PRODUCT_INPUT"
  | "AWAITING_SCENE_EDIT"
  | "AWAITING_GENERATE_IMAGE"
  | "AWAITING_MULTI_IMAGE_UPLOAD"
  | "AWAITING_STORYBOARD_EDIT"
  | "AWAITING_TRANSCRIPT_INPUT"
  | "DELETE_ACCOUNT_CONFIRMATION"
  | "avatar_talk_photo"
  | "avatar_talk_text"
  | "IMAGE_ELEMENT_SELECTION"
  | "VIDEO_ELEMENT_SELECTION"
  | "WAITING_BUG_REPORT"
  | "MEDIA_INTENT_SELECTION"
  | "EBOOK_IDEA"
  | "EBOOK_TITLE"
  | "EBOOK_CHAPTERS"
  | "EBOOK_LANGUAGE"
  | "EBOOK_MODE";

// =============================================================================
// USER TYPES
// =============================================================================

export type UserTier = "free" | "basic" | "pro" | "agency";
export type UserLanguage = string;

export interface User {
  id: number;
  telegramId: number;
  uuid: string;
  username?: string;
  firstName: string;
  lastName?: string;
  phoneNumber?: string;
  tier: UserTier;
  creditBalance: number;
  creditExpiresAt?: Date;
  referralCode?: string;
  referredBy?: string;
  referralTier: number;
  language: UserLanguage;
  notificationsEnabled: boolean;
  autoRenewal: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

// =============================================================================
// VIDEO TYPES
// =============================================================================

export type VideoStatus = "processing" | "completed" | "failed" | "expired";
export type VideoPlatform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "facebook"
  | "twitter"
  | "linkedin";
export type VideoNiche =
  | "fnb"
  | "beauty"
  | "retail"
  | "services"
  | "professional"
  | "hospitality";

export interface VideoParams {
  niche: VideoNiche;
  platform: VideoPlatform;
  duration: number;
  scenes: number;
  images: string[];
  brief?: string;
  angles?: number;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export type TransactionStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "expired"
  | "refunded";
export type TransactionType =
  | "topup"
  | "subscription"
  | "refund"
  | "bonus"
  | "adjustment"
  | "welcome_bonus"
  | "credit_rollover";
export type PaymentGateway =
  | "midtrans"
  | "tripay"
  | "duitku"
  | "nowpayments"
  | "internal"
  | "admin_transfer"
  | "system"
  | "stars";

export interface TopupPackage {
  id: string;
  name: string;
  nameId: string;
  priceIdr: number;
  credits: number;
  bonus: number;
  expiryDays: number | null;
  savingsPercent: number;
}

// =============================================================================
// REFERRAL TYPES
// =============================================================================

export type CommissionStatus =
  | "pending"
  | "available"
  | "withdrawn"
  | "pending_cashout";

export interface ReferralStats {
  totalReferrals: number;
  tier1Referrals: number;
  tier2Referrals: number;
  totalCommission: number;
  pendingCommission: number;
  availableCommission: number;
  withdrawnCommission: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "BotError";
  }
}

export class ValidationError extends BotError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class InsufficientCreditsError extends BotError {
  constructor(message: string = "Insufficient credits") {
    super(message, "INSUFFICIENT_CREDITS", 402);
    this.name = "InsufficientCreditsError";
  }
}

export class RateLimitError extends BotError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
    this.name = "RateLimitError";
  }
}
