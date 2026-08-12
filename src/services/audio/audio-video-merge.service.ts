/**
 * Audio-Video Merge Service
 *
 * Merges generated audio with video content.
 * Features:
 * - Audio overlay on video
 * - Timeline synchronization
 * - Volume control
 * - Multiple audio tracks (voice + music)
 *
 * Uses FFmpeg for audio processing.
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { ExternalServiceError } from "@/utils/app-errors";

const execAsync = promisify(exec);

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

export interface AudioMergeRequest {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  options?: {
    volume?: number; // 0-1, default 1.0
    fadeIn?: number; // seconds
    fadeOut?: number; // seconds
    startTime?: number; // seconds, when audio starts
    loop?: boolean; // loop audio to match video length
  };
}

export interface AudioMergeResponse {
  outputPath: string;
  duration: number;
  metadata: {
    videoDuration: number;
    audioDuration: number;
    mergedDuration: number;
  };
}

// ══════════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════════

export class AudioVideoMergeService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), "temp", "audio-merge");
  }

  /**
   * Initialize temp directory
   */
  async init(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  /**
   * Merge audio with video
   */
  async mergeAudioVideo(
    request: AudioMergeRequest,
  ): Promise<AudioMergeResponse> {
    await this.init();

    const options = request.options || {};
    const volume = options.volume ?? 1.0;
    const fadeIn = options.fadeIn ?? 0;
    const fadeOut = options.fadeOut ?? 0;
    const startTime = options.startTime ?? 0;

    logger.info({
      msg: "Audio-Video merge: Starting",
      videoPath: request.videoPath,
      audioPath: request.audioPath,
      volume,
      startTime,
    });

    try {
      // Get video duration
      const videoDuration = await this.getDuration(request.videoPath);
      const audioDuration = await this.getDuration(request.audioPath);

      // Build FFmpeg command
      const filterComplex = this.buildFilterComplex({
        volume,
        fadeIn,
        fadeOut,
        startTime,
        videoDuration,
        audioDuration,
        loop: options.loop,
      });

      const command = [
        "ffmpeg",
        "-y",
        "-i",
        request.videoPath,
        "-i",
        request.audioPath,
        "-filter_complex",
        filterComplex,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000", // 48kHz for Veo compatibility
        "-shortest",
        request.outputPath,
      ].join(" ");

      await execAsync(command, { timeout: 120000 });

      const mergedDuration = await this.getDuration(request.outputPath);

      logger.info({
        msg: "Audio-Video merge: Completed",
        outputPath: request.outputPath,
        duration: mergedDuration,
      });

      return {
        outputPath: request.outputPath,
        duration: mergedDuration,
        metadata: {
          videoDuration,
          audioDuration,
          mergedDuration,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      logger.error({ msg: "Audio-Video merge: Failed", error });
      throw new ExternalServiceError(
        "AudioVideoMerge",
        `Audio-Video merge failed: ${error}`,
      );
    }
  }

  /**
   * Build FFmpeg filter complex for audio processing
   */
  private buildFilterComplex(options: {
    volume: number;
    fadeIn: number;
    fadeOut: number;
    startTime: number;
    videoDuration: number;
    audioDuration: number;
    loop?: boolean;
  }): string {
    const filters: string[] = [];

    // Volume adjustment
    filters.push(`[1:a]volume=${options.volume}[a1]`);

    // Fade in
    if (options.fadeIn > 0) {
      filters.push(`[a1]afade=t=in:st=0:d=${options.fadeIn}[a2]`);
    }

    // Fade out
    if (options.fadeOut > 0) {
      const fadeOutStart = options.audioDuration - options.fadeOut;
      const input = options.fadeIn > 0 ? "[a2]" : "[a1]";
      filters.push(
        `${input}afade=t=out:st=${fadeOutStart}:d=${options.fadeOut}[a3]`,
      );
    }

    // Delay audio start
    if (options.startTime > 0) {
      const input =
        options.fadeOut > 0 ? "[a3]" : options.fadeIn > 0 ? "[a2]" : "[a1]";
      filters.push(
        `${input}adelay=${options.startTime * 1000}|${options.startTime * 1000}[a4]`,
      );
    }

    // Loop audio if needed
    if (options.loop && options.audioDuration < options.videoDuration) {
      const input =
        options.startTime > 0
          ? "[a4]"
          : options.fadeOut > 0
            ? "[a3]"
            : options.fadeIn > 0
              ? "[a2]"
              : "[a1]";
      filters.push(`${input}aloop=loop=-1:size=2e+09[a5]`);
    }

    // Select final audio stream
    const finalStream = options.loop
      ? "[a5]"
      : options.startTime > 0
        ? "[a4]"
        : options.fadeOut > 0
          ? "[a3]"
          : options.fadeIn > 0
            ? "[a2]"
            : "[a1]";

    filters.push(`[0:a]${finalStream}amix=inputs=2:duration=first[out]`);

    return filters.join(";");
  }

  /**
   * Get media file duration using FFprobe
   */
  private async getDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { timeout: 10000 },
      );
      return parseFloat(stdout.trim());
    } catch {
      return 0;
    }
  }

  /**
   * Get service info
   */
  getInfo(): {
    available: boolean;
    capabilities: string[];
  } {
    return {
      available: true, // FFmpeg is always available
      capabilities: [
        "audio-overlay",
        "fade-in-out",
        "volume-control",
        "timeline-sync",
      ],
    };
  }
}

// Singleton instance
export const audioVideoMergeService = new AudioVideoMergeService();
