/**
 * Vilona Content Bot — Standalone Entry Point
 *
 * Dedicated content factory bot (@vilonacontentbot) with only:
 * - /suno — Suno AI music
 * - /voice — Edge TTS voiceover
 * - /music — Background music
 * - /loop — Looping video
 * - /analyze — Channel analysis
 * - /publish — Social media posting
 * - /storyboard — Visual storyboard
 */

import { Telegraf } from "telegraf";
import { BotContext } from "@/types";
import { initConfig } from "@/config/env";
import { initializeDatabase, disconnectDatabase } from "@/config/database";
import { prisma } from "@/config/database";
import { initializeRedis, disconnectRedis } from "@/config/redis";
import { logger } from "@/utils/logger";

// Content factory commands
import {
  sunoCommand,
  voiceCommand,
  musicCommand,
  loopCommand,
  analyzeCommand,
  publishCommand,
} from "@/commands/content-factory.commands";
import { storyboardCommand } from "@/commands/storyboard";
import { socialCommand } from "@/commands/social";

// Content factory callback & message handlers
import { handleContentFactoryCallbacks } from "@/handlers/callbacks/content-factory";
import { handleVoiceTextWaiting, handleLoopAudioWaiting } from "@/handlers/messages/content-factory";
// Payment & credits
import { UserService } from "@/services/user.service";
import { PaymentService } from "@/services/payment.service";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { getPackagesAsync } from "@/config/pricing";

// ── Config ────────────────────────────────────────────────────

const appConfig = initConfig();
const bot = new Telegraf<BotContext>(appConfig.BOT_TOKEN);

// ── Middleware: minimal session ────────────────────────────────

bot.use(async (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {
      state: "START" as any,
      stateData: {},
      lastActivity: new Date(),
    };
  }
  ctx.session.lastActivity = new Date();
  await next();
});

// ── /start ────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || "Creator";
  await ctx.reply(
    `🎬 *Vilona Content Factory*\n\n` +
    `Halo ${name}! Saya AI content assistant kamu.\n\n` +
    `*Commands:*\n` +
    `✂️ /clip \`<url>\` — Auto-clip video panjang → viral shorts\n` +
    `🎬 /faceless \`<topic>\` — Buat video faceless\n` +
    `🛍️ /product \`<name> | <desc> | <harga>\` — Video produk\n` +
    `📊 /analyze \`<url>\` — Analisa channel + clone\n` +
    `🔥 /trends \`<niche>\` — Scan trending topics\n` +
    `🤖 /autopilot start — Auto-generate & publish 24/7\n` +
    `🎵 /suno \`<prompt>\` — Generate musik AI\n` +
    `🎙️ /voice \`<text>\` — Buat voiceover\n` +
    `🎶 /music \`<prompt>\` — Background music\n` +
    `🔁 /loop — Buat video loop dari audio\n` +
    `📤 /publish — Posting ke social media\n` +
    `📋 /storyboard — Visual storyboard\n\n` +
    `Ketik command untuk mulai! 🚀`,
    { parse_mode: "Markdown" },
  );
});

// ── Commands ──────────────────────────────────────────────────

bot.command("suno", sunoCommand);
bot.command("voice", voiceCommand);
bot.command("music", musicCommand);
bot.command("loop", loopCommand);
bot.command("analyze", analyzeCommand);
bot.command("publish", publishCommand);
bot.command("storyboard", storyboardCommand);

// ── Credits & Payment ──────────────────────────────────────

