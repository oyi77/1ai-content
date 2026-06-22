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
import { WhiteLabelService } from "@/services/whitelabel.service";
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

bot.use(async (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {
      state: "START",
      stateData: {},
      lastActivity: new Date(),
    } as any;
  }
  ctx.session.lastActivity = new Date();
  await next();
});

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


// ══════════════════════════════════════════════════════════════
// MENU TEXT
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// /start & /menu
// ══════════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  if (!(await ensureUser(ctx))) {
    await ctx.reply("❌ Gagal mendaftar. Coba lagi.");
    return;
  }
  const name = ctx.from?.first_name || "Creator";
  await ctx.reply(
    `🎬 *Vilona Content Factory*\n\n` +
    `Halo ${name}! Bot khusus buat konten.\n\n` +
    `*Commands:*\n` +
    `🎵 /suno <prompt> — Musik AI\n` +
    `🎙️ /voice <text> — Voiceover\n` +
    `🎶 /music <prompt> — Background music\n` +
    `🔁 /loop — Video loop\n` +
    `📋 /storyboard — Visual storyboard\n` +
    `📊 /analyze <url> — Analisa channel\n\n` +
    `Untuk top up & profile, gunakan @berkahkarya_saas_bot`,
    { parse_mode: "Markdown" },
  );
});

// ══════════════════════════════════════════════════════════════
// /help
// ══════════════════════════════════════════════════════════════



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

// ══════════════════════════════════════════════════════════════
// WHITELABEL COMMANDS
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// /create — Content Pipeline
// ══════════════════════════════════════════════════════════════

