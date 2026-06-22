/**
 * Vilona Content Bot — Standalone Entry Point
 *
 * Content factory bot (@vilonacontentbot) with:
 * - Content creation: /suno, /voice, /music, /loop, /storyboard
 * - Channel analysis: /analyze
 * - Social media: /publish
 * - Payment: /topup, /credits (Midtrans)
 * - User: /profile, /help, /menu
 */

import { Telegraf } from "telegraf";
import { BotContext } from "@/types";
import { initConfig } from "@/config/env";
import { initializeDatabase, disconnectDatabase, prisma } from "@/config/database";
import { initializeRedis, disconnectRedis } from "@/config/redis";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { PaymentService } from "@/services/payment.service";
import { getPackagesAsync } from "@/config/pricing";
import {
  sunoCommand,
  voiceCommand,
  musicCommand,
  loopCommand,
  analyzeCommand,
  publishCommand,
} from "@/commands/content-factory.commands";
import { storyboardCommand } from "@/commands/storyboard";
import { handleContentFactoryCallbacks } from "@/handlers/callbacks/content-factory";
import { handleVoiceTextWaiting, handleLoopAudioWaiting } from "@/handlers/messages/content-factory";

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════

const appConfig = initConfig();
const bot = new Telegraf<BotContext>(appConfig.BOT_TOKEN);

// ponytail: in-memory session, swap to Redis if multi-instance needed
const sessions = new Map<string, { state: string; data: Record<string, unknown> }>();

function getSession(userId: number) {
  const key = String(userId);
  if (!sessions.has(key)) sessions.set(key, { state: "idle", data: {} });
  return sessions.get(key)!;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function ensureUser(ctx: BotContext): Promise<boolean> {
  const from = ctx.from;
  if (!from) return false;
  try {
    let user = await UserService.findByTelegramId(BigInt(from.id));
    if (!user) {
      user = await UserService.create({
        telegramId: BigInt(from.id),
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
      logger.info(`[Bot] New user registered: ${from.username || from.id}`);
    }
    return true;
  } catch (err) {
    logger.error("[Bot] ensureUser error:", err);
    return false;
  }
}

async function getCredits(userId: number): Promise<number> {
  const user = await UserService.findByTelegramId(BigInt(userId));
  return user ? Number(user.creditBalance) : 0;
}

// ══════════════════════════════════════════════════════════════
// MENU TEXT
// ══════════════════════════════════════════════════════════════

function buildMenuText(name: string, credits: number): string {
  const credEmoji = credits === 0 ? "⚠️" : credits < 3 ? "🟡" : "🟢";
  return (
    `🎬 *Vilona Content Factory*\n\n` +
    `Halo ${name}! ${credEmoji} Credits: *${credits}*\n\n` +
    `*🎵 Content Creation:*\n` +
    `/suno <prompt> — Generate musik AI\n` +
    `/voice <text> — Buat voiceover\n` +
    `/music <prompt> — Background music\n` +
    `/loop — Video loop dari audio\n` +
    `/storyboard — Visual storyboard\n\n` +
    `*📊 Riset & Publish:*\n` +
    `/analyze <url> — Analisa channel\n` +
    `/publish — Posting ke sosmed\n\n` +
    `*💳 Billing:*\n` +
    `/credits — Cek saldo\n` +
    `/topup — Isi ulang credits\n` +
    `/profile — Profil kamu\n\n` +
    `Ketik command atau tap tombol di bawah 👇`
  );
}

// ══════════════════════════════════════════════════════════════
// /start & /menu
// ══════════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  if (!(await ensureUser(ctx))) {
    await ctx.reply("❌ Gagal mendaftar. Coba lagi.");
    return;
  }
  const name = ctx.from?.first_name || "Creator";
  const credits = await getCredits(ctx.from!.id);
  await ctx.reply(buildMenuText(name, credits), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎵 Suno AI", callback_data: "menu_suno" },
          { text: "🎙️ Voice", callback_data: "menu_voice" },
        ],
        [
          { text: "🎶 Music", callback_data: "menu_music" },
          { text: "🔁 Loop", callback_data: "menu_loop" },
        ],
        [
          { text: "📊 Analyze", callback_data: "menu_analyze" },
          { text: "📤 Publish", callback_data: "menu_publish" },
        ],
        [
          { text: "💳 Top Up", callback_data: "menu_topup" },
          { text: "📋 Credits", callback_data: "menu_credits" },
        ],
        [
          { text: "👤 Profile", callback_data: "menu_profile" },
          { text: "❓ Help", callback_data: "menu_help" },
        ],
      ],
    },
  });
});

