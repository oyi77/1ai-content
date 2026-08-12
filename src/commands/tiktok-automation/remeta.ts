/**
 * /remeta — Simple Video Re-Metadata (text overlay + re-render)
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { tiktokAutomation } from "@/services/tiktok-automation.service";

export async function remetaCommand(ctx: BotContext): Promise<void> {
  const text =
    "text" in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : "";
  const args = text.replace(/^\/remeta(?:@\S+)?\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "🔄 *Re-Metadata Engine*\n\n" +
        "Ambil video, tambah text overlay, re-render. " +
        "Metadata berubah = fingerprint berbeda = anti-copyright.\n\n" +
        "*Cara pakai:*\n" +
        "1. Kirim video ke bot\n" +
        "2. Ketik: `/remeta @brandname`\n\n" +
        "*Opsi:*\n" +
        "• `/remeta @mybrand` — tambah overlay text\n" +
        "• `/remeta @brand --watermark @user` — overlay + watermark\n" +
        "• `/remeta @brand --niche tech tips` — SEO metadata\n\n" +
        "Atau langsung kirim video dengan caption `/remeta @brand`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Check if user has a recent video to process
  const lastVideo = ctx.session?.stateData?.lastVideoPath as string | undefined;
  if (!lastVideo || !require("fs").existsSync(lastVideo)) {
    ctx.session.stateData = {
      ...ctx.session.stateData,
      waitingForRemetaVideo: true,
      remetaOverlay: args.split(/\s+/)[0],
      remetaArgs: args,
    };
    await ctx.reply(
      "📹 *Kirim video yang mau di-re-metadata*\n\n" +
        `Overlay: ${args.split(/\s+/)[0]}\n\n` +
        "Kirim video langsung ke bot ini.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Process existing video
  await _processRemeta(ctx, lastVideo, args);
}

async function _processRemeta(
  ctx: BotContext,
  videoPath: string,
  args: string,
): Promise<void> {
  // Parse args
  const parts = args.split(/\s+/);
  const overlay = parts[0] || "";
  let watermark = "";
  let niche = "general";

  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "--watermark" && parts[i + 1]) {
      watermark = parts[i + 1];
      i++;
    } else if (parts[i] === "--niche" && parts[i + 1]) {
      niche = parts[i + 1];
      i++;
    }
  }

  await ctx.reply(
    `🔄 *Re-Metadata Started*\n\n` +
      `📹 Video: ${require("path").basename(videoPath)}\n` +
      `🏷️ Overlay: ${overlay}\n` +
      `${watermark ? `💧 Watermark: ${watermark}\n` : ""}` +
      `🎯 Niche: ${niche}\n\n` +
      `⏳ Proses 30-60 detik...`,
    { parse_mode: "Markdown" },
  );

  try {
    const result = await tiktokAutomation.remetaContent({
      source: videoPath,
      overlay,
      watermark: watermark || undefined,
      niche,
    });

    if (result.success) {
      const newVideoPath = result.video_path as string;
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const changes = result.changes_applied as string[] | undefined;
      const hashtags = Array.isArray(metadata?.hashtags)
        ? (metadata.hashtags as string[]).slice(0, 5).join(" ")
        : "";

      if (newVideoPath && require("fs").existsSync(newVideoPath)) {
        await ctx.replyWithVideo(
          { source: newVideoPath },
          {
            caption:
              `✅ *Video Re-Metadata Done!*\n\n` +
              `🔄 Changes: ${changes?.join(", ") ?? "none"}\n` +
              `📊 Original: ${String(result.original_hash ?? "").slice(0, 12)}...\n` +
              `📊 New: ${String(result.new_hash ?? "").slice(0, 12)}...\n\n` +
              `*New Metadata:*\n` +
              `📝 ${String(metadata?.title ?? "").slice(0, 100)}\n\n` +
              `#️⃣ ${hashtags}`,
            parse_mode: "Markdown",
          },
        );
      }
    } else {
      await ctx.reply(`❌ Gagal: ${String(result.error ?? "Unknown error")}`);
    }
  } catch (err: unknown) {
    logger.error(
      `[Remeta] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    await ctx.reply("❌ Terjadi kesalahan saat re-metadata.");
  }
}