bot.command("credits", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try {
    const user = await UserService.findByTelegramId(BigInt(userId));
    if (!user) {
      await ctx.reply("❌ User tidak ditemukan. Ketik /start dulu.");
      return;
    }
    const balance = Number(user.creditBalance);
    await ctx.reply(
      `💳 *Credit Balance*\n\n` +
      `Saldo: *${balance}* credits\n` +
      `Tier: ${user.tier}\n\n` +
      `Ketik /topup untuk isi ulang.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: unknown) {
    logger.error("[Credits] Error:", err);
    await ctx.reply("❌ Gagal cek saldo.");
  }
});

bot.command("topup", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try {
    const packages = await getPackagesAsync();
    const rows = packages.map((pkg: { id: string; name: string; priceIdr: number; credits: number }) => [
      { text: `${pkg.name} — Rp ${pkg.priceIdr.toLocaleString()} (${pkg.credits} credits)`, callback_data: `topup_${pkg.id}` },
    ]);
    await ctx.reply(
      `💳 *Top Up Credits*\n\n` +
      `Pilih paket:`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rows },
      }
    );
  } catch (err: unknown) {
    logger.error("[Topup] Error:", err);
    await ctx.reply("❌ Gagal load paket.");
  }
});

bot.on("callback_query", async (ctx) => {
  const data = "data" in (ctx.callbackQuery ?? {}) ? (ctx.callbackQuery as any).data : undefined;
  if (!data) return;

  // Topup callbacks
  if (data.startsWith("topup_")) {
    const packageName = data.replace("topup_", "");
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      await ctx.answerCbQuery();
      const user = await UserService.findByTelegramId(BigInt(userId));
      if (!user) { await ctx.reply("❌ User tidak ditemukan."); return; }
      const result = await PaymentService.createTransaction({
        userId: BigInt(userId),
        packageId: packageName,
        username: user.firstName || "User",
      });
      const snapUrl = result.redirectUrl;
      if (snapUrl) {
        await ctx.reply(
          `💳 *Pembayaran ${packageName}*\n\n` +
          `Order: ${result.orderId}\n\n` +
          `[Klik di sini untuk bayar](${snapUrl})\n\n` +
          `Setelah bayar, credits otomatis masuk.`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply("❌ Gagal membuat pembayaran. Coba lagi.");
      }
    } catch (err: unknown) {
      logger.error("[Topup] Error:", err);
      await ctx.reply("❌ Gagal proses topup.");
    }
    return;
  }


  // Social account callbacks
  if (data === "noop") {
    await ctx.answerCbQuery().catch(() => {});
    return;
  }

  if (await handleContentFactoryCallbacks(ctx, data)) return;

  await ctx.answerCbQuery("⚠️ Unknown action").catch(() => {});
});

// ── Error handler ────────────────────────────────────────────
bot.catch((err, ctx) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(`Bot error for ${ctx.update.update_id}: ${error.message}`);
  ctx.reply("❌ Terjadi kesalahan. Coba lagi nanti.").catch(() => {});
});


bot.on("message", async (ctx) => {
  const state = ctx.session?.state;

  if (state === "VOICE_TEXT_WAITING") {
    if (await handleVoiceTextWaiting(ctx)) return;
  }
  if (state === "LOOP_AUDIO_WAITING") {
    if (await handleLoopAudioWaiting(ctx)) return;
  }

  // YouTube token waiting
  if (state === "YOUTUBE_TOKEN_WAITING") {
    const msg = ctx.message;
    if (msg && "text" in msg && msg.text && !msg.text.startsWith("/")) {
      const token = msg.text.trim();
      if (token.length > 20) {
        // Store token in session for now (in production: encrypt + store in DB)
        ctx.session.stateData = { ...ctx.session.stateData, youtube_token: token };
        ctx.session.state = "DASHBOARD" as any;
        await ctx.reply(
          `✅ YouTube token tersimpan!\n\n` +
 `🔑 Token: \`${token.substring(0, 10)}...${token.substring(token.length - 5)}\`\n\n` +
          `Sekarang kamu bisa /publish ke YouTube.`,
          { parse_mode: 'Markdown' },
        );
        return;
      }
    }
  }

  // X/Twitter token waiting
  if (state === "X_TOKEN_WAITING") {
    const msg = ctx.message;
    if (msg && "text" in msg && msg.text && !msg.text.startsWith("/")) {
      const parts = msg.text.trim().split('|');
      if (parts.length === 4) {
        ctx.session.stateData = {
          ...ctx.session.stateData,
          x_api_key: parts[0].trim(),
          x_api_secret: parts[1].trim(),
          x_access_token: parts[2].trim(),
          x_access_token_secret: parts[3].trim(),
        };
        ctx.session.state = "DASHBOARD" as any;
        await ctx.reply(
          `✅ X/Twitter credentials tersimpan!\n\n` +
          `🔑 API Key: \`${parts[0].trim().substring(0, 6)}...\`\n` +
          `Sekarang kamu bisa /publish ke X/Twitter.`,
          { parse_mode: 'Markdown' },
        );
        return;
      } else {
        await ctx.reply(
          '❌ Format salah. Kirim dalam format:\n`api_key|api_secret|access_token|access_token_secret`',
          { parse_mode: 'Markdown' },
        );
        return;
      }
    }
  }

  // Default: show help
  const defaultMsg = ctx.message;
  if (defaultMsg && "text" in defaultMsg && defaultMsg.text && !defaultMsg.text.startsWith("/")) {
    await ctx.reply(
      "🤔 Saya belum mengerti pesan itu.\n\n" +
      "Ketik /start untuk melihat daftar command.",
    );
  }
});

// ── Main ──────────────────────────────────────────────────────

async function main() {
  logger.info("🎬 Starting Vilona Content Bot...");

  // Database
  logger.info("📦 Connecting to database...");
  await initializeDatabase();
  logger.info("✅ Database connected");

  // Redis
  logger.info("💾 Connecting to Redis...");
  await initializeRedis();
  logger.info("✅ Redis connected");

  // Delete webhook first, then start polling
  logger.info("🔌 Deleting webhook...");
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    logger.info("✅ Webhook deleted");
  } catch {
    logger.warn("⚠️ deleteWebhook failed, continuing...");
  }

  // Start polling — bot.launch() runs forever, don't await it
  logger.info("🔌 Starting Telegram polling...");
  bot.launch().catch((err) => logger.error("❌ bot.launch() error:", err));
  logger.info("✅ Vilona Content Bot is LIVE — polling started");

  // Set command menu
  await bot.telegram.setMyCommands([
    { command: "start", description: "🏠 Start & show commands" },
    { command: "clip", description: "✂️ Auto-clip video → viral shorts" },
    { command: "suno", description: "🎵 Generate music (Suno AI)" },
    { command: "voice", description: "🎙️ AI voiceover generator" },
    { command: "music", description: "🎶 Background music generator" },
    { command: "loop", description: "🔁 Create looping video" },
    { command: "publish", description: "📤 Publish to social media" },
    { command: "storyboard", description: "📋 Visual storyboard" },
  ]).catch(() => {});

  // Graceful shutdown — stop polling, drain connections, then exit
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down...`);
    bot.stop(signal);
    try {
      await disconnectDatabase();
      await disconnectRedis();
    } catch (err) {
      logger.error("Error during disconnect:", err);
    }
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("❌ Fatal error:", err);
  process.exit(1);
});
