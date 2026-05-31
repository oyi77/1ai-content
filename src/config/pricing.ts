/**
 * Static & Dynamic Pricing Engine
 * 
 * Centralizing all prices, durations, and credit costs.
 * v3.0 logic: 1 Credit = 10 Units.
 */

import { PaymentSettingsService } from "@/services/payment-settings.service";

// ── Shared Constants ──────────────────────────────────────────────────────────

export type PlanKey = 'lite' | 'pro' | 'agency';
export type BillingCycle = 'monthly' | 'annual';

// Use UNIT_COSTS as the primary source of truth for all modules
// Adjusted 2026-03-31: video/campaign prices raised to maintain >50% margin
export const UNIT_COSTS = {
  VIDEO_15S: 8,    // 0.8 Credits (was 0.5)
  VIDEO_30S: 15,   // 1.5 Credits (was 1.0) — margin 60% vs 40%
  VIDEO_60S: 30,   // 3.0 Credits (was 2.0)
  VIDEO_120S: 65,  // 6.5 Credits (was 4.5)
  IMAGE_UNIT: 2,   // 0.2 Credits (unchanged — 98% margin)
  IMAGE_SET_7_SCENE: 15, // 1.5 Credits (unchanged — 98% margin)
  CLONE_STYLE: 8,  // 0.8 Credits (was 0.5) — uses vision + gen
  CAMPAIGN_5_VIDEO: 60,  // 6.0 Credits (was 4.0) — margin 50% vs 25%
  CAMPAIGN_10_VIDEO: 110, // 11.0 Credits (was 7.5) — margin 50%
};

export const CUSTOM_DURATION_MIN = 6; // seconds — no max limit, pricing scales dynamically

// Aliases for transition
export const VIDEO_UNIT_COSTS = UNIT_COSTS;
export const IMAGE_UNIT_COST = UNIT_COSTS.IMAGE_UNIT;
export const CREDIT_TO_UNIT = 10;

// ── Subscription Tiers & Credits ──────────────────────────────────────────────

export const SUBSCRIPTION_PLANS = {
  lite: {
    name: 'Lite',
    tier: 'basic',
    monthlyCredits: 20,
    dailyGenerationLimit: 3,
    monthlyPriceIdr: 99000,
    annualPriceIdr: 990000,
    features: ['20 Credits/month', '3 Daily limit', 'Standard support'],
  },
  pro: {
    name: 'Pro',
    tier: 'pro',
    monthlyCredits: 50,
    dailyGenerationLimit: 10,
    monthlyPriceIdr: 199000,
    annualPriceIdr: 1990000,
    features: ['50 Credits/month', '10 Daily limit', 'Priority support', 'Viral research'],
  },
  agency: {
    name: 'Agency',
    tier: 'agency',
    monthlyCredits: 150,
    dailyGenerationLimit: 30,
    monthlyPriceIdr: 499000,
    annualPriceIdr: 4990000,
    features: ['150 Credits/month', '30 Daily limit', 'White-labeling', 'API Access'],
  },
};

// Legacy alias
export const SUBSCRIPTION_PLANS_V3 = SUBSCRIPTION_PLANS;

// ── Credit Packages ──────────────────────────────────────────────────────────

export const PACKAGES = [
  { id: 'starter', name: 'Starter Flow', priceIdr: 99000, credits: 5, bonus: 1, totalCredits: 6 },
  { id: 'growth', name: 'Growth Machine', priceIdr: 149000, credits: 18, bonus: 4, totalCredits: 22, isPopular: true },
  { id: 'business', name: 'Business Kingdom', priceIdr: 499000, credits: 70, bonus: 15, totalCredits: 85 },
];

export const EXTRA_CREDIT_PACKAGES = [
  { id: '1credit', credits: 1, priceIdr: 15000, name: '1 Credit' },
  { id: '5credits', credits: 5, priceIdr: 65000, name: '5 Credits' },
];

// Legacy alias
export const CREDIT_PACKAGES_V3 = PACKAGES;

// ── Helpers ──────────────────────────────────────────────────────────────────

export const creditsToUnits = (credits: number) => Math.round(credits * 10);
export const unitsToCredits = (units: number) => units / 10;

export function getPlanPrice(plan: PlanKey, cycle: BillingCycle): number {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  if (!planConfig) return 0;
  return cycle === 'monthly' ? planConfig.monthlyPriceIdr : planConfig.annualPriceIdr;
}

/**
 * Get the cost of a video in Credits (v3.0)
 * Fallback to static if DB config is missing
 */
export function getVideoCreditCost(durationSeconds: number): number {
  if (durationSeconds <= 15) return 0.8;
  if (durationSeconds <= 30) return 1.5;
  if (durationSeconds <= 60) return 3.0;
  if (durationSeconds <= 120) return 6.5;
  // Custom duration tiered pricing
  return getCustomDurationCreditCost(durationSeconds);
}

/** Tiered pricing for custom durations: 0.035/s first 60s, 0.030/s 61-300s, 0.025/s 300+s */
export function getCustomDurationCreditCost(durationSeconds: number): number {
  let cost = 0;
  if (durationSeconds <= 60) {
    cost = durationSeconds * 0.035;
  } else if (durationSeconds <= 300) {
    cost = 60 * 0.035 + (durationSeconds - 60) * 0.030;
  } else {
    cost = 60 * 0.035 + 240 * 0.030 + (durationSeconds - 300) * 0.025;
  }
  return Math.max(0.5, Math.round(cost * 10) / 10);
}

// ── Asynchronous Pricing Engine (Dynamic Override) ──────────────────────────

