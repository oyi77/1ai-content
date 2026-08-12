import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { logger } from "@/utils/logger";
import { videoEditorService } from "./video-editor.service";

const execFileAsync = promisify(execFile);

export interface ReworkOptions {
  inputPath: string;
  outputPath?: string;
  // Visual transforms
  mirror?: boolean;
  cropPercent?: number; // 0-20, crop edges
  colorShift?: number; // -100 to 100, hue shift
  brightness?: number; // 0.5-1.5
  contrast?: number; // 0.5-1.5
  saturation?: number; // 0-2
  speed?: number; // 0.8-1.2 (subtle speed change)
  // Audio transforms
  pitchShift?: number; // semitones, -12 to 12
  volumeAdjust?: number; // 0.5-1.5
  // Metadata
  changeMetadata?: boolean;
  newTitle?: string;
  newDescription?: string;
  // Watermark
  addWatermark?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
}

export interface CopyrightCheckResult {
  isSafe: boolean;
  riskLevel: "low" | "medium" | "high";
  issues: string[];
  recommendations: string[];
}

export class ContentReworkService {
  private workDir: string;

  constructor() {
    this.workDir = join(tmpdir(), "1ai-content", "rework");
    this.ensureDir();
  }

  getWorkDir(): string {
    return this.workDir;
  }

  private async ensureDir() {
    const { mkdir } = await import("fs/promises");
    await mkdir(this.workDir, { recursive: true });
  }

  /**
   * Apply all rework transformations to avoid copyright detection
   */
  async reworkContent(options: ReworkOptions): Promise<string> {
    const {
      inputPath,
      outputPath,
      mirror = true,
      cropPercent = 5,
      colorShift = 10,
      brightness = 1.05,
      contrast = 1.05,
      saturation = 1.1,
      speed = 1.02,
      pitchShift = 1,
      volumeAdjust = 1.1,
      addWatermark = true,
      watermarkText = "",
      watermarkOpacity = 0.3,
    } = options;

    const output = outputPath || this.getOutputPath("rework");
    logger.info(`Reworking content: ${inputPath}`);

    let currentFile = inputPath;

    // Step 1: Visual transforms
    currentFile = await this.applyVisualTransforms(currentFile, {
      mirror,
      cropPercent,
      colorShift,
      brightness,
      contrast,
      saturation,
      speed,
    });

    // Step 2: Audio transforms
    currentFile = await this.applyAudioTransforms(currentFile, {
      pitchShift,
      volumeAdjust,
    });

    // Step 3: Add watermark if specified
    if (addWatermark && watermarkText) {
      currentFile = await videoEditorService.addWatermark({
        inputPath: currentFile,
        watermarkPath: await this.createTextWatermark(watermarkText),
        opacity: watermarkOpacity,
        position: "bottom-right",
        scale: 0.08,
      });
    }

    // Step 4: Change metadata
    if (options.changeMetadata) {
      currentFile = await this.changeMetadata(currentFile, {
        title: options.newTitle,
        description: options.newDescription,
      });
    }

    // Copy to final output
    const { copyFile } = await import("fs/promises");
    await copyFile(currentFile, output);

    logger.info(`Rework complete: ${output}`);
    return output;
  }

  /**
   * Apply visual transforms
   */
  private async applyVisualTransforms(
    inputPath: string,
    options: {
      mirror?: boolean;
      cropPercent?: number;
      colorShift?: number;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      speed?: number;
    },
  ): Promise<string> {
    const output = this.getOutputPath("visual");
    const filters: string[] = [];

    // Mirror (horizontal flip)
    if (options.mirror) {
      filters.push("hflip");
    }

    // Crop edges
    if (options.cropPercent && options.cropPercent > 0) {
      const pct = options.cropPercent / 100;
      filters.push(`crop=iw*(1-${pct}*2):ih*(1-${pct}*2):iw*${pct}:ih*${pct}`);
    }

    // Color adjustments
    const eqFilters: string[] = [];
    if (options.brightness && options.brightness !== 1) {
      eqFilters.push(`brightness=${options.brightness - 1}`);
    }
    if (options.contrast && options.contrast !== 1) {
      eqFilters.push(`contrast=${options.contrast}`);
    }
    if (options.saturation && options.saturation !== 1) {
      eqFilters.push(`saturation=${options.saturation}`);
    }
    if (eqFilters.length > 0) {
      filters.push(`eq=${eqFilters.join(":")}`);
    }

    // Hue shift
    if (options.colorShift && options.colorShift !== 0) {
      filters.push(`hue=h=${options.colorShift}`);
    }

    // Speed (subtle)
    if (options.speed && options.speed !== 1) {
      filters.push(`setpts=${1 / options.speed}*PTS`);
    }

    if (filters.length === 0) {
      return inputPath; // No transforms needed
    }

    logger.info(`Applying visual transforms: ${filters.join(", ")}`);

    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vf", filters.join(","), "-c:a", "copy", output],
      { timeout: 300000 },
    );

