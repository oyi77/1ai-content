/**
 * Production Orchestrator (FASE 2)
 *
 * Routes production by production_format.
 * Narrated slideshow: script → voice → visual → thumbnail → seo
 * Music visualizer: music source → visual → assembly → thumbnail → seo
 */

import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { NICHE_VERTICALS } from "@/config/youtube.config";
import { generateScript } from "./script-writer.service";
import { synthesizeNarration } from "./voice-synthesis.service";
import { assembleNarratedSlideshow, assembleMusicVisual } from "./visual-assembly.service";
import { generateThumbnail } from "./thumbnail.service";
import { generateSeoPackage } from "./seo-optimizer.service";
import { generateMusic } from "./music-source.service";
import { runQualityGate } from "./quality-gate.service";
import type { NicheVertical, ChannelTier } from "@/config/youtube.config";
import type { YtVideoPackage } from "@/types/youtube.types";

interface ProductionResult {
  success: boolean;
  videoPackage?: YtVideoPackage;
  error?: string;
}

export async function produceVideo(ideaId: string, outputDir: string): Promise<ProductionResult> {
  const idea = await prisma.ytIdea.findUnique({ where: { id: ideaId } });
  if (!idea) return { success: false, error: `Idea ${ideaId} not found` };

  const channel = await prisma.ytChannel.findUnique({ where: { channelId: idea.channelId } });
  if (!channel) return { success: false, error: `Channel ${idea.channelId} not found` };

  const niche = channel.nicheVertical as NicheVertical;
  const nicheConfig = NICHE_VERTICALS[niche];
  if (!nicheConfig) return { success: false, error: `Unknown niche: ${niche}` };

  const format = nicheConfig.productionFormat;
  const tier = (channel.tier || "tier_1_cold_start") as ChannelTier;
  const outputSubDir = `${outputDir}/${ideaId}`;

  require("fs").mkdirSync(outputSubDir, { recursive: true });

  try {
    if (format === "narrated_slideshow") {
      return await produceNarrated(idea, channel, niche, tier, outputSubDir);
    } else {
      return await produceMusic(idea, channel, niche, outputSubDir);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[production] Failed for idea ${ideaId}: ${msg}`);
    return { success: false, error: msg };
  }
}

async function produceNarrated(idea: { id: string; titleDraft: string | null; summary: string | null; toneVariant: string | null }, channel: { channelId: string; tier: string | null }, niche: NicheVertical, tier: ChannelTier, outputDir: string): Promise<ProductionResult> {
  const title = idea.titleDraft || "Untitled";
  const summary = idea.summary || "";
  const tone = idea.toneVariant || "misteri";

  logger.info(`[production] Script writing for "${title}"`);
  const script = await generateScript(summary, tone, tier, title);

  logger.info(`[production] Voice synthesis for "${title}"`);
  const narration = await synthesizeNarration(script.script, tone, `${outputDir}/narration.mp3`);

  logger.info(`[production] Visual assembly for "${title}"`);
  const images = Array.from({ length: Math.min(script.timestamps.length, 10) }, (_, i) => `${outputDir}/img_${i}.png`);
  for (const imgPath of images) {
    require("fs").writeFileSync(imgPath, Buffer.alloc(0));
  }
  const visual = await assembleNarratedSlideshow(images, narration.audioPath, script.timestamps, outputDir);

  logger.info(`[production] Thumbnail for "${title}"`);
  const thumbnail = await generateThumbnail(title, tone, niche, `${outputDir}/thumbnail.png`);

  logger.info(`[production] SEO package for "${title}"`);
  const seo = await generateSeoPackage(title, summary, niche);

  const pkg: YtVideoPackage = {
    ideaId: idea.id,
    channelId: channel.channelId,
    nicheVertical: niche,
    productionFormat: "narrated_slideshow",
    scriptPath: `${outputDir}/script.md`,
    narrationPath: narration.audioPath,
    finalVideoPath: visual.videoPath,
    thumbnailPath: thumbnail.thumbnailPath,
    seoPackage: seo,
  };

  const quality = await runQualityGate(pkg);
  if (!quality.passed) {
    logger.warn(`[production] Quality gate failed: ${quality.blockingFailures.join(", ")}`);
  }

  return { success: true, videoPackage: pkg };
}

async function produceMusic(idea: { id: string; titleDraft: string | null; summary: string | null; genre: string | null; mood: string | null; durationMinutes: number | null }, channel: { channelId: string }, niche: NicheVertical, outputDir: string): Promise<ProductionResult> {
  const title = idea.titleDraft || "Music Mix";
  const genre = idea.genre || "lofi";
  const mood = idea.mood || "chill";
  const duration = idea.durationMinutes || 15;

  logger.info(`[production] Music generation for "${title}"`);
  const music = await generateMusic(genre, mood, duration, `${outputDir}/audio.mp3`);

  logger.info(`[production] Music visual assembly for "${title}"`);
  const visual = await assembleMusicVisual(music.audioPath, `${outputDir}/visual.mp4`, outputDir);

  logger.info(`[production] Thumbnail for "${title}"`);
  const thumbnail = await generateThumbnail(title, mood, niche, `${outputDir}/thumbnail.png`);

  logger.info(`[production] SEO for "${title}"`);
  const seo = await generateSeoPackage(title, idea.summary || "", niche);

  const pkg: YtVideoPackage = {
    ideaId: idea.id,
    channelId: channel.channelId,
    nicheVertical: niche,
    productionFormat: "music_visualizer",
    audioTrackPath: music.audioPath,
    finalVideoPath: visual.videoPath,
    thumbnailPath: thumbnail.thumbnailPath,
    seoPackage: seo,
  };

  return { success: true, videoPackage: pkg };
}
