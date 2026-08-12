/**
 * Quality Check Service
 *
 * Uses Gemini Vision to score AI-generated video quality before delivery.
 * Extracts a single frame via FFmpeg, sends it to Gemini Vision for analysis,
 * and returns a quality score (0-10) with identified issues.
 *
 * Design constraints:
 *   - Must complete in <5s (single frame analysis only)
 *   - Max 1 retry per video to avoid burning credits
 *   - Score >= 6 is considered passable for delivery
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { secureRandomString } from "@/utils/crypto";
import axios from "axios";
import { trackTokens } from "@/services/token-tracker.service";
import { AIConfigService } from "@/services/ai-config.service";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { exec as execCallback } from "child_process";

const exec = promisify(execCallback);

async function getGeminiVisionUrl(): Promise<string> {
  const cfg = await AIConfigService.getTaskConfig("qualityCheck");
  const model = cfg.model || "gemini-2.0-flash";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getConfig().GEMINI_API_KEY || ""}`;
}

const FRAME_DIR = "/tmp/quality_check_frames";
const QUALITY_THRESHOLD = 6;

export interface QualityCheckResult {
  score: number;
  issues: string[];
  passable: boolean;
}

export class QualityCheckService {
  /**
   * Score a generated video frame for commercial quality (0-10).
   *
   * Steps:
   *   1. Extract a frame at 2s mark using FFmpeg
   *   2. Send frame to Gemini Vision with quality assessment prompt
   *   3. Parse score and issues from response
   *   4. passable = score >= 6
   */
  static async scoreVideo(
    videoPath: string,
    expectedNiche: string,
    expectedDuration: number,
    hasReferenceImage: boolean,
  ): Promise<QualityCheckResult> {
    const defaultResult: QualityCheckResult = {
      score: 7,
      issues: [],
      passable: true,
    };

    // If Gemini API key is not configured, skip quality check and pass
    if (!getConfig().GEMINI_API_KEY) {
      logger.warn(
        "[QualityCheck] GEMINI_API_KEY not configured, skipping quality check",
      );
      return defaultResult;
    }

    // Validate that the video file exists and is non-empty
    if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
      logger.warn(`[QualityCheck] Video file missing or empty: ${videoPath}`);
      return {
        score: 0,
        issues: ["Video file missing or empty"],
        passable: false,
      };
    }

    let framePath: string | null = null;

    try {
      framePath = await this.extractFrame(videoPath);
      if (!framePath) {
        logger.warn(
          "[QualityCheck] Frame extraction failed, defaulting to pass",
        );
        return defaultResult;
      }

      const result = await this.analyzeFrame(
        framePath,
        expectedNiche,
        expectedDuration,
        hasReferenceImage,
      );
      return result;
    } catch (error) {
      logger.error(
        "[QualityCheck] Quality check failed, defaulting to pass:",
        (error as Error).message,
      );
      return defaultResult;
    } finally {
      // Clean up extracted frame
      if (framePath && fs.existsSync(framePath)) {
        try {
          fs.unlinkSync(framePath);
        } catch (err) {
          logger.debug("Silent cleanup error:", err);
        }
      }
    }
  }

  /**
   * Extract a single frame from the video at the 2-second mark.
   * Falls back to 0s if the video is shorter than 2s.
   */
  private static async extractFrame(videoPath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(FRAME_DIR)) {
        fs.mkdirSync(FRAME_DIR, { recursive: true });
      }

      const frameFile = `qc_${Date.now()}_${secureRandomString(6).toLowerCase()}.jpg`;
      const framePath = path.join(FRAME_DIR, frameFile);

      // Extract frame at 2s mark, fall back to first frame if video is too short
      try {
        await exec(
          `ffmpeg -y -i "${videoPath}" -ss 2 -frames:v 1 -q:v 2 "${framePath}" 2>/dev/null`,
          { timeout: 10000 },
        );
      } catch (_) {
        // If 2s extraction fails (video shorter), try at 0s
        await exec(
          `ffmpeg -y -i "${videoPath}" -frames:v 1 -q:v 2 "${framePath}" 2>/dev/null`,
          { timeout: 10000 },
        );
      }

      if (fs.existsSync(framePath) && fs.statSync(framePath).size > 0) {
        return framePath;
      }

      logger.warn("[QualityCheck] Frame extraction produced empty file");
      return null;
    } catch (error) {
      logger.error(
        "[QualityCheck] FFmpeg frame extraction failed:",
        (error as Error).message,
      );
      return null;
    }
  }

  /**
   * Send frame to Gemini Vision for quality analysis.
   * Timeout set to 5s to meet latency requirement.
   */
  private static async analyzeFrame(
    framePath: string,
    expectedNiche: string,
    expectedDuration: number,
    hasReferenceImage: boolean,
  ): Promise<QualityCheckResult> {
    const imageBuffer = fs.readFileSync(framePath);
    const base64Image = imageBuffer.toString("base64");

    const [promptsCfg, taskCfg] = await Promise.all([
      AIConfigService.getPromptsConfig(),
      AIConfigService.getTaskConfig("qualityCheck"),
    ]);

    const hardcodedPrompt = [
      `Rate this AI-generated video frame for commercial quality (0-10).`,
      `Expected: ${expectedNiche} content, ${expectedDuration}s duration.`,
      hasReferenceImage
        ? `This video was generated from a reference image.`
        : "",
      `Check: sharpness, composition, relevance to niche, professional quality, no artifacts.`,
      `Output ONLY in this exact format:`,
      `score: N`,
      `issues: [comma separated list or "none"]`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = promptsCfg.qualityCheck || hardcodedPrompt;
    const model = taskCfg.model || "gemini-2.0-flash";

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.1,
      },
    };

    const response = await axios.post(await getGeminiVisionUrl(), payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usageMeta = response.data?.usageMetadata;
    if (usageMeta) {
      trackTokens({
        provider: "gemini-direct",
        model,
        service: "quality_check",
        promptTokens: usageMeta.promptTokenCount || 0,
        completionTokens: usageMeta.candidatesTokenCount || 0,
      }).catch((err) =>
        logger.warn("Token tracking failed", { error: err.message }),
      );
    }
    return this.parseResponse(text);
  }

  /**
   * Parse Gemini Vision response into structured result.
   * Expected format:
   *   score: N
   *   issues: [list]
   */
  private static parseResponse(text: string): QualityCheckResult {
    const defaultResult: QualityCheckResult = {
      score: 7,
      issues: [],
      passable: true,
    };

    if (!text) {
      logger.warn("[QualityCheck] Empty Gemini response, defaulting to pass");
      return defaultResult;
    }

    // Extract score
    const scoreMatch = text.match(/score\s*:\s*(\d+(?:\.\d+)?)/i);
    const score = scoreMatch
      ? Math.min(10, Math.max(0, parseFloat(scoreMatch[1])))
      : 7;

    // Extract issues
    let issues: string[] = [];
    const issuesMatch = text.match(/issues\s*:\s*\[([^\]]*)\]/i);
    if (issuesMatch && issuesMatch[1]) {
      const issueText = issuesMatch[1].trim();
      if (issueText.toLowerCase() !== "none" && issueText !== "") {
        issues = issueText
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean);
      }
    }

    const passable = score >= QUALITY_THRESHOLD;

    logger.info(
      `[QualityCheck] Score: ${score}/10, Issues: ${issues.length > 0 ? issues.join(", ") : "none"}, Passable: ${passable}`,
    );

    return { score, issues, passable };
  }

  /**
   * Quality threshold constant, exposed for external use.
   */
  static get threshold(): number {
    return QUALITY_THRESHOLD;
  }
}
