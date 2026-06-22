/**
 * YouTube Workflow — Button-based Menu System
 *
 * /yt → main menu with inline buttons
 * Each button → sub-action or data view
 */

import { Context } from "telegraf";
import { prisma } from "@/config/database";
import { runNicheCpmResearch, getLatestResearch } from "@/services/youtube/niche-research.service";


type BotContext = Context;

// ── Main Menu ──

export async function showYouTubeMenu(ctx: BotContext): Promise<void> {
  const channelCount = await prisma.ytChannel.count();
  const videoCount = await prisma.ytPublishedVideo.count();
  const quarantineCount = await prisma.ytChannel.count({ where: { trafficStatus: "quarantine" } });

  const text = [
    "📺 *YouTube Workflow Dashboard*",
    "",
    `Channels: *${channelCount}* | Videos: *${videoCount}* | Quarantine: *${quarantineCount}*`,
    "",
    "Pilih menu di bawah:",
  ].join("\n");

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📺 Channels", callback_data: "yt_menu_channels" },
          { text: "📊 Reports", callback_data: "yt_menu_reports" },
        ],
        [
          { text: "🔍 Research", callback_data: "yt_menu_research" },
          { text: "🔒 Quarantine", callback_data: "yt_menu_quarantine" },
        ],
        [
          { text: "📈 Research Results", callback_data: "yt_menu_results" },
          { text: "📋 Agent Logs", callback_data: "yt_menu_logs" },
        ],
        [
          { text: "🔄 Refresh", callback_data: "yt_menu_refresh" },
        ],
      ],
    },
  });
}

// ── Channel List ──

export async function showChannelList(ctx: BotContext): Promise<void> {
  const channels = await prisma.ytChannel.findMany({
    orderBy: { createdAt: "desc" },
    select: { channelId: true, nicheVertical: true, productionFormat: true, tier: true, trafficStatus: true, totalPublished: true },
  });

  if (channels.length === 0) {
    await ctx.answerCbQuery?.("No channels");
    await ctx.editMessageText("📭 *No YouTube channels registered.*\n\nUse /yt_channel_add to add one.", {
      
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
    return;
  }

  const lines = channels.map((ch, i) => {
    const statusIcon = ch.trafficStatus === "quarantine" ? "🔒" : ch.trafficStatus === "growing" ? "📈" : ch.trafficStatus === "established" ? "✅" : "⚪";
    return `${statusIcon} *${ch.channelId}*\n   ${ch.nicheVertical} | ${ch.tier} | ${ch.totalPublished}v`;
  });

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(`📺 *YouTube Channels*\n\n${lines.join("\n\n")}`, {
    
    reply_markup: {
      inline_keyboard: [
        ...channels.map((ch) => [{ text: `📊 ${ch.channelId}`, callback_data: `yt_channel_${ch.channelId}` }]),
        [{ text: "🔙 Back", callback_data: "yt_menu_refresh" }],
      ],
    },
  });
}

// ── Channel Detail ──

export async function showChannelDetail(ctx: BotContext, channelId: string): Promise<void> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel) {
    await ctx.answerCbQuery?.("Channel not found");
    return;
  }

  const recentVideos = await prisma.ytPublishedVideo.findMany({
    where: { channelId },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { videoId: true, title: true, status: true, publishedAt: true },
  });

  const statusIcon = channel.trafficStatus === "quarantine" ? "🔒" : channel.trafficStatus === "growing" ? "📈" : "⚪";
  const videoLines = recentVideos.length > 0
    ? recentVideos.map((v) => `  • ${v.status === "breakout" ? "🔥" : "📹"} ${v.title || v.videoId} [${v.status}]`).join("\n")
    : "  No videos yet";

  const text = [
    `${statusIcon} *Channel: ${channelId}*`,
    "",
    `Niche: *${channel.nicheVertical}* | Format: ${channel.productionFormat}`,
    `Tier: *${channel.tier}* | Status: *${channel.trafficStatus}*`,
    `Country: ${channel.targetCountry || "N/A"} | Language: ${channel.targetLanguage || "N/A"}`,
    `Published: *${channel.totalPublished}* total | Age: ${channel.channelAgeDays} days`,
    `Score: ${channel.trafficScore || "N/A"}`,
    "",
    "*Recent Videos:*",
    videoLines,
  ].join("\n");

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(text, {
    
    reply_markup: {
      inline_keyboard: [
        [{ text: "📈 View Metrics", callback_data: `yt_metrics_${channelId}` }],
        [{ text: "🔙 Back to Channels", callback_data: "yt_menu_channels" }],
      ],
    },
  });
}

// ── Reports ──