// ══════════════════════════════════════════════════════════════
// /help
// ══════════════════════════════════════════════════════════════

bot.command("help", async (ctx) => {
  const name = ctx.from?.first_name || "Creator";
  const credits = await getCredits(ctx.from!.id);
  await ctx.reply(buildMenuText(name, credits), { parse_mode: "Markdown" });
});

bot.command("menu", async (ctx) => {
  const name = ctx.from?.first_name || "Creator";
  const credits = await getCredits(ctx.from!.id);
  await ctx.reply(buildMenuText(name, credits), { parse_mode: "Markdown" });
});

// ══════════════════════════════════════════════════════════════
// CONTENT COMMANDS
// ══════════════════════════════════════════════════════════════

bot.command("suno", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await sunoCommand(ctx);
});

bot.command("voice", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await voiceCommand(ctx);
});

bot.command("music", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await musicCommand(ctx);
});

bot.command("loop", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await loopCommand(ctx);
});

bot.command("storyboard", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await storyboardCommand(ctx);
});

bot.command("analyze", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await analyzeCommand(ctx);
});

bot.command("publish", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  await publishCommand(ctx);
});

// ══════════════════════════════════════════════════════════════
// /credits
// ══════════════════════════════════════════════════════════════

bot.command("credits", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  const userId = ctx.from!.id;
  try {
    const user = await UserService.findByTelegramId(BigInt(userId));
    if (!user) { await ctx.reply("❌ User tidak ditemukan."); return; }
    const balance = Number(user.creditBalance);
    const credEmoji = balance === 0 ? "⚠️" : balance < 3 ? "🟡" : "🟢";
    await ctx.reply(
      `${credEmoji} *Credit Balance*\n\n` +
      `Saldo: *${balance}* credits\n` +
      `Tier: ${user.tier}\n\n` +
      balance === 0
        ? `⚠️ Credits habis! Ketik /topup untuk isi ulang.`
        : `✅ Siap untuk membuat konten!`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    logger.error("[Credits] Error:", err);
    await ctx.reply("❌ Gagal cek saldo.");
  }
});

// ══════════════════════════════════════════════════════════════
// /topup
// ══════════════════════════════════════════════════════════════

bot.command("topup", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  try {
    const packages = await getPackagesAsync();
    if (!packages.length) {
      await ctx.reply("❌ Paket belum tersedia. Hubungi admin.");
      return;
    }
    const rows = packages.map((pkg: { id: string; name: string; priceIdr: number; credits: number }) => [
      { text: `${pkg.name} — Rp ${pkg.priceIdr.toLocaleString()} (${pkg.credits} cr)`, callback_data: `topup_${pkg.id}` },
    ]);
    rows.push([{ text: "◀️ Kembali", callback_data: "back_menu" }]);
    await ctx.reply(`💳 *Top Up Credits*\n\nPilih paket:`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: rows },
    });
  } catch (err) {
    logger.error("[Topup] Error:", err);
    await ctx.reply("❌ Gagal load paket.");
  }
});

// ══════════════════════════════════════════════════════════════
// /profile
// ══════════════════════════════════════════════════════════════

bot.command("profile", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  const userId = ctx.from!.id;
  try {
    const user = await UserService.findByTelegramId(BigInt(userId));
    if (!user) { await ctx.reply("❌ User tidak ditemukan."); return; }
    const videos = await prisma.video.count({ where: { userId: BigInt(userId) } });
    const txns = await prisma.transaction.count({ where: { userId: BigInt(userId), status: "success" } });
    await ctx.reply(
      `👤 *Profil*\n\n` +
      `Nama: ${user.firstName} ${user.lastName || ""}\n` +
      `Username: @${user.username || "-"}\n` +
      `Tier: ${user.tier}\n` +
      `Credits: ${Number(user.creditBalance)}\n` +
      `Video dibuat: ${videos}\n` +
      `Transaksi sukses: ${txns}\n` +
      `Bergabung: ${user.createdAt.toLocaleDateString("id-ID")}`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    logger.error("[Profile] Error:", err);
    await ctx.reply("❌ Gagal load profil.");
  }
});

