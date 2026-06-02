/**
 * Tests for token-tracker.service.ts — specifically the cost calculation.
 */
import { jest } from '@jest/globals';
import { estimateCost } from '@/services/token-tracker.service';

jest.mock('@/config/env', () => ({
  getConfig: jest.fn(() => ({ USD_TO_IDR_RATE: 16000 })),
}));

jest.mock('@/services/exchange-rate.service', () => ({
  ExchangeRateService: {
    getRate: jest.fn(async () => null),
  },
}));

describe('token-tracker.estimateCost', () => {
  it('calculates cost for known gemini model', async () => {
    const { usd, idr } = await estimateCost('gemini-2.5-flash', 1000, 500);
    expect(usd).toBeCloseTo(0.00015 + 0.0003, 6);
    expect(idr).toBeCloseTo((0.00015 + 0.0003) * 16000, 2);
  });

  it('calculates cost for gpt-4o', async () => {
    const { usd } = await estimateCost('gpt-4o', 1000, 1000);
    expect(usd).toBeCloseTo(0.0025 + 0.01, 6);
  });

  it('falls back to default model cost when unknown', async () => {
    const { usd } = await estimateCost('unknown-model-xyz', 1000, 1000);
    expect(usd).toBeCloseTo(0.001 + 0.003, 6);
  });

  it('handles zero tokens', async () => {
    const { usd, idr } = await estimateCost('gemini-2.5-flash', 0, 0);
    expect(usd).toBe(0);
    expect(idr).toBe(0);
  });

  it('handles claude model', async () => {
    const { usd } = await estimateCost('claude-3-5-sonnet', 1000, 500);
    expect(usd).toBeCloseTo(0.003 + 0.0075, 6);
  });

  it('handles case-insensitive model name', async () => {
    const { usd } = await estimateCost('GPT-4o', 1000, 1000);
    expect(usd).toBeCloseTo(0.0025 + 0.01, 6);
  });
});