bot.command("create", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  const userId = ctx.from!.id;
  const args = ctx.message && "text" in ctx.message ? ctx.message.text.replace(/^\/create\s*/, "").trim() : "";
  const p = getPipeline(userId);

  if (args) {
    // User provided input directly: /create <url or text>
    p.step = "analyzing";
    p.inputSource = args;
    p.inputType = detectInputType(args);
    await ctx.reply("⏳ Sedang analisa...");
    try {
      const analysis = await analyzeInput(args, p.inputType!);
      p.analysis = analysis;
      p.step = "analysis_done";
      const rendered = renderStep(userId);
      await ctx.reply(rendered.text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rendered.buttons as never },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      p.step = "input";
      p.error = msg;
      await ctx.reply(`❌ Analisa gagal: ${msg}`);
    }
    return;
  }

  // No args — show instructions
  const rendered = renderStep(userId);
  await ctx.reply(rendered.text, {
    parse_mode: "Markdown",
    reply_markup: rendered.buttons.length ? { inline_keyboard: rendered.buttons as never } : undefined,
  });
});
bot.command("whitelabel", async (ctx) => {
  if (!(await ensureUser(ctx))) return;
  const userId = ctx.from!.id;
  const args = ctx.message && "text" in ctx.message ? ctx.message.text.replace(/^\/whitelabel\s*/, "").trim() : "";

  if (!args) {
    await ctx.reply(
      "🏷️ *Whitelabel Bot System*\n\n" +
      "Jual bot kami dengan brand kamu sendiri!\n\n" +
      "*Commission:* 30% dari setiap transaksi user kamu\n" +
      "*MLM:* +15%/5%/2% dari referral 3 level\n\n" +
      "*Commands:*\n" +
      "/whitelabel register <bot_token> <brand_name> — Daftarkan bot\n" +
      "/whitelabel stats — Lihat statistik\n" +
      "/whitelabel withdraw <amount> — Tarik komisi\n" +
      "/whitelabel list — Daftar bot kamu\n\n" +
      "*Cara kerja:*\n" +
      "1. Buat bot baru via @BotFather\n" +
      "2. Register token di sini\n" +
      "3. Share bot kamu ke orang lain\n" +
      "4. Setiap transaksi user = kamu dapat 30%!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const parts = args.split("\s+");
  const subcommand = parts[0];

  // ── /whitelabel register <token> <brand_name> ──
  if (subcommand === "register") {
    const token = parts[1];
    const brandName = parts.slice(2).join(" ");
    if (!token || !brandName) {
      await ctx.reply("❌ Format: /whitelabel register <bot_token> <brand_name>");
      return;
    }
    try {
      const bot = await WhiteLabelService.register({
        ownerId: BigInt(userId),
        botToken: token,
        brandName,
      });
      await ctx.reply(
        `✅ *Bot Whitelabel Terdaftar!*\n\n` +
        `Brand: ${bot.brandName}\n` +
        `Commission: ${Number(bot.commissionRate) * 100}%\n\n` +
        `Bot kamu sekarang aktif! Share link bot kamu ke orang lain.\n` +
        `Setiap transaksi = kamu dapat komisi.`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ Gagal register: ${msg}`);
    }
    return;
  }

  // ── /whitelabel stats ──
  if (subcommand === "stats") {
    try {
      const stats = await WhiteLabelService.getStats(BigInt(userId));
      await ctx.reply(
        `📊 *Whitelabel Stats*\n\n` +
        `Bot terdaftar: ${stats.botCount} (${stats.activeBots} aktif)\n` +
        `Total user: ${stats.totalUsers}\n` +
        `Total penjualan: Rp ${stats.totalSales.toLocaleString()}\n` +
        `Total komisi: Rp ${stats.totalEarned.toLocaleString()}\n` +
        `Sudah ditarik: Rp ${stats.totalWithdrawn.toLocaleString()}\n` +
        `Saldo tersedia: Rp ${stats.availableBalance.toLocaleString()}\n\n` +
        stats.bots.map((b) => `• ${b.brandName} (@${b.botUsername || "-"}) — ${b.userCount} users — Rp ${b.totalEarned.toLocaleString()}`).join("\n"),
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ ${msg}`);
    }
    return;
  }

  // ── /whitelabel withdraw <amount> ──
  if (subcommand === "withdraw") {
    const amount = parseInt(parts[1]);
    if (!amount || amount < 10000) {
      await ctx.reply("❌ Minimal withdraw: Rp 10.000\nFormat: /whitelabel withdraw <amount>");
      return;
    }
    try {
      await WhiteLabelService.withdraw(BigInt(userId), amount);
      await ctx.reply(`✅ Withdraw Rp ${amount.toLocaleString()} berhasil!\nDana akan diproses admin dalam 1x24 jam.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ ${msg}`);
    }
    return;
  }

  // ── /whitelabel list ──
  if (subcommand === "list") {
    try {
      const bots = await WhiteLabelService.getByOwner(BigInt(userId));
      if (!bots.length) {
        await ctx.reply("Kamu belum punya bot whitelabel.\nKetik /whitelabel register untuk mulai.");
        return;
      }
      const list = bots.map((b) =>
        `${b.isActive ? "✅" : "❌"} *${b.brandName}*\n` +
        `  @${b.botUsername || "pending"} | ${b.userCount} users | Rp ${Number(b.totalEarned).toLocaleString()}`
      ).join("\n\n");
      await ctx.reply(`🏷️ *Bot Whitelabel Kamu*\n\n${list}`, { parse_mode: "Markdown" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ ${msg}`);
    }
    return;
  }

  await ctx.reply("❌ Subcommand tidak dikenal. Ketik /whitelabel untuk bantuan.");
});


// ══════════════════════════════════════════════════════════════
// /credits
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// /topup
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// /profile
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// CALLBACK HANDLER
// ══════════════════════════════════════════════════════════════

bot.on("callback_query", async (ctx) => {
  const raw = ctx.callbackQuery;
  if (!raw || !("data" in raw)) return;
  const data = raw.data;

  // ── Menu navigation ──
  
  // ── Menu shortcuts → reply with usage hint ──
  
  
  
  

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

  // ── Pipeline callbacks ──
  if (data.startsWith("pipe_")) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const p = getPipeline(userId);
    await ctx.answerCbQuery();

    if (data === "pipe_script") {
      if (!p.analysis) { await ctx.reply("❌ Analisa dulu."); return; }
      p.script = generateScript(p.analysis);
      p.step = "script_done";
      const rendered = renderStep(userId);
      await ctx.editMessageText(rendered.text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rendered.buttons as never },
      });
      return;
    }

    if (data === "pipe_generate") {
      p.step = "generate";
      await ctx.editMessageText("🎬 Generating video... Mohon tunggu.");
      // TODO: queue video generation via BullMQ
      p.step = "done";
      const rendered = renderStep(userId);
      await ctx.reply(rendered.text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rendered.buttons as never },
      });
      return;
    }

    if (data === "pipe_reanalyze") {
      if (!p.inputSource) { await ctx.reply("❌ Input tidak ditemukan."); return; }
      p.step = "analyzing";
      await ctx.editMessageText("⏳ Re-analisa...");
      const analysis = await analyzeInput(p.inputSource, p.inputType || "text_prompt");
      p.analysis = analysis;
      p.step = "analysis_done";
      const rendered = renderStep(userId);
      await ctx.reply(rendered.text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: rendered.buttons as never },
      });
      return;
    }

    if (data === "pipe_back_analysis") {
      if (p.analysis) {
        p.step = "analysis_done";
        const rendered = renderStep(userId);
        await ctx.editMessageText(rendered.text, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: rendered.buttons as never },
        });
      }
      return;
    }

    if (data === "pipe_edit_script") {
      await ctx.reply("✏️ Kirim script baru dalam format markdown:");
      // TODO: handle script edit in message handler
      return;
    }

    if (data === "pipe_publish") {
      await ctx.reply("📤 Fitur publish coming soon!");
      return;
    }

    if (data === "pipe_new" || data === "pipe_cancel") {
      pipelines.delete(userId);
      await ctx.reply("🎬 Ketik /create untuk buat konten baru.");
      return;
    }

    return;
  }
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

  // Pipeline: detect URL in message
  const userId = ctx.from?.id;
  if (userId) {
    const p = getPipeline(userId);
    const text = msg.text.trim();
    const isUrl = /https?:\/\//.test(text);

    if (isUrl || text.endsWith(".md") || text.endsWith(".txt")) {
      p.step = "analyzing";
      p.inputSource = text;
      p.inputType = detectInputType(text);
      await ctx.reply("⏳ Sedang analisa...");
      try {
        const analysis = await analyzeInput(text, p.inputType!);
        p.analysis = analysis;
        p.step = "analysis_done";
        const rendered = renderStep(userId);
        await ctx.reply(rendered.text, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: rendered.buttons as never },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        p.step = "input";
        await ctx.reply(`❌ Analisa gagal: ${errMsg}`);
      }
      return;
    }
  }

  // Default
  await ctx.reply("🤔 Ketik /create untuk buat konten.");
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

  await bot.telegram.setMyCommands([
    { command: "create", description: "🎬 Buat konten dari ide/link/file" },
    { command: "suno", description: "🎵 Generate musik AI" },
    { command: "voice", description: "🎙️ AI voiceover" },
    { command: "music", description: "🎶 Background music" },
    { command: "loop", description: "🔁 Video loop" },
    { command: "storyboard", description: "📋 Visual storyboard" },
    { command: "analyze", description: "📊 Analisa channel" },
    { command: "whitelabel", description: "🏷️ Whitelabel bot" },
  ]).catch(() => {});
  logger.info("✅ Vilona Content Bot is LIVE");


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

// ══════════════════════════════════════════════════════════════
// CONTENT PIPELINE
// ══════════════════════════════════════════════════════════════

import {
  detectInputType,
  analyzeInput,
  generateScript,
  formatAnalysis,
  formatScript,
  type PipelineState,
  type AnalysisResult,
  type ContentScript,
} from "@/services/content-pipeline.service";

// Per-user pipeline state (in-memory)
const pipelines = new Map<number, PipelineState>();

function getPipeline(userId: number): PipelineState {
  if (!pipelines.has(userId)) pipelines.set(userId, { step: "input" });
  return pipelines.get(userId)!;
}

function renderStep(userId: number): { text: string; buttons: unknown[][] } {
  const p = getPipeline(userId);
  switch (p.step) {
    case "input":
      return {
        text: "🎬 *Buat Konten*\n\nKirim salah satu:\n• URL YouTube/TikTok\n• File .md / .txt\n• Prompt text\n\nBot akan analisa dan buatkan script + video.",
        buttons: [],
      };
    case "analyzing":
      return { text: "⏳ Sedang analisa...", buttons: [] };
    case "analysis_done": {
      const a = p.analysis!;
      return {
        text: formatAnalysis(a) + "\n\nMau lanjut buat script?",
        buttons: [
          [{ text: "📝 Buat Script", callback_data: "pipe_script" }],
          [{ text: "🔄 Analisa Ulang", callback_data: "pipe_reanalyze" }],
          [{ text: "❌ Batal", callback_data: "pipe_cancel" }],
        ],
      };
    }
    case "script_done": {
      const s = p.script!;
      return {
        text: formatScript(s),
        buttons: [
          [{ text: "🎬 Generate Video", callback_data: "pipe_generate" }],
          [{ text: "✏️ Edit Script", callback_data: "pipe_edit_script" }],
          [{ text: "🔄 Buat Ulang Script", callback_data: "pipe_script" }],
          [{ text: "◀️ Kembali ke Analysis", callback_data: "pipe_back_analysis" }],
        ],
      };
    }
    case "generate":
      return { text: "🎬 Generating video... Mohon tunggu.", buttons: [] };
    case "done":
      return {
        text: "✅ Video selesai! Mau publish ke sosmed?",
        buttons: [
          [{ text: "📤 Publish", callback_data: "pipe_publish" }],
          [{ text: "🎬 Buat Lagi", callback_data: "pipe_new" }],
        ],
      };
    default:
      return { text: "Ketik /create untuk mulai.", buttons: [] };
  }
}
