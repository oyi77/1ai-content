/**
 * YouTube Video Telegram Commands
 *
 * /yt_approve, /yt_reject, /yt_edit_title
 */

import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { prisma } from "@/config/database";

export function registerVideoCommands(bot: Telegraf<Context>): void {
  bot.command("yt_approve", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);
    const videoId = args[0];
    if (!videoId) {
      await ctx.reply("Usage: /yt_approve <video_id>");
      return;
    }

    await ctx.reply(`⏳ Approving video \`${videoId}\`...`, {
      parse_mode: "Markdown",
    });

    const video = await prisma.ytPublishedVideo.findUnique({
      where: { videoId },
    });
    if (!video) {
      await ctx.reply(`❌ Video \`${videoId}\` not found.`, {
        parse_mode: "Markdown",
      });
      return;
    }

    await ctx.reply(`✅ Video \`${videoId}\` approved for publish.`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("yt_reject", async (ctx) => {
    const parts = ctx.message.text.split(" ").slice(1);
    const videoId = parts[0];
    const reason = parts.slice(1).join(" ") || "No reason given";
    if (!videoId) {
      await ctx.reply("Usage: /yt_reject <video_id> [reason]");
      return;
    }

    await ctx.reply(`❌ Video \`${videoId}\` rejected.\nReason: ${reason}`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("yt_edit_title", async (ctx) => {
    const parts = ctx.message.text.split(" ").slice(1);
    const videoId = parts[0];
    const newTitle = parts.slice(1).join(" ");
    if (!videoId || !newTitle) {
      await ctx.reply("Usage: /yt_edit_title <video_id> <new title>");
      return;
    }

    await prisma.ytPublishedVideo.update({
      where: { videoId },
      data: { title: newTitle },
    });

    await ctx.reply(`✏️ Title updated for \`${videoId}\`:\n*${newTitle}*`, {
      parse_mode: "Markdown",
    });
  });
}
