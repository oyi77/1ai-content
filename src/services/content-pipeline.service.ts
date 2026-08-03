/**
 * Content Pipeline Service
 *
 * Analyzes user input (URL/file/text), generates scripts,
 * and manages multi-step content creation workflow.
 */

import { logger } from "@/utils/logger";

// ── Types ──

export type InputType = "youtube" | "tiktok" | "md_file" | "text_prompt";

export interface AnalysisResult {
  type: InputType;
  source: string;
  title: string;
  summary: string;
  insights: string[];
  contentIdeas: string[];
  rawData: Record<string, unknown>;
}

export interface ScriptScene {
  scene: number;
  duration: number;
  visual: string;
  narration: string;
  motion: string;
  audioMood: string;
}

export interface ContentScript {
  title: string;
  hook: string;
  target: string;
  scenes: ScriptScene[];
  totalDuration: number;
  hashtags: string[];
}

export interface PipelineState {
  step: "input" | "analyzing" | "analysis_done" | "script" | "script_done" | "generate" | "done";
  inputType?: InputType;
  inputSource?: string;
  analysis?: AnalysisResult;
  script?: ContentScript;
  generatedVideoId?: string;
  error?: string;
}

// ── Input Detection ──

export function detectInputType(input: string): InputType {
  const trimmed = input.trim();
  if (/youtube\.com|youtu\.be/.test(trimmed)) return "youtube";
  if (/tiktok\.com|vm\.tiktok\.com/.test(trimmed)) return "tiktok";
  if (trimmed.endsWith(".md") || trimmed.endsWith(".txt")) return "md_file";
  return "text_prompt";
}

// ── Analysis ──

export async function analyzeInput(input: string, type: InputType): Promise<AnalysisResult> {
  switch (type) {
    case "youtube":
      return analyzeYouTube(input);
    case "tiktok":
      return analyzeTikTok(input);
    case "md_file":
      return analyzeFile(input);
    case "text_prompt":
      return analyzePrompt(input);
  }
}

