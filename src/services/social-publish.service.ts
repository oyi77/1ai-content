/**
 * Social Publishing Service
 * 
 * Bridges 1ai-content → 1ai-social for multi-platform publishing.
 * Handles content handoff after video/image generation.
 */

import axios, { type AxiosResponse } from 'axios';
import { logger } from '@/utils/logger';
import { getEcosystemConfig, createServiceHeaders } from '@/config/ecosystem';
import type {
  PublishRequest,
  PublishResponse,
  Platform,
  ContentPackage,
  AffiliateLinkRequest,
  AffiliateLinkResponse,
} from '@/types/ecosystem';

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

interface SocialPublishOptions {
  userId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'carousel';
  caption: string;
  platforms: Platform[];
  scheduledAt?: Date;
  injectAffiliateLink?: boolean;
  campaignId?: string;
  pageIds?: Record<Platform, string[]>;
}

interface BulkScheduleOptions {
  userId: string;
  contentPackages: ContentPackage[];
  startDate: Date;
  postsPerDay: number;
  platforms: Platform[];
}

// ══════════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════════

export class SocialPublishService {
  /**
   * Publish content to social media via 1ai-social
   */
  static async publish(options: SocialPublishOptions): Promise<PublishResponse> {
    const config = getEcosystemConfig();
    const url = `${config.social.baseUrl}/api/content/publish`;

    const payload: PublishRequest = {
      userId: options.userId,
      mediaUrl: options.mediaUrl,
      mediaType: options.mediaType,
      caption: options.caption,
      platforms: options.platforms,
      pageIds: options.pageIds,
      scheduledAt: options.scheduledAt?.toISOString(),
      injectAffiliateLink: options.injectAffiliateLink,
      campaignId: options.campaignId,
    };

    try {
      const headers = createServiceHeaders('1ai-content', payload, config.social.apiKey);
      const response: AxiosResponse<PublishResponse> = await axios.post(url, payload, {
        headers,
        timeout: 30_000,
      });

      logger.info({
        msg: 'Social publish completed',
        userId: options.userId,
        platforms: options.platforms,
        published: response.data.published,
        failed: response.data.failed,
      });

      return response.data;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ msg: 'Social publish failed', error, userId: options.userId });
      throw new Error(`Social publish failed: ${error}`);
    }
  }

  /**
   * Generate affiliate tracking link via 1ai-affiliate
   */
  static async generateAffiliateLink(
    userId: string,
    destinationUrl: string,
    campaignId?: string
  ): Promise<AffiliateLinkResponse> {
    const config = getEcosystemConfig();
    const url = `${config.affiliate.baseUrl}/api/affiliate/generate-link`;

    const payload: AffiliateLinkRequest = {
      userId,
      destinationUrl,
      campaignId,
    };

    try {
      const headers = createServiceHeaders('1ai-content', payload, config.affiliate.apiKey);
      const response: AxiosResponse<AffiliateLinkResponse> = await axios.post(url, payload, {
        headers,
        timeout: 10_000,
      });

      logger.info({
        msg: 'Affiliate link generated',
        userId,
        trackingId: response.data.trackingId,
      });

      return response.data;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ msg: 'Affiliate link generation failed', error, userId });
      throw new Error(`Affiliate link generation failed: ${error}`);
    }
  }

  /**
   * Bulk schedule content across multiple days
   */
  static async bulkSchedule(options: BulkScheduleOptions): Promise<PublishResponse[]> {
    const results: PublishResponse[] = [];
    const { contentPackages, startDate, postsPerDay, platforms, userId } = options;

    const totalDays = Math.ceil(contentPackages.length / postsPerDay);
    
    for (let day = 0; day < totalDays; day++) {
      const dayContent = contentPackages.slice(day * postsPerDay, (day + 1) * postsPerDay);
      const scheduleDate = new Date(startDate);
      scheduleDate.setDate(scheduleDate.getDate() + day);

      // Distribute posts across the day (9 AM to 9 PM)
      const hourSlots = this.generateTimeSlots(dayContent.length, 9, 21);

      for (let i = 0; i < dayContent.length; i++) {
        const content = dayContent[i];
        const scheduledAt = new Date(scheduleDate);
        scheduledAt.setHours(hourSlots[i], 0, 0, 0);

        const result = await this.publish({
          userId,
          mediaUrl: content.mediaUrls[0],
          mediaType: content.type,
          caption: content.caption,
          platforms,
          scheduledAt,
          injectAffiliateLink: true,
          campaignId: content.affiliate?.campaignId,
        });

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get available Facebook pages for user
   */
  static async getUserPages(userId: string): Promise<unknown[]> {
    const config = getEcosystemConfig();
    const url = `${config.social.baseUrl}/api/meta-pages`;

    try {
      const headers = createServiceHeaders('1ai-content', { userId }, config.social.apiKey);
      const response = await axios.get(url, {
        headers,
        params: { userId },
        timeout: 10_000,
      });

      return response.data.pages;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ msg: 'Failed to get user pages', error, userId });
      return [];
    }
  }

  /**
   * Generate time slots between start and end hour
   */
  private static generateTimeSlots(count: number, startHour: number, endHour: number): number[] {
    const availableHours = endHour - startHour;
    const step = availableHours / Math.max(count, 1);
    const slots: number[] = [];
    
    for (let i = 0; i < count; i++) {
      slots.push(Math.floor(startHour + i * step));
    }
    
    return slots;
  }
}

export default SocialPublishService;
