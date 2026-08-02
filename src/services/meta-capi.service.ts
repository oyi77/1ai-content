/**
 * Meta CAPI (Conversions API) Service
 * 
 * Tracks 14 events for full funnel attribution
 * Master Document v3.0 — Part 11.4
 * 
 * Events:
 * 1. PageView — landing page hit
 * 2. ViewContent — bot /start
 * 3. AddToCart — tap "Beli Credit"
 * 4. InitiateCheckout — select package
 * 5. AddPaymentInfo — payment method selected
 * 6. Purchase — payment confirmed
 * 7. Lead — first generate
 * 8. CompleteRegistration — onboarding done
 * 9. Search — niche search
 * 10. CustomEvent:GenerateStart — tap generate
 * 11. CustomEvent:GenerateComplete — received output
 * 12. CustomEvent:VideoView — video delivered
 * 13. CustomEvent:ReferralShare — shared referral link
 * 14. CustomEvent:SubscriptionStart — subscription activated
 */

import { logger } from '@/utils/logger';
import { createHash } from 'crypto';
import { getConfig } from '@/config/env';

// ── Config ────────────────────────────────────────────────────────────────────

function getPixelId() { return getConfig().META_PIXEL_ID || ''; }
function getAccessToken() { return getConfig().META_CAPI_TOKEN || ''; }
function getApiUrl() { return `https://graph.facebook.com/v18.0/${getPixelId()}/events`; }
function getTestEventCode() { return getConfig().META_TEST_EVENT_CODE || ''; }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserData {
  telegramId: bigint;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fbc?: string; // Facebook click ID
  fbp?: string; // Facebook browser ID
  ttclid?: string; // TikTok click ID
  ipAddress?: string;
  userAgent?: string;
}

export interface CustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  numItems?: number;
  orderId?: string;
  [key: string]: unknown;
}

export interface CAPIEvent {
  eventName: string;
  eventTime?: number;
  userData: UserData;
  customData?: CustomData;
  eventSourceUrl?: string;
  actionSource?: 'app' | 'website' | 'chat';
}

