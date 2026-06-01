/**
 * BalanceCheckerService — Generic, extensible balance/credit checking for AI providers.
 *
 * Architecture:
 *   - Strategy registry: array of { pattern, name, check } entries
 *   - Pattern matched against provider baseUrl (string prefix or RegExp)
 *   - First match wins; falls back to generic OpenAI-style then generic REST attempts
 *   - New providers: call registerBalanceStrategy() at startup or in provider config
 *
 * Supported providers (built-in):
 *   SiliconFlow, Laozhang/AIGC-Best, Runware, Fal.ai, PiAPI, Segmind, Wavespeed,
 *   ZhipuAI/BigModel, Groq (no balance), GetGoAPI, LingYaAI, JuheAPI, ApiYi,
 *   EvoLink, Hypereal, Kie.ai, BytePlus (no balance), GeminiGen (no balance),
 *   + generic OpenAI-compatible fallback
 */

import axios, { AxiosError } from 'axios';
import { logger } from '@/utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Helper ─────────────────────────────────────────────────────────────────

function matchesPattern(baseUrl: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return baseUrl.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(baseUrl);
}

function safe(label: string, value: unknown): number | undefined {
  const n = Number(value);
  if (!isNaN(n)) return n;
  logger.debug(`BalanceChecker: could not parse ${label} as number:`, value);
  return undefined;
}

async function httpGet(
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

async function httpPost(
  url: string,
  apiKey: string,
  body: any,
  timeout = 8000,
): Promise<any> {
  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout,
  });
  return res.data;
}

// ─── Built-in Strategies ────────────────────────────────────────────────────

/**
 * SiliconFlow — GET /v1/user/info
 * Response: { code: 20000, status: "ok", data: { id, name, balance, chargeBalance, totalBalance } }
 */
const siliconflowStrategy: BalanceStrategyEntry = {
  pattern: 'siliconflow',
  name: 'SiliconFlow',
  async check(baseUrl, apiKey) {
    const data = await httpGet(`${baseUrl}/user/info`, apiKey);
    const balance = safe('balance', data?.data?.totalBalance ?? data?.data?.balance);
    return {
      success: true,
      balance,
      currency: 'CNY',
      unit: '¥',
      raw: data?.data,
      strategyUsed: 'SiliconFlow',
    };
  },
};

/**
 * Laozhang / AIGC-Best / api2.aigcbest.top — OpenAI-style proxy
 * Tries /v1/dashboard/billing/credit_grants first, falls back to /v1/balance
 * Response (credit_grants): { object: "billing", grants: { object: "list", data: [{ amount, used, expires_at }] } }
 * Response (balance): { balance_infos: [{ balance, currency }] } OR { total_available: N }
 */
const laozhangStrategy: BalanceStrategyEntry = {
  pattern: /laozhang|aigcbest|lzmtl/i,
  name: 'Laozhang/AIGC-Best',
  async check(baseUrl, apiKey) {
    // Try credit_grants first
    try {
      const data = await httpGet(`${baseUrl}/dashboard/billing/credit_grants`, apiKey);
      const grant = data?.grants?.data?.[0];
      if (grant) {
        const total = safe('amount', grant.amount);
        const used = safe('used', grant.used);
        const balance = (total !== undefined && used !== undefined) ? total - used : total;
        return { success: true, balance, currency: 'credits', unit: 'credits', raw: grant, strategyUsed: 'Laozhang/credit_grants' };
      }
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // fall through
    }
    // Try /v1/balance
    const data = await httpGet(`${baseUrl}/balance`, apiKey);
    const info = data?.balance_infos?.[0];
    if (info) {
      return {
        success: true,
        balance: safe('balance', info.balance),
        currency: info.currency || 'CNY',
        unit: info.currency === 'USD' ? '$' : '¥',
        raw: info,
        strategyUsed: 'Laozhang/balance',
      };
    }
    const total = safe('total_available', data?.total_available);
    return { success: true, balance: total, currency: 'credits', unit: 'credits', raw: data, strategyUsed: 'Laozhang/balance' };
  },
};

