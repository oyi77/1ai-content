/**
 * YouTube Data API v3 Wrapper
 *
 * Handles OAuth2, uploads, analytics, and video management.
 * All API costs tracked via quota-tracker.
 */

import axios from "axios";
import { NotFoundError } from "@/utils/app-errors";

import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { recordUsage, canPerformAction } from "./quota-tracker.service";
import type { YtSeoPackage } from "@/types/youtube.types";

interface UploadParams {
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  videoPath: string;
  thumbnailPath?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  scheduledAt?: Date;
}

interface UploadResult {
  success: boolean;
  videoId?: string;
  error?: string;
}

interface AnalyticsResult {
  views: number;
  ctr: number;
  avgViewPct: number;
  avdSeconds: number;
  trafficSrc: Record<string, unknown>;
}

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

async function getAccessToken(channelId: string): Promise<string> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel?.ytOauthToken) throw new NotFoundError("OAuth token", `channel ${channelId}`);
  const tokens = JSON.parse(channel.ytOauthToken);
  return tokens.access_token || "";
}

export async function refreshToken(channelId: string): Promise<boolean> {
  try {
    const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
    if (!channel?.ytOauthToken) throw new NotFoundError("OAuth token");
    const tokens = JSON.parse(channel.ytOauthToken);
    const config = getConfig();
    const res = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: config.YT_CLIENT_ID,
      client_secret: config.YT_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    });
    await prisma.ytChannel.update({
      where: { channelId },
      data: { ytOauthToken: JSON.stringify({ ...tokens, access_token: res.data.access_token }) },
    });
    return true;
  } catch (err) {
    logger.error(`[yt-api] Token refresh failed for ${channelId}: ${err}`);
    return false;
  }
}

export async function uploadVideo(params: UploadParams): Promise<UploadResult> {
  if (!canPerformAction("upload")) {
    return { success: false, error: "Daily API quota exceeded" };
  }

  try {
    const token = await getAccessToken(params.channelId);
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("snippet", JSON.stringify({ title: params.title, description: params.description, tags: params.tags, categoryId: "22" }));
    form.append("status", JSON.stringify({ privacyStatus: params.privacyStatus || "private", publishAt: params.scheduledAt?.toISOString(), selfDeclaredMadeForKids: false }));
    form.append("file", require("fs").createReadStream(params.videoPath));

    const res = await axios.post(`${YT_API_BASE}/videos?part=snippet,status&uploadType=multipart`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const videoId = res.data.id;
    if (!videoId) return { success: false, error: "No video ID returned" };

    recordUsage("upload");

    if (params.thumbnailPath) {
      const token2 = await getAccessToken(params.channelId);
      const thumbForm = new (await import("form-data")).default();
      thumbForm.append("file", require("fs").createReadStream(params.thumbnailPath));
      await axios.post(`${YT_API_BASE}/thumbnails/set?videoId=${videoId}&uploadType=multipart`, thumbForm, {
        headers: { ...thumbForm.getHeaders(), Authorization: `Bearer ${token2}` },
      });
      recordUsage("upload");
    }

    logger.info(`[yt-api] Uploaded video ${videoId} to channel ${params.channelId}`);
    return { success: true, videoId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[yt-api] Upload failed: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function updateVideoMetadata(
  videoId: string,
  channelId: string,
  updates: Partial<Pick<YtSeoPackage, "title" | "description" | "tags">>,
): Promise<boolean> {
  if (!canPerformAction("update")) return false;

  try {
    const token = await getAccessToken(channelId);
    await axios.put(`${YT_API_BASE}/videos?part=snippet`, {
      id: videoId,
      snippet: { title: updates.title, description: updates.description, tags: updates.tags, categoryId: "22" },
    }, { headers: { Authorization: `Bearer ${token}` } });

    recordUsage("update");
    return true;
  } catch (err) {
    logger.error(`[yt-api] Update failed for ${videoId}: ${err}`);
    return false;
  }
}

export async function getAnalytics(
  channelId: string,
  videoId: string,
  _daysSincePublished: number,
): Promise<AnalyticsResult | null> {
  if (!canPerformAction("read")) return null;

  try {
    const token = await getAccessToken(channelId);
    const statsRes = await axios.get(`${YT_API_BASE}/videos`, {
      params: { part: "statistics", id: videoId },
      headers: { Authorization: `Bearer ${token}` },
    });
    recordUsage("read");
    const stats = statsRes.data.items?.[0]?.statistics;
    if (!stats) return null;

    return {
      views: Number(stats.viewCount || 0),
      ctr: 0,
      avgViewPct: 0,
      avdSeconds: 0,
      trafficSrc: {},
    };
  } catch (err) {
    logger.error(`[yt-api] Analytics failed for ${videoId}: ${err}`);
    return null;
  }
}

export async function getChannelInfo(channelId: string): Promise<Record<string, unknown> | null> {
  try {
    const token = await getAccessToken(channelId);
    const res = await axios.get(`${YT_API_BASE}/channels`, {
      params: { part: "snippet,statistics", mine: true },
      headers: { Authorization: `Bearer ${token}` },
    });
    recordUsage("read");
    return (res.data.items?.[0] as Record<string, unknown>) || null;
  } catch (err) {
    logger.error(`[yt-api] Channel info failed: ${err}`);
    return null;
  }
}
