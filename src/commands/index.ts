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
import { carouselCommand, autopilotCommand, calendarCommand, abtestCommand, repurposeCommand, regenCommand, remetaCommand } from "./tiktok-automation.commands";
import { connectCommand, publishCommand, scheduleCommand } from "./social-media.commands";

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
import {
  showMainDashboard, showCreateMenu, showImageMenu, showChatMenu, showPromptsMenu,
  showVideosMenu, showProfileMenu,
  showSettingsMenu, showSupportMenu, showHelpMenu,
  showTrendingMenu, showCalendarMenu, showABTestMenu,
} from "../menus/unified-dashboard";

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

  // TikTok automation commands
  bot.command("carousel", carouselCommand);
  bot.command("autopilot", autopilotCommand);
  bot.command("calendar", calendarCommand);
  bot.command("abtest", abtestCommand);
  bot.command("regen", regenCommand);
  bot.command("repurpose", repurposeCommand);
  bot.command("remeta", remetaCommand);

  // Social media commands (via 1ai-social bridge)
  bot.command("connect", connectCommand);
  bot.command("publish", publishCommand);
  bot.command("schedule", scheduleCommand);

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

  // Unified dashboard — button navigation for all sections
  bot.action("menu_main", (ctx) => showMainDashboard(ctx));
  bot.action("menu_create", (ctx) => showCreateMenu(ctx));
  bot.action("menu_image", (ctx) => showImageMenu(ctx));
  bot.action("menu_chat", (ctx) => showChatMenu(ctx));
  bot.action("menu_prompts", (ctx) => showPromptsMenu(ctx));
  bot.action("menu_videos", (ctx) => showVideosMenu(ctx));
  bot.action("menu_profile", (ctx) => showProfileMenu(ctx));
  bot.action("menu_settings", (ctx) => showSettingsMenu(ctx));
  bot.action("menu_support", (ctx) => showSupportMenu(ctx));
  bot.action("menu_help", (ctx) => showHelpMenu(ctx));
  bot.action("menu_trending", (ctx) => showTrendingMenu(ctx));
  bot.action("menu_calendar", (ctx) => showCalendarMenu(ctx));
  bot.action("menu_abtest", (ctx) => showABTestMenu(ctx));

  // Admin commands (with middleware check)
  bot.command("broadcast", adminBroadcastCommand);
  bot.command("system_status", adminSystemStatusCommand);
  bot.command("grant_credits", adminGrantCreditsCommand);
  bot.command("deduct_credits", adminDeductCreditsCommand);
  bot.command("payment_settings", paymentSettingsCommand);
  bot.command("admin", paymentSettingsCommand); // Alias

  // Set bot commands menu — Vilona Content Automation
  bot.telegram.setMyCommands([
    { command: "start", description: "🏠 Start bot & main menu" },
    { command: "create", description: "🎬 Buat video baru" },
    { command: "image", description: "🖼️ Buat foto produk/logo" },
    { command: "carousel", description: "🖼️ Buat TikTok carousel" },
    { command: "autopilot", description: "🤖 Auto-generate & publish" },
    { command: "calendar", description: "📅 Content calendar" },
    { command: "abtest", description: "🧪 A/B testing konten" },
    { command: "chat", description: "💬 Chat dengan AI Assistant" },
    { command: "prompts", description: "📚 Browse prompt library" },
    { command: "trending", description: "🔥 Trending content" },
    { command: "viral", description: "🔥 Find viral videos" },
    { command: "clip", description: "✂️ Download & clip videos" },
    { command: "repurpose", description: "🔄 Repurpose multi-source (anti-copyright remix)" },
    { command: "remeta", description: "🔄 Re-metadata single video (overlay + re-render)" },
    { command: "connect", description: "🔗 Connect social media accounts" },
    { command: "publish", description: "📤 Publish to social media" },
    { command: "schedule", description: "📅 Schedule content" },
    { command: "videos", description: "📁 Video saya" },
    { command: "profile", description: "👤 Profil saya" },
    { command: "settings", description: "⚙️ Pengaturan" },
    { command: "support", description: "🆘 Hubungi support" },
    { command: "help", description: "📖 Panduan lengkap" },
  ]).catch(() => { /* ignore - bot token may not be set yet */ });

  logger.info("Bot commands registered successfully");
}