/**
 * Runware — POST /v2 with taskType=authentication
 * Response: { data: [{ taskType: "authentication", creditsBalance: N }] }
 */
const runwareStrategy: BalanceStrategyEntry = {
  pattern: 'runware',
  name: 'Runware',
  async check(baseUrl, apiKey) {
    const base = baseUrl.replace(/\/v\d+\/?$/, '');
    const data = await httpPost(`${base}/v2`, apiKey, [{ taskType: 'authentication', apiKey }]);
    const auth = (data?.data ?? []).find((d: any) => d.taskType === 'authentication');
    return {
      success: true,
      balance: safe('creditsBalance', auth?.creditsBalance),
      currency: 'credits',
      unit: 'credits',
      raw: auth,
      strategyUsed: 'Runware',
    };
  },
};

/**
 * Fal.ai — GET /v1/account/balance  (via REST API key)
 * Response: { balance: { total: N, currency: "USD" } }
 * Note: fal uses key_id:key_secret format in Authorization header as "Key ..."
 */
const falStrategy: BalanceStrategyEntry = {
  pattern: /fal\.ai|fal\.run/i,
  name: 'Fal.ai',
  async check(_baseUrl: string, apiKey: string) {
    const res = await axios.get(`https://rest.alpha.fal.ai/v1/account/balance`, {
      headers: { Authorization: `Key ${apiKey}` },
      timeout: 8000,
    });
    const data = res.data;
    return {
      success: true,
      balance: safe('balance', data?.balance?.total ?? data?.balance),
      currency: data?.balance?.currency || 'USD',
      unit: '$',
      raw: data,
      strategyUsed: 'Fal.ai',
    };
  },
};

/**
 * PiAPI — GET /api/account/balance
 * Response: { code: 200, data: { balance: N, currency: "USD" } }
 */
const piapiStrategy: BalanceStrategyEntry = {
  pattern: 'piapi',
  name: 'PiAPI',
  async check(baseUrl, apiKey) {
    const base = baseUrl.replace(/\/v1\/?$/, '');
    const data = await httpGet(`${base}/api/account/balance`, apiKey);
    return {
      success: true,
      balance: safe('balance', data?.data?.balance),
      currency: data?.data?.currency || 'USD',
      unit: '$',
      raw: data?.data,
      strategyUsed: 'PiAPI',
    };
  },
};

/**
 * Segmind — GET /v1/account
 * Response: { credits: { remaining: N, total: N, used: N } }
 */
const segmindStrategy: BalanceStrategyEntry = {
  pattern: 'segmind',
  name: 'Segmind',
  async check(baseUrl, apiKey) {
    const data = await httpGet(`${baseUrl}/account`, apiKey);
    return {
      success: true,
      balance: safe('remaining', data?.credits?.remaining),
      currency: 'credits',
      unit: 'credits',
      raw: data?.credits,
      strategyUsed: 'Segmind',
    };
  },
};

/**
 * Wavespeed — GET /v1/user/balance
 * Response: { code: 0, data: { balance: N, currency: "USD" } }
 * (Also try /v1/account/balance as fallback)
 */
const wavespeedStrategy: BalanceStrategyEntry = {
  pattern: 'wavespeed',
  name: 'Wavespeed',
  async check(baseUrl, apiKey) {
    try {
      const data = await httpGet(`${baseUrl}/user/balance`, apiKey);
      if (data?.data?.balance !== undefined) {
        return {
          success: true,
          balance: safe('balance', data.data.balance),
          currency: data.data.currency || 'USD',
          unit: '$',
          raw: data.data,
          strategyUsed: 'Wavespeed/user/balance',
        };
      }
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // fall through
    }
    const data = await httpGet(`${baseUrl}/account/balance`, apiKey);
    return {
      success: true,
      balance: safe('balance', data?.data?.balance ?? data?.balance),
      currency: data?.data?.currency || 'USD',
      unit: '$',
      raw: data?.data ?? data,
      strategyUsed: 'Wavespeed/account/balance',
    };
  },
};

