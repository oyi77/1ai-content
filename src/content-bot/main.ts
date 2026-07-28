/**
 * Content Bot — Main entry point
 *
 * Initializes services, registers handlers, and launches the bot.
 */
import { logger } from "@/utils/logger";
import { initializeDatabase, disconnectDatabase } from "@/config/database";
import { initializeRedis, disconnectRedis } from "@/config/redis";
import { bot } from "./setup";
import { registerHandlers } from "./handlers";

export async function main() {
  logger.info("🎬 Starting Vilona Content Bot...");
  await initializeDatabase();
  await initializeRedis();

  registerHandlers(bot);

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

// Allow direct execution
if (require.main === module) {
  main().catch((err) => {
    logger.error("❌ Fatal:", err);
    process.exit(1);
  });
}
