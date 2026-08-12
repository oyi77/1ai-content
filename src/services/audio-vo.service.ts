/**
 * Audio & Voice Over Service
 *
 * Pipeline:
 *   1. TTS via edge-tts CLI (free, high quality, generates VTT subtitles)
 *   2. Word-level subtitle estimation from VTT sentence timing
 *   3. SRT generation with configurable segmentation
 *   4. Audio mixing (VO + BGM) via FFmpeg
 *   5. Subtitle burning into video via FFmpeg
 *
 * Voice profiles from: src/config/audio-subtitle-engine.ts
 */

import { logger } from "@/utils/logger";
import { ValidationError, ProviderError } from "@/utils/app-errors";
import { getConfig } from "@/config/env";
import { promisify } from "util";
import {
  exec as execCallback,
  execFile as execFileCallback,
} from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  AI_VOICE_PROFILES,
  CATEGORY_TO_VOICE,
  SUBTITLE_SEGMENTATION,
  SUBTITLE_STYLE_PRESETS,
} from "@/config/audio-subtitle-engine";

const exec = promisify(execCallback);
const execFile = promisify(execFileCallback);

function getAudioDir(): string {
  const dir = getConfig().AUDIO_DIR || "/tmp/audio";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Types ──

export interface TTSResult {
  success: boolean;
  audioPath?: string;
  vttPath?: string;
  subtitleBlocks?: SubtitleBlock[];
  duration?: number;
  error?: string;
}

export interface SubtitleBlock {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface AudioMixResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// ── Edge TTS Voice Map ──

const EDGE_TTS_VOICES: Record<string, string> = {
  "id-ID-Standard-A": "id-ID-ArdiNeural",
  "id-ID-Standard-B": "id-ID-GadisNeural",
  "en-US-Deep-Male": "en-US-GuyNeural",
};

// ── TTS Generation ──

export class AudioVOService {
  /**
   * Generate voice over audio + VTT subtitles using edge-tts CLI.
   */
  static async generateTTS(
    text: string,
    category?: string,
    jobId?: string,
    language?: string,
  ): Promise<TTSResult> {
    const id = jobId || `tts-${Date.now()}`;
    const audioPath = path.join(getAudioDir(), `${id}.mp3`);
    const vttPath = path.join(getAudioDir(), `${id}.vtt`);

    try {
      let edgeVoice: string;
      if (language) {
        // Use language registry for voice selection
        const { getTTSVoice } =
          require("@/config/languages") as typeof import("@/config/languages");
        edgeVoice = getTTSVoice(language);
      } else {
        // Fallback to niche-based voice
        const voiceProfileKey = category
          ? CATEGORY_TO_VOICE[category] || "indonesian_female_soft"
          : "indonesian_female_soft";
        const voiceProfile = AI_VOICE_PROFILES[voiceProfileKey];
        edgeVoice =
          EDGE_TTS_VOICES[voiceProfile?.voice_id] || "id-ID-GadisNeural";
      }

      logger.info(
        `🎙️ Generating TTS: voice=${edgeVoice}, text=${text.slice(0, 50)}...`,
      );

      // Use edge-tts CLI — reliable, generates both audio + VTT subtitles.
      // Pass text as a separate argv entry so it is never interpreted by the shell.
      await execFile(
        "edge-tts",
        [
          "--voice",
          edgeVoice,
          "--text",
          text,
          "--write-media",
          audioPath,
          "--write-subtitles",
          vttPath,
        ],
        { timeout: 60000 },
      );

      if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
        throw new ValidationError(
          "TTS audio file empty or missing",
          "audioFile",
        );
      }

      // Parse VTT into subtitle blocks with word-level estimation
      let subtitleBlocks: SubtitleBlock[] = [];
      let duration = 0;
      if (fs.existsSync(vttPath)) {
        const vttContent = fs.readFileSync(vttPath, "utf-8");
        const sentenceBlocks = parseVTT(vttContent);
        // Split sentences into word-level blocks for karaoke-style subtitles
        subtitleBlocks = splitIntoWordBlocks(sentenceBlocks);
        if (subtitleBlocks.length > 0) {
          duration = subtitleBlocks[subtitleBlocks.length - 1].endTime;
        }
      }

      // Fallback: get duration from ffprobe if VTT is empty
      if (duration === 0) {
        try {
          const probe = await exec(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
            { timeout: 10000 },
          );
          duration = parseFloat(probe.stdout.trim()) || 0;
        } catch (err) {
          logger.debug("Silent cleanup error:", err);
        }
      }

      logger.info(
        `🎙️ TTS generated: ${subtitleBlocks.length} subtitle blocks, ${duration.toFixed(1)}s`,
      );
      return { success: true, audioPath, vttPath, subtitleBlocks, duration };
    } catch (error) {
      logger.error("TTS generation failed:", (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Generate SRT subtitle file from subtitle blocks.
   */
  static generateSRT(blocks: SubtitleBlock[], outputPath: string): string {
    const lines = blocks.map((b) => {
      const start = formatSRTTime(b.startTime);
      const end = formatSRTTime(b.endTime);
      return `${b.index}\n${start} --> ${end}\n${b.text}\n`;
    });
    fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
    return outputPath;
  }

  /**
   * Merge video + voiceover + optional background music using FFmpeg.
   */
  static async mergeAudioVideo(
    videoPath: string,
    ttsPath: string,
    bgmPath?: string,
    outputPath?: string,
    bgmVolume: number = 0.15,
  ): Promise<AudioMixResult> {
    const output = outputPath || videoPath.replace(".mp4", "_voiced.mp4");

    try {
      if (bgmPath && fs.existsSync(bgmPath)) {
        // Full mix: video + TTS + BGM with ducking
        const filter = `[2:a]volume=${bgmVolume}[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`;
        await exec(
          `ffmpeg -y -i "${videoPath}" -i "${ttsPath}" -i "${bgmPath}" ` +
            `-filter_complex "${filter}" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${output}"`,
          { timeout: 120000 },
        );
      } else {
        // Simple: video + TTS only
        await exec(
          `ffmpeg -y -i "${videoPath}" -i "${ttsPath}" ` +
            `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${output}"`,
          { timeout: 60000 },
        );
      }

      if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
        throw new ProviderError("AudioVO", "Merged output empty");
      }

      logger.info(`🎵 Audio merged: ${output}`);
      return { success: true, outputPath: output };
    } catch (error) {
      logger.error("Audio merge failed:", (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Burn subtitles into video using FFmpeg.
   */
  static async burnSubtitles(
    videoPath: string,
    srtPath: string,
    outputPath?: string,
    styleName: string = "clean_minimal",
  ): Promise<AudioMixResult> {
    const output = outputPath || videoPath.replace(".mp4", "_subtitled.mp4");
    const style =
      SUBTITLE_STYLE_PRESETS[styleName] || SUBTITLE_STYLE_PRESETS.clean_minimal;

    const fontFamily = style.font_style.includes("extra_bold")
      ? "Impact"
      : style.font_style.includes("bold")
        ? "Arial"
        : "Helvetica";
    const fontSize = style.font_style.includes("extra_bold")
      ? 28
      : style.font_style.includes("bold")
        ? 24
        : 20;
    const outlineSize =
      style.stroke === "strong" ? 3 : style.stroke === "medium" ? 2 : 1;

    try {
      // Escape the SRT path for FFmpeg subtitles filter
      const escapedSrt = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
      await exec(
        `ffmpeg -y -i "${videoPath}" ` +
          `-vf "subtitles='${escapedSrt}':force_style='FontName=${fontFamily},FontSize=${fontSize},` +
          `PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=${outlineSize},Shadow=1'" ` +
          `-c:a copy "${output}"`,
        { timeout: 120000 },
      );

      if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
        throw new ProviderError("AudioVO", "Subtitled output empty");
      }

      logger.info(`📝 Subtitles burned: ${output}`);
      return { success: true, outputPath: output };
    } catch (error) {
      logger.error("Subtitle burn failed:", (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Full VO pipeline: TTS → Subtitles → Merge Audio → Burn Subtitles
   */
  static async fullVOPipeline(
    videoPath: string,
    script: string,
    category: string,
    jobId: string,
    options?: {
      bgmPath?: string;
      subtitleStyle?: string;
      bgmVolume?: number;
      language?: string;
    },
  ): Promise<AudioMixResult> {
    try {
      logger.info(`🎬 Starting full VO pipeline for ${jobId}`);

      // Step 1: Generate TTS
      const tts = await this.generateTTS(
        script,
        category,
        jobId,
        options?.language,
      );
      if (!tts.success || !tts.audioPath) {
        return { success: false, error: `TTS failed: ${tts.error}` };
      }

      // Step 2: Generate SRT from subtitle blocks
      const srtPath = path.join(getAudioDir(), `${jobId}.srt`);
      if (tts.subtitleBlocks && tts.subtitleBlocks.length > 0) {
        this.generateSRT(tts.subtitleBlocks, srtPath);
        logger.info(
          `📝 Generated ${tts.subtitleBlocks.length} subtitle blocks`,
        );
      }

      // Step 3: Merge audio with video
      const mergedPath = path.join(getAudioDir(), `${jobId}_voiced.mp4`);
      const merge = await this.mergeAudioVideo(
        videoPath,
        tts.audioPath,
        options?.bgmPath,
        mergedPath,
        options?.bgmVolume,
      );
      if (!merge.success || !merge.outputPath) {
        return { success: false, error: `Audio merge failed: ${merge.error}` };
      }

      // Step 4: Burn subtitles (if we have them)
      if (fs.existsSync(srtPath) && fs.statSync(srtPath).size > 0) {
        const finalPath = path.join(getAudioDir(), `${jobId}_final.mp4`);
        const burn = await this.burnSubtitles(
          merge.outputPath,
          srtPath,
          finalPath,
          options?.subtitleStyle,
        );
        if (burn.success && burn.outputPath) {
          logger.info(`🎬 Full VO pipeline complete: ${finalPath}`);
          return { success: true, outputPath: burn.outputPath };
        }
        // Subtitle burn failed — return voiced version without subtitles
        logger.warn("📝 Subtitle burn failed, returning voiced-only version");
      }

      return { success: true, outputPath: merge.outputPath };
    } catch (error) {
      logger.error("Full VO pipeline failed:", (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
}

// ── VTT Parsing ──

interface VTTBlock {
  startTime: number;
  endTime: number;
  text: string;
}

function parseVTT(vttContent: string): VTTBlock[] {
  const blocks: VTTBlock[] = [];
  const lines = vttContent.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp line: 00:00:00,100 --> 00:00:07,387
    const timeMatch = line.match(
      /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
    );
    if (timeMatch) {
      const startTime = parseTimestamp(timeMatch[1]);
      const endTime = parseTimestamp(timeMatch[2]);

      // Collect text lines until empty line or end
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim());
        i++;
      }

      if (textLines.length > 0) {
        blocks.push({ startTime, endTime, text: textLines.join(" ") });
      }
    }
    i++;
  }

  return blocks;
}

function parseTimestamp(ts: string): number {
  const parts = ts.replace(",", ".").split(":");
  const h = parseFloat(parts[0]) || 0;
  const m = parseFloat(parts[1]) || 0;
  const s = parseFloat(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Split sentence-level VTT blocks into word-level subtitle blocks.
 * Distributes timing evenly across words within each sentence.
 */
function splitIntoWordBlocks(sentenceBlocks: VTTBlock[]): SubtitleBlock[] {
  const {
    max_characters_per_line,
    max_lines_per_block,
    min_caption_duration_seconds,
    max_caption_duration_seconds,
  } = SUBTITLE_SEGMENTATION;
  const maxChars = max_characters_per_line * max_lines_per_block;
  const result: SubtitleBlock[] = [];
  let blockIndex = 1;

  for (const sentence of sentenceBlocks) {
    const words = sentence.text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) continue;

    const totalDuration = sentence.endTime - sentence.startTime;
    const timePerWord = totalDuration / words.length;

    // Group words into chunks that fit within character limits
    let chunk: string[] = [];
    let chunkStartIdx = 0;

    for (let wi = 0; wi < words.length; wi++) {
      const wouldBe = [...chunk, words[wi]].join(" ");
      const wouldDuration = (wi - chunkStartIdx + 1) * timePerWord;

      if (
        (wouldBe.length > maxChars ||
          wouldDuration > max_caption_duration_seconds) &&
        chunk.length > 0
      ) {
        // Flush current chunk
        const startTime = sentence.startTime + chunkStartIdx * timePerWord;
        const endTime = sentence.startTime + wi * timePerWord;
        if (endTime - startTime >= min_caption_duration_seconds) {
          result.push({
            index: blockIndex++,
            startTime,
            endTime,
            text: chunk.join(" "),
          });
        }
        chunk = [];
        chunkStartIdx = wi;
      }
      chunk.push(words[wi]);
    }

    // Flush remaining
    if (chunk.length > 0) {
      const startTime = sentence.startTime + chunkStartIdx * timePerWord;
      const endTime = sentence.endTime;
      if (endTime - startTime >= min_caption_duration_seconds) {
        result.push({
          index: blockIndex++,
          startTime,
          endTime,
          text: chunk.join(" "),
        });
      }
    }
  }

  return result;
}

// ── Helpers ──

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function pad3(n: number): string {
  return String(n).padStart(3, "0");
}
