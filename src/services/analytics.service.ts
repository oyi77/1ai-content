/**
 * Analytics Service - Multi-platform conversion tracking
 * Tracks purchases, signups, and events to:
 * - Google Analytics 4
 * - Meta Conversions API
 * - TikTok Events API
 */

import axios from "axios";
import crypto from "crypto";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { secureRandomString } from "@/utils/crypto";

interface TrackingEvent {
  event_name: string;
  user_id?: string;
  email?: string;
  phone?: string;
  user_agent?: string;
  ip_address?: string;
  event_source_url?: string;
  custom_data?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_type?: string;
    content_id?: string;
    [key: string]: any;
  };
}

export class AnalyticsService {
  private static get GA4_MEASUREMENT_ID() { return getConfig().GA4_MEASUREMENT_ID || "G-V9C14XZ9SG"; }
  private static get GA4_API_SECRET() { return getConfig().GA4_API_SECRET || ""; }
  private static get TIKTOK_PIXEL_ID() { return getConfig().TIKTOK_PIXEL_ID || "D6IA84RC77UCTB9KG9OG"; }
  private static get TIKTOK_PIXEL_EVENT_TOKEN() { return getConfig().TIKTOK_PIXEL_EVENT_TOKEN || ""; }
  private static get META_PIXEL_ID() { return getConfig().META_PIXEL_ID || "771021905629860"; }
  private static get META_PIXEL_ACCESS_TOKEN() { return getConfig().META_PIXEL_ACCESS_TOKEN || ""; }
  private static get META_PIXEL_DATA_SET_ID() { return getConfig().META_PIXEL_DATA_SET_ID || ""; }

  /**
   * SHA256 hash for PII (email, phone, user ID)
   */
  private static hashPII(value: string): string {
    if (!value) return "";
    return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
  }

  /**
   * Track Purchase Event (Purchase, CompleteRegistration, AddToCart)
   */
  static async trackPurchase(data: {
    user_id: string;
    email?: string;
    phone?: string;
    amount_idr: number;
    currency?: string;
    transaction_id?: string;
    user_agent?: string;
    ip_address?: string;
    event_source_url?: string;
    // UTM Parameters
    utm_source?: string;
    utm_campaign?: string;
    utm_content?: string;
    lp_variant?: string;
    // Attribution IDs
    fbc?: string;
    fbp?: string;
    ttclid?: string;
    // LTV Metrics
    days_to_conversion?: number;
  }) {
    const payload: TrackingEvent = {
      event_name: "Purchase",
      user_id: data.user_id,
      email: data.email,
      phone: data.phone,
      user_agent: data.user_agent,
      ip_address: data.ip_address,
      event_source_url: data.event_source_url,
      custom_data: {
        value: data.amount_idr,
        currency: data.currency || "IDR",
        content_name: "Video Credits Purchase",
        content_type: "product",
        content_id: data.transaction_id,
        // UTM Parameters
        utm_campaign: data.utm_campaign,
        utm_content: data.utm_content,
        lp_variant: data.lp_variant,
        // Attribution IDs
        fbc: data.fbc,
        fbp: data.fbp,
        ttclid: data.ttclid,
        // LTV Metrics
        days_to_conversion: data.days_to_conversion,
      },
    };

    await Promise.all([
      this.sendToGA4(payload),
      this.sendToMetaCAPI(payload),
      this.sendToTikTokAPI(payload),
    ]).catch((error) => {
      logger.warn("⚠️ Some analytics failed (non-blocking):", error);
    });
  }

