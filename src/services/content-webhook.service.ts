/**
 * Content Webhook Service
 *
 * Notifies 1ai-social when content is generated so it can be
 * auto-distributed to social platforms.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";

interface WebhookPayload {
  source: string;
  event_type: string;
  content_id: string;
  content_type: string;
  title?: string;
  description?: string;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  hashtags?: string[];
  platform?: string;
  metadata?: Record<string, unknown>;
}

interface WebhookResponse {
  status: string;
  message: string;
  post_ids?: string[];
}

export class ContentWebhookService {
  private webhookUrl: string;
  private apiKey: string;

  constructor() {
    this.webhookUrl = getConfig().SOCIAL_WEBHOOK_URL;
    this.apiKey = getConfig().CONTENT_WEBHOOK_SECRET || "";
  }

  async notifyVideoCompleted(params: {
    contentId: string;
    title?: string;
    description?: string;
    videoUrl: string;
    thumbnailUrl?: string;
    caption?: string;
    hashtags?: string[];
    platform?: string;
  }): Promise<WebhookResponse | null> {
    return this.sendWebhook({
      source: "1ai-content",
      event_type: "video_completed",
      content_id: params.contentId,
      content_type: "video",
      title: params.title,
      description: params.description,
      media_url: params.videoUrl,
      thumbnail_url: params.thumbnailUrl,
      caption: params.caption,
      hashtags: params.hashtags,
      platform: params.platform,
    });
  }

  async notifyImageGenerated(params: {
    contentId: string;
    title?: string;
    imageUrl: string;
    caption?: string;
    hashtags?: string[];
    platform?: string;
  }): Promise<WebhookResponse | null> {
    return this.sendWebhook({
      source: "1ai-content",
      event_type: "image_generated",
      content_id: params.contentId,
      content_type: "image",
      title: params.title,
      media_url: params.imageUrl,
      caption: params.caption,
      hashtags: params.hashtags,
      platform: params.platform,
    });
  }

  async notifyEbookCompleted(params: {
    contentId: string;
    title: string;
    description?: string;
    downloadUrl: string;
    platform?: string;
  }): Promise<WebhookResponse | null> {
    return this.sendWebhook({
      source: "1ai-content",
      event_type: "ebook_completed",
      content_id: params.contentId,
      content_type: "ebook",
      title: params.title,
      description: params.description,
      media_url: params.downloadUrl,
      platform: params.platform,
    });
  }


  async notifyTikTokUpload(params: {
    contentId: string;
    videoPath: string;
    caption: string;
    hashtags?: string[];
  }): Promise<WebhookResponse | null> {
    return this.sendWebhook({
      source: "1ai-content",
      event_type: "tiktok_upload",
      content_id: params.contentId,
      content_type: "video",
      caption: params.caption,
      hashtags: params.hashtags,
      platform: "tiktok",
      metadata: { video_path: params.videoPath },
    });
  }

  private async sendWebhook(payload: WebhookPayload): Promise<WebhookResponse | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.warn("Webhook failed", {
          status: response.status,
          body: text,
          contentId: payload.content_id,
        });
        return null;
      }

      const result = (await response.json()) as WebhookResponse;
      logger.info("Webhook sent successfully", {
        contentId: payload.content_id,
        postIds: result.post_ids,
      });
      return result;
    } catch (err) {
      logger.debug("Webhook not available (1ai-social may be offline)", {
        error: (err as Error).message,
      });
      return null;
    }
  }
}

export const contentWebhookService = new ContentWebhookService();
