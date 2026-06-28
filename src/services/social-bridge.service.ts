/**
 * Social Bridge Service — Connects 1ai-content to 1ai-social
 *
 * Handles:
 * - Listing user's connected social accounts
 * - Publishing content to social media
 * - Scheduling posts
 * - Uploading media files
 *
 * All social media management is delegated to 1ai-social.
 * 1ai-content only generates content and sends it to 1ai-social for publishing.
 */

import axios, { type AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { getConfig } from '@/config/env';
import { logger } from '@/utils/logger';

// ── Types ─────────────────────────────────────────────────────

export interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  status: string;
  avatar_url?: string;
  connected_at?: string;
}

export interface PublishResult {
  success: boolean;
  post_id?: string;
  platform?: string;
  status?: string;
  error?: string;
}

export interface ScheduleResult {
  success: boolean;
  scheduled_id?: string;
  scheduled_at?: string;
  error?: string;
}

export interface MediaUploadResult {
  url: string;
  filename: string;
}

// ── Service ───────────────────────────────────────────────────

export class SocialBridgeService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.SOCIAL_SERVICE_URL || 'http://localhost:8200';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get authorization headers for 1ai-social API.
   * Uses the social service API key for server-to-server auth.
   */
  private getAuthHeaders(userId: number): Record<string, string> {
    const config = getConfig();
    return {
      'Authorization': `Bearer ${config.SOCIAL_SERVICE_KEY || ''}`,
      'X-User-Id': String(userId),
      'Content-Type': 'application/json',
    };
  }

  // ── Account Management ────────────────────────────────────

  /**
   * List user's connected social accounts from 1ai-social.
   */
  async getConnectedAccounts(userId: number): Promise<SocialAccount[]> {
    try {
      const { data } = await this.client.get('/accounts', {
        headers: this.getAuthHeaders(userId),
      });
      return (data.platforms || data.accounts || []).map((a: Record<string, unknown>) => ({
        id: String(a.id ?? ''),
        platform: String(a.platform ?? a.name ?? ''),
        account_name: String(a.account_name ?? a.username ?? ''),
        account_id: String(a.account_id ?? a.platform_user_id ?? ''),
        status: String(a.status ?? 'active'),
        avatar_url: a.avatar_url ? String(a.avatar_url) : undefined,
        connected_at: a.connected_at ? String(a.connected_at) : undefined,
      }));
    } catch (err: unknown) {
      logger.error(`[SocialBridge] getConnectedAccounts failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Get OAuth URL for connecting a social account.
   */
  async getConnectUrl(userId: number, platform: string): Promise<string | null> {
    try {
      const { data } = await this.client.get(`/accounts/connect/${platform}`, {
        headers: this.getAuthHeaders(userId),
      });
      return data.auth_url || data.url || null;
    } catch (err: unknown) {
      logger.error(`[SocialBridge] getConnectUrl failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Disconnect a social account.
   */
  async disconnectAccount(userId: number, accountId: string): Promise<boolean> {
    try {
      await this.client.delete(`/accounts/${accountId}`, {
        headers: this.getAuthHeaders(userId),
      });
      return true;
    } catch (err: unknown) {
      logger.error(`[SocialBridge] disconnectAccount failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ── Publishing ────────────────────────────────────────────

  /**
   * Upload media file to 1ai-social.
   */
  async uploadMedia(userId: number, filePath: string): Promise<MediaUploadResult | null> {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      const { data } = await this.client.post('/media/upload', form, {
        headers: {
          ...this.getAuthHeaders(userId),
          ...form.getHeaders(),
        },
        timeout: 60_000,
      });
      return { url: data.url, filename: data.filename || path.basename(filePath) };
    } catch (err: unknown) {
      logger.error(`[SocialBridge] uploadMedia failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Publish content to social media via 1ai-social.
   */
  async publish(userId: number, options: {
    platform: string;
    mediaUrl: string;
    caption: string;
    hashtags?: string[];
    mediaType?: 'video' | 'image' | 'carousel';
  }): Promise<PublishResult> {
    try {
      const { data } = await this.client.post('/posts', {
        platform: options.platform,
        media_url: options.mediaUrl,
        content: options.caption,
        hashtags: options.hashtags || [],
        media_type: options.mediaType || 'video',
      }, {
        headers: this.getAuthHeaders(userId),
      });
      return {
        success: true,
        post_id: data.id,
        platform: options.platform,
        status: data.status || 'published',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SocialBridge] publish failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Schedule a post for later publishing.
   */
  async schedulePost(userId: number, options: {
    platform: string;
    mediaUrl: string;
    caption: string;
    hashtags?: string[];
    scheduledAt: string; // ISO datetime
    timezone?: string;
  }): Promise<ScheduleResult> {
    try {
      const { data } = await this.client.post('/posts', {
        platform: options.platform,
        media_url: options.mediaUrl,
        content: options.caption,
        hashtags: options.hashtags || [],
        scheduled_at: options.scheduledAt,
        timezone: options.timezone || 'Asia/Jakarta',
        status: 'scheduled',
      }, {
        headers: this.getAuthHeaders(userId),
      });
      return {
        success: true,
        scheduled_id: data.id,
        scheduled_at: options.scheduledAt,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SocialBridge] schedulePost failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Get user's scheduled posts.
   */
  async getScheduledPosts(userId: number, status?: string): Promise<Record<string, unknown>[]> {
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const { data } = await this.client.get('/posts', {
        headers: this.getAuthHeaders(userId),
        params,
      });
      return Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      logger.error(`[SocialBridge] getScheduledPosts failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Cancel a scheduled post.
   */
  async cancelScheduledPost(userId: number, postId: string): Promise<boolean> {
    try {
      await this.client.delete(`/posts/${postId}`, {
        headers: this.getAuthHeaders(userId),
      });
      return true;
    } catch (err: unknown) {
      logger.error(`[SocialBridge] cancelScheduledPost failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Check if 1ai-social is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { data } = await this.client.get('/health', { timeout: 5000 });
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
}

// Singleton
export const socialBridge = new SocialBridgeService();