/**
 * ZhipuAI / BigModel (open.bigmodel.cn) — GET /api/paas/v4/account/billing
 * Response: { code: 200, data: { accountType: 1, balance: N } }
 */
const zhipuStrategy: BalanceStrategyEntry = {
  pattern: /zhipu|bigmodel/i,
  name: 'ZhipuAI/BigModel',
  async check(baseUrl, apiKey) {
    const base = baseUrl.replace(/\/v\d+\/?$/, '');
    try {
      const data = await httpGet(`${base}/api/paas/v4/account/billing`, apiKey);
      return {
        success: true,
        balance: safe('balance', data?.data?.balance),
        currency: 'CNY',
        unit: '¥',
        raw: data?.data,
        strategyUsed: 'ZhipuAI',
      };
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // Some ZhipuAI deployments use /v4
      const data = await httpGet(`${baseUrl}/billing/balance`, apiKey);
      return {
        success: true,
        balance: safe('balance', data?.data?.balance ?? data?.balance),
        currency: 'CNY',
        unit: '¥',
        raw: data,
        strategyUsed: 'ZhipuAI/v4',
      };
    }
  },
};

/**
 * Groq — no balance endpoint (usage-based free tier, metered by tokens/day).
 * Returns a special "not applicable" result instead of an error.
 */
const groqStrategy: BalanceStrategyEntry = {
  pattern: 'groq',
  name: 'Groq',
  async check(_baseUrl: string, _apiKey: string) {
    return {
      success: true,
      balance: undefined,
      currency: 'N/A',
      unit: 'rate-limited (free tier)',
      raw: {},
      strategyUsed: 'Groq/no-balance-api',
    };
  },
};

/**
 * GetGoAPI — GET /v1/balance
 * Response: { balance: N, currency: "USD" }  OR  { data: { balance: N } }
 */
const getgoStrategy: BalanceStrategyEntry = {
  pattern: /getgo|gptgod/i,
  name: 'GetGoAPI',
  async check(baseUrl, apiKey) {
    const data = await httpGet(`${baseUrl}/balance`, apiKey);
    const balance = safe('balance', data?.data?.balance ?? data?.balance);
    return {
      success: true,
      balance,
      currency: data?.currency || data?.data?.currency || 'USD',
      unit: '$',
      raw: data?.data ?? data,
      strategyUsed: 'GetGoAPI',
    };
  },
};

/**
 * LingYaAI / LingYi / Yi (api.lingyaai.com, api.lingyiwanwu.com) — OpenAI-compatible
 * Response: { balance: N } OR { data: { balance: N } }
 */
const lingyaStrategy: BalanceStrategyEntry = {
  pattern: /lingya|lingyiwanwu|01\.ai/i,
  name: 'LingYaAI/Yi',
  async check(baseUrl, apiKey) {
    const data = await httpGet(`${baseUrl}/user/me/balance`, apiKey);
    const balance = safe('balance', data?.data?.balance ?? data?.balance ?? data?.total_balance);
    return {
      success: true,
      balance,
      currency: data?.currency || 'CNY',
      unit: '¥',
      raw: data?.data ?? data,
      strategyUsed: 'LingYaAI',
    };
  },
};

/**
 * JuheAPI (wisdom-gate.juheapi.com) — OpenAI-compatible
 * Response (speculative): { balance: N } OR billing endpoint
 */
const juheStrategy: BalanceStrategyEntry = {
  pattern: 'juheapi',
  name: 'JuheAPI',
  async check(baseUrl, apiKey) {
    // Try /v1/balance first, then billing
    try {
      const data = await httpGet(`${baseUrl}/balance`, apiKey);
      if (data !== undefined) {
        const balance = safe('balance', data?.balance ?? data?.data?.balance ?? data?.total_available);
        return { success: true, balance, currency: 'credits', unit: 'credits', raw: data, strategyUsed: 'JuheAPI/balance' };
      }
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // fall through
    }
    const data = await httpGet(`${baseUrl}/dashboard/billing/credit_grants`, apiKey);
    const grant = data?.grants?.data?.[0];
    const total = safe('amount', grant?.amount);
    const used = safe('used', grant?.used);
    return {
      success: true,
      balance: (total !== undefined && used !== undefined) ? total - used : total,
      currency: 'credits',
      unit: 'credits',
      raw: grant,
      strategyUsed: 'JuheAPI/billing',
    };
  },
};

