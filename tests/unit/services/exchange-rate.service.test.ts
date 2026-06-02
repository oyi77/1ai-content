import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ExchangeRateService } from '@/services/exchange-rate.service';

const mockRedisGet = jest.fn<any>();
const mockRedisSetex = jest.fn<any>();
const mockRedisSet = jest.fn<any>();
const mockRedisDel = jest.fn<any>();
const mockPrismaFindUnique = jest.fn<any>();
const mockAxiosGet = jest.fn<any>();

jest.mock('@/config/redis', () => ({
  redis: {
    get: (k: string) => mockRedisGet(k),
    setex: (k: string, ttl: number, v: string) => mockRedisSetex(k, ttl, v),
    set: (k: string, v: string) => mockRedisSet(k, v),
    del: (k: string) => mockRedisDel(k),
  },
}));

jest.mock('@/config/database', () => ({
  prisma: { pricingConfig: { findUnique: (args: any) => mockPrismaFindUnique(args) } },
}));

jest.mock('@/config/env', () => ({
  getConfig: jest.fn(() => ({ USD_TO_IDR_RATE: 16000 })),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (url: string) => mockAxiosGet(url) },
}));

describe('ExchangeRateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchLiveRate', () => {
    it('returns rate and caches when frankfurter succeeds', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { rates: { IDR: 16250 } },
      });
      const rate = await ExchangeRateService.fetchLiveRate();
      expect(rate).toBe(16250);
      expect(mockRedisSetex).toHaveBeenCalledWith('live:usd_idr_rate', 3600, '16250');
    });

    it('returns null when frankfurter returns out-of-range', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { rates: { IDR: 5 } },
      });
      const rate = await ExchangeRateService.fetchLiveRate();
      expect(rate).toBeNull();
    });

    it('returns null on network error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('timeout'));
      const rate = await ExchangeRateService.fetchLiveRate();
      expect(rate).toBeNull();
    });
  });

  describe('getRate', () => {
    it('returns cached live rate when available', async () => {
      mockRedisGet.mockImplementation((k: string) => {
        if (k === 'live:usd_idr_rate') return Promise.resolve('16500');
        if (k === 'live:usd_idr_rate:ts') return Promise.resolve('2026-01-01T00:00:00Z');
        return Promise.resolve(null);
      });
      const result = await ExchangeRateService.getRate();
      expect(result.rate).toBe(16500);
      expect(result.source).toBe('live');
      expect(result.lastUpdated).toBe('2026-01-01T00:00:00Z');
    });

    it('falls back to manual DB rate when live cache missing', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPrismaFindUnique.mockResolvedValue({ value: 17000 });
      const result = await ExchangeRateService.getRate();
      expect(result.rate).toBe(17000);
      expect(result.source).toBe('manual');
    });

    it('falls back to env rate when nothing else works', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPrismaFindUnique.mockResolvedValue(null);
      mockAxiosGet.mockRejectedValue(new Error('timeout'));
      const result = await ExchangeRateService.getRate();
      expect(result.rate).toBe(16000);
      expect(result.source).toBe('env');
    });
  });

  describe('refresh', () => {
    it('deletes cache and fetches fresh rate', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { rates: { IDR: 16800 } },
      });
      mockRedisGet.mockResolvedValue('2026-06-02T12:00:00Z');
      const result = await ExchangeRateService.refresh();
      expect(mockRedisDel).toHaveBeenCalledWith('live:usd_idr_rate');
      expect(result.rate).toBe(16800);
      expect(result.source).toBe('live');
    });
  });
});
