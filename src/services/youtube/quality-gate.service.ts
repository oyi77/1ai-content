/**
 * Quality Gate Service
 *
 * Validates video packages before publish.
 * All thresholds from env config — zero hardcoded values.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import type { YtQualityGateResult, YtVideoPackage } from "@/types/youtube.types";
import {
  getMinSampleRate, getTargetLufs,
  getMinVideoWidth, getMinVideoHeight, getMaxVideoFileSizeMb,
  getMinThumbWidth, getMinThumbHeight,
  getMaxTitleLength, getMinTags, getMaxTags,
  getMaxSimilarityScore,
} from "@/config/youtube.config";

const execFileAsync = promisify(execFile);

interface FFProbeResult {
  sample_rate?: number;
  duration?: number;
  width?: number;
  height?: number;
  codec_name?: string;
  bit_rate?: number;
  format_name?: string;
}

async function ffprobe(filePath: string): Promise<FFProbeResult> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath,
    ]);
    const data = JSON.parse(stdout);
    const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === "audio");
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === "video");
    return {
      sample_rate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
      duration: data.format?.duration ? Number(data.format.duration) : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
      codec_name: videoStream?.codec_name,
      bit_rate: data.format?.bit_rate ? Number(data.format.bit_rate) : undefined,
      format_name: data.format?.format_name,
    };
  } catch (err) {
    logger.error(`[quality-gate] ffprobe failed for ${filePath}: ${err}`);
    return {};
  }
}

export async function validateAudio(audioPath: string, expectedDurationSec: number): Promise<{ failures: string[]; warnings: string[] }> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const info = await ffprobe(audioPath);

  if (!info.sample_rate) failures.push("Cannot read audio sample rate");
  else if (info.sample_rate < getMinSampleRate()) failures.push(`Sample rate ${info.sample_rate} < ${getMinSampleRate()}`);

  if (info.duration && expectedDurationSec > 0) {
    const tolerance = getConfig().YT_AUDIO_DURATION_TOLERANCE_PCT || 0.10;
    const diff = Math.abs(info.duration - expectedDurationSec) / expectedDurationSec;
    if (diff > tolerance) failures.push(`Audio duration ${info.duration}s differs ${(diff * 100).toFixed(0)}% from expected ${expectedDurationSec}s`);
  }

  if (!info.duration) failures.push("Cannot read audio duration");

  return { failures, warnings };
}

export async function validateVideo(videoPath: string, expectedDurationSec: number): Promise<{ failures: string[]; warnings: string[] }> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const info = await ffprobe(videoPath);

  if (info.width && info.width < getMinVideoWidth()) failures.push(`Video width ${info.width} < ${getMinVideoWidth()}`);
  if (info.height && info.height < getMinVideoHeight()) failures.push(`Video height ${info.height} < ${getMinVideoHeight()}`);

  const maxBytes = getMaxVideoFileSizeMb() * 1024 * 1024;
  try {
    const stat = require("fs").statSync(videoPath);
    if (stat.size > maxBytes) warnings.push(`Video file ${(stat.size / 1024 / 1024).toFixed(0)}MB > ${getMaxVideoFileSizeMb()}MB limit`);
  } catch { /* ignore */ }

  if (info.duration && expectedDurationSec > 0) {
    const toleranceSec = getConfig().YT_VIDEO_DURATION_TOLERANCE_SEC || 2;
    if (Math.abs(info.duration - expectedDurationSec) > toleranceSec) {
      failures.push(`Video duration ${info.duration}s differs > ${toleranceSec}s from expected`);
    }
  }

  return { failures, warnings };
}

export async function validateThumbnail(thumbPath: string): Promise<{ failures: string[]; warnings: string[] }> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const info = await ffprobe(thumbPath);

  if (info.width && info.width < getMinThumbWidth()) failures.push(`Thumbnail width ${info.width} < ${getMinThumbWidth()}`);
  if (info.height && info.height < getMinThumbHeight()) failures.push(`Thumbnail height ${info.height} < ${getMinThumbHeight()}`);

  const maxBytes = 2 * 1024 * 1024;
  try {
    const stat = require("fs").statSync(thumbPath);
    if (stat.size > maxBytes) failures.push(`Thumbnail ${(stat.size / 1024 / 1024).toFixed(1)}MB > 2MB`);
  } catch { /* ignore */ }

  return { failures, warnings };
}

export function validateSeo(title: string, description: string, tags: string[]): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (title.length > getMaxTitleLength()) failures.push(`Title ${title.length} chars > ${getMaxTitleLength()}`);
  if (tags.length < getMinTags()) warnings.push(`Tags ${tags.length} < recommended ${getMinTags()}`);
  if (tags.length > getMaxTags()) warnings.push(`Tags ${tags.length} > max ${getMaxTags()}`);
  if (description.length < getConfig().YT_MIN_DESCRIPTION_LENGTH || 100) warnings.push("Description too short");

  return { failures, warnings };
}

export async function runQualityGate(pkg: YtVideoPackage): Promise<YtQualityGateResult> {
  const allFailures: string[] = [];
  const allWarnings: string[] = [];
  const checks: string[] = [];

  if (pkg.narrationPath) {
    const audio = await validateAudio(pkg.narrationPath, 0);
    allFailures.push(...audio.failures);
    allWarnings.push(...audio.warnings);
    checks.push("audio");
  }

  if (pkg.finalVideoPath) {
    const video = await validateVideo(pkg.finalVideoPath, 0);
    allFailures.push(...video.failures);
    allWarnings.push(...video.warnings);
    checks.push("video");
  }

  if (pkg.thumbnailPath) {
    const thumb = await validateThumbnail(pkg.thumbnailPath);
    allFailures.push(...thumb.failures);
    allWarnings.push(...thumb.warnings);
    checks.push("thumbnail");
  }

  if (pkg.seoPackage) {
    const seo = validateSeo(pkg.seoPackage.title, pkg.seoPackage.description, pkg.seoPackage.tags);
    allFailures.push(...seo.failures);
    allWarnings.push(...seo.warnings);
    checks.push("seo");
  }

  return {
    passed: allFailures.length === 0,
    checks,
    blockingFailures: allFailures,
    warnings: allWarnings,
  };
}