export async function showReports(ctx: BotContext): Promise<void> {
  const channels = await prisma.ytChannel.findMany({
    select: { channelId: true, nicheVertical: true, tier: true, totalPublished: true, trafficStatus: true },
  });

  if (channels.length === 0) {
    await ctx.answerCbQuery?.("No data");
    await ctx.editMessageText("📊 *No channel data yet.*", {
      
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
    return;
  }

  const totalPublished = channels.reduce((sum: number, ch: { totalPublished: number }) => sum + ch.totalPublished, 0);
  const growing = channels.filter((ch: { trafficStatus: string }) => ch.trafficStatus === "growing").length;
  const quarantined = channels.filter((ch: { trafficStatus: string }) => ch.trafficStatus === "quarantine").length;

  const lines = channels.map((ch: { channelId: string; nicheVertical: string; tier: string; totalPublished: number; trafficStatus: string }) =>
    `• ${ch.channelId} | ${ch.nicheVertical} | ${ch.tier} | ${ch.totalPublished}v | ${ch.trafficStatus}`
  );

  const text = [
    "📊 *YouTube Reports*",
    "",
    `Total Channels: *${channels.length}*`,
    `Total Videos: *${totalPublished}*`,
    `Growing: *${growing}* | Quarantined: *${quarantined}*`,
    "",
    "*Channel List:*",
    ...lines,
  ].join("\n");

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(text, {
    
    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
  });
}

// ── Research ──

export async function triggerResearch(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.("Running research...");
  await ctx.editMessageText("🔍 Running Niche + CPM Research...\n\nPlease wait, this may take a moment.");

  try {
    const result = await runNicheCpmResearch();
    const topOpps = result.recommendations.slice(0, 3);
    const lines = topOpps.map((r: { nicheVertical: string; targetCountry: string; estimatedCpm: number; priority: string }, i: number) =>
      `${i + 1}. *${r.nicheVertical}* x ${r.targetCountry} | CPM USD ${r.estimatedCpm} | ${r.priority}`
    );

    const text = [
      "🔍 *Research Complete*",
      "",
      "*Top Opportunities:*",
      ...lines,
      "",
      "View full results: /yt_research_results",
    ].join("\n");

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
  } catch (err) {
    await ctx.editMessageText("❌ Research failed: " + String(err), {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
  }
}

// ── Research Results ──

export async function showResearchResults(ctx: BotContext): Promise<void> {
  const research = await getLatestResearch();
  if (!research) {
    await ctx.answerCbQuery?.("No results");
    await ctx.editMessageText("📭 *No research results yet.*\n\nRun research first.", {
      
      reply_markup: { inline_keyboard: [[{ text: "🔍 Run Research", callback_data: "yt_menu_research" }], [{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
    return;
  }

  const topCpm = Object.entries(research.cpmSnapshot)
    .sort((a: [string, { cpmUsd: number }], b: [string, { cpmUsd: number }]) => b[1].cpmUsd - a[1].cpmUsd)
    .slice(0, 5)
    .map(([country, data]: [string, { cpmUsd: number; trend: string }]) => `• ${country}: USD ${data.cpmUsd} (${data.trend})`);

  const text = [
    `📈 *Latest Research* (${research.researchDate.split("T")[0]})`,
    "",
    "*Top CPM Countries:*",
    ...topCpm,
    "",
    `Niches analyzed: ${research.nicheAnalysis.length}`,
    `Recommendations: ${research.recommendations.length}`,
  ].join("\n");

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(text, {
    
    reply_markup: { inline_keyboard: [[{ text: "🔄 Re-run Research", callback_data: "yt_menu_research" }], [{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
  });
}

// ── Quarantine ──

export async function showQuarantine(ctx: BotContext): Promise<void> {
  const quarantined = await prisma.ytChannel.findMany({
    where: { trafficStatus: "quarantine" },
    select: { channelId: true, nicheVertical: true, quarantineStarted: true, channelAgeDays: true },
  });

  if (quarantined.length === 0) {
    await ctx.answerCbQuery?.("No quarantine");
    await ctx.editMessageText("✅ *No channels in quarantine.*", {
      
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
    return;
  }

  const lines = quarantined.map((ch: { channelId: string; nicheVertical: string; quarantineStarted: Date | null; channelAgeDays: number }) => {
    const since = ch.quarantineStarted ? new Date(ch.quarantineStarted).toISOString().split("T")[0] : "N/A";
    return `🔒 *${ch.channelId}*\n   ${ch.nicheVertical} | Age: ${ch.channelAgeDays}d | Since: ${since}`;
  });

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(`🔒 *Quarantine Status*\n\n${lines.join("\n\n")}`, {
    
    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
  });
}

// ── Agent Logs ──

export async function showAgentLogs(ctx: BotContext): Promise<void> {
  const logs = await (prisma as any).ytAgentTaskLog?.findMany?.({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { agentName: true, phase: true, status: true, startedAt: true },
  }) ?? [];

  if (logs.length === 0) {
    await ctx.answerCbQuery?.("No logs");
    await ctx.editMessageText("📋 *No agent task logs yet.*", {
      
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
    });
    return;
  }

  const lines = logs.map((l: { agentName: string; phase: string | null; status: string | null; startedAt: Date | null }) => {
    const time = l.startedAt ? new Date(l.startedAt).toISOString().split("T")[1]?.split(".")[0] : "N/A";
    const icon = l.status === "completed" ? "✅" : l.status === "failed" ? "❌" : "⏳";
    return `${icon} ${time} | ${l.agentName} | ${l.phase || "N/A"} | ${l.status || "N/A"}`;
  });

  await ctx.answerCbQuery?.();
  await ctx.editMessageText(`📋 *Agent Task Logs (last 10)*\n\n${lines.join("\n")}`, {
    
    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "yt_menu_refresh" }]] },
  });
}