/**
 * EvoLink — GET /v1/user/balance or /v1/account
 */
const evolinkStrategy: BalanceStrategyEntry = {
  pattern: 'evoai',
  name: 'EvoLink',
  async check(baseUrl, apiKey) {
    try {
      const data = await httpGet(`${baseUrl}/user/balance`, apiKey);
      return {
        success: true,
        balance: safe('balance', data?.data?.balance ?? data?.balance),
        currency: 'credits',
        unit: 'credits',
        raw: data?.data ?? data,
        strategyUsed: 'EvoLink/user/balance',
      };
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      const data = await httpGet(`${baseUrl}/account`, apiKey);
      return {
        success: true,
        balance: safe('balance', data?.data?.balance ?? data?.balance),
        currency: 'credits',
        unit: 'credits',
        raw: data?.data ?? data,
        strategyUsed: 'EvoLink/account',
      };
    }
  },
};

/**
 * Hypereal — GET /v1/account/balance or /v1/user/info
 * Also supports checking via generation response (creditsUsed field)
 */
const hyperealStrategy: BalanceStrategyEntry = {
  pattern: 'hypereal',
  name: 'Hypereal',
  async check(baseUrl, apiKey) {
    // Try /account/balance first
    try {
      const data = await httpGet(`${baseUrl}/account/balance`, apiKey);
      const balance = safe('balance', data?.data?.balance ?? data?.balance ?? data?.credits);
      if (balance !== undefined) {
        return {
          success: true,
          balance,
          currency: 'credits',
          unit: 'credits',
          raw: data?.data ?? data,
          strategyUsed: 'Hypereal/account/balance',
        };
      }
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // fall through
    }
    
    // Try /user/info as fallback
    try {
      const data = await httpGet(`${baseUrl}/user/info`, apiKey);
      const balance = safe('balance', data?.data?.balance ?? data?.balance ?? data?.credits);
      if (balance !== undefined) {
        return {
          success: true,
          balance,
          currency: 'credits',
          unit: 'credits',
          raw: data?.data ?? data,
          strategyUsed: 'Hypereal/user/info',
        };
      }
    } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
      // fall through
    }
    
    // Try /user as last resort
    const data = await httpGet(`${baseUrl}/user`, apiKey);
    return {
      success: true,
      balance: safe('balance', data?.data?.balance ?? data?.balance ?? data?.credits),
      currency: 'credits',
      unit: 'credits',
      raw: data?.data ?? data,
      strategyUsed: 'Hypereal/user',
    };
  },
};

/**
 * Kie.ai — GET /api/v1/chat/credit
 * Response: { code: 200, data: { credit: N } }
 */
const kieStrategy: BalanceStrategyEntry = {
  pattern: /kie\.ai|kieai/i,
  name: 'Kie.ai',
  async check(baseUrl, apiKey) {
    const base = baseUrl.replace(/\/v\d+\/?$/, '');
    const data = await httpGet(`${base}/api/v1/chat/credit`, apiKey);
    return {
      success: true,
      balance: safe('credit', data?.data?.credit ?? data?.credit),
      currency: 'credits',
      unit: 'credits',
      raw: data?.data ?? data,
      strategyUsed: 'Kie.ai',
    };
  },
};

/**
 * BytePlus Seedance — No public balance endpoint available
 * Returns N/A status (usage-based billing via BytePlus console)
 */
const byteplusStrategy: BalanceStrategyEntry = {
  pattern: /byteplus|seedance/i,
  name: 'BytePlus',
  async check(_baseUrl: string, _apiKey: string) {
    return {
      success: true,
      balance: undefined,
      currency: 'N/A',
      unit: 'usage-based (BytePlus console)',
      raw: {},
      strategyUsed: 'BytePlus/no-balance-api',
    };
  },
};

