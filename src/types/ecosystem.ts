/**
 * Ecosystem API Contracts
 * 
 * Shared types for 1ai-content ↔ 1ai-social ↔ 1ai-affiliate integration.
 * Import from '@/types/ecosystem' in any service.
 */

// ══════════════════════════════════════════════════════════════════════
// 1ai-content → 1ai-social (Publish Request)
// ══════════════════════════════════════════════════════════════════════

export interface PublishRequest {
  /** User ID from 1ai-content */
  userId: string;
  /** Media URL (image or video) */
  mediaUrl: string;
  /** Media type */
  mediaType: 'image' | 'video' | 'carousel';
  /** Post caption */
  caption: string;
  /** Target platforms */
  platforms: Platform[];
  /** Optional: specific page/account IDs per platform */
  pageIds?: Record<Platform, string[]>;
  /** Schedule time (ISO 8601). Omit for immediate publish */
  scheduledAt?: string;
  /** Auto-inject affiliate tracking link */
  injectAffiliateLink?: boolean;
  /** Campaign ID for affiliate tracking */
  campaignId?: string;
  /** Platform-specific overrides */
  platformOverrides?: Partial<Record<Platform, PlatformOverride>>;
}

export type Platform = 
  | 'facebook' 
  | 'instagram' 
  | 'tiktok' 
  | 'youtube' 
  | 'twitter' 
  | 'linkedin';

export interface PlatformOverride {
  caption?: string;
  mediaUrl?: string;
  aspectRatio?: string;
  hashtags?: string[];
}

// ══════════════════════════════════════════════════════════════════════
// 1ai-social → 1ai-content (Publish Response)
// ══════════════════════════════════════════════════════════════════════

export interface PublishResponse {
  success: boolean;
  results: PlatformResult[];
  /** Total platforms published */
  published: number;
  /** Total platforms failed */
  failed: number;
}

export interface PlatformResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  scheduledAt?: string;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════
// 1ai-social → 1ai-affiliate (Affiliate Link Request)
// ══════════════════════════════════════════════════════════════════════

export interface AffiliateLinkRequest {
  /** User ID */
  userId: string;
  /** Destination URL (product/offer page) */
  destinationUrl: string;
  /** Campaign ID */
  campaignId?: string;
  /** Platform where link will be posted */
  platform?: Platform;
  /** Custom sub-ID for tracking */
  subId?: string;
}

export interface AffiliateLinkResponse {
  /** Unique tracking ID */
  trackingId: string;
  /** Full tracking URL */
  trackingUrl: string;
  /** Short URL (if available) */
  shortUrl?: string;
  /** Expiry date */
  expiresAt?: string;
}

// ══════════════════════════════════════════════════════════════════════
// 1ai-affiliate → 1ai-content (Conversion Webhook)
// ══════════════════════════════════════════════════════════════════════

export interface ConversionWebhook {
  /** Tracking click ID */
  clickId: string;
  /** Tracking link ID */
  trackingId: string;
  /** User ID from 1ai-content */
  userId: string;
  /** Conversion type */
  conversionType: 'click' | 'lead' | 'purchase' | 'signup';
  /** Revenue amount (in smallest currency unit) */
  revenue: number;
  /** Currency code */
  currency: string;
  /** Commission amount */
  commission: number;
  /** Campaign ID */
  campaignId?: string;
  /** Platform where click originated */
  platform?: Platform;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface ConversionAck {
  accepted: boolean;
  conversionId?: string;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════
// Shared: Content Package (passed between all three services)
// ══════════════════════════════════════════════════════════════════════

export interface ContentPackage {
  /** Unique content ID from 1ai-content */
  contentId: string;
  /** User who created the content */
  userId: string;
  /** Content type */
  type: 'video' | 'image' | 'carousel';
  /** Media URLs */
  mediaUrls: string[];
  /** Generated caption */
  caption: string;
  /** Niche/category */
  niche?: string;
  /** Style reference */
  style?: string;
  /** Created timestamp */
  createdAt: string;
  /** Publishing status */
  publishStatus?: Record<Platform, 'pending' | 'scheduled' | 'published' | 'failed'>;
  /** Affiliate tracking info */
  affiliate?: {
    trackingId: string;
    trackingUrl: string;
    campaignId?: string;
  };
}

// ══════════════════════════════════════════════════════════════════════
// API Endpoints (for documentation & client generation)
// ══════════════════════════════════════════════════════════════════════

export const ENDPOINTS = {
  // 1ai-social
  SOCIAL_PUBLISH: '/api/content/publish',
  SOCIAL_SCHEDULE: '/api/content/schedule',
  SOCIAL_PAGES: '/api/meta-pages',
  SOCIAL_ANALYTICS: '/api/analytics',

  // 1ai-affiliate
  AFFILIATE_GENERATE_LINK: '/api/affiliate/generate-link',
  AFFILIATE_CAMPAIGNS: '/api/affiliate/campaigns',
  AFFILIATE_CONVERSION_WEBHOOK: '/webhook/conversion',
  AFFILIATE_ANALYTICS: '/api/affiliate/analytics',

  // 1ai-content (internal)
  CONTENT_WEBHOOK_PUBLISH: '/webhook/publish-result',
  CONTENT_WEBHOOK_CONVERSION: '/webhook/conversion-update',
} as const;

// ══════════════════════════════════════════════════════════════════════
// Auth: Inter-service API key authentication
// ══════════════════════════════════════════════════════════════════════

export interface ServiceAuth {
  /** API key header */
  'X-Service-Key': string;
  /** Service name */
  'X-Service-Name': '1ai-content' | '1ai-social' | '1ai-affiliate';
  /** Request timestamp for replay protection */
  'X-Timestamp': string;
  /** HMAC signature */
  'X-Signature': string;
}