// ── Helper: Hash PII ──────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function buildUserDataPayload(userData: UserData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    external_id: sha256(userData.telegramId.toString()),
  };

  if (userData.email) payload.em = sha256(userData.email);
  if (userData.phone) payload.ph = sha256(userData.phone.replace(/\D/g, ''));
  if (userData.firstName) payload.fn = sha256(userData.firstName);
  if (userData.lastName) payload.ln = sha256(userData.lastName);
  if (userData.fbc) payload.fbc = userData.fbc;
  if (userData.fbp) payload.fbp = userData.fbp;
  if (userData.ipAddress) payload.client_ip_address = userData.ipAddress;
  if (userData.userAgent) payload.client_user_agent = userData.userAgent;

  return payload;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class MetaCAPIService {

  private static isConfigured(): boolean {
    return !!(getPixelId() && getAccessToken());
  }

  /**
   * Send event to Meta CAPI
   */
  static async sendEvent(event: CAPIEvent): Promise<void> {
    if (!this.isConfigured()) return;

    const payload = {
      data: [{
        event_name: event.eventName,
        event_time: event.eventTime || Math.floor(Date.now() / 1000),
        action_source: event.actionSource || 'app',
        event_source_url: event.eventSourceUrl || 'https://content.aitradepulse.com',
        user_data: buildUserDataPayload(event.userData),
        custom_data: event.customData || {},
      }],
      ...(getTestEventCode() && { test_event_code: getTestEventCode() }),
    };

    try {
      const response = await fetch(`${getApiUrl()}?access_token=${getAccessToken()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const err = await response.text();
        logger.warn(`[meta-capi] Event ${event.eventName} failed: ${err.slice(0, 100)}`);
      } else {
        logger.debug(`[meta-capi] ✅ ${event.eventName} sent`);
      }
    } catch (err) {
      logger.error('[meta-capi] Network error:', err);
    }
  }

  /**
   * Batch send multiple events
   */
  static async sendEvents(events: CAPIEvent[]): Promise<void> {
    if (!this.isConfigured() || events.length === 0) return;

    const data = events.map((event) => ({
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      action_source: event.actionSource || 'app',
      user_data: buildUserDataPayload(event.userData),
      custom_data: event.customData || {},
    }));

    try {
      const response = await fetch(`${getApiUrl()}?access_token=${getAccessToken()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, ...(getTestEventCode() && { test_event_code: getTestEventCode() }) }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn('[meta-capi] Batch send failed');
      }
    } catch (err) {
      logger.error('[meta-capi] Batch send error:', err);
    }
  }

  // ── 14 Named Event Methods ──────────────────────────────────────────────────

  /** Event 1: Landing page view */
  static async trackPageView(userData: UserData, url?: string): Promise<void> {
    await this.sendEvent({ eventName: 'PageView', userData, eventSourceUrl: url, actionSource: 'website' });
  }

  /** Event 2: Bot /start */
  static async trackViewContent(userData: UserData, contentName?: string): Promise<void> {
    await this.sendEvent({
      eventName: 'ViewContent',
      userData,
      customData: { content_name: contentName || '1AI Content Bot Start', content_category: 'ai_tool' },
    });
  }

  /** Event 3: Tap "Beli Credit" */
  static async trackAddToCart(userData: UserData): Promise<void> {
    await this.sendEvent({
      eventName: 'AddToCart',
      userData,
      customData: { content_category: 'credit_package', currency: 'IDR' },
    });
  }

  /** Event 4: Select package */
  static async trackInitiateCheckout(userData: UserData, packageId: string, priceIdr: number): Promise<void> {
    await this.sendEvent({
      eventName: 'InitiateCheckout',
      userData,
      customData: { content_ids: [packageId], value: priceIdr / (getConfig().USD_TO_IDR_RATE), currency: 'IDR', num_items: 1 },
    });
  }

  /** Event 5: Payment method selected */
  static async trackAddPaymentInfo(userData: UserData, method: string): Promise<void> {
    await this.sendEvent({
      eventName: 'AddPaymentInfo',
      userData,
      customData: { content_category: method },
    });
  }

  /** Event 6: Payment confirmed */
  static async trackPurchase(
    userData: UserData,
    orderId: string,
    priceIdr: number,
    packageId: string
  ): Promise<void> {
    await this.sendEvent({
      eventName: 'Purchase',
      userData,
      customData: {
        order_id: orderId,
        value: priceIdr / (getConfig().USD_TO_IDR_RATE),
        currency: 'IDR',
        content_ids: [packageId],
        content_type: 'product',
      },
    });
  }

  /** Event 7: First generate */
  static async trackLead(userData: UserData): Promise<void> {
    await this.sendEvent({
      eventName: 'Lead',
      userData,
      customData: { content_name: 'First Generate', content_category: 'ai_generate' },
    });
  }

  /** Event 8: Onboarding complete */
  static async trackCompleteRegistration(userData: UserData): Promise<void> {
    await this.sendEvent({
      eventName: 'CompleteRegistration',
      userData,
      customData: { status: 'completed', currency: 'IDR', value: 0 },
    });
  }

  /** Event 9: Niche/product search */
  static async trackSearch(userData: UserData, searchString: string): Promise<void> {
    await this.sendEvent({
      eventName: 'Search',
      userData,
      customData: { search_string: searchString },
    });
  }

  /** Event 10: Generate started */
  static async trackGenerateStart(userData: UserData, mode: string, action: string): Promise<void> {
    await this.sendEvent({
      eventName: 'CustomEvent',
      userData,
      customData: { event_type: 'GenerateStart', mode, action },
    });
  }

  /** Event 11: Generate completed (received output) */
  static async trackGenerateComplete(
    userData: UserData,
    action: string,
    durationMs: number,
    creditCost: number
  ): Promise<void> {
    await this.sendEvent({
      eventName: 'CustomEvent',
      userData,
      customData: {
        event_type: 'GenerateComplete',
        action,
        duration_ms: durationMs,
        credit_cost: creditCost,
      },
    });
  }

  /** Event 12: Video delivered to user */
  static async trackVideoView(userData: UserData, videoId: string, durationSeconds: number): Promise<void> {
    await this.sendEvent({
      eventName: 'CustomEvent',
      userData,
      customData: { event_type: 'VideoView', video_id: videoId, duration_seconds: durationSeconds },
    });
  }

  /** Event 13: Referral link shared */
  static async trackReferralShare(userData: UserData, channel: string): Promise<void> {
    await this.sendEvent({
      eventName: 'CustomEvent',
      userData,
      customData: { event_type: 'ReferralShare', channel },
    });
  }

  /** Event 14: Subscription activated */
  static async trackSubscriptionStart(userData: UserData, plan: string, priceIdr: number): Promise<void> {
    await this.sendEvent({
      eventName: 'CustomEvent',
      userData,
      customData: {
        event_type: 'SubscriptionStart',
        plan,
        value: priceIdr / (getConfig().USD_TO_IDR_RATE),
        currency: 'IDR',
      },
    });
  }
}

export default MetaCAPIService;
