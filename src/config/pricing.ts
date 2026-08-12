/**
 * Static & Dynamic Pricing Engine
 *
 * Centralizing all prices, durations, and credit costs.
 * v3.0 logic: 1 Credit = 10 Units.
 */

import { PaymentSettingsService } from "@/services/payment-settings.service";

// ── Shared Constants ──────────────────────────────────────────────────────────

export type PlanKey = "lite" | "pro" | "agency";
export type BillingCycle = "monthly" | "annual";

// Use UNIT_COSTS as the primary source of truth for all modules
// Adjusted 2026-03-31: video/campaign prices raised to maintain >50% margin
export const UNIT_COSTS = {
  VIDEO_15S: 8, // 0.8 Credits (was 0.5)
  VIDEO_30S: 15, // 1.5 Credits (was 1.0) — margin 60% vs 40%
  VIDEO_60S: 30, // 3.0 Credits (was 2.0)
  VIDEO_120S: 65, // 6.5 Credits (was 4.5)
  IMAGE_UNIT: 2, // 0.2 Credits (unchanged — 98% margin)
  IMAGE_SET_7_SCENE: 15, // 1.5 Credits (unchanged — 98% margin)
  CLONE_STYLE: 8, // 0.8 Credits (was 0.5) — uses vision + gen
  CAMPAIGN_5_VIDEO: 60, // 6.0 Credits (was 4.0) — margin 50% vs 25%
  CAMPAIGN_10_VIDEO: 110, // 11.0 Credits (was 7.5) — margin 50%
};

export const CUSTOM_DURATION_MIN = 6; // seconds — no max limit, pricing scales dynamically

// Aliases for transition
export const VIDEO_UNIT_COSTS = UNIT_COSTS;
export const IMAGE_UNIT_COST = UNIT_COSTS.IMAGE_UNIT;
export const CREDIT_TO_UNIT = 10;

// ── Subscription Tiers & Credits ──────────────────────────────────────────────

// Social media platform access by tier
export const SOCIAL_TIERS = {
  lite: {
    platforms: [], // No social posting included
    maxPlatforms: 0,
    postsPerDay: 0,
    canSchedule: false,
    canAutoPilot: false,
  },
  pro: {
    platforms: ["tiktok"], // TikTok included
    maxPlatforms: 1,
    postsPerDay: 5,
    canSchedule: true,
    canAutoPilot: false,
  },
  agency: {
    platforms: ["tiktok", "instagram", "facebook", "youtube", "x", "linkedin"],
    maxPlatforms: 6, // All platforms
    postsPerDay: 30,
    canSchedule: true,
    canAutoPilot: true,
  },
} as const;

// Social media add-on packages (purchased separately)
export const SOCIAL_ADDONS = {
  single_platform: {
    name: "Single Platform",
    description: "Connect 1 additional social media platform",
    monthlyPriceIdr: 49000,
    platforms: 1,
    postsPerDay: 3,
  },
  multi_platform: {
    name: "Multi Platform",
    description: "Connect up to 3 additional platforms",
    monthlyPriceIdr: 99000,
    platforms: 3,
    postsPerDay: 10,
  },
  all_platforms: {
    name: "All Platforms",
    description: "Unlimited platforms + scheduling + autopilot",
    monthlyPriceIdr: 199000,
    platforms: 999,
    postsPerDay: 30,
  },
  autopilot_addon: {
    name: "AutoPilot Add-on",
    description: "Auto-generate & publish content on schedule",
    monthlyPriceIdr: 149000,
    platforms: 0,
    postsPerDay: 0,
    autopilot: true,
  },
} as const;

export const SUBSCRIPTION_PLANS = {
  lite: {
    name: "Lite",
    tier: "basic",
    monthlyCredits: 20,
    dailyGenerationLimit: 3,
    monthlyPriceIdr: 99000,
    annualPriceIdr: 990000,
    features: [
      "20 Credits/month",
      "3 Daily limit",
      "Standard support",
      "❌ No social media posting",
      "💡 Add-on: Social media (+Rp 49K/platform)",
    ],
    social: SOCIAL_TIERS.lite,
  },
  pro: {
    name: "Pro",
    tier: "pro",
    monthlyCredits: 50,
    dailyGenerationLimit: 10,
    monthlyPriceIdr: 199000,
    annualPriceIdr: 1990000,
    features: [
      "50 Credits/month",
      "10 Daily limit",
      "Priority support",
      "Viral research",
      "✅ TikTok posting included",
      "✅ Content scheduling",
      "💡 Add-on: More platforms (+Rp 49K/platform)",
    ],
    social: SOCIAL_TIERS.pro,
  },
  agency: {
    name: "Agency",
    tier: "agency",
    monthlyCredits: 150,
    dailyGenerationLimit: 30,
    monthlyPriceIdr: 499000,
    annualPriceIdr: 4990000,
    features: [
      "150 Credits/month",
      "30 Daily limit",
      "White-labeling",
      "API Access",
      "✅ ALL platforms (TikTok, IG, FB, YouTube, X, LinkedIn)",
      "✅ Content scheduling",
      "✅ AutoPilot (auto-generate & publish)",
      "✅ 30 posts/day",
    ],
    social: SOCIAL_TIERS.agency,
  },
};