  /**
   * Track InitiateCheckout Event
   */
  static async trackInitiateCheckout(data: {
    user_id: string;
    email?: string;
    amount_idr: number;
    user_agent?: string;
    ip_address?: string;
    event_source_url?: string;
  }) {
    const payload: TrackingEvent = {
      event_name: "InitiateCheckout",
      user_id: data.user_id,
      email: data.email,
      user_agent: data.user_agent,
      ip_address: data.ip_address,
      event_source_url: data.event_source_url,
      custom_data: {
        value: data.amount_idr,
        currency: "IDR",
        content_name: "Checkout Initiated",
      },
    };

    await Promise.all([
      this.sendToGA4(payload),
      this.sendToMetaCAPI(payload),
      this.sendToTikTokAPI(payload),
    ]).catch((error) => {
      logger.warn("⚠️ Some analytics failed (non-blocking):", error);
    });
  }

  /**
   * Track CompleteRegistration Event
   */
  static async trackCompleteRegistration(data: {
    user_id: string;
    email?: string;
    phone?: string;
    user_agent?: string;
    ip_address?: string;
    event_source_url?: string;
  }) {
    const payload: TrackingEvent = {
      event_name: "CompleteRegistration",
      user_id: data.user_id,
      email: data.email,
      phone: data.phone,
      user_agent: data.user_agent,
      ip_address: data.ip_address,
      event_source_url: data.event_source_url,
      custom_data: {
        content_name: "User Registration",
        content_type: "registration",
      },
    };

    await Promise.all([
      this.sendToGA4(payload),
      this.sendToMetaCAPI(payload),
      this.sendToTikTokAPI(payload),
    ]).catch((error) => {
      logger.warn("⚠️ Some analytics failed (non-blocking):", error);
    });
  }

  /**
   * Track AddToCart Event
   */
  static async trackAddToCart(data: {
    user_id: string;
    email?: string;
    amount_idr: number;
    content_id?: string;
    user_agent?: string;
    ip_address?: string;
    event_source_url?: string;
  }) {
    const payload: TrackingEvent = {
      event_name: "AddToCart",
      user_id: data.user_id,
      email: data.email,
      user_agent: data.user_agent,
      ip_address: data.ip_address,
      event_source_url: data.event_source_url,
      custom_data: {
        value: data.amount_idr,
        currency: "IDR",
        content_name: "Video Credits",
        content_id: data.content_id,
      },
    };

    await Promise.all([
      this.sendToGA4(payload),
      this.sendToMetaCAPI(payload),
      this.sendToTikTokAPI(payload),
    ]).catch((error) => {
      logger.warn("⚠️ Some analytics failed (non-blocking):", error);
    });
  }

  /**
   * Send to Google Analytics 4 (Measurement Protocol)
   */
  private static async sendToGA4(event: TrackingEvent) {
    if (!this.GA4_MEASUREMENT_ID || !this.GA4_API_SECRET) {
      logger.debug("GA4: Missing measurement ID or API secret");
      return;
    }

    try {
      const payload = {
        client_id: event.user_id || "anonymous",
        events: [
          {
            name: event.event_name,
            params: {
              user_id: event.user_id,
              session_id: secureRandomString(16),
              value: event.custom_data?.value,
              currency: event.custom_data?.currency,
              transaction_id: event.custom_data?.content_id,
              engagement_time_msec: "100",
            },
          },
        ],
      };

      await axios.post(
        `https://www.google-analytics.com/mp/collect?measurement_id=${this.GA4_MEASUREMENT_ID}&api_secret=${this.GA4_API_SECRET}`,
        payload,
        { timeout: 5000 }
      );

      logger.debug(`✅ GA4 tracked: ${event.event_name}`);
    } catch (error: any) {
      logger.warn(`⚠️ GA4 tracking failed: ${error.message}`);
    }
  }

