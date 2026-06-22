/**
 * Video Download Service — VidBee Integration
 * Downloads videos from any supported URL via yt-dlp.
 */

import { logger } from '@/utils/logger';
const STACK_BASE = process.env.STACK_CONTENT_URL || 'http://localhost:8770';


// ── Types ──

export interface DownloadRequest {
  url: string;
  format?: 'mp4' | 'mp3';
  quality?: 'best' | '720p' | '480p' | '360p';
  audioOnly?: boolean;
  maxDuration?: number;
}

export interface DownloadResult {
  success: boolean;
  jobId: string;
  filename: string;
  title: string;
  duration: number;
  filesize: number;
  thumbnail: string;
  downloadPath: string;
  error: string;
}

export interface VideoInfo {
  success: boolean;
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  viewCount: number;
  formats: VideoFormat[];
  error: string;
}

export interface VideoFormat {
  formatId: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  fps: number | null;
}

// ── Service ──

export async function downloadVideo(req: DownloadRequest): Promise<DownloadResult> {
  const body = {
    url: req.url,
    format: req.format ?? 'mp4',
    quality: req.quality ?? 'best',
    audio_only: req.audioOnly ?? false,
    max_duration: req.maxDuration ?? 600,
  };

  try {
    const res = await fetch(`${STACK_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    const data = (await res.json()) as Record<string, unknown>;

    return {
      success: Boolean(data.success),
      jobId: String(data.job_id ?? ''),
      filename: String(data.filename ?? ''),
      title: String(data.title ?? ''),
      duration: Number(data.duration ?? 0),
      filesize: Number(data.filesize ?? 0),
      thumbnail: String(data.thumbnail ?? ''),
      downloadPath: String(data.download_path ?? ''),
      error: String(data.error ?? ''),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('VidBee download failed:', message);
    return {
      success: false,
      jobId: '',
      filename: '',
      title: '',
      duration: 0,
      filesize: 0,
      thumbnail: '',
      downloadPath: '',
      error: message,
    };
  }
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const res = await fetch(`${STACK_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    const rawFormats = Array.isArray(data.formats) ? data.formats : [];

    return {
      success: Boolean(data.success),
      title: String(data.title ?? ''),
      duration: Number(data.duration ?? 0),
      thumbnail: String(data.thumbnail ?? ''),
      uploader: String(data.uploader ?? ''),
      viewCount: Number(data.view_count ?? 0),
      formats: rawFormats.map((f: unknown) => {
        const fmt = f as Record<string, unknown>;
        return {
          formatId: String(fmt.format_id ?? ''),
          ext: String(fmt.ext ?? ''),
          resolution: String(fmt.resolution ?? 'audio'),
          filesize: typeof fmt.filesize === 'number' ? fmt.filesize : null,
          fps: typeof fmt.fps === 'number' ? fmt.fps : null,
        };
      }),
      error: String(data.error ?? ''),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('VidBee info failed:', message);
    return {
      success: false,
      title: '',
      duration: 0,
      thumbnail: '',
      uploader: '',
      viewCount: 0,
      formats: [],
      error: message,
    };
  }
}

export async function getDownloadUrl(jobId: string): Promise<string> {
  return `${STACK_BASE}/file/${jobId}`;
}

export async function deleteDownload(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${STACK_BASE}/file/${jobId}`, { method: 'DELETE' });
    const data = (await res.json()) as Record<string, unknown>;
    return Boolean(data.deleted);
  } catch {
    return false;
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${STACK_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