// Legacy alias
export const SUBSCRIPTION_PLANS_V3 = SUBSCRIPTION_PLANS;

// ── Credit Packages ──────────────────────────────────────────────────────────

export const PACKAGES = [
  {
    id: "starter",
    name: "Starter Flow",
    priceIdr: 99000,
    credits: 5,
    bonus: 1,
    totalCredits: 6,
  },
  {
    id: "growth",
    name: "Growth Machine",
    priceIdr: 149000,
    credits: 18,
    bonus: 4,
    totalCredits: 22,
    isPopular: true,
  },
  {
    id: "business",
    name: "Business Kingdom",
    priceIdr: 499000,
    credits: 70,
    bonus: 15,
    totalCredits: 85,
  },
];

export const EXTRA_CREDIT_PACKAGES = [
  { id: "1credit", credits: 1, priceIdr: 15000, name: "1 Credit" },
  { id: "5credits", credits: 5, priceIdr: 65000, name: "5 Credits" },
];

// Legacy alias
export const CREDIT_PACKAGES_V3 = PACKAGES;

// ── Helpers ──────────────────────────────────────────────────────────────────

export const creditsToUnits = (credits: number) => Math.round(credits * 10);
export const unitsToCredits = (units: number) => units / 10;

// ── Social Media Access Helpers ───────────────────────────────────────────────

export type SocialPlatform =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "youtube"
  | "x"
  | "linkedin";

/**
 * Check if a user's tier allows posting to a specific platform.
 */
export function canPostToPlatform(tier: string, platform: string): boolean {
  const planKey = tier as keyof typeof SOCIAL_TIERS;
  const socialConfig = SOCIAL_TIERS[planKey] || SOCIAL_TIERS.lite;
  if (socialConfig.platforms.length === 0) return false;
  return (socialConfig.platforms as readonly string[]).includes(platform);
}

/**
 * Get the list of platforms a tier can post to by default.
 */
export function getIncludedPlatforms(tier: string): readonly string[] {
  const planKey = tier as keyof typeof SOCIAL_TIERS;
  return SOCIAL_TIERS[planKey]?.platforms || SOCIAL_TIERS.lite.platforms;
}

/**
 * Check if a tier can use scheduling.
 */
export function canSchedule(tier: string): boolean {
  const planKey = tier as keyof typeof SOCIAL_TIERS;
  return SOCIAL_TIERS[planKey]?.canSchedule ?? false;
}

/**
 * Check if a tier can use AutoPilot.
 */
export function canUseAutoPilot(tier: string): boolean {
  const planKey = tier as keyof typeof SOCIAL_TIERS;
  return SOCIAL_TIERS[planKey]?.canAutoPilot ?? false;
}

/**
 * Get max posts per day for a tier.
 */
export function getMaxPostsPerDay(tier: string): number {
  const planKey = tier as keyof typeof SOCIAL_TIERS;
  return SOCIAL_TIERS[planKey]?.postsPerDay ?? 0;
}

/**
 * Get all available social add-ons.
 */
export function getSocialAddons(): Record<
  string,
  { name: string; description: string; monthlyPriceIdr: number }
> {
  return SOCIAL_ADDONS;
}

export function getPlanPrice(plan: PlanKey, cycle: BillingCycle): number {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  if (!planConfig) return 0;
  return cycle === "monthly"
    ? planConfig.monthlyPriceIdr
    : planConfig.annualPriceIdr;
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
    cost = 60 * 0.035 + (durationSeconds - 60) * 0.03;
  } else {
    cost = 60 * 0.035 + 240 * 0.03 + (durationSeconds - 300) * 0.025;
  }
  return Math.max(0.5, Math.round(cost * 10) / 10);
}

// ── Asynchronous Pricing Engine (Dynamic Override) ──────────────────────────

export async function getVideoCreditCostAsync(
  durationSeconds: number,
): Promise<number> {
  // Map duration to UNIT_COSTS key
  let unitKey: keyof typeof UNIT_COSTS = "VIDEO_120S";
  if (durationSeconds <= 15) unitKey = "VIDEO_15S";
  else if (durationSeconds <= 30) unitKey = "VIDEO_30S";
  else if (durationSeconds <= 60) unitKey = "VIDEO_60S";

  if (durationSeconds > 120) {
    // Custom duration tiered pricing (mirror sync getVideoCreditCost)
    return getCustomDurationCreditCost(durationSeconds);
  }

  // Read from unit_cost category (same as getUnitCostAsync)
  const units = await getUnitCostAsync(unitKey);
  return units / 10; // Convert units to credits
}

