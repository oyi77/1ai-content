/**
 * Unit Tests — SocialPublishService
 * Tests for: publish, generateAffiliateLink, bulkSchedule, getUserPages
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockConfig = {
  social: {
    baseUrl: 'http://social.test',
    apiKey: 'social-secret',
  },
  affiliate: {
    baseUrl: 'http://affiliate.test',
    apiKey: 'affiliate-secret',
  },
};

const mockHeaders = {
  'Content-Type': 'application/json',
  'X-Service-Key': 'test-key',
  'X-Service-Name': '1ai-content',
  'X-Timestamp': '1234567890',
  'X-Signature': 'test-sig',
};

const mockAxiosPost = jest.fn();
const mockAxiosGet = jest.fn();

jest.mock('@/utils/logger', () => ({ logger: mockLogger }));
jest.mock('@/config/ecosystem', () => ({
  getEcosystemConfig: jest.fn(() => mockConfig),
  createServiceHeaders: jest.fn(() => mockHeaders),
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
  },
}));

import { SocialPublishService } from '@/services/social-publish.service';
import { getEcosystemConfig, createServiceHeaders } from '@/config/ecosystem';
import type { PublishResponse, AffiliateLinkResponse, ContentPackage } from '@/types/ecosystem';

// ── Helpers ──────────────────────────────────────────────────────────────────

function publishResponse(overrides?: Partial<PublishResponse>): PublishResponse {
  return {
    success: true,
    results: [{ platform: 'facebook', success: true, postId: 'fb-123' }],
    published: 1,
    failed: 0,
    ...overrides,
  };
}

function affiliateResponse(): AffiliateLinkResponse {
  return {
    trackingId: 'trk-abc',
    trackingUrl: 'http://track.test/abc',
    shortUrl: 'http://t.test/a',
  };
}

function contentPackage(overrides?: Partial<ContentPackage>): ContentPackage {
  return {
    contentId: 'content-1',
    userId: 'user-1',
    type: 'video',
    mediaUrls: ['http://media.test/video1.mp4'],
    caption: 'Test caption',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SocialPublishService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    const baseOptions = {
      userId: 'user-1',
      mediaUrl: 'http://media.test/img.jpg',
      mediaType: 'image' as const,
      caption: 'Hello world',
      platforms: ['facebook', 'instagram'] as const,
    };

    it('sends POST to social service with correct payload', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      const result = await SocialPublishService.publish(baseOptions);

      expect(getEcosystemConfig).toHaveBeenCalled();
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://social.test/api/content/publish',
        expect.objectContaining({
          userId: 'user-1',
          mediaUrl: 'http://media.test/img.jpg',
          mediaType: 'image',
          caption: 'Hello world',
          platforms: ['facebook', 'instagram'],
        }),
        expect.objectContaining({
          headers: mockHeaders,
          timeout: 30_000,
        }),
      );
      expect(result).toEqual(data);
    });

    it('includes scheduledAt as ISO string when provided', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });
      const scheduled = new Date('2026-07-01T10:00:00Z');

      await SocialPublishService.publish({ ...baseOptions, scheduledAt: scheduled });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.scheduledAt).toBe('2026-07-01T10:00:00.000Z');
    });

    it('omits scheduledAt when not provided', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.publish(baseOptions);

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.scheduledAt).toBeUndefined();
    });

    it('passes pageIds through to payload', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.publish({
        ...baseOptions,
        pageIds: { facebook: ['page-1'], instagram: ['ig-1'] },
      });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.pageIds).toEqual({ facebook: ['page-1'], instagram: ['ig-1'] });
    });

    it('passes injectAffiliateLink and campaignId', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.publish({
        ...baseOptions,
        injectAffiliateLink: true,
        campaignId: 'camp-1',
      });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.injectAffiliateLink).toBe(true);
      expect(payload.campaignId).toBe('camp-1');
    });

    it('logs success on completion', async () => {
      const data = publishResponse({ published: 2, failed: 0 });
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.publish(baseOptions);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Social publish completed',
          userId: 'user-1',
          published: 2,
          failed: 0,
        }),
      );
    });

    it('creates service headers with social api key', async () => {
      const data = publishResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.publish(baseOptions);

      expect(createServiceHeaders).toHaveBeenCalledWith(
        '1ai-content',
        expect.objectContaining({ userId: 'user-1' }),
        'social-secret',
      );
    });

    it('wraps axios errors with user-friendly message', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(SocialPublishService.publish(baseOptions)).rejects.toThrow(
        'Social publish failed: Network timeout',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Social publish failed', error: 'Network timeout' }),
      );
    });

    it('handles non-Error thrown values', async () => {
      mockAxiosPost.mockRejectedValueOnce('string error');

      await expect(SocialPublishService.publish(baseOptions)).rejects.toThrow(
        'Social publish failed: Unknown error',
      );
    });
  });

  // ── generateAffiliateLink ────────────────────────────────────────────────

  describe('generateAffiliateLink', () => {
    it('sends POST to affiliate service with correct payload', async () => {
      const data = affiliateResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      const result = await SocialPublishService.generateAffiliateLink(
        'user-1',
        'http://product.test/item',
      );

      expect(getEcosystemConfig).toHaveBeenCalled();
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://affiliate.test/api/affiliate/generate-link',
        expect.objectContaining({
          userId: 'user-1',
          destinationUrl: 'http://product.test/item',
          campaignId: undefined,
        }),
        expect.objectContaining({
          headers: mockHeaders,
          timeout: 10_000,
        }),
      );
      expect(result).toEqual(data);
    });

    it('passes campaignId when provided', async () => {
      const data = affiliateResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.generateAffiliateLink(
        'user-1',
        'http://product.test/item',
        'camp-42',
      );

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.campaignId).toBe('camp-42');
    });

    it('creates service headers with affiliate api key', async () => {
      const data = affiliateResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.generateAffiliateLink('user-1', 'http://product.test/item');

      expect(createServiceHeaders).toHaveBeenCalledWith(
        '1ai-content',
        expect.objectContaining({ userId: 'user-1' }),
        'affiliate-secret',
      );
    });

    it('logs tracking ID on success', async () => {
      const data = affiliateResponse();
      mockAxiosPost.mockResolvedValueOnce({ data });

      await SocialPublishService.generateAffiliateLink('user-1', 'http://product.test/item');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Affiliate link generated',
          userId: 'user-1',
          trackingId: 'trk-abc',
        }),
      );
    });

    it('wraps axios errors with descriptive message', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        SocialPublishService.generateAffiliateLink('user-1', 'http://product.test/item'),
      ).rejects.toThrow('Affiliate link generation failed: Connection refused');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Affiliate link generation failed' }),
      );
    });

    it('handles non-Error thrown values', async () => {
      mockAxiosPost.mockRejectedValueOnce(null);

      await expect(
        SocialPublishService.generateAffiliateLink('user-1', 'http://product.test/item'),
      ).rejects.toThrow('Affiliate link generation failed: Unknown error');
    });
  });

  // ── bulkSchedule ─────────────────────────────────────────────────────────

  describe('bulkSchedule', () => {
    const baseScheduleOptions = {
      userId: 'user-1',
      startDate: new Date('2026-07-01T00:00:00Z'),
      postsPerDay: 2,
      platforms: ['facebook', 'instagram'] as const,
    };

    beforeEach(() => {
      mockAxiosPost.mockResolvedValue({ data: publishResponse() });
    });

    it('schedules content across multiple days', async () => {
      const packages = [
        contentPackage({ contentId: 'c1' }),
        contentPackage({ contentId: 'c2' }),
        contentPackage({ contentId: 'c3' }),
      ];

      const results = await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        contentPackages: packages,
      });

      // 3 packages / 2 per day = 2 days → 3 publish calls
      expect(results).toHaveLength(3);
      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
    });

    it('distributes posts across 9 AM to 9 PM time slots', async () => {
      const packages = [
        contentPackage({ contentId: 'c1' }),
        contentPackage({ contentId: 'c2' }),
      ];

      await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        postsPerDay: 3,
        contentPackages: packages,
      });

      // Check scheduledAt times for each call
      const firstPayload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      const secondPayload = mockAxiosPost.mock.calls[1][1] as Record<string, unknown>;

      const firstDate = new Date(firstPayload.scheduledAt as string);
      const secondDate = new Date(secondPayload.scheduledAt as string);

      // Both on same day (setHours sets local hours; check local)
      expect(firstDate.getDate()).toBe(1);
      expect(secondDate.getDate()).toBe(1);
      // Hours are within 9-21 range (local)
      expect(firstDate.getHours()).toBeGreaterThanOrEqual(9);
      expect(secondDate.getHours()).toBeLessThanOrEqual(21);
    });

    it('sets injectAffiliateLink to true for all posts', async () => {
      const packages = [contentPackage()];

      await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        contentPackages: packages,
      });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.injectAffiliateLink).toBe(true);
    });

    it('passes campaignId from content package affiliate', async () => {
      const packages = [
        contentPackage({
          affiliate: { trackingId: 't1', trackingUrl: 'http://t.test/1', campaignId: 'camp-99' },
        }),
      ];

      await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        contentPackages: packages,
      });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.campaignId).toBe('camp-99');
    });

    it('uses first mediaUrl from content package', async () => {
      const packages = [
        contentPackage({ mediaUrls: ['http://a.test/1.mp4', 'http://a.test/2.mp4'] }),
      ];

      await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        contentPackages: packages,
      });

      const payload = mockAxiosPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.mediaUrl).toBe('http://a.test/1.mp4');
    });

    it('returns all publish responses in order', async () => {
      const responses = [
        publishResponse({ published: 1, failed: 0 }),
        publishResponse({ published: 2, failed: 0 }),
      ];
      mockAxiosPost
        .mockResolvedValueOnce({ data: responses[0] })
        .mockResolvedValueOnce({ data: responses[1] });

      const packages = [
        contentPackage({ contentId: 'c1' }),
        contentPackage({ contentId: 'c2' }),
      ];

      const results = await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        postsPerDay: 3,
        contentPackages: packages,
      });

      expect(results).toEqual(responses);
    });

    it('increments schedule date for each day', async () => {
      const packages = [
        contentPackage({ contentId: 'c1' }),
        contentPackage({ contentId: 'c2' }),
        contentPackage({ contentId: 'c3' }),
      ];

      await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        postsPerDay: 2,
        contentPackages: packages,
      });

      // First two calls are day 0, third is day 1
      const firstDate = new Date(
        (mockAxiosPost.mock.calls[0][1] as Record<string, unknown>).scheduledAt as string,
      );
      const thirdDate = new Date(
        (mockAxiosPost.mock.calls[2][1] as Record<string, unknown>).scheduledAt as string,
      );

      expect(thirdDate.getUTCDate()).toBe(firstDate.getUTCDate() + 1);
    });

    it('handles single content package', async () => {
      const packages = [contentPackage()];

      const results = await SocialPublishService.bulkSchedule({
        ...baseScheduleOptions,
        contentPackages: packages,
      });

      expect(results).toHaveLength(1);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('propagates publish errors', async () => {
      mockAxiosPost.mockReset();
      mockAxiosPost.mockRejectedValueOnce(new Error('Service down'));

      await expect(
        SocialPublishService.bulkSchedule({
          ...baseScheduleOptions,
          contentPackages: [contentPackage()],
        }),
      ).rejects.toThrow('Social publish failed: Service down');
    });
  });

  // ── getUserPages ─────────────────────────────────────────────────────────

  describe('getUserPages', () => {
    it('sends GET to social service with userId param', async () => {
      const pages = [{ id: 'page-1', name: 'My Page' }];
      mockAxiosGet.mockResolvedValueOnce({ data: { pages } });

      const result = await SocialPublishService.getUserPages('user-1');

      expect(getEcosystemConfig).toHaveBeenCalled();
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'http://social.test/api/meta-pages',
        expect.objectContaining({
          headers: mockHeaders,
          params: { userId: 'user-1' },
          timeout: 10_000,
        }),
      );
      expect(result).toEqual(pages);
    });

    it('returns empty array on error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await SocialPublishService.getUserPages('user-1');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to get user pages',
          error: 'Connection refused',
          userId: 'user-1',
        }),
      );
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockAxiosGet.mockRejectedValueOnce('timeout');

      const result = await SocialPublishService.getUserPages('user-1');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unknown error' }),
      );
    });

    it('creates service headers with social api key', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { pages: [] } });

      await SocialPublishService.getUserPages('user-1');

      expect(createServiceHeaders).toHaveBeenCalledWith(
        '1ai-content',
        { userId: 'user-1' },
        'social-secret',
      );
    });
  });
});
