/**
 * Content Ideation Service (FASE 1)
 *
 * Generates batch ideas per channel, niche-aware.
 * 70% proven theme, 30% experiment. All config from env.
 */

import { getConfig } from "@/config/env";
import { logger} from "@/utils/logger";
import { prisma } from "@/config/database";
import { getProvenThemeRatio } from "@/config/youtube.config";
import { NICHE_VERTICALS } from "@/config/youtube.config";
import type { YtIdeaCreate } from "@/types/youtube.types";
import { NotFoundError, ValidationError } from "@/utils/app-errors";

interface IdeaBatch {
  batchId: string;
  channelId: string;
  nicheVertical: string;
  productionFormat: string;
  ideas: YtIdeaCreate[];
}

export async function generateIdeas(channelId: string, batchSize = 15): Promise<IdeaBatch> {
  const channel = await prisma.ytChannel.findUnique({ where: { channelId } });
  if (!channel) throw new NotFoundError("Channel", channelId);

  const niche = channel.nicheVertical as keyof typeof NICHE_VERTICALS;
  const nicheConfig = NICHE_VERTICALS[niche];
  if (!nicheConfig) throw new ValidationError(`Unknown niche vertical: ${niche}`);

  const pastVideos = await prisma.ytPublishedVideo.findMany({
    where: { channelId },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: { title: true },
  });
  const pastTitles = pastVideos.map((v: { title: string | null }) => v.title || "");

  const batchId = crypto.randomUUID();
  const provenRatio = getProvenThemeRatio();
  const provenCount = Math.ceil(batchSize * provenRatio);
  const experimentCount = batchSize - provenCount;

  const ideas: YtIdeaCreate[] = [];

  for (let i = 0; i < provenCount; i++) {
    ideas.push({
      channelId,
      nicheVertical: niche,
      productionFormat: nicheConfig.productionFormat,
      batchId,
      titleDraft: `${nicheConfig.name} Story ${i + 1}`,
      nicheCategory: niche,
      hookType: "mystery_question",
      toneVariant: nicheConfig.toneVariants[i % nicheConfig.toneVariants.length],
      summary: `Proven theme content for ${niche}`,
      potentialScore: "SEDANG",
      priority: "NORMAL",
    });
  }

  for (let i = 0; i < experimentCount; i++) {
    ideas.push({
      channelId,
      nicheVertical: niche,
      productionFormat: nicheConfig.productionFormat,
      batchId,
      titleDraft: `Experimental ${nicheConfig.name} ${i + 1}`,
      nicheCategory: niche,
      hookType: "shocking_fact",
      toneVariant: nicheConfig.toneVariants[i % nicheConfig.toneVariants.length],
      summary: `Experimental content for ${niche}`,
      potentialScore: "RENDAH",
      priority: "NORMAL",
    });
  }

  const filtered = ideas.filter((idea) => {
    const title = idea.titleDraft || "";
    return !pastTitles.some((past) => past && similarity(title, past) > (getConfig().YT_MAX_SIMILARITY_SCORE || 0.70));
  });

  await prisma.ytIdea.createMany({
    data: filtered.map((idea) => ({
      channelId: idea.channelId,
      nicheVertical: idea.nicheVertical,
      productionFormat: idea.productionFormat,
      batchId: idea.batchId,
      titleDraft: idea.titleDraft,
      nicheCategory: idea.nicheCategory,
      hookType: idea.hookType,
      toneVariant: idea.toneVariant,
      summary: idea.summary,
      potentialScore: idea.potentialScore,
      priority: idea.priority || "NORMAL",
      status: "pending",
    })),
  });

  logger.info(`[ideation] Generated ${filtered.length} ideas for channel ${channelId}`);
  return { batchId, channelId, nicheVertical: niche, productionFormat: nicheConfig.productionFormat, ideas: filtered };
}

function similarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function getPendingIdeas(channelId: string, limit = 5): Promise<Array<{ id: string; titleDraft: string | null; summary: string | null; toneVariant: string | null; potentialScore: string | null }>> {
  return prisma.ytIdea.findMany({
    where: { channelId, status: "pending" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true, titleDraft: true, summary: true, toneVariant: true, potentialScore: true },
  });
}
