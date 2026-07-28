/**
 * BalanceCheckerService — barrel.
 *
 * Re-exports the public API of the balance-checker service from
 * focused sub-modules.
 */
export type { BalanceResult, BalanceStrategyFn, BalanceStrategyEntry } from './types';
export { registerBalanceStrategy, listBalanceStrategies } from './registry';
export { checkProviderBalance } from './checker';
