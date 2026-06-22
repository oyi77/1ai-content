/**
 * Commands Module
 *
 * Registers all bot commands
 */

import { Telegraf } from "telegraf";
import { BotContext } from "@/types";
import { logger } from "@/utils/logger";

// Import command handlers
import { startCommand } from "./start";
import { helpCommand } from "./help";
import { topupCommand } from "./topup";
import { referralCommand } from "./referral";
import { profileCommand } from "./profile";
import { settingsCommand } from "./settings";
import { videosCommand } from "./videos";
import { subscriptionCommand } from "./subscription";
import { supportCommand } from "./support";

import { chatCommand } from "./grok";
import { socialCommand } from "./social";
import {
  promptsCommand,
  dailyCommand,
  trendingCommand,
  fingerprintCommand,
} from "./prompts";
import { cancelCommand } from "./cancel";
import { sendCommand } from "./send";
import { pricingCommand } from "./pricing";
import { deleteAccountCommand } from "./deleteAccount";
import {
  ebookCommand,
  handleEbookCreate,
  handleEbookList,
  handleEbookDownload,
  handleEbookPreview,
} from "./ebook";

// Content commands (video clipper, editor, rework)
import { ContentCommands } from "./content.commands";

// Feature-based flows
export * from "@/flows/generate";
export * from "@/menus/main";

// Admin commands
import { adminBroadcastCommand } from "./admin/broadcast";
import { adminSystemStatusCommand } from "./admin/systemStatus";
import {
  adminGrantCreditsCommand,
  adminDeductCreditsCommand,
} from "./admin/grantCredits";
import { paymentSettingsCommand } from "./admin/paymentSettings";
import { showYouTubeMenu, showChannelList, showChannelDetail, showReports, triggerResearch, showResearchResults, showQuarantine, showAgentLogs } from "./youtube/youtube.menu";

/**
 * Setup all bot commands
 */
export function setupCommands(bot: Telegraf<BotContext>): void {
  logger.info("Registering bot commands...");

  // User commands
  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command("create", async (ctx) => {
    const { showGenerateMode } = await import("../flows/generate.js");
    await showGenerateMode(ctx);
  });
  bot.command("menu", startCommand); // Show main menu with all features
  bot.command("dashboard", startCommand); // Alias for menu
  bot.command("topup", topupCommand);
  bot.command("referral", referralCommand);
  bot.command("profile", profileCommand);
  bot.command("settings", settingsCommand);
  bot.command("videos", videosCommand);
  bot.command("subscription", subscriptionCommand);
  bot.command("support", supportCommand);
  bot.command("cancel", cancelCommand);
  bot.command("send", sendCommand);
  bot.command("pricing", pricingCommand);
  bot.command("delete_account", deleteAccountCommand);
  bot.command("ebook", ebookCommand);
  bot.command("ebooks", ebookCommand); // Alias
  bot.command("image", (ctx) =>
    ctx.reply("🖼️ *Image Generation*\n\n" + "Select workflow:", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍️ Product Photo", callback_data: "img_product" }],
          [{ text: "🍔 F&B Food", callback_data: "img_fnb" }],
          [{ text: "🏠 Real Estate", callback_data: "img_realestate" }],
          [{ text: "🚗 Car/Automotive", callback_data: "img_car" }],
        ],
      },
    }),
  );
  // AI chat (OmniRoute — cheapest/free model)
  bot.command("chat", chatCommand);
  bot.command("ask", chatCommand); // Alias
  bot.command("social", socialCommand); // Social media accounts & publish
  // Prompt library commands
  bot.command("prompts", promptsCommand);
  bot.command("prompt", promptsCommand); // Alias
  bot.command("daily", dailyCommand);
  bot.command("trending", trendingCommand);
  bot.command("fingerprint", fingerprintCommand);

  bot.command("viral", (ctx) => ContentCommands.handleViral(ctx as any));
  bot.command("clip", (ctx) => ContentCommands.handleClip(ctx as any));
  bot.command("edit", (ctx) => ContentCommands.handleEdit(ctx as any));
  bot.command("rework", (ctx) => ContentCommands.handleRework(ctx as any));
  bot.command("scrape", (ctx) => ContentCommands.handleScrape(ctx as any));

  // YouTube workflow — button-based menu
  bot.command("yt", (ctx) => showYouTubeMenu(ctx));
  bot.command("youtube", (ctx) => showYouTubeMenu(ctx));

  // YouTube callback handlers
  bot.action("yt_menu_refresh", (ctx) => showYouTubeMenu(ctx));
  bot.action("yt_menu_channels", (ctx) => showChannelList(ctx));
  bot.action("yt_menu_reports", (ctx) => showReports(ctx));
  bot.action("yt_menu_research", (ctx) => triggerResearch(ctx));
  bot.action("yt_menu_results", (ctx) => showResearchResults(ctx));
  bot.action("yt_menu_quarantine", (ctx) => showQuarantine(ctx));
  bot.action("yt_menu_logs", (ctx) => showAgentLogs(ctx));
  bot.action(/^yt_channel_(.+)$/, (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    return showChannelDetail(ctx, match[1]);
  });

  // Admin commands (with middleware check)
  bot.command("broadcast", adminBroadcastCommand);
  bot.command("system_status", adminSystemStatusCommand);
  bot.command("grant_credits", adminGrantCreditsCommand);
  bot.command("deduct_credits", adminDeductCreditsCommand);
  bot.command("payment_settings", paymentSettingsCommand);
  bot.command("admin", paymentSettingsCommand); // Alias

  // Set bot commands menu - show all features accessible
  bot.telegram.setMyCommands([
    { command: "start", description: "🏠 Start bot & main menu" },
    { command: "create", description: "🎬 Buat video baru" },
    { command: "image", description: "🖼️ Buat foto produk/logo" },
    { command: "chat", description: "💬 Chat dengan AI Assistant" },
    { command: "prompts", description: "📚 Browse prompt library" },
    { command: "trending", description: "🔥 Prompt trending minggu ini" },
    { command: "daily", description: "🎁 Mystery prompt harian" },
    { command: "videos", description: "📁 Video saya" },
    { command: "topup", description: "💰 Beli kredit" },
    { command: "subscription", description: "⭐ Upgrade langganan" },
    { command: "referral", description: "👥 Referral & affiliate" },
    { command: "profile", description: "👤 Profil saya" },
    { command: "settings", description: "⚙️ Pengaturan" },
    { command: "ebook", description: "📖 Buat ebook dengan AI" },
    { command: "viral", description: "🔥 Find viral videos" },
    { command: "clip", description: "✂️ Download & clip videos" },
    { command: "edit", description: "🎬 Edit videos" },
    { command: "rework", description: "🔄 Anti-copyright rework" },
    { command: "scrape", description: "🕵️ Scrape competitor content" },
    { command: "yt", description: "📺 YouTube Dashboard" },
    { command: "support", description: "🆘 Hubungi support" },
    { command: "help", description: "📖 Panduan lengkap" },
  ]).catch(() => { /* ignore - bot token may not be set yet */ });

  logger.info("Bot commands registered successfully");
}
