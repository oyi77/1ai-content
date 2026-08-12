/**
 * Main balance checker — dispatches to the appropriate strategy for a provider.
 *
 * checkProviderBalance  — check a single provider's balance by baseUrl + apiKey
 */
import axios, { AxiosError } from "axios";
import { logger } from "@/utils/logger";
import type { BalanceResult, BalanceStrategyEntry } from "./types";
import { matchesPattern } from "./helpers";
import { STRATEGY_REGISTRY, genericOpenAIStrategy } from "./registry";

/**
 * Check the balance for a provider given its baseUrl and apiKey.
 * Auto-detects the best strategy; falls back to generic probing.
 */
export async function checkProviderBalance(
  baseUrl: string,
  apiKey: string,
  forcedStrategyName?: string,
): Promise<BalanceResult> {
  const url = baseUrl.replace(/\/$/, ""); // strip trailing slash

  let strategy: BalanceStrategyEntry | undefined;

  if (forcedStrategyName) {
    strategy = STRATEGY_REGISTRY.find(
      (s) => s.name.toLowerCase() === forcedStrategyName.toLowerCase(),
    );
  }

  if (!strategy) {
    // Skip the generic fallback entry (pattern='') in detection pass
    strategy = STRATEGY_REGISTRY.find(
      (s) => s.pattern !== "" && matchesPattern(url, s.pattern),
    );
  }

  // Default to generic if nothing matched
  if (!strategy) {
    strategy = genericOpenAIStrategy;
  }

  logger.debug(`BalanceChecker: using strategy "${strategy.name}" for ${url}`);

  try {
    const result = await strategy.check(url, apiKey);
    return result;
  } catch (err: unknown) {
    const axiosErr = err as AxiosError;
    const statusCode = axiosErr?.response?.status;
    const errMsg =
      statusCode === 401
        ? "API key invalid or unauthorized"
        : statusCode === 403
          ? "Access forbidden — check API key permissions"
          : statusCode === 404
            ? "Balance endpoint not found for this provider"
            : (axiosErr?.message ?? String(err));

    logger.warn(
      `BalanceChecker: strategy "${strategy.name}" failed for ${url}:`,
      errMsg,
    );

    // If a specific strategy failed, try generic fallback as last resort
    if (strategy !== genericOpenAIStrategy) {
      try {
        logger.debug(
          `BalanceChecker: falling back to Generic strategy for ${url}`,
        );
        return await genericOpenAIStrategy.check(url, apiKey);
      } catch (err) {
        logger.debug("Balance check fallback", {
          error: (err as Error).message,
        });
        // give up
      }
    }

    return {
      success: false,
      error: errMsg,
      strategyUsed: strategy.name,
    };
  }
}
