/**
 * Open-Sora Service Client — AI Video Generation
 * Text-to-video via open-source Open-Sora model.
 */
import { logger } from "@/utils/logger";

const STACK_BASE = process.env.STACK_CONTENT_URL || 'http://localhost:8770';


// ── Types ──

export interface SoraGenerateRequest {
  prompt: string;
  duration?: number;
  resolution?: '720p' | '480p' | '360p';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  guidanceScale?: number;
  seed?: number | null;
  imageUrl?: string | null;
}

export interface SoraGenerateResult {
  success: boolean;
  jobId: string;
  videoPath: string;
  duration: number;
  resolution: string;
  seed: number;
  error: string;
}

export interface SoraStatus {
  available: boolean;
  gpuName: string;
  vramTotal: string;
  vramFree: string;
  mode: 'demo' | 'gpu' | 'cpu';
}

// ── Service ──

export async function generateVideo(req: SoraGenerateRequest): Promise<SoraGenerateResult> {
  const body = {
    prompt: req.prompt,
    duration: req.duration ?? 5,
    resolution: req.resolution ?? '720p',
    aspect_ratio: req.aspectRatio ?? '16:9',
    guidance_scale: req.guidanceScale ?? 7.5,
    seed: req.seed ?? null,
    image_url: req.imageUrl ?? null,
  };

  try {
    const res = await fetch(`${STACK_BASE}/sora/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000), // 5 min for GPU inference
    });

    const data = (await res.json()) as Record<string, unknown>;

    return {
      success: Boolean(data.success),
      jobId: String(data.job_id ?? ''),
      videoPath: String(data.video_path ?? ''),
      duration: Number(data.duration ?? 0),
      resolution: String(data.resolution ?? ''),
      seed: Number(data.seed ?? 0),
      error: String(data.error ?? ''),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Open-Sora generation failed:', message);
    return {
      success: false,
      jobId: '',
      videoPath: '',
      duration: 0,
      resolution: '',
      seed: 0,
      error: message,
    };
  }
}

export async function getStatus(): Promise<SoraStatus> {
  try {
    const res = await fetch(`${STACK_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as Record<string, unknown>;

    return {
      available: Boolean(data.available),
      gpuName: String(data.gpu_name ?? ''),
      vramTotal: String(data.vram_total ?? ''),
      vramFree: String(data.vram_free ?? ''),
      mode: (['demo', 'gpu', 'cpu'].includes(String(data.mode))
        ? data.mode
        : 'demo') as SoraStatus['mode'],
    };
  } catch {
    return { available: false, gpuName: '', vramTotal: '', vramFree: '', mode: 'demo' };
  }
}

export async function getVideoUrl(jobId: string): Promise<string> {
  return `${STACK_BASE}/file/${jobId}`;
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${STACK_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
