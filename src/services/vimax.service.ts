/**
 * ViMax Service Client — Agentic Video Generation
 * Director, Screenwriter, Producer all-in-one.
 */

import { logger } from '@/utils/logger';

const VIMAX_BASE = process.env.VIMAX_API_URL || 'http://localhost:8770';

// ── Types ──

export interface IdeaRequest {
  idea: string;
  style?: 'cinematic' | 'casual' | 'corporate' | 'educational';
  duration?: number;
  platform?: 'tiktok' | 'youtube' | 'instagram';
  language?: 'id' | 'en';
}

export interface ScriptRequest {
  topic: string;
  style?: string;
  duration?: number;
  language?: 'id' | 'en';
  includeHooks?: boolean;
}

export interface Scene {
  sceneNumber: number;
  act: string;
  duration: number;
  visualPrompt: string;
  narration: string;
  motion: string;
  camera: string;
  transition: string;
  audioMood: string;
}

export interface AgentResult {
  success: boolean;
  jobId: string;
  script: string;
  scenes: Scene[];
  voiceover: string;
  videoPath: string;
  metadata: Record<string, unknown>;
  error: string;
}

// ── Helpers ──

function parseScene(raw: unknown): Scene {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    sceneNumber: Number(s.scene_number ?? 0),
    act: String(s.act ?? ''),
    duration: Number(s.duration ?? 0),
    visualPrompt: String(s.visual_prompt ?? ''),
    narration: String(s.narration ?? ''),
    motion: String(s.motion ?? 'slow'),
    camera: String(s.camera ?? 'static'),
    transition: String(s.transition ?? 'cut'),
    audioMood: String(s.audio_mood ?? 'calm'),
  };
}

function parseAgentResponse(data: Record<string, unknown>): AgentResult {
  const rawScenes = Array.isArray(data.scenes) ? data.scenes : [];
  const rawMeta = (typeof data.metadata === 'object' && data.metadata !== null
    ? data.metadata
    : {}) as Record<string, unknown>;

  return {
    success: Boolean(data.success),
    jobId: String(data.job_id ?? ''),
    script: String(data.script ?? ''),
    scenes: rawScenes.map(parseScene),
    voiceover: String(data.voiceover ?? ''),
    videoPath: String(data.video_path ?? ''),
    metadata: rawMeta,
    error: String(data.error ?? ''),
  };
}

// ── Service ──

export async function ideaToVideo(req: IdeaRequest): Promise<AgentResult> {
  const body = {
    idea: req.idea,
    style: req.style ?? 'cinematic',
    duration: req.duration ?? 30,
    platform: req.platform ?? 'tiktok',
    language: req.language ?? 'id',
  };

  try {
    const res = await fetch(`${VIMAX_BASE}/idea-to-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return parseAgentResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('ViMax idea-to-video failed:', message);
    return {
      success: false,
      jobId: '',
      script: '',
      scenes: [],
      voiceover: '',
      videoPath: '',
      metadata: {},
      error: message,
    };
  }
}

export async function generateScript(req: ScriptRequest): Promise<AgentResult> {
  const body = {
    topic: req.topic,
    style: req.style ?? 'engaging',
    duration: req.duration ?? 30,
    language: req.language ?? 'id',
    include_hooks: req.includeHooks ?? true,
  };

  try {
    const res = await fetch(`${VIMAX_BASE}/generate-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return parseAgentResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('ViMax script generation failed:', message);
    return {
      success: false,
      jobId: '',
      script: '',
      scenes: [],
      voiceover: '',
      videoPath: '',
      metadata: {},
      error: message,
    };
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${VIMAX_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