async function analyzeYouTube(url: string): Promise<AnalysisResult> {
  // Use yt-dlp to get channel/video info
  const { execFileSync } = await import("child_process");
  try {
    const raw = execFileSync(
      "python3",
      ["-m", "yt_dlp", "--dump-json", "--no-download", "--flat-playlist", url],
      { timeout: 30000, encoding: "utf-8" },
    );
    // --flat-playlist emits one JSON object per line; keep the first non-empty line
    const firstLine = raw.split("\n").find((l) => l.trim()) || "";
    const data = JSON.parse(firstLine);
    return {
      type: "youtube",
      source: url,
      title: data.title || data.channel || "YouTube Content",
      summary: `Channel: ${data.channel || data.uploader || "Unknown"} | ${data.view_count || 0} views`,
      insights: [
        `Duration: ${data.duration || 0}s`,
        `Upload date: ${data.upload_date || "unknown"}`,
        `Description: ${(data.description || "").slice(0, 200)}`,
      ],
      contentIdeas: [
        `Remake: ${data.title}`,
        `Similar topic, different angle`,
        `Reaction/commentary to this content`,
      ],
      rawData: data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[Pipeline] YouTube analysis failed:", msg);
    return {
      type: "youtube",
      source: url,
      title: "YouTube Analysis",
      summary: `Gagal analisa: ${msg}`,
      insights: ["Video tidak bisa diakses atau URL salah"],
      contentIdeas: [],
      rawData: {},
    };
  }
}

async function analyzeTikTok(url: string): Promise<AnalysisResult> {
  const { execFileSync } = await import("child_process");
  try {
    const raw = execFileSync(
      "python3",
      ["-m", "yt_dlp", "--dump-json", "--no-download", url],
      { timeout: 30000, encoding: "utf-8" },
    );
    const firstLine = raw.split("\n").find((l) => l.trim()) || "";
    const data = JSON.parse(firstLine);
    return {
      type: "tiktok",
      source: url,
      title: data.title || data.description || "TikTok Content",
      summary: `Creator: ${data.uploader || "Unknown"} | ${data.view_count || 0} views | ${data.like_count || 0} likes`,
      insights: [
        `Duration: ${data.duration || 0}s`,
        `Music: ${data.track || "unknown"}`,
        `Description: ${(data.description || "").slice(0, 200)}`,
      ],
      contentIdeas: [
        `Recreate with similar style`,
        `Duets/stitch approach`,
        `Trending format adaptation`,
      ],
      rawData: data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[Pipeline] TikTok analysis failed:", msg);
    return {
      type: "tiktok",
      source: url,
      title: "TikTok Analysis",
      summary: `Gagal analisa: ${msg}`,
      insights: ["Video tidak bisa diakses atau URL salah"],
      contentIdeas: [],
      rawData: {},
    };
  }
}

function analyzeFile(content: string): AnalysisResult {
  const lines = content.split("\n").filter((l) => l.trim());
  const headings = lines.filter((l) => l.startsWith("#")).map((l) => l.replace(/^#+\s*/, ""));
  const title = headings[0] || "Document Analysis";

  return {
    type: "md_file",
    source: "uploaded file",
    title,
    summary: `${lines.length} baris, ${headings.length} section`,
    insights: [
      `Topik utama: ${headings.slice(0, 5).join(", ")}`,
      `Konten: ${content.slice(0, 300)}...`,
    ],
    contentIdeas: headings.slice(0, 5).map((h) => `Buat konten tentang: ${h}`),
    rawData: { content: content.slice(0, 5000) },
  };
}

function analyzePrompt(prompt: string): AnalysisResult {
  return {
    type: "text_prompt",
    source: prompt,
    title: prompt.slice(0, 50),
    summary: `Prompt: ${prompt.slice(0, 200)}`,
    insights: [
      `Panjang prompt: ${prompt.length} karakter`,
      `Keywords: ${extractKeywords(prompt).join(", ")}`,
    ],
    contentIdeas: [prompt],
    rawData: { prompt },
  };
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

// ── Script Generation ──

export function generateScript(analysis: AnalysisResult, targetDuration = 30): ContentScript {
  const scenes: ScriptScene[] = [];
  const sceneCount = Math.max(3, Math.min(8, Math.floor(targetDuration / 5)));

  // Hook scene
  scenes.push({
    scene: 1,
    duration: Math.min(5, targetDuration / 3),
    visual: `Opening shot — eye-catching, related to: ${analysis.title}`,
    narration: analysis.insights[0] || `Tahukah kamu tentang ${analysis.title}?`,
    motion: "dynamic",
    audioMood: "energetic",
  });

  // Body scenes
  const bodyDuration = targetDuration - 10;
  const bodyScenes = sceneCount - 2;
  for (let i = 0; i < bodyScenes; i++) {
    scenes.push({
      scene: i + 2,
      duration: Math.round(bodyDuration / bodyScenes),
      visual: analysis.contentIdeas[i] || `Scene ${i + 2} — content detail`,
      narration: analysis.insights[i + 1] || `Point ${i + 1} tentang ${analysis.title}`,
      motion: "smooth",
      audioMood: "calm",
    });
  }

  // CTA scene
  scenes.push({
    scene: sceneCount,
    duration: Math.min(5, targetDuration / 4),
    visual: "Closing shot — brand/logo, call to action",
    narration: "Follow untuk konten lainnya! Like dan share!",
    motion: "fade_out",
    audioMood: "upbeat",
  });

  const hashtags = extractKeywords(analysis.title + " " + analysis.summary)
    .map((w) => `#${w}`)
    .slice(0, 5);

  return {
    title: analysis.title,
    hook: scenes[0].narration,
    target: analysis.summary,
    scenes,
    totalDuration: scenes.reduce((s, sc) => s + sc.duration, 0),
    hashtags,
  };
}

// ── Format for Telegram ──

export function formatAnalysis(result: AnalysisResult): string {
  let msg = `📊 *Analysis Result*\n\n`;
  msg += `*${result.title}*\n`;
  msg += `${result.summary}\n\n`;
  msg += `*Insights:*\n`;
  for (const insight of result.insights.slice(0, 5)) {
    msg += `• ${insight}\n`;
  }
  if (result.contentIdeas.length) {
    msg += `\n*Content Ideas:*\n`;
    for (const idea of result.contentIdeas.slice(0, 5)) {
      msg += `• ${idea}\n`;
    }
  }
  return msg;
}

export function formatScript(script: ContentScript): string {
  let msg = `📝 *Script: ${script.title}*\n\n`;
  msg += `🎯 Hook: ${script.hook}\n`;
  msg += `⏱ Total: ${script.totalDuration}s | ${script.scenes.length} scenes\n\n`;

  for (const scene of script.scenes) {
    msg += `*Scene ${scene.scene}* (${scene.duration}s) — ${scene.visual}\n`;
    if (scene.narration) msg += `  🎙 ${scene.narration}\n`;
    msg += `  🎵 ${scene.audioMood} | 📹 ${scene.motion}\n\n`;
  }

  if (script.hashtags.length) {
    msg += `🏷 ${script.hashtags.join(" ")}`;
  }
  return msg;
}