  /**
   * Send to Meta Conversions API (server-side)
   */
  private static async sendToMetaCAPI(event: TrackingEvent) {
    if (!this.META_PIXEL_ID || !this.META_PIXEL_ACCESS_TOKEN) {
      logger.debug("Meta CAPI: Missing pixel ID or access token");
      return;
    }

    try {
      const userData: any = {
        ...(event.user_id && { uid: this.hashPII(event.user_id) }),
        ...(event.email && { em: this.hashPII(event.email) }),
        ...(event.phone && { ph: this.hashPII(event.phone) }),
        ...(event.ip_address && { client_ip_address: event.ip_address }),
        ...(event.user_agent && { client_user_agent: event.user_agent }),
      };
      
      // Add attribution IDs if available (for click matching)
      if (event.custom_data?.fbc) {
        userData.fbc = event.custom_data.fbc;
      }
      if (event.custom_data?.fbp) {
        userData.fbp = event.custom_data.fbp;
      }

      const customData: Record<string, unknown> = {
        value: event.custom_data?.value,
        currency: event.custom_data?.currency || "IDR",
      };
      
      // Add UTM parameters to custom data for reporting
      if (event.custom_data?.utm_campaign) {
        customData.utm_campaign = event.custom_data.utm_campaign;
      }
      if (event.custom_data?.utm_content) {
        customData.utm_content = event.custom_data.utm_content;
      }
      if (event.custom_data?.lp_variant) {
        customData.lp_variant = event.custom_data.lp_variant;
      }

      await axios.post(
        `https://graph.facebook.com/v19.0/${this.META_PIXEL_ID}/events`,
        {
          data: [{ 
            user_data: userData, 
            custom_data: customData, 
            event_name: event.event_name, 
            event_time: Math.floor(Date.now() / 1000),
            event_source_url: event.event_source_url || "https://bot.aitradepulse.com",
          }],
          access_token: this.META_PIXEL_ACCESS_TOKEN,
        },
        { timeout: 5000 }
      );

      logger.debug(`✅ Meta CAPI tracked: ${event.event_name}`);
    } catch (error: any) {
      logger.warn(`⚠️ Meta CAPI tracking failed: ${error.message}`);
    }
  }

  /**
   * Send to TikTok Events API (server-side)
   */
  private static async sendToTikTokAPI(event: TrackingEvent) {
    if (!this.TIKTOK_PIXEL_ID || !this.TIKTOK_PIXEL_EVENT_TOKEN) {
      logger.debug("TikTok API: Missing pixel ID or event token");
      return;
    }

    try {
      const userData: any = {
        ...(event.user_id && { external_id: this.hashPII(event.user_id) }),
        ...(event.email && { email: this.hashPII(event.email) }),
        ...(event.phone && { phone_number: this.hashPII(event.phone) }),
        ...(event.ip_address && { ip: event.ip_address }),
        ...(event.user_agent && { user_agent: event.user_agent }),
      };
      
      // Add TikTok Click ID if available (for attribution matching)
      if (event.custom_data?.ttclid) {
        userData.ttclid = event.custom_data.ttclid;
      }

      const properties: Record<string, unknown> = {
        ...(event.custom_data?.value && { value: event.custom_data.value }),
        ...(event.custom_data?.currency && { currency: event.custom_data.currency }),
        content_id: event.custom_data?.content_id,
        content_name: event.custom_data?.content_name,
        content_type: event.custom_data?.content_type,
      };
      
      // Add UTM parameters for reporting
      if (event.custom_data?.utm_campaign) {
        properties.utm_campaign = event.custom_data.utm_campaign;
      }
      if (event.custom_data?.lp_variant) {
        properties.lp_variant = event.custom_data.lp_variant;
      }

      const payload = {
        event: event.event_name,
        event_id: secureRandomString(13),
        timestamp: Math.floor(Date.now() / 1000),
        user: userData,
        properties,
      };

      await axios.post(
        `https://business-api.tiktok.com/open_api/v1.3/pixel/${this.TIKTOK_PIXEL_ID}/track`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.TIKTOK_PIXEL_EVENT_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }
      );

      logger.debug(`✅ TikTok tracked: ${event.event_name}`);
    } catch (error: any) {
      logger.warn(`⚠️ TikTok tracking failed: ${error.message}`);
    }
  }
}
