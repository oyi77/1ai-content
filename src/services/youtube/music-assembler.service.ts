/**
 * Music Assembler Service (Pipeline B)
 *
 * Merges audio track + visual loop into final video via FFmpeg.
 * All config from env — zero hardcoded values.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "@/utils/logger";
import { getMinVideoWidth, getMinVideoHeight } from "@/config/youtube.config";

const execFileAsync = promisify(execFile);

interface AssemblyResult {
  videoPath: string;
  duration: number;
}

export async function assembleMusicVideo(
  audioPath: string,
  visualPath: string,
  outputDir: string,
): Promise<AssemblyResult> {
  const outputPath = `${outputDir}/music_video.mp4`;

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-stream_loop", "-1", "-i", visualPath,
      "-i", audioPath,
      "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-vf", `scale=${getMinVideoWidth()}:${getMinVideoHeight()}:force_original_aspect_ratio=decrease,pad=${getMinVideoWidth()}:${getMinVideoHeight()}:(ow-iw)/2:(oh-ih)/2`,
      "-shortest",
      "-movflags", "+faststart",
      outputPath,
    ]);

    const stat = require("fs").statSync(outputPath);
    logger.info(`[music-assembler] Assembled: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);

    return { videoPath: outputPath, duration: 0 };
  } catch (err) {
    logger.error(`[music-assembler] Assembly failed: ${err}`);
    throw err;
  }
}