// ══════════════════════════════════════════════════════════════
// CALLBACK HANDLER
// ══════════════════════════════════════════════════════════════

bot.on("callback_query", async (ctx) => {
  const raw = ctx.callbackQuery;
  if (!raw || !("data" in raw)) return;
  const data = raw.data;

  // ── Menu navigation ──
  if (data === "back_menu") {
    await ctx.answerCbQuery();
    const name = ctx.from?.first_name || "Creator";
    const credits = await getCredits(ctx.from!.id);
    await ctx.editMessageText(buildMenuText(name, credits), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎵 Suno AI", callback_data: "menu_suno" },
            { text: "🎙️ Voice", callback_data: "menu_voice" },
          ],
          [
            { text: "🎶 Music", callback_data: "menu_music" },
            { text: "🔁 Loop", callback_data: "menu_loop" },
          ],
          [
            { text: "📊 Analyze", callback_data: "menu_analyze" },
            { text: "📤 Publish", callback_data: "menu_publish" },
          ],
          [
            { text: "💳 Top Up", callback_data: "menu_topup" },
            { text: "📋 Credits", callback_data: "menu_credits" },
          ],
          [
            { text: "👤 Profile", callback_data: "menu_profile" },
            { text: "❓ Help", callback_data: "menu_help" },
          ],
        ],
      },
    });
    return;
  }

  // ── Menu shortcuts → reply with usage hint ──
  const menuHints: Record<string, string> = {
    menu_suno: "🎵 *Suno AI Music*\n\nKetik: `/suno lo-fi chill beats`\n\nAtau kirim prompt langsung.",
    menu_voice: "🎙️ *AI Voiceover*\n\nKetik: `/voice Beli sekarang di Shopee!`",
    menu_music: "🎶 *Background Music*\n\nKetik: `/music corporate upbeat`",
    menu_loop: "🔁 *Looping Video*\n\nKetik: `/loop` lalu kirim audio file.",
    menu_analyze: "📊 *Channel Analyzer*\n\nKetik: `/analyze https://youtube.com/@channel`",
    menu_publish: "📤 *Publish ke Sosmed*\n\nKetik: `/publish` untuk pilih platform.",
    menu_topup: "", // handled separately
    menu_credits: "", // handled separately
    menu_profile: "", // handled separately
    menu_help: "", // handled separately
  };

  if (data === "menu_topup") {
    await ctx.answerCbQuery();
    // Trigger /topup inline
    const packages = await getPackagesAsync();
    if (!packages.length) {
      await ctx.reply("❌ Paket belum tersedia.");
      return;
    }
    const rows = packages.map((pkg: { id: string; name: string; priceIdr: number; credits: number }) => [
      { text: `${pkg.name} — Rp ${pkg.priceIdr.toLocaleString()} (${pkg.credits} cr)`, callback_data: `topup_${pkg.id}` },
    ]);
    rows.push([{ text: "◀️ Kembali", callback_data: "back_menu" }]);
    await ctx.editMessageText(`💳 *Top Up Credits*\n\nPilih paket:`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: rows },
    });
    return;
  }

  if (data === "menu_credits") {
    await ctx.answerCbQuery();
    const user = await UserService.findByTelegramId(BigInt(ctx.from!.id));
    const balance = user ? Number(user.creditBalance) : 0;
    await ctx.editMessageText(
      `💳 *Credits: ${balance}*\n\nTier: ${user?.tier || "free"}`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "💳 Top Up", callback_data: "menu_topup" }, { text: "◀️ Kembali", callback_data: "back_menu" }]] },
      },
    );
    return;
  }

  if (data === "menu_profile") {
    await ctx.answerCbQuery();
    const user = await UserService.findByTelegramId(BigInt(ctx.from!.id));
    if (user) {
      await ctx.editMessageText(
        `👤 *${user.firstName} ${user.lastName || ""}*\n@${user.username || "-"}\nTier: ${user.tier} | Credits: ${Number(user.creditBalance)}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "◀️ Kembali", callback_data: "back_menu" }]] } },
      );
    }
    return;
  }

  if (data === "menu_help") {
    await ctx.answerCbQuery();
    const name = ctx.from?.first_name || "Creator";
    const credits = await getCredits(ctx.from!.id);
    await ctx.editMessageText(buildMenuText(name, credits), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "◀️ Kembali", callback_data: "back_menu" }]] },
    });
    return;
  }

  if (menuHints[data]) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(menuHints[data], {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "◀️ Kembali", callback_data: "back_menu" }]] },
    });
    return;
  }

  // ── Topup callbacks ──
  if (data.startsWith("topup_")) {
    const packageId = data.replace("topup_", "");
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      await ctx.answerCbQuery();
      const user = await UserService.findByTelegramId(BigInt(userId));
      if (!user) { await ctx.reply("❌ User tidak ditemukan."); return; }
      const result = await PaymentService.createTransaction({
        userId: BigInt(userId),
        packageId,
        username: user.firstName || "User",
      });
      if (result.redirectUrl) {
        await ctx.reply(
          `💳 *Pembayaran*\n\n` +
          `Order: \`${result.orderId}\`\n\n` +
          `[🔗 Klik di sini untuk bayar](${result.redirectUrl})\n\n` +
          `Setelah bayar, credits otomatis masuk.`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply("❌ Gagal membuat pembayaran.");
      }
    } catch (err) {
      logger.error("[Topup] Error:", err);
      await ctx.reply("❌ Gagal proses topup.");
    }
    return;
  }

  // ── Content factory callbacks ──
  if (await handleContentFactoryCallbacks(ctx, data)) return;

  // ── Unknown ──
  await ctx.answerCbQuery("⚠️ Unknown action").catch(() => {});
});

