/**
 * YouTube Data API v3 Wrapper
 *
 * Minimal surface consumed by the reoptimizer workflow:
 * OAuth token resolution + video metadata updates.
 */

import axios from "axios";
import { NotFoundError } from "@/utils/app-errors";

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import type { YtSeoPackage } from "@/types/youtube.types";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

async function getAccessToken(channelId: string): Promise<string> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel?.ytOauthToken) throw new NotFoundError("OAuth token", `channel ${channelId}`);
  const tokens = JSON.parse(channel.ytOauthToken);
  return tokens.access_token || "";
}

export async function updateVideoMetadata(
  videoId: string,
  channelId: string,
  updates: Partial<Pick<YtSeoPackage, "title" | "description" | "tags">>,
): Promise<boolean> {
  try {
    const token = await getAccessToken(channelId);
    await axios.put(`${YT_API_BASE}/videos?part=snippet`, {
      id: videoId,
      snippet: { title: updates.title, description: updates.description, tags: updates.tags, categoryId: "22" },
    }, { headers: { Authorization: `Bearer ${token}` } });

    return true;
  } catch (err) {
    logger.error(`[yt-api] Update failed for ${videoId}: ${err}`);
    return false;
  }
}
