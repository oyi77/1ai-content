/**
 * Content Bot — Command & callback handler registrations
 *
 * All bot.command() and bot.on() registrations, imported by main.ts
 * and bound to the bot instance.
 */
import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { WhiteLabelService } from "@/services/whitelabel.service";
import { PaymentService } from "@/services/payment.service";
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
import { ensureUser } from "./ensure-user";
import { getPipeline, renderStep } from "./pipeline";
import {
  detectInputType,
  analyzeInput,
  generateScript,
} from "@/services/content-pipeline.service";

export function registerHandlers(bot: import("telegraf").Telegraf<BotContext>): void {
  // ── CONTENT COMMANDS ──

  bot.command("start", async (ctx) => {
    if (!(await ensureUser(ctx))) return;
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

  bot.command("help", async (ctx) => {
    if (!(await ensureUser(ctx))) return;
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
    const userId = ctx.from!.id;
    const args = ctx.message && "text" in ctx.message ? ctx.message.text.replace(/^\/analyze\s*/, "").trim() : "";
    if (!args) {
      await ctx.reply("📊 Kirim URL YouTube/TikTok untuk dianalisa.\nContoh: /analyze https://youtube.com/@channel");
      return;
    }
    const p = getPipeline(userId);
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
      await ctx.reply(`❌ Analisa gagal: ${msg}`);
    }
  });

  bot.command("create", async (ctx) => {
    if (!(await ensureUser(ctx))) return;
    const userId = ctx.from!.id;
    const args = ctx.message && "text" in ctx.message ? ctx.message.text.replace(/^\/create\s*/, "").trim() : "";
    const p = getPipeline(userId);

    if (args) {
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

    const parts = args.split(/\s+/);
    const subcommand = parts[0];

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
          stats.bots.map((b: any) => `• ${b.brandName} (@${b.botUsername || "-"}) — ${b.userCount} users — Rp ${b.totalEarned.toLocaleString()}`).join("\n"),
          { parse_mode: "Markdown" },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`❌ ${msg}`);
      }
      return;
    }

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

    if (subcommand === "list") {
      try {
        const bots = await WhiteLabelService.getByOwner(BigInt(userId));
        if (!bots.length) {
          await ctx.reply("Kamu belum punya bot whitelabel.\nKetik /whitelabel register untuk mulai.");
          return;
        }
        const list = bots.map((b: any) =>
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

  // ── Callback handler ──

  bot.on("callback_query", async (ctx) => {
    const raw = ctx.callbackQuery;
    if (!raw || !("data" in raw)) return;
    const data = raw.data;

    // Topup callbacks
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
          gateway: 'midtrans',
        });
        if (result.redirectUrl) {
          await ctx.reply(
            `💳 *Pembayaran*\n\n` +
            `Order: \`${result.orderId}\`\n\n` +
            `[🔗 Klik di sini untuk bayar](${result.redirectUrl})\n\n` +
            `Setelah bayar, kirim screenshot ke admin.`,
            { parse_mode: "Markdown" },
          );
        } else {
          await ctx.reply("✅ Pembayaran berhasil!");
        }
      } catch (err) {
        await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // Content factory callbacks
    if (data.startsWith("cf_")) {
      await ctx.answerCbQuery();
      await handleContentFactoryCallbacks(ctx, data);
      return;
    }

    // Pipeline callbacks
    if (data.startsWith("pipe_")) {
      const userId = ctx.from!.id;
      const p = getPipeline(userId);

      switch (data) {
        case "pipe_script": {
          if (!p.analysis) {
            await ctx.reply("❌ Belum ada analysis. Ketik /create untuk mulai.");
            return;
          }
          p.step = "analyzing";
          await ctx.reply("⏳ Generate script...");
          try {
            const script = await generateScript(p.analysis);
            p.script = script;
            p.step = "script_done";
            const rendered = renderStep(userId);
            await ctx.reply(rendered.text, {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: rendered.buttons as never },
            });
          } catch (err) {
            p.step = "analysis_done";
            await ctx.reply(`❌ Gagal generate script: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        }
        case "pipe_reanalyze": {
          if (p.inputSource) {
            p.step = "analyzing";
            await ctx.reply("⏳ Analisa ulang...");
            try {
              const analysis = await analyzeInput(p.inputSource, p.inputType!);
              p.analysis = analysis;
              p.step = "analysis_done";
              const rendered = renderStep(userId);
              await ctx.reply(rendered.text, {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: rendered.buttons as never },
              });
            } catch (err) {
              p.step = "input";
              await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
            }
          } else {
            await ctx.reply("❌ Tidak ada input untuk dianalisa ulang.");
          }
          break;
        }
        case "pipe_cancel":
          p.step = "input";
          delete p.analysis;
          delete p.script;
          delete p.inputSource;
          delete p.inputType;
          delete p.error;
          await ctx.reply("❌ Dibatal.");
          break;
        case "pipe_back_analysis":
          if (p.analysis) {
            p.step = "analysis_done";
            const rendered = renderStep(userId);
            await ctx.reply(rendered.text, {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: rendered.buttons as never },
            });
          } else {
            await ctx.reply("❌ Tidak ada analysis.");
          }
          break;
        case "pipe_edit_script": {
          await ctx.reply("✏️ Kirim script revisi sebagai pesan teks.");
          p.step = "input"; // waiting for text
          break;
        }
        case "pipe_generate":
          p.step = "generate";
          await ctx.reply("🎬 Generate video... (fitur dalam pengembangan)");
          break;
        case "pipe_publish":
          if (p.script) {
            await ctx.reply("📤 Publish ke sosial media... (fitur dalam pengembangan)");
          } else {
            await ctx.reply("❌ Belum ada script untuk dipublish.");
          }
          break;
        case "pipe_new":
          p.step = "input";
          delete p.analysis;
          delete p.script;
          delete p.inputSource;
          delete p.inputType;
          delete p.error;
          await ctx.reply("🆕 Mulai konten baru!\nKetik /create untuk mulai.");
          break;
      }
      return;
    }

    // Fallback to content factory for unhandled callbacks
    await ctx.answerCbQuery();
    await handleContentFactoryCallbacks(ctx, data);
  });

  // ── Text handler ──

  bot.on("text", async (ctx) => {
    if (!(await ensureUser(ctx))) return;
    // Check if user is in a waiting state
    await handleVoiceTextWaiting(ctx);
    await handleLoopAudioWaiting(ctx);
  });

  // ── Audio handler ──

  bot.on("audio", async (ctx) => {
    if (!(await ensureUser(ctx))) return;
    await handleLoopAudioWaiting(ctx);
  });

  // ── Error handler ──

  bot.catch((err, ctx) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`[Bot] Error for ${ctx.update.update_id}: ${error.message}`);
    ctx.reply("❌ Terjadi kesalahan. Coba lagi nanti.").catch(() => {});
  });
}