export async function getVideoCreditCostAsync(durationSeconds: number): Promise<number> {
  // Map duration to UNIT_COSTS key
  let unitKey: keyof typeof UNIT_COSTS = 'VIDEO_120S';
  if (durationSeconds <= 15) unitKey = 'VIDEO_15S';
  else if (durationSeconds <= 30) unitKey = 'VIDEO_30S';
  else if (durationSeconds <= 60) unitKey = 'VIDEO_60S';

  // Read from unit_cost category (same as getUnitCostAsync)
  const units = await getUnitCostAsync(unitKey);
  return units / 10; // Convert units to credits
}

export async function getImageCreditCostAsync(provider?: string): Promise<number> {
  return PaymentSettingsService.getImageCreditCost(provider);
}

export async function getPackagesAsync() {
  const dbPackages = await PaymentSettingsService.getAllPricingByCategory('package');
  if (Object.keys(dbPackages).length > 0) {
    return Object.entries(dbPackages).map(([id, config]: [string, any]) => {
      const credits = config.credits || config.credit || 0;
      const bonus = config.bonus || 0;
      return {
        id,
        name: config.name || id,
        priceIdr: config.priceIdr || config.price || 0,
        credits,
        bonus,
        totalCredits: credits + bonus,
        description: config.description,
        isPopular: config.isPopular,
      };
    });
  }
  return PACKAGES;
}

export async function getSubscriptionPlansAsync(): Promise<Record<string, any>> {
  const dbPlans = await PaymentSettingsService.getAllPricingByCategory('subscription');
  if (Object.keys(dbPlans).length > 0) return dbPlans;
  return SUBSCRIPTION_PLANS;
}

export async function getUnitCostAsync(key: keyof typeof UNIT_COSTS): Promise<number> {
  const config = await PaymentSettingsService.getPricingConfig('unit_cost', key);
  if (config !== null && config !== undefined) {
    // DB value can be: number (direct), { units: N }, or { value: N }
    if (typeof config === 'number') return config;
    if (typeof config === 'object' && 'units' in config) return (config as Record<string, unknown>).units as number;
    if (typeof config === 'object' && 'value' in config) return (config as Record<string, unknown>).value as number;
  }
  return UNIT_COSTS[key];
}

export async function getReferralCommissionsAsync(): Promise<Record<string, number>> {
  const defaults = { TIER_1: 0.15, TIER_2: 0.05, TIER_3: 0.02 };
  const dbComms = await PaymentSettingsService.getAllPricingByCategory('referral_commission');
  return { ...defaults, ...dbComms };
}

// Legacy alias for admin route
export const REFERRAL_COMMISSIONS_V3 = { TIER_1: 0.15, TIER_2: 0.05, TIER_3: 0.02 };

/**
 * Main persistent keyboard (Reply Keyboard) — language-aware
 */
const MENU_LABELS: Record<string, Record<string, string>> = {
  id: { create: '🎬 Buat Video', image: '🖼️ Buat Gambar', chat: '💬 Chat AI', library: '📚 Prompt Library', trending: '🔥 Trending', daily: '🎁 Daily Prompt', videos: '📁 Video Saya', fingerprint: '🧬 Fingerprint', talk: '🗣️ Foto Bicara', subscription: '⭐ Langganan', topup: '💰 Top Up', profile: '👤 Profil', referral: '👥 Referral', settings: '⚙️ Pengaturan', support: '🆘 Bantuan', help: '📖 Panduan' },
  en: { create: '🎬 Create Video', image: '🖼️ Generate Image', chat: '💬 Chat AI', library: '📚 Prompt Library', trending: '🔥 Trending', daily: '🎁 Daily Prompt', videos: '📁 My Videos', fingerprint: '🧬 Fingerprint', talk: '🗣️ Talking Photo', subscription: '⭐ Subscription', topup: '💰 Top Up', profile: '👤 Profile', referral: '👥 Referral', settings: '⚙️ Settings', support: '🆘 Support', help: '📖 Help' },
  ru: { create: '🎬 Создать видео', image: '🖼️ Создать фото', chat: '💬 Чат AI', library: '📚 Библиотека', trending: '🔥 Тренды', daily: '🎁 Промпт дня', videos: '📁 Мои видео', fingerprint: '🧬 Fingerprint', talk: '🗣️ Говорящее фото', subscription: '⭐ Подписка', topup: '💰 Пополнить', profile: '👤 Профиль', referral: '👥 Реферал', settings: '⚙️ Настройки', support: '🆘 Поддержка', help: '📖 Помощь' },
  zh: { create: '🎬 创建视频', image: '🖼️ 生成图片', chat: '💬 AI聊天', library: '📚 提示库', trending: '🔥 热门', daily: '🎁 每日提示', videos: '📁 我的视频', fingerprint: '🧬 指纹', talk: '🗣️ 说话照片', subscription: '⭐ 订阅', topup: '💰 充值', profile: '👤 个人资料', referral: '👥 推荐', settings: '⚙️ 设置', support: '🆘 支持', help: '📖 帮助' },
};

export function getMainMenuKeyboard(lang: string = 'en') {
  const l = MENU_LABELS[lang] || MENU_LABELS.en;
  return [
    [{ text: l.create }, { text: l.image }, { text: l.chat }],
    [{ text: l.library }, { text: l.trending }, { text: l.daily }],
    [{ text: l.videos }, { text: l.fingerprint }, { text: l.talk }],
    [{ text: l.topup }, { text: l.profile }, { text: l.subscription }],
    [{ text: l.referral }, { text: l.settings }, { text: l.support }],
    [{ text: l.help }],
  ];
}

/** Get all possible button texts across all languages (for message handler matching) */
export function getAllMenuTexts(key: string): string[] {
  return Object.values(MENU_LABELS).map(l => l[key]).filter(Boolean);
}

// Legacy static export (English default) for backward compat
export const MAIN_MENU_KEYBOARD = getMainMenuKeyboard('en');
