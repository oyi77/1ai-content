/** Types for the Balance Checker strategy pattern. */

export interface BalanceResult {
  success: boolean;
  balance?: number;         // numeric balance (credits or monetary)
  currency?: string;        // 'USD', 'CNY', 'credits', 'tokens', etc.
  unit?: string;            // human label: 'credits', 'tokens', '$', '¥'
  raw?: Record<string, any>; // raw provider response for debugging
  strategyUsed?: string;    // which strategy resolved this
  error?: string;
}

export type BalanceStrategyFn = (baseUrl: string, apiKey: string) => Promise<BalanceResult>;

export interface BalanceStrategyEntry {
  /** String prefix (startsWith) or RegExp matched against provider baseUrl */
  pattern: string | RegExp;
  /** Friendly name for this strategy (logged on use) */
  name: string;
  check: BalanceStrategyFn;
}
