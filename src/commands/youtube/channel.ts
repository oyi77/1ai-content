/**
 * YouTube Channel Telegram Commands
 *
 * /yt_channel_add, /yt_channels, /yt_status
 */

import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { prisma } from "@/config/database";

export function registerChannelCommands(bot: Telegraf<Context>): void {
  bot.command("yt_channels", async (ctx) => {
    const channels = await prisma.ytChannel.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        channelId: true,
        nicheVertical: true,
        tier: true,
        trafficStatus: true,
        totalPublished: true,
      },
    });

    if (channels.length === 0) {
      await ctx.reply(
        "📭 No YouTube channels registered. Use /yt_channel_add to add one.",
      );
      return;
    }

    const lines = channels.map(
      (ch: Record<string, unknown>, i: number) =>
        `${i + 1}. \`${ch.channelId}\` | ${ch.nicheVertical} | ${ch.tier} | ${ch.trafficStatus} | ${ch.totalPublished} videos`,
    );

    await ctx.reply(`📺 *YouTube Channels*\n\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("yt_status", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);
    const channelId = args[0];
    if (!channelId) {
      await ctx.reply("Usage: /yt_status <channel_id>");
      return;
    }

    const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
    if (!channel) {
      await ctx.reply(`❌ Channel \`${channelId}\` not found.`, {
        parse_mode: "Markdown",
      });
      return;
    }

    const recentVideos = await prisma.ytPublishedVideo.count({
      where: {
        channelId,
        publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    const text = [
      `📺 *Channel: ${channelId}*`,
      `Niche: ${channel.nicheVertical} | Format: ${channel.productionFormat}`,
      `Tier: ${channel.tier} | Status: ${channel.trafficStatus}`,
      `Country: ${channel.targetCountry || "N/A"} | Language: ${channel.targetLanguage || "N/A"}`,
      `Published: ${channel.totalPublished} total | ${recentVideos} this month`,
      `Age: ${channel.channelAgeDays} days | Score: ${channel.trafficScore || "N/A"}`,
    ].join("\n");

    await ctx.reply(text, { parse_mode: "Markdown" });
  });
}
