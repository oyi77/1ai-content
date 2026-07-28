/** Shared helper functions for balance-checker strategies. */

import axios from 'axios';
import { logger } from '@/utils/logger';

export function matchesPattern(baseUrl: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return baseUrl.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(baseUrl);
}

export function safe(label: string, value: unknown): number | undefined {
  const n = Number(value);
  if (!isNaN(n)) return n;
  logger.debug(`BalanceChecker: could not parse ${label} as number:`, value);
  return undefined;
}

export async function httpGet(
  url: string,
  apiKey: string,
  timeout = 8000,
): Promise<any> {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout,
  });
  return res.data;
}

export async function httpPost(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeout = 8000,
): Promise<unknown> {
  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout,
  });
  return res.data;
}
