import { redis } from "@/config/redis";
import { logger } from "@/utils/logger";

export async function runSeeder() {
  try {
    logger.info("[SEEDER] Starting data initialization...");

    // 1. Initialize Database Defaults (Upsert logic inside)
    const { PaymentSettingsService } =
      await import("../services/payment-settings.service.js");
    await PaymentSettingsService.initializeDefaults();
    await PaymentSettingsService.initializePricingDefaults();

    // 2. Additional Essential Data (Upsert mode)
    const { prisma } = await import("../config/database.js");

    // Niches
    const { NICHE_LIST } = await import("../config/niches.js");
    logger.info(`[SEEDER] Seeding ${NICHE_LIST.length} default niches...`);
    for (const niche of NICHE_LIST) {
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "niche", key: niche.id } },
        create: {
          category: "niche",
          key: niche.id,
          value: JSON.parse(JSON.stringify(niche)),
          updatedAt: new Date(),
        },
        update: {}, // Don't overwrite admin changes
      });
    }

    // Free Trial Config
    const { FREE_TRIAL_CONFIG } = await import("../config/free-trial.js");
    logger.info("[SEEDER] Seeding default free-trial config...");
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "free_trial", key: "config" } },
      create: {
        category: "free_trial",
        key: "config",
        value: FREE_TRIAL_CONFIG,
      },
      update: {},
    });

    // Sys Settings
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "system", key: "exchange_rate" } },
      create: { category: "system", key: "exchange_rate", value: 16000 },
      update: {},
    });

    logger.info("[SEEDER] Database defaults initialized (Upsert mode)");

    // 3. Landing Page Config (Redis)
    logger.info("[SEEDER] seeding landing_config...");

    const defaultLandingConfig = {
      headline: "BK Vilona — Ubah 1 Foto Jadi Video Iklan Viral",
      subheadline:
        "Platform AI yang ubah foto produk jadi video iklan profesional dengan struktur HPAS. Langsung dari Telegram. Mulai gratis, bayar pakai VA/e-wallet.",
      videoDuration: "60",
      heroImageUrl: "/public/hero-tiktok-showcase.png?v=1774653613",
      ctaText: "🎁 Mulai Gratis — 1 Video Gratis",
      testimonials: {
        id: [
          {
            name: "Joko D.",
            role: "Owner Toko Sepatu Lokal",
            avatar: "",
            text: '"Gila sih, awalnya iseng cobain 1 foto produk sepatu, generate video 30 detik. Trus di-post ke TikTok, nembus 500k views! Closing hari itu dapet 32 order. Worth it banget!"',
            stars: 5,
            bg: "#333",
            initial: "JD",
          },
          {
            name: "Mita R.",
            role: "Skincare Reseller",
            avatar: "",
            text: '"Saya jualan skincare, biasa bingung ngonten karena gak ngerti editing. Pake Vilona bener-bener ngebantu karena framework-nya (HPAS) emang convert! Kemaren tembus 120 paket."',
            stars: 5,
            bg: "#00d9ff",
            color: "#0a0a1a",
            initial: "MR",
          },
          {
            name: "Ahmad Diki",
            role: "F&B Franchise",
            avatar: "",
            text: '"Bayangin, pake HP doang, di sela-sela waktu istirahat, generate 5 variasi video iklan. Langsung dipecah ke IG Reels dan TikTok. Tools ini cheat code umkm!"',
            stars: 5,
            bg: "#555",
            initial: "AD",
          },
        ],
        en: [
          {
            name: "John D.",
            role: "Local Shoe Store Owner",
            avatar: "",
            text: '"Crazy, I tried it with 1 shoe product photo, generated a 30s video. Reached 500k views on TikTok! 32 orders in one day. Totally worth it!"',
            stars: 5,
            bg: "#333",
            initial: "JD",
          },
          {
            name: "Sarah M.",
            role: "Skincare Reseller",
            avatar: "",
            text: '"I sell skincare, usually confused about content because I don\'t understand editing. Vilona really helped because the (HPAS) framework actually converts!"',
            stars: 5,
            bg: "#00d9ff",
            color: "#0a0a1a",
            initial: "SM",
          },
        ],
      },
    };

    await redis.set(
      "admin:landing_config",
      JSON.stringify(defaultLandingConfig),
    );
    logger.info(
      "[SEEDER] Successfully seeded default admin:landing_config with multi-language testimonials.",
    );
  } catch (error: any) {
    logger.error("[SEEDER] Failed to run seeder:", error);
  }
}

// Allow direct execution
if (require.main === module) {
  runSeeder()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
