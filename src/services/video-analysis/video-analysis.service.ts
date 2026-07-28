/**
 * Video Analysis Service
 *
 * Downloads a video URL, extracts frames with ffmpeg, sends to Gemini Vision
 * for storyboard / transcript / scene prompt extraction.
 */
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { ValidationError } from '@/utils/app-errors';
import axios from 'axios';
import { AIConfigService } from '@/services/ai-config.service';
import { getOmniRouteService } from '@/services/omniroute.service';
import { fetchMediaAsBase64 } from './media-utils';
import { extractJSON, buildFallbackResult } from './parse-utils';
import { getGeminiVisionUrl } from './gemini';
import type { AnalyzedScene, VideoAnalysisResult } from './types';

const execFile = promisify(execFileCb);

export class VideoAnalysisService {
  /**
   * Full pipeline: download → extract frames → Gemini analysis → return result.
   */
  static async analyze(videoUrl: string): Promise<VideoAnalysisResult> {
    const jobId = Date.now().toString();
    const tmpDir = '/tmp/videos';
    let framesDir = '';
    const tempPath = `${tmpDir}/analyze_${jobId}.mp4`;

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    framesDir = `/tmp/video_frames/${jobId}`;
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

    try {
      // ── 1. Download video ──
      const isSocialPlatform = /tiktok\.com|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|fb\.watch|pinterest\.com|bilibili\.com/i.test(videoUrl);
      try {
        logger.info(`[VideoAnalysis] Downloading video (${isSocialPlatform ? 'yt-dlp' : 'wget'}): ${videoUrl.slice(0, 80)}`);
        if (isSocialPlatform) {
          const ytdlpBin = '/home/openclaw/.local/bin/yt-dlp';
          const ytdlpCmd = require('fs').existsSync(ytdlpBin) ? ytdlpBin : 'yt-dlp';
          await execFile(ytdlpCmd, [
            '--no-playlist', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '-o', tempPath, videoUrl,
          ], { timeout: 120_000 });
        } else {
          const { execFile: execFileCb } = await import('child_process');
          const { promisify: prom } = await import('util');
          await prom(execFileCb)('wget', ['-q', '-O', tempPath, videoUrl]);
        }
        if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
          throw new ValidationError('Downloaded file is empty', 'downloadedFile');
        }
      } catch (err) {
        logger.warn(`[VideoAnalysis] Download failed: ${(err as Error).message}`);
        if (!getConfig().GEMINI_API_KEY) return buildFallbackResult(videoUrl);
        return VideoAnalysisService._analyzeViaUrl(videoUrl);
      }

      // ── 2. Get duration ──
      let totalDuration = 15;
      try {
        const { stdout } = await execFile('ffprobe', [
          '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tempPath,
        ], { timeout: 15_000 });
        const parsed = parseFloat(stdout.trim());
        if (!isNaN(parsed)) totalDuration = Math.round(parsed);
      } catch (err) {
        logger.warn(`[VideoAnalysis] ffprobe failed: ${(err as Error).message}`);
      }

      // ── 3. Extract frames (1 per 5s, max 8) ──
      const keyFramePaths: string[] = [];
      try {
        await execFile('ffmpeg', [
          '-y', '-i', tempPath, '-vf', 'fps=1/5,scale=640:-1', '-q:v', '2',
          path.join(framesDir, 'frame_%03d.jpg'),
        ], { timeout: 15_000 });
        const files = fs.readdirSync(framesDir)
          .filter(f => f.endsWith('.jpg'))
          .sort()
          .slice(0, 8)
          .map(f => path.join(framesDir, f));
        keyFramePaths.push(...files);
      } catch (err) {
        logger.warn(`[VideoAnalysis] ffmpeg frame extraction failed: ${(err as Error).message}`);
      }

      // ── 4. Gemini analysis ──
      let analysisResult: VideoAnalysisResult;
      if (!getConfig().GEMINI_API_KEY) {
        logger.warn('[VideoAnalysis] GEMINI_API_KEY not set — using config-driven fallback chain');
        analysisResult = await VideoAnalysisService._analyzeViaFallbackChain(keyFramePaths, videoUrl);
        if (!analysisResult.totalDuration) analysisResult.totalDuration = totalDuration;
        analysisResult.keyFramePaths = keyFramePaths;
      } else {
        analysisResult = await VideoAnalysisService._callGemini(tempPath, videoUrl, keyFramePaths);
        if (!analysisResult.totalDuration) analysisResult.totalDuration = totalDuration;
        analysisResult.keyFramePaths = keyFramePaths;
      }

      // ── 5. Cleanup ──
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch { /* non-fatal */ }

      return analysisResult;
    } finally {
      if (framesDir) {
        fs.promises.rm(framesDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  // ── Private methods ──

  private static async _callGemini(
    tempPath: string,
    originalUrl: string,
    keyFramePaths: string[],
  ): Promise<VideoAnalysisResult> {
    const systemPrompt = `Analyze this video carefully and return ONLY a valid JSON object (no markdown, no explanation):
{
  "niche": "one of: fitness, food, travel, business, fashion, education, tech, beauty, real_estate, automotive, general",
  "style": "brief visual style description (lighting, color, mood, camera work)",
  "totalDuration": <number in seconds>,
  "transcript": "exact spoken words verbatim (empty string if no speech)",
  "storyboard": [
    {
      "scene": 1,
      "startTime": 0,
      "duration": <seconds>,
      "description": "detailed visual description of what happens",
      "prompt": "cinematic AI video generation prompt for recreating this scene"
    }
  ]
}
Break the video into 1 scene per ~5 seconds (max 8 scenes total). Make each prompt detailed enough to regenerate the scene independently.`;

    let inlinePart: Record<string, unknown>;
    try {
      if (fs.existsSync(tempPath)) {
        const { data, mimeType } = await fetchMediaAsBase64(
          `file://${tempPath}`,
        ).catch(async () => {
          const buf = fs.readFileSync(tempPath);
          return { data: buf.toString('base64'), mimeType: 'video/mp4' };
        });
        inlinePart = { inline_data: { mime_type: mimeType, data } };
      } else {
        throw new ValidationError('temp file missing', 'tempFile');
      }
    } catch {
      if (keyFramePaths.length > 0) {
        const buf = fs.readFileSync(keyFramePaths[0]);
        inlinePart = { inline_data: { mime_type: 'image/jpeg', data: buf.toString('base64') } };
      } else {
        inlinePart = { text: `Video URL: ${originalUrl}` };
      }
    }

    const requestBody = {
      contents: [
        { parts: [inlinePart, { text: systemPrompt }] },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    };

    let responseText = '';
    try {
      const response = await axios.post(await getGeminiVisionUrl(), requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60_000,
      });
      responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      logger.warn(`[VideoAnalysis] Gemini API failed (${(err as Error).message}), using config-driven fallback chain`);
      return VideoAnalysisService._analyzeViaFallbackChain(keyFramePaths, originalUrl);
    }

    return VideoAnalysisService._parseResponse(responseText, keyFramePaths, originalUrl);
  }

  private static _parseResponse(
    responseText: string,
    keyFramePaths: string[],
    originalUrl: string,
  ): VideoAnalysisResult {
    try {
      const jsonStr = extractJSON(responseText);
      const parsed = JSON.parse(jsonStr);
      const storyboard: AnalyzedScene[] = (parsed.storyboard || [])
        .slice(0, 8)
        .map((s: Record<string, unknown>, idx: number) => ({
          scene: s.scene ?? idx + 1,
          startTime: s.startTime ?? 0,
          duration: s.duration ?? 5,
          description: s.description ?? '',
          prompt: s.prompt ?? '',
        }));

      if (!storyboard.length) {
        return { success: false, error: 'Could not parse analysis' };
      }

      return {
        success: true,
        niche: parsed.niche || 'general',
        style: parsed.style || '',
        totalDuration: parsed.totalDuration || undefined,
        transcript: parsed.transcript || '',
        storyboard,
      };
    } catch (parseErr) {
      logger.warn(`[VideoAnalysis] JSON parse failed: ${(parseErr as Error).message}`);
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const storyboard: AnalyzedScene[] = (parsed.storyboard || [])
            .slice(0, 8)
            .map((s: Record<string, unknown>, idx: number) => ({
              scene: s.scene ?? idx + 1,
              startTime: s.startTime ?? 0,
              duration: s.duration ?? 5,
              description: s.description ?? '',
              prompt: s.prompt ?? '',
            }));
          if (storyboard.length) {
            return {
              success: true,
              niche: parsed.niche || 'general',
              style: parsed.style || '',
              totalDuration: parsed.totalDuration || undefined,
              transcript: parsed.transcript || '',
              storyboard,
            };
          }
        } catch { /* fall through */ }
      }
      return { success: false, error: 'Could not parse analysis' };
    }
  }

  private static async _analyzeViaUrl(videoUrl: string): Promise<VideoAnalysisResult> {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text:
                `Analyze this video URL (assume you can access it): ${videoUrl}\n\n` +
                `Return ONLY a valid JSON object:\n` +
                `{"niche":"general","style":"unknown","totalDuration":15,"transcript":"","storyboard":[{"scene":1,"startTime":0,"duration":15,"description":"Full video content","prompt":"cinematic video recreation"}]}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    };

    try {
      const response = await axios.post(await getGeminiVisionUrl(), requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      });
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonStr = extractJSON(text);
      const parsed = JSON.parse(jsonStr);
      const storyboard: AnalyzedScene[] = (parsed.storyboard || [])
        .slice(0, 8)
        .map((s: Record<string, unknown>, idx: number) => ({
          scene: s.scene ?? idx + 1,
          startTime: s.startTime ?? 0,
          duration: s.duration ?? 5,
          description: s.description ?? '',
          prompt: s.prompt ?? '',
        }));
      return {
        success: true,
        niche: parsed.niche || 'general',
        style: parsed.style || '',
        totalDuration: parsed.totalDuration || 15,
        transcript: parsed.transcript || '',
        storyboard: storyboard.length ? storyboard : buildFallbackResult(videoUrl).storyboard,
        keyFramePaths: [],
      };
    } catch {
      return VideoAnalysisService._analyzeViaFallbackChain([], videoUrl);
    }
  }

  private static async _analyzeViaFallbackChain(
    keyFramePaths: string[],
    videoUrl: string,
  ): Promise<VideoAnalysisResult> {
    const tasksConfig = await AIConfigService.getTasksConfig().catch(() => null);
    const fallback1 = tasksConfig?.transcriptFallback1 ?? { provider: 'omniroute', model: 'antigravity/gemini-2.5-flash' };
    const fallback2 = tasksConfig?.transcriptFallback2 ?? { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct' };

    const chain = [fallback1, fallback2];
    for (const cfg of chain) {
      try {
        const result = await VideoAnalysisService._analyzeViaProvider(cfg.provider, cfg.model, keyFramePaths, videoUrl);
        if (result.success) return result;
      } catch (err) {
        logger.warn(`[VideoAnalysis] Fallback provider ${cfg.provider}/${cfg.model} failed: ${(err as Error).message}`);
      }
    }

    logger.warn('[VideoAnalysis] All fallback providers failed, returning hardcoded fallback');
    return buildFallbackResult(videoUrl);
  }

  private static async _analyzeViaProvider(
    provider: string,
    model: string,
    keyFramePaths: string[],
    videoUrl: string,
  ): Promise<VideoAnalysisResult> {
    if (provider === 'groq') {
      return VideoAnalysisService._analyzeViaGroq(keyFramePaths, videoUrl, model);
    }
    return VideoAnalysisService._analyzeViaOmniRoute(keyFramePaths, videoUrl, model);
  }

  private static async _analyzeViaOmniRoute(
    keyFramePaths: string[],
    videoUrl: string,
    modelOverride?: string,
  ): Promise<VideoAnalysisResult> {
    const ANALYSIS_PROMPT = `Analyze this video frame and return ONLY a valid JSON object (no markdown):
{"niche":"one of: fitness,food,travel,business,fashion,education,tech,beauty,general","style":"brief visual style","totalDuration":15,"transcript":"spoken words if any","storyboard":[{"scene":1,"startTime":0,"duration":15,"description":"detailed visual description","prompt":"cinematic AI video generation prompt for recreating this scene"}]}`;

    const omni = getOmniRouteService();
    let visionModel = modelOverride;
    if (!visionModel) {
      const taskCfg = await AIConfigService.getTaskConfig('transcript').catch(() => null);
      visionModel = (taskCfg?.provider === 'omniroute' && taskCfg.model)
        ? taskCfg.model
        : 'antigravity/gemini-2.5-flash';
    }

    if (keyFramePaths.length > 0) {
      for (const framePath of keyFramePaths.slice(0, 3)) {
        try {
          if (!fs.existsSync(framePath)) continue;
          const buf = fs.readFileSync(framePath);
          const base64 = buf.toString('base64');
          const result = await omni.analyzeImage(base64, 'image/jpeg', ANALYSIS_PROMPT, visionModel);
          if (!result.success || !result.content) continue;

          const jsonStr = extractJSON(result.content);
          const parsed = JSON.parse(jsonStr);
          const storyboard: AnalyzedScene[] = (parsed.storyboard || [])
            .slice(0, 8)
            .map((s: Record<string, unknown>, idx: number) => ({
              scene: s.scene ?? idx + 1,
              startTime: s.startTime ?? 0,
              duration: s.duration ?? 5,
              description: s.description ?? '',
              prompt: s.prompt ?? '',
            }));

          if (storyboard.length) {
            logger.info(`[VideoAnalysis] OmniRoute fallback succeeded with frame ${framePath}`);
            return { success: true, niche: parsed.niche || 'general', style: parsed.style || '', totalDuration: parsed.totalDuration || 15, transcript: parsed.transcript || '', storyboard, keyFramePaths };
          }
        } catch (frameErr) {
          logger.warn(`[VideoAnalysis] OmniRoute frame analysis failed: ${(frameErr as Error).message}`);
        }
      }
    }

    try {
      const textPrompt = `Analyze a video from this URL: ${videoUrl.slice(0, 200)}\n\nReturn ONLY valid JSON: {"niche":"general","style":"unknown","totalDuration":15,"transcript":"","storyboard":[{"scene":1,"startTime":0,"duration":15,"description":"Video content","prompt":"cinematic video recreation based on the source video"}]}`;
      const result = await omni.chat('video-analysis-system', textPrompt);
      if (result.success && result.content) {
        const jsonStr = extractJSON(result.content);
        const parsed = JSON.parse(jsonStr);
        const storyboard: AnalyzedScene[] = (parsed.storyboard || [])
          .map((s: Record<string, unknown>, idx: number) => ({
            scene: s.scene ?? idx + 1,
            startTime: s.startTime ?? 0,
            duration: s.duration ?? 5,
            description: s.description ?? '',
            prompt: s.prompt ?? '',
          }));
        if (storyboard.length) {
          omni.clearHistory('video-analysis-system');
          return { success: true, niche: parsed.niche || 'general', style: parsed.style || '', totalDuration: 15, transcript: '', storyboard, keyFramePaths };
        }
      }
    } catch (textErr) {
      logger.warn(`[VideoAnalysis] OmniRoute text fallback failed: ${(textErr as Error).message}`);
    }

    logger.warn('[VideoAnalysis] OmniRoute analysis failed, trying Groq vision fallback');
    return VideoAnalysisService._analyzeViaGroq(keyFramePaths, videoUrl);
  }

  private static async _analyzeViaGroq(
    keyFramePaths: string[],
    videoUrl: string,
    modelOverride?: string,
  ): Promise<VideoAnalysisResult> {
    const apiKey = getConfig().GROQ_API_KEY;
    if (!apiKey || keyFramePaths.length === 0) return buildFallbackResult(videoUrl);

    const groqModel = modelOverride || 'meta-llama/llama-4-scout-17b-16e-instruct';
    const ANALYSIS_PROMPT = `Analyze this video frame and return ONLY a valid JSON object (no markdown):
{"niche":"one of: fitness,food,travel,business,fashion,education,tech,beauty,general","style":"brief visual style","totalDuration":15,"transcript":"spoken words if any","storyboard":[{"scene":1,"startTime":0,"duration":15,"description":"detailed visual description","prompt":"cinematic AI video generation prompt for recreating this scene"}]}`;

    for (const framePath of keyFramePaths.slice(0, 2)) {
      try {
        if (!fs.existsSync(framePath)) continue;
        const base64 = fs.readFileSync(framePath).toString('base64');
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: groqModel,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: ANALYSIS_PROMPT },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            }],
            max_tokens: 1500,
            temperature: 0.4,
          },
          {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            timeout: 30000,
          },
        );
        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) continue;

        const jsonStr = extractJSON(content);
        const parsed = JSON.parse(jsonStr);
        const storyboard: AnalyzedScene[] = (parsed.storyboard || []).slice(0, 8).map((s: Record<string, unknown>, idx: number) => ({
          scene: s.scene ?? idx + 1,
          startTime: s.startTime ?? 0,
          duration: s.duration ?? 5,
          description: s.description ?? '',
          prompt: s.prompt ?? '',
        }));

        if (storyboard.length) {
          logger.info(`[VideoAnalysis] Groq vision fallback succeeded with frame ${framePath}`);
          return { success: true, niche: parsed.niche || 'general', style: parsed.style || '', totalDuration: parsed.totalDuration || 15, transcript: parsed.transcript || '', storyboard, keyFramePaths };
        }
      } catch (err) {
        logger.warn(`[VideoAnalysis] Groq vision frame failed: ${(err as Error).message}`);
      }
    }

    logger.warn('[VideoAnalysis] All analysis methods failed, returning fallback result');
    return buildFallbackResult(videoUrl);
  }
}