    return output;
  }

  /**
   * Apply audio transforms
   */
  private async applyAudioTransforms(
    inputPath: string,
    options: {
      pitchShift?: number;
      volumeAdjust?: number;
    },
  ): Promise<string> {
    const output = this.getOutputPath("audio");
    const filters: string[] = [];

    // Volume adjustment
    if (options.volumeAdjust && options.volumeAdjust !== 1) {
      filters.push(`volume=${options.volumeAdjust}`);
    }

    // Pitch shift (using asetrate + atempo trick)
    if (options.pitchShift && options.pitchShift !== 0) {
      const pitchFactor = Math.pow(2, options.pitchShift / 12);
      // Adjust pitch without changing speed
      filters.push(`asetrate=44100*${pitchFactor}`);
      filters.push(`atempo=${1 / pitchFactor}`);
    }

    if (filters.length === 0) {
      return inputPath;
    }

    logger.info(`Applying audio transforms: ${filters.join(", ")}`);

    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-af", filters.join(","), "-c:v", "copy", output],
      { timeout: 120000 },
    );

    return output;
  }

  /**
   * Create text watermark image
   */
  private async createTextWatermark(text: string): Promise<string> {
    const outputPath = this.getOutputPath("watermark");
    const { writeFile } = await import("fs/promises");

    // Create simple SVG watermark
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50">
      <text x="10" y="35" font-family="Arial" font-size="24" fill="white" opacity="0.7">${text}</text>
    </svg>`;

    await writeFile(outputPath.replace(".mp4", ".svg"), svg);
    return outputPath.replace(".mp4", ".svg");
  }

  /**
   * Change video metadata
   */
  private async changeMetadata(
    inputPath: string,
    metadata: {
      title?: string;
      description?: string;
    },
  ): Promise<string> {
    const output = this.getOutputPath("metadata");

    logger.info("Changing video metadata");

    const args = ["-y", "-i", inputPath];

    if (metadata.title) {
      args.push("-metadata", `title=${metadata.title}`);
    }
    if (metadata.description) {
      args.push("-metadata", `comment=${metadata.description}`);
    }

    // Remove existing metadata and add new
    args.push("-map_metadata", "-1");
    args.push("-c", "copy");
    args.push(output);

    await execFileAsync("ffmpeg", args, { timeout: 60000 });
    return output;
  }

  /**
   * Check content for copyright risk
   */
  async checkCopyrightRisk(inputPath: string): Promise<CopyrightCheckResult> {
    logger.info("Checking copyright risk");

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Get video info
    const info = await videoEditorService.getVideoInfo(inputPath);

    // Check 1: Duration (longer = higher risk)
    if (info.duration > 60) {
      issues.push("Video is over 60 seconds (higher detection risk)");
      recommendations.push("Consider trimming to under 60 seconds");
    }

    // Check 2: Resolution (common resolutions are easier to detect)
    if (info.width === 1920 && info.height === 1080) {
      issues.push("Standard 1080p resolution (common fingerprint)");
      recommendations.push("Consider resizing to non-standard dimensions");
    }

    // Check 3: File size (unusual sizes are harder to detect)
    const sizeMB = info.size / 1024 / 1024;
    if (sizeMB > 50) {
      issues.push("Large file size (>50MB)");
      recommendations.push("Compress video to reduce file size");
    }

    // Determine risk level
    let riskLevel: "low" | "medium" | "high" = "low";
    if (issues.length >= 3) riskLevel = "high";
    else if (issues.length >= 1) riskLevel = "medium";

    return {
      isSafe: issues.length === 0,
      riskLevel,
      issues,
      recommendations,
    };
  }

  /**
   * Batch rework multiple videos
   */
  async batchRework(
    inputPaths: string[],
    options: Partial<ReworkOptions> = {},
  ): Promise<string[]> {
    const results: string[] = [];

    for (const inputPath of inputPaths) {
      try {
        const output = await this.reworkContent({ inputPath, ...options });
        results.push(output);
      } catch (error) {
        logger.error(
          `Failed to rework ${inputPath}: ${(error as Error).message}`,
        );
      }
    }

    return results;
  }

  private getOutputPath(prefix: string): string {
    return join(this.workDir, `${prefix}-${randomUUID()}.mp4`);
  }
}

export const contentReworkService = new ContentReworkService();
