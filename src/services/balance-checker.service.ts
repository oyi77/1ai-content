/**
 * Balance Checker Service — BARREL
 *
 * Re-exports the public API from the split sub-module.
 * Consumers importing from "@/services/balance-checker.service" keep working.
 */
export type {
  BalanceResult,
  BalanceStrategyFn,
  BalanceStrategyEntry,
} from "./balance-checker/types";
export {
  registerBalanceStrategy,
  listBalanceStrategies,
} from "./balance-checker/registry";
export { checkProviderBalance } from "./balance-checker/checker";
