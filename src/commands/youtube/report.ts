/**
 * YouTube Report Telegram Commands
 *
 * /yt_report, /yt_quarantine, /yt_research, /yt_research_results
 */

import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { prisma } from "@/config/database";
import { getLatestResearch } from "@/services/youtube/niche-research.service";
import { runNicheCpmResearch } from "@/services/youtube/niche-research.service";

export function registerReportCommands(bot: Telegraf<Context>): void {
  bot.command("yt_report", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);
    const channelId = args[0];

    if (channelId) {
      const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
      if (!channel) {
        await ctx.reply(`❌ Channel \`${channelId}\` not found.`, { parse_mode: "Markdown" });
        return;
      }

      const videos = await prisma.ytPublishedVideo.findMany({
        where: { channelId, publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { publishedAt: "desc" },
        take: 10,
        select: { videoId: true, title: true, status: true, publishedAt: true },
      });

      const lines = videos.map((v: Record<string, unknown>, i: number) => `${i + 1}. \`${v.videoId}\` | ${v.status} | ${v.title || "N/A"}`);
      await ctx.reply(
        `📊 *Report: ${channelId}*\nTier: ${channel.tier} | Status: ${channel.trafficStatus}\nPublished: ${channel.totalPublished}\n\nRecent videos:\n${lines.join("\n") || "None"}`,
        { parse_mode: "Markdown" },
      );
    } else {
      const channels = await prisma.ytChannel.findMany({ select: { channelId: true, tier: true, trafficStatus: true, totalPublished: true } });
      const lines = channels.map((ch: { channelId: string; tier: string; trafficStatus: string; totalPublished: number }) => `${ch.channelId} | ${ch.tier} | ${ch.trafficStatus} | ${ch.totalPublished}v`);
      await ctx.reply(`📊 *All Channels*\n\n${lines.join("\n") || "No channels"}`, { parse_mode: "Markdown" });
    }
  });

  bot.command("yt_quarantine", async (ctx) => {
    const quarantined = await prisma.ytChannel.findMany({
      where: { trafficStatus: "quarantine" },
      select: { channelId: true, nicheVertical: true, quarantineStarted: true, channelAgeDays: true },
    });

    if (quarantined.length === 0) {
      await ctx.reply("✅ No channels in quarantine.");
      return;
    }

    const lines = quarantined.map((ch: { channelId: string; nicheVertical: string; channelAgeDays: number; quarantineStarted: Date | null }) =>
      `🔒 \`${ch.channelId}\` | ${ch.nicheVertical} | Age: ${ch.channelAgeDays}d | Since: ${(ch.quarantineStarted ? new Date(ch.quarantineStarted).toISOString().split('T')[0] : 'N/A')}`,
    );
    await ctx.reply(`*Quarantine Status*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  });

  bot.command("yt_research", async (ctx) => {
    await ctx.reply("🔍 Running niche + CPM research...");
    try {
      const result = await runNicheCpmResearch();
      const topOpps = result.recommendations.slice(0, 3);
      const lines = topOpps.map((r, i) => `${i + 1}. ${r.nicheVertical} × ${r.targetCountry} | CPM $${r.estimatedCpm} | ${r.priority}`);
      await ctx.reply(`🌍 *Research Complete*\n\nTop opportunities:\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ Research failed: ${err}`);
    }
  });

  bot.command("yt_research_results", async (ctx) => {
    const research = await getLatestResearch();
    if (!research) {
      await ctx.reply("📭 No research results yet. Run /yt_research first.");
      return;
    }

    const topCpm = Object.entries(research.cpmSnapshot)
      .sort((a, b) => b[1].cpmUsd - a[1].cpmUsd)
      .slice(0, 5)
      .map(([country, data]) => `${country}: $${data.cpmUsd} (${data.trend})`);

    await ctx.reply(
      `🌍 *Latest Research (${research.researchDate.split("T")[0]})*\n\nTop CPM:\n${topCpm.join("\n")}`,
      { parse_mode: "Markdown" },
    );
  });
}
