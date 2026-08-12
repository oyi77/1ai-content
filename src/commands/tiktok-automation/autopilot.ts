/**
 * /autopilot — Auto-generate & publish content
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { tiktokAutomation } from "@/services/tiktok-automation.service";

export async function autopilotCommand(ctx: BotContext): Promise<void> {
  const text =
    "text" in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : "";
  const args = text.replace(/^\/autopilot(?:@\S+)?\s*/, "").trim();

  // /autopilot status
  if (args === "status" || args === "") {
    try {
      const status = await tiktokAutomation.getAutoPilotStatus();

      const lines = [
        "🤖 *AutoPilot Status*\n",
        `📊 Active Jobs: ${status.active_jobs}`,
        `📋 Total Jobs: ${status.total_jobs}`,
        `🕐 Last Run: ${status.last_run ?? "Never"}\n`,
      ];

      if (status.jobs?.length > 0) {
        lines.push("*Jobs:*");
        for (const job of status.jobs) {
          lines.push(
            `• ${job.name} — ${job.status} (${job.config.content_type})`,
          );
        }
      }

      lines.push("\nPilih aksi:");
      await ctx.reply(lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "▶️ Run Now", callback_data: "autopilot_run" }],
            [{ text: "➕ Create Job", callback_data: "autopilot_create" }],
            [
              {
                text: "📊 Detailed Status",
                callback_data: "autopilot_detailed",
              },
            ],
          ],
        },
      });
    } catch (err: unknown) {
      logger.error(
        `[AutoPilot] Status error: ${err instanceof Error ? err.message : String(err)}`,
      );
      await ctx.reply("❌ Gagal mengambil status autopilot.");
    }
    return;
  }

  // /autopilot create <niche>
  if (args.startsWith("create ")) {
    const niche = args.replace("create ", "").trim();
    await ctx.reply(
      `🤖 *Create AutoPilot Job*\n\nNiche: ${niche}\n\nPilih tipe konten:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎬 Video", callback_data: `ap_create_video_${niche}` },
              {
                text: "🖼️ Carousel",
                callback_data: `ap_create_carousel_${niche}`,
              },
            ],
            [{ text: "🔀 Mixed", callback_data: `ap_create_mixed_${niche}` }],
          ],
        },
      },
    );
    return;
  }

  // /autopilot help
  await ctx.reply(
    "🤖 *AutoPilot Commands*\n\n" +
      "• `/autopilot` — Lihat status\n" +
      "• `/autopilot create <niche>` — Buat job baru\n" +
      "• `/autopilot status` — Status detail\n\n" +
      "AutoPilot akan otomatis generate & publish konten sesuai jadwal.",
    { parse_mode: "Markdown" },
  );
}