export async function getImageCreditCostAsync(
  provider?: string,
): Promise<number> {
  return PaymentSettingsService.getImageCreditCost(provider);
}

export async function getPackagesAsync() {
  const dbPackages =
    await PaymentSettingsService.getAllPricingByCategory("package");
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

export async function getSubscriptionPlansAsync(): Promise<
  Record<string, any>
> {
  const dbPlans =
    await PaymentSettingsService.getAllPricingByCategory("subscription");
  if (Object.keys(dbPlans).length > 0) return dbPlans;
  return SUBSCRIPTION_PLANS;
}

export async function getUnitCostAsync(
  key: keyof typeof UNIT_COSTS,
): Promise<number> {
  const config = await PaymentSettingsService.getPricingConfig(
    "unit_cost",
    key,
  );
  if (config !== null && config !== undefined) {
    // DB value can be: number (direct), { units: N }, or { value: N }
    if (typeof config === "number") return config;
    if (typeof config === "object" && "units" in config)
      return (config as Record<string, unknown>).units as number;
    if (typeof config === "object" && "value" in config)
      return (config as Record<string, unknown>).value as number;
  }
  return UNIT_COSTS[key];
}

export async function getReferralCommissionsAsync(): Promise<
  Record<string, number>
> {
  const defaults = { TIER_1: 0.15, TIER_2: 0.05, TIER_3: 0.02 };
  const dbComms = await PaymentSettingsService.getAllPricingByCategory(
    "referral_commission",
  );
  return { ...defaults, ...dbComms };
}

// Legacy alias for admin route
export const REFERRAL_COMMISSIONS_V3 = {
  TIER_1: 0.15,
  TIER_2: 0.05,
  TIER_3: 0.02,
};

/**
 * Main persistent keyboard (Reply Keyboard) — language-aware
 */
const MENU_LABELS: Record<string, Record<string, string>> = {
  id: {
    create: "🎬 Buat Video",
    image: "🖼️ Buat Gambar",
    chat: "💬 Chat AI",
    library: "📚 Prompt Library",
    trending: "🔥 Trending",
    daily: "🎁 Daily Prompt",
    videos: "📁 Video Saya",
    fingerprint: "🧬 Fingerprint",
    talk: "🗣️ Foto Bicara",
    subscription: "⭐ Langganan",
    topup: "💰 Top Up",
    profile: "👤 Profil",
    referral: "👥 Referral",
    settings: "⚙️ Pengaturan",
    support: "🆘 Bantuan",
    help: "📖 Panduan",
  },
  en: {
    create: "🎬 Create Video",
    image: "🖼️ Generate Image",
    chat: "💬 Chat AI",
    library: "📚 Prompt Library",
    trending: "🔥 Trending",
    daily: "🎁 Daily Prompt",
    videos: "📁 My Videos",
    fingerprint: "🧬 Fingerprint",
    talk: "🗣️ Talking Photo",
    subscription: "⭐ Subscription",
    topup: "💰 Top Up",
    profile: "👤 Profile",
    referral: "👥 Referral",
    settings: "⚙️ Settings",
    support: "🆘 Support",
    help: "📖 Help",
  },
  ru: {
    create: "🎬 Создать видео",
    image: "🖼️ Создать фото",
    chat: "💬 Чат AI",
    library: "📚 Библиотека",
    trending: "🔥 Тренды",
    daily: "🎁 Промпт дня",
    videos: "📁 Мои видео",
    fingerprint: "🧬 Fingerprint",
    talk: "🗣️ Говорящее фото",
    subscription: "⭐ Подписка",
    topup: "💰 Пополнить",
    profile: "👤 Профиль",
    referral: "👥 Реферал",
    settings: "⚙️ Настройки",
    support: "🆘 Поддержка",
    help: "📖 Помощь",
  },
  zh: {
    create: "🎬 创建视频",
    image: "🖼️ 生成图片",
    chat: "💬 AI聊天",
    library: "📚 提示库",
    trending: "🔥 热门",
    daily: "🎁 每日提示",
    videos: "📁 我的视频",
    fingerprint: "🧬 指纹",
    talk: "🗣️ 说话照片",
    subscription: "⭐ 订阅",
    topup: "💰 充值",
    profile: "👤 个人资料",
    referral: "👥 推荐",
    settings: "⚙️ 设置",
    support: "🆘 支持",
    help: "📖 帮助",
  },
};

export function getMainMenuKeyboard(lang: string = "en") {
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
  return Object.values(MENU_LABELS)
    .map((l) => l[key])
    .filter(Boolean);
}

// Legacy static export (English default) for backward compat
export const MAIN_MENU_KEYBOARD = getMainMenuKeyboard("en");
