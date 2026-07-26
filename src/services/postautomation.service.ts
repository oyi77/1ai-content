/**
 * Post Automation Service
 * 
 * Handles social media posting via PostBridge API
 * Each user can only post to their own connected accounts
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import axios from 'axios';
import { ValidationError, ProviderError } from '@/utils/app-errors';
import { publishViaAdapter, getPostBridgeAccountsViaAdapter } from './shared-platform-adapters.service';

const POSTBRIDGE_API = 'https://api.post-bridge.com/v1';

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
  accountId: string;
}

export interface PublishParams {
  userId: bigint;
  mediaUrl: string;
  caption: string;
  platformAccountIds: number[]; // User's connected account IDs
  scheduledAt?: Date;
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  platform: string;
  error?: string;
}

export interface ConnectAccountResult {
  id: number;
  userId: bigint;
  platform: string;
  pbAccountId: string;
  accountName: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PostAutomation Service
 */
export class PostAutomationService {
  
  /**
   * Get PostBridge accounts (admin only - for reference)
   */
  static async getPostBridgeAccounts(): Promise<SocialAccount[]> {
    // Tier -1: Try shared adapter first
    try {
      const adapterResult = await getPostBridgeAccountsViaAdapter();
      if (adapterResult !== null) {
        return adapterResult;
      }
    } catch (err: any) {
      logger.warn('Shared adapter getAccounts failed, falling back:', err.message);
    }

    // Fallback: Direct API call
    try {
      const response = await axios.get(
        `${POSTBRIDGE_API}/social-accounts`,
        {
          headers: {
            'Authorization': `Bearer ${getConfig().POSTBRIDGE_API_KEY || ''}`,
          },
        }
      );

      return response.data.data || [];
    } catch (error: any) {
      logger.error('Failed to fetch PostBridge accounts:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get user's connected social accounts
   */
  static async getUserAccounts(userId: bigint): Promise<SocialAccount[]> {
    const accounts = await prisma.socialAccount.findMany({
      where: { 
        userId,
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.map(acc => ({
      id: acc.id,
      platform: acc.platform,
      username: acc.accountName || '',
      accountId: acc.pbAccountId,
    }));
  }

  /**
   * Connect social account for user
   * Links PostBridge account to user
   */
  static async connectAccount(
    userId: bigint,
    platform: string,
    pbAccountId: string,
    accountName?: string,
    avatarUrl?: string
  ): Promise<ConnectAccountResult> {
    // Check if already connected
    const existing = await prisma.socialAccount.findFirst({
      where: {
        pbAccountId,
      },
    });

    if (existing) {
      // Update if exists
      return prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          accountName,
          avatarUrl,
          status: 'active',
          updatedAt: new Date(),
        },
      });
    }

    // Create new connection
    return prisma.socialAccount.create({
      data: {
        userId,
        platform,
        pbAccountId,
        accountName,
        avatarUrl,
        status: 'active',
      },
    });
  }

  /**
   * Disconnect social account
   */
  static async disconnectAccount(userId: bigint, accountId: number): Promise<void> {
    await prisma.socialAccount.deleteMany({
      where: {
        id: accountId,
        userId, // Ensure user owns this account
      },
    });
  }

  /**
   * Upload media to PostBridge
   */
  static async uploadMedia(mediaUrl: string): Promise<string> {
    try {
      const response = await axios.post(
        `${POSTBRIDGE_API}/media/create-upload-url`,
        {
          media_url: mediaUrl,
        },
        {
          headers: {
            'Authorization': `Bearer ${getConfig().POSTBRIDGE_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.media_id || response.data.id;
    } catch (error: any) {
      logger.error('Failed to upload media to PostBridge:', error.response?.data || error.message);
      throw new ValidationError('Failed to upload media', 'media');
    }
  }

  /**
   * Publish to social media
   */
  static async publish(params: PublishParams): Promise<PublishResult[]> {
    // Tier -1: Try shared platform-adapters first
    try {
      const adapterResult = await publishViaAdapter({
        caption: params.caption,
        mediaUrl: params.mediaUrl,
        socialAccountIds: params.platformAccountIds,
        scheduledAt: params.scheduledAt,
      });
      if (adapterResult !== null) {
        return adapterResult.map((r: any) => ({
          success: r.success,
          postId: r.postId,
          postUrl: r.postUrl,
          platform: r.platform,
          error: r.error,
        }));
      }
    } catch (err: any) {
      logger.warn('Shared platform-adapters publish failed, falling back:', err.message);
    }

    // Fallback: Existing direct PostBridge API implementation
    const results: PublishResult[] = [];

    // Get user's connected accounts
    const userAccounts = await this.getUserAccounts(params.userId);
    
    // Filter to only selected accounts
    const selectedAccounts = userAccounts.filter(acc =>
      params.platformAccountIds.includes(acc.id)
    );

    if (selectedAccounts.length === 0) {
      throw new ValidationError('No accounts selected', 'accounts');
    }

    // Upload media to PostBridge first
    let mediaId: string;
    try {
      mediaId = await this.uploadMedia(params.mediaUrl);
    } catch (error) {
      logger.error('Media upload failed:', error);
      throw new ProviderError('PostBridge', 'Failed to upload media');
    }

    // Publish to each selected platform
    for (const account of selectedAccounts) {
      try {
        const postData: any = {
          caption: params.caption,
          media: [mediaId],
          social_accounts: [parseInt(account.accountId)],
          use_queue: true,
        };

        if (params.scheduledAt) {
          postData.scheduled_at = params.scheduledAt.toISOString();
        }

        const response = await axios.post(
          `${POSTBRIDGE_API}/posts`,
          postData,
          {
            headers: {
              'Authorization': `Bearer ${getConfig().POSTBRIDGE_API_KEY || ''}`,
              'Content-Type': 'application/json',
            },
          }
        );

        results.push({
          success: true,
          postId: response.data.id || response.data.post_id,
          postUrl: response.data.url,
          platform: account.platform,
        });

        logger.info(`Published to ${account.platform} for user ${params.userId}`);

      } catch (error: any) {
        logger.error(`Failed to publish to ${account.platform}:`, error.response?.data || error.message);
        
        results.push({
          success: false,
          platform: account.platform,
          error: error.response?.data?.message || error.message,
        });
      }
    }

    return results;
  }

  /**
   * Check if user has connected accounts
   */
  static async hasConnectedAccounts(userId: bigint): Promise<boolean> {
    const count = await prisma.socialAccount.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Get platform-specific account requirements
   */
  static getPlatformRequirements(platform: string): {
    required: string[];
    optional: string[];
  } {
    const requirements: Record<string, { required: string[]; optional: string[] }> = {
      tiktok: {
        required: ['video'],
        optional: ['caption', 'hashtags'],
      },
      instagram: {
        required: ['media'], // image or video
        optional: ['caption', 'hashtags', 'location'],
      },
      facebook: {
        required: ['media'],
        optional: ['caption', 'hashtags'],
      },
      twitter: {
        required: ['text'],
        optional: ['media', 'hashtags'],
      },
      youtube: {
        required: ['video', 'title'],
        optional: ['description', 'tags'],
      },
    };

    return requirements[platform.toLowerCase()] || { required: [], optional: [] };
  }
}
