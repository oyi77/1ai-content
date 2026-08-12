/**
 * Balance strategy registry — stores and manages the ordered list of strategies.
 *
 * Strategies are checked in order; the first pattern match wins.
 * The generic fallback strategy must always be the last entry.
 */
import { logger } from "@/utils/logger";
import type { BalanceStrategyEntry } from "./types";
import {
  siliconflowStrategy,
  laozhangStrategy,
  runwareStrategy,
  falStrategy,
  piapiStrategy,
  segmindStrategy,
  wavespeedStrategy,
  zhipuStrategy,
  groqStrategy,
  getgoStrategy,
  lingyaStrategy,
  juheStrategy,
  evolinkStrategy,
  hyperealStrategy,
  kieStrategy,
  byteplusStrategy,
  geminigenStrategy,
  genericOpenAIStrategy,
} from "./strategies";

const STRATEGY_REGISTRY: BalanceStrategyEntry[] = [
  siliconflowStrategy,
  laozhangStrategy,
  runwareStrategy,
  falStrategy,
  piapiStrategy,
  segmindStrategy,
  wavespeedStrategy,
  zhipuStrategy,
  groqStrategy,
  getgoStrategy,
  lingyaStrategy,
  juheStrategy,
  evolinkStrategy,
  hyperealStrategy,
  kieStrategy,
  byteplusStrategy,
  geminigenStrategy,
  // generic fallback must be last
  genericOpenAIStrategy,
];

/**
 * Register a custom balance strategy. Call this at startup for new providers.
 * Inserted before the generic fallback so it takes precedence.
 *
 * @example
 * registerBalanceStrategy({
 *   pattern: 'myprovider.com',
 *   name: 'MyProvider',
 *   async check(baseUrl, apiKey) {
 *     const data = await httpGet(`${baseUrl}/wallet`, apiKey);
 *     return { success: true, balance: data.credits, currency: 'USD', unit: '$', strategyUsed: 'MyProvider' };
 *   }
 * });
 */
export function registerBalanceStrategy(entry: BalanceStrategyEntry): void {
  // Insert before generic fallback (last entry)
  STRATEGY_REGISTRY.splice(STRATEGY_REGISTRY.length - 1, 0, entry);
  logger.info(`BalanceChecker: registered strategy "${entry.name}"`);
}

/**
 * Get all registered strategy names (useful for admin UI / debugging).
 */
export function listBalanceStrategies(): string[] {
  return STRATEGY_REGISTRY.map((s) => s.name);
}

export { STRATEGY_REGISTRY, genericOpenAIStrategy };