// ══════════════════════════════════════════════════════════════
// MESSAGE HANDLER (state-based)
// ══════════════════════════════════════════════════════════════

bot.on("message", async (ctx) => {
  const session = getSession(ctx.from?.id || 0);
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return;
  if (msg.text.startsWith("/")) return; // skip commands

  // Voice text waiting
  if (session.state === "voice_waiting") {
    if (await handleVoiceTextWaiting(ctx)) return;
  }

  // Loop audio waiting
  if (session.state === "loop_waiting") {
    if (await handleLoopAudioWaiting(ctx)) return;
  }

  // Default: show help hint
  await ctx.reply(
    "🤔 Saya belum mengerti pesan itu.\n\nKetik /menu untuk melihat daftar command.",
  );
});

// ══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ══════════════════════════════════════════════════════════════

bot.catch((err, ctx) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(`[Bot] Error for ${ctx.update.update_id}: ${error.message}`);
  ctx.reply("❌ Terjadi kesalahan. Coba lagi nanti.").catch(() => {});
});

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

async function main() {
  logger.info("🎬 Starting Vilona Content Bot...");
  await initializeDatabase();
  await initializeRedis();

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  } catch { /* ok */ }

  bot.launch().catch((err) => logger.error("[Bot] launch error:", err));
  logger.info("✅ Vilona Content Bot is LIVE");

  await bot.telegram.setMyCommands([
    { command: "menu", description: "🏠 Menu utama" },
    { command: "suno", description: "🎵 Generate musik AI" },
    { command: "voice", description: "🎙️ AI voiceover" },
    { command: "music", description: "🎶 Background music" },
    { command: "loop", description: "🔁 Video loop" },
    { command: "storyboard", description: "📋 Visual storyboard" },
    { command: "analyze", description: "📊 Analisa channel" },
    { command: "publish", description: "📤 Post ke sosmed" },
    { command: "topup", description: "💳 Top up credits" },
    { command: "credits", description: "📋 Cek saldo" },
    { command: "profile", description: "👤 Profil" },
    { command: "help", description: "❓ Bantuan" },
  ]).catch(() => {});

  const shutdown = async (signal: string) => {
    logger.info(`${signal} — shutting down...`);
    bot.stop(signal);
    await disconnectDatabase().catch(() => {});
    await disconnectRedis().catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("❌ Fatal:", err);
  process.exit(1);
});
