/**
 * Video Generation Worker — Helpers
 *
 * Shared utility functions extracted from video-generation.worker.ts.
 */

import { promisify } from "util";
import { execFile as execFileCallback } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { Telegram } from "telegraf";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { VideoPostProcessing } from "@/services/video-post-processing.service";
import { ProviderError } from "@/utils/app-errors";

const execFile = promisify(execFileCallback);
export const VIDEO_DIR = getConfig().VIDEO_DIR;

// ── Progress notification helpers ──

export async function notifyProgress(
  telegram: Telegram,
  chatId: number,
  text: string,
): Promise<void> {
  try {
    await telegram.sendMessage(chatId, text, { disable_notification: true });
  } catch (err) {
    logger.warn("Failed to send progress notification:", err);
  }
}

export function startTimeoutWatcher(
  telegram: Telegram,
  chatId: number,
  thresholdMs: number = 4 * 60 * 1000,
): () => void {
  const timer = setTimeout(() => {
    notifyProgress(
      telegram,
      chatId,
      "\u23f3 Still processing... Taking longer than usual. We\u2019ll notify you when ready.",
    );
  }, thresholdMs);
  return () => clearTimeout(timer);
}

// ── Prompt helpers ──

export function buildPrompt(
  description: string,
  platform: string,
  duration: number,
  customPrompt?: string,
): string {
  const base = customPrompt
    ? `${duration}s ${customPrompt}. Scene context: ${description}`
    : `${duration}s ${description}`;
  return `${base}, high quality, ${platform} format, professional style`;
}

export function getAspectRatio(platform: string): string {
  const ratios: Record<string, string> = {
    tiktok: "9:16",
    shorts: "9:16",
    reels: "9:16",
    facebook: "16:9",
    youtube: "16:9",
    instagram: "4:5",
    square: "1:1",
  };
  return ratios[platform] || "9:16";
}

export function getStyleForNiche(niche: string): string {
  const styles: Record<string, string> = {
    trading: "professional",
    fitness: "energetic",
    cooking: "appetizing",
    tech: "modern",
    travel: "cinematic",
    education: "clear",
  };
  return styles[niche] || "professional";
}

// ── Download & Concatenate ──

export async function downloadVideo(
  url: string,
  outputPath: string,
): Promise<void> {
  await execFile("wget", [
    "-q",
    "--timeout=60",
    "--tries=2",
    "-O",
    outputPath,
    url,
  ]);
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw new ProviderError(
      "download",
      `Download failed or produced empty file: ${url.slice(0, 80)}`,
    );
  }
}

export async function concatenateVideos(
  inputPaths: string[],
  outputPath: string,
  niche?: string,
): Promise<void> {
  await VideoPostProcessing.concatenateWithTransitions(inputPaths, outputPath, {
    niche,
    transitionDuration: 0.5,
  });
}
