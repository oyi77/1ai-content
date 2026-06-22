/**
 * Visual Assembly Service (FASE 2C)
 *
 * Assembles narrated slideshows and music visualizers via FFmpeg.
 * All config from env — zero hardcoded values.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { getMinVideoWidth, getMinVideoHeight } from "@/config/youtube.config";

const execFileAsync = promisify(execFile);

interface AssemblyResult {
  videoPath: string;
  duration: number;
}

interface TimestampMarker {
  time: string;
  label: string;
  segmentIndex: number;
}

export async function assembleNarratedSlideshow(
  imagePaths: string[],
  narrationPath: string,
  timestamps: TimestampMarker[],
  outputDir: string,
): Promise<AssemblyResult> {
  const outputPath = `${outputDir}/slideshow.mp4`;
  const concatPath = `${outputDir}/concat_list.txt`;
  const duration = getConfig().YT_TIER1_DURATION_MIN || 15;

  try {
    const fs = require("fs");
    const slideDuration = Math.ceil((duration * 60) / Math.max(imagePaths.length, 1));

    const lines: string[] = [];
    for (const img of imagePaths) {
      lines.push(`file '${img}'`);
      lines.push(`duration ${slideDuration}`);
    }
    lines.push(`file '${imagePaths[imagePaths.length - 1]}'`);
    fs.writeFileSync(concatPath, lines.join("\n"));

    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
      "-vf", `scale=${getMinVideoWidth()}:${getMinVideoHeight()}:force_original_aspect_ratio=decrease,pad=${getMinVideoWidth()}:${getMinVideoHeight()}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-t", String(duration * 60),
      outputPath,
    ]);

    const finalPath = `${outputDir}/final_video.mp4`;
    await execFileAsync("ffmpeg", [
      "-y", "-i", outputPath, "-i", narrationPath,
      "-c:v", "copy", "-c:a", "aac", "-shortest",
      finalPath,
    ]);

    logger.info(`[visual-assembly] Assembled narrated slideshow: ${finalPath}`);
    return { videoPath: finalPath, duration: duration * 60 };
  } catch (err) {
    logger.error(`[visual-assembly] Assembly failed: ${err}`);
    throw err;
  }
}

export async function assembleMusicVisual(
  audioPath: string,
  visualPath: string,
  outputDir: string,
): Promise<AssemblyResult> {
  const outputPath = `${outputDir}/music_video.mp4`;

  try {
    await execFileAsync("ffmpeg", [
      "-y", "-stream_loop", "-1", "-i", visualPath,
      "-i", audioPath,
      "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest",
      "-vf", `scale=${getMinVideoWidth()}:${getMinVideoHeight()}:force_original_aspect_ratio=decrease,pad=${getMinVideoWidth()}:${getMinVideoHeight()}:(ow-iw)/2:(oh-ih)/2`,
      outputPath,
    ]);

    logger.info(`[visual-assembly] Assembled music visual: ${outputPath}`);
    return { videoPath: outputPath, duration: 0 };
  } catch (err) {
    logger.error(`[visual-assembly] Music visual assembly failed: ${err}`);
    throw err;
  }
}