/**
 * GeminiGen — No public balance endpoint available
 * Returns N/A status (check balance via GeminiGen dashboard)
 */
const geminigenStrategy: BalanceStrategyEntry = {
  pattern: /geminigen/i,
  name: 'GeminiGen',
  async check(_baseUrl: string, _apiKey: string) {
    return {
      success: true,
      balance: undefined,
      currency: 'N/A',
      unit: 'check dashboard',
      raw: {},
      strategyUsed: 'GeminiGen/no-balance-api',
    };
  },
};

/**
 * Generic OpenAI-compatible fallback — tries common billing endpoints in order.
 * Works for most OpenAI proxy providers.
 */
const genericOpenAIStrategy: BalanceStrategyEntry = {
  pattern: '', // matches everything (used as last resort via fallback chain)
  name: 'Generic/OpenAI-compat',
  async check(baseUrl, apiKey) {
    const candidates = [
      { path: '/balance', parse: (d: any) => d?.balance ?? d?.data?.balance ?? d?.total_available },
      { path: '/dashboard/billing/credit_grants', parse: (d: any) => {
          const g = d?.grants?.data?.[0];
          if (!g) return undefined;
          const a = Number(g.amount ?? 0);
          const u = Number(g.used ?? 0);
          return isNaN(a) ? undefined : a - u;
        }},
      { path: '/dashboard/billing/subscription', parse: (d: any) => d?.soft_limit_usd ?? d?.hard_limit_usd },
      { path: '/user/info', parse: (d: any) => d?.data?.balance ?? d?.balance },
      { path: '/account', parse: (d: any) => d?.data?.balance ?? d?.balance ?? d?.credits?.remaining },
    ];

    for (const { path, parse } of candidates) {
      try {
        const data = await httpGet(`${baseUrl}${path}`, apiKey);
        const val = parse(data);
        if (val !== undefined && val !== null) {
          return {
            success: true,
            balance: safe('balance', val),
            currency: 'credits',
            unit: 'credits',
            raw: data,
            strategyUsed: `Generic${path}`,
          };
        }
      } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
        // try next
      }
    }

    return { success: false, error: 'No balance endpoint responded with usable data', strategyUsed: 'Generic/exhausted' };
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

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

// ─── Main checker ────────────────────────────────────────────────────────────

/**
 * Check the balance for a provider given its baseUrl and apiKey.
 * Auto-detects the best strategy; falls back to generic probing.
 */
export async function checkProviderBalance(
  baseUrl: string,
  apiKey: string,
  forcedStrategyName?: string,
): Promise<BalanceResult> {
  const url = baseUrl.replace(/\/$/, ''); // strip trailing slash

  let strategy: BalanceStrategyEntry | undefined;

  if (forcedStrategyName) {
    strategy = STRATEGY_REGISTRY.find(
      (s) => s.name.toLowerCase() === forcedStrategyName.toLowerCase(),
    );
  }

  if (!strategy) {
    // Skip the generic fallback entry (pattern='') in detection pass
    strategy = STRATEGY_REGISTRY.find(
      (s) => s.pattern !== '' && matchesPattern(url, s.pattern),
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
      statusCode === 401 ? 'API key invalid or unauthorized'
      : statusCode === 403 ? 'Access forbidden — check API key permissions'
      : statusCode === 404 ? 'Balance endpoint not found for this provider'
      : (axiosErr?.message ?? String(err));

    logger.warn(`BalanceChecker: strategy "${strategy.name}" failed for ${url}:`, errMsg);

    // If a specific strategy failed, try generic fallback as last resort
    if (strategy !== genericOpenAIStrategy) {
      try {
        logger.debug(`BalanceChecker: falling back to Generic strategy for ${url}`);
        return await genericOpenAIStrategy.check(url, apiKey);
      } catch (err) { logger.debug("Balance check fallback", { error: (err as Error).message });
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
