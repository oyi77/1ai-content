/**
 * Content Factory Service — TypeScript bridge to Python FastAPI services
 *
 * Calls the 1AI-Content Factory Python API (port 8766) for:
 * - Storyboard generation
 * - TTS (text-to-speech)
 * - Suno AI music
 * - Background music
 * - Looping video
 * - Channel analysis
 * - CloakBrowser social posting
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { getConfig } from '@/config/env';

// ── Types ─────────────────────────────────────────────────────

export interface StoryboardScene {
  scene_number: number;
  title: string;
  duration_seconds: number;
  description: string;
  image_prompt: string;
  narration: string;
  camera: string;
  transition: string;
  image_path?: string;
}

export interface StoryboardResult {
  success: boolean;
  prompt: string;
  style: string;
  scenes: StoryboardScene[];
  total_scenes: number;
  total_duration_seconds: number;
  aspect_ratio: string;
  session_dir: string;
  layout_html: string;
  generated_at: string;
}

export interface TTSResult {
  success: boolean;
  audio_path?: string;
  duration?: number;
  voice_used?: string;
  engine?: string;
  error?: string;
}

export interface SunoResult {
  success: boolean;
  audio_path?: string;
  audio_url?: string;
  duration?: number;
  title?: string;
  error?: string;
}

export interface MusicResult {
  success: boolean;
  audio_path?: string;
  duration?: number;
  engine?: string;
  error?: string;
}

export interface LoopResult {
  success: boolean;
  video_path?: string;
  duration?: number;
  file_size?: number;
  resolution?: string;
  error?: string;
}

export interface ChannelAnalysis {
  success: boolean;
  channel?: {
    name: string;
    subscribers: number;
    description: string;
    url: string;
  };
  performance?: Record<string, unknown>;
  content?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  videos_analyzed?: number;
  error?: string;
}

export interface CloakPostResult {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

// ── Service ───────────────────────────────────────────────────

class ContentFactoryService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = getConfig().CONTENT_FACTORY_URL;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300_000, // 5 min — video/loop generation can be slow
      headers: {
        'Content-Type': 'application/json',
        // media-api :8767 requires X-API-Key when EBOOK_API_KEY is set (security: gap-1)
        'X-API-Key': getConfig().EBOOK_API_KEY || '',
      },
    });
  }

  /** Health check — returns true if Python API is reachable */
  async isAvailable(): Promise<boolean> {
    try {
      const resp = await this.client.get('/health', { timeout: 5000 });
      return resp.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ── Storyboard ────────────────────────────────────────────

  async createStoryboard(
    prompt: string,
    opts: {
      style?: string;
      numScenes?: number;
      aspectRatio?: string;
    } = {},
  ): Promise<StoryboardResult> {
    const resp = await this.client.post('/image/storyboard', {
      prompt,
      style: opts.style || 'cinematic',
      num_scenes: opts.numScenes || 4,
      aspect_ratio: opts.aspectRatio || '16:9',
    });
    return resp.data;
  }

  /** Get storyboard image as Buffer for sending via Telegram */
  async getStoryboardImage(imagePath: string): Promise<Buffer | null> {
    try {
      // Extract relative path from session dir
      const relativePath = imagePath.includes('storyboard_output')
        ? imagePath.split('storyboard_output/')[1]
        : imagePath;
      const resp = await this.client.get(`/image/storyboard/image/${relativePath}`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(resp.data);
    } catch {
      return null;
    }
  }

  // ── TTS ───────────────────────────────────────────────────

  async synthesizeSpeech(
    text: string,
    opts: {
      language?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
    } = {},
  ): Promise<TTSResult> {
    const resp = await this.client.post('/audio/speech', {
      text,
      language: opts.language || 'id',
      voice: opts.voice,
      rate: opts.rate || '+0%',
      pitch: opts.pitch || '+0Hz',
    });
    return resp.data;
  }

  async listVoices(language?: string): Promise<{ voices: Array<{ name: string; language: string; gender: string }> }> {
    const resp = await this.client.get('/audio/speech/voices', {
      params: language ? { language } : {},
    });
    return resp.data;
  }

  /** Get TTS audio as Buffer */
  async getTTSAudio(audioPath: string): Promise<Buffer | null> {
    try {
      const filename = path.basename(audioPath);
      const resp = await this.client.get(`/audio/speech/media/${filename}`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(resp.data);
    } catch {
      return null;
    }
  }

  // ── Suno AI Music ─────────────────────────────────────────

  async generateSunoMusic(
    prompt: string,
    opts: {
      style?: string;
      lyrics?: string;
      instrumental?: boolean;
    } = {},
  ): Promise<SunoResult> {
    const resp = await this.client.post('/audio/music', {
      prompt,
      style: opts.style,
      lyrics: opts.lyrics,
      instrumental: opts.instrumental ?? true,
    });
    return resp.data;
  }

  async generateLofi(mood: string = 'chill'): Promise<SunoResult> {
    const resp = await this.client.post('/audio/music/lofi', null, {
      params: { mood },
    });
    return resp.data;
  }

  async generateBGM(theme: string = 'corporate'): Promise<SunoResult> {
    const resp = await this.client.post('/audio/music/bgm', null, {
      params: { theme },
    });
    return resp.data;
  }

  // ── Music Generator ───────────────────────────────────────

  async generateMusic(
    prompt: string,
    opts: {
      duration?: number;
      engine?: string;
      style?: string;
    } = {},
  ): Promise<MusicResult> {
    const resp = await this.client.post('/audio/music', {
      prompt,
      duration_seconds: opts.duration || 60,
      engine: opts.engine || 'auto',
      style: opts.style,
    });
    return resp.data;
  }

  async generateThemedBGM(theme: string = 'corporate'): Promise<MusicResult> {
    const resp = await this.client.post('/audio/music/bgm', null, {
      params: { theme },
    });
    return resp.data;
  }

  // ── Looping Video ─────────────────────────────────────────

  async createLoop(
    audioPath: string,
    opts: {
      durationMinutes?: number;
      visualType?: string;
      resolution?: string;
      colors?: string;
      imagePath?: string;
    } = {},
  ): Promise<LoopResult> {
    const resp = await this.client.post('/video/loop', {
      audio_path: audioPath,
      duration_minutes: opts.durationMinutes || 60,
      visual_type: opts.visualType || 'gradient',
      resolution: opts.resolution || '1920x1080',
      colors: opts.colors,
      image_path: opts.imagePath,
    });
    return resp.data;
  }

  // ── Channel Analysis ──────────────────────────────────────

  async analyzeChannel(
    channelUrl: string,
    opts: {
      niche?: string;
      limit?: number;
    } = {},
  ): Promise<ChannelAnalysis> {
    const resp = await this.client.post('/analyze/channel', {
      channel_url: channelUrl,
      niche: opts.niche || '',
      limit: opts.limit || 50,
    });
    return resp.data;
  }

  async compareChannels(
    channelUrls: string[],
    niche: string = '',
  ): Promise<ChannelAnalysis> {
    const resp = await this.client.post('/analyze/compare', {
      channel_urls: channelUrls,
      niche,
    });
    return resp.data;
  }

  async getChannelInfo(channelUrl: string): Promise<Record<string, unknown>> {
    const resp = await this.client.get('/analyze/info', {
      params: { channel_url: channelUrl },
    });
    return resp.data;
  }

  // ── CloakBrowser ──────────────────────────────────────────

  async listProfiles(platform?: string): Promise<{ profiles: Array<Record<string, unknown>> }> {
    const resp = await this.client.get('/cloak/profiles', {
      params: platform ? { platform } : {},
    });
    return resp.data;
  }

  async postToSocial(
    profileId: string,
    mediaPath: string,
    caption: string,
    platform: string,
    opts: {
      link?: string;
      tags?: string[];
    } = {},
  ): Promise<CloakPostResult> {
    const resp = await this.client.post('/cloak/post', {
      profile_id: profileId,
      media_path: mediaPath,
      caption,
      platform,
      link: opts.link,
      tags: opts.tags,
    });
    return resp.data;
  }

  async batchPost(
    profileIds: string[],
    mediaPath: string,
    caption: string,
    platform: string,
    link?: string,
  ): Promise<{ results: CloakPostResult[] }> {
    const resp = await this.client.post('/cloak/batch-post', {
      profile_ids: profileIds,
      media_path: mediaPath,
      caption,
      platform,
      link,
    });
    return resp.data;
  }

  // ── File Upload ───────────────────────────────────────────

  /** Upload a local file to the Python API for processing */
  async uploadAudio(filePath: string): Promise<{ success: boolean; path: string; filename: string }> {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    const resp = await this.client.post('/upload/audio', fileBuffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
      params: { filename },
    });
    return resp.data;
  }

  // ── Re-Metadata ─────────────────────────────────────────

  async remetaVideo(params: {
    source: string;
    overlay?: string;
    watermark?: string;
    position?: string;
    speed?: number;
    colorShift?: boolean;
    niche?: string;
    platform?: string;
    language?: string;
  }): Promise<{ success: boolean; video_path?: string; metadata?: Record<string, unknown>; changes_applied?: string[]; original_hash?: string; new_hash?: string; error?: string }> {
    const resp = await this.client.post('/video/remeta', {
      source: params.source,
      overlay: params.overlay ?? '',
      watermark: params.watermark ?? '',
      position: params.position ?? 'bottom_right',
      speed: params.speed ?? 0,
      color_shift: params.colorShift ?? true,
      niche: params.niche ?? 'general',
      platform: params.platform ?? 'tiktok',
      language: params.language ?? 'id',
    });
    return resp.data;
  }

  // ── Repurpose (multi-source remix) ───────────────────────

  async repurposeVideo(params: {
    sources: string[];
    targetDuration?: number;
    platform?: string;
    niche?: string;
    style?: string;
    language?: string;
    colorPreset?: string;
    transitionStyle?: string;
    overlayText?: string;
    watermarkText?: string;
    bgmPath?: string;
    bgmVolume?: number;
    addSubtitles?: boolean;
    subtitleStyle?: string;
  }): Promise<{ success: boolean; video_path?: string; metadata?: Record<string, unknown>; segments_used?: unknown[]; duration?: number; platform?: string; error?: string }> {
    const resp = await this.client.post('/video/repurpose', {
      sources: params.sources,
      target_duration: params.targetDuration ?? 180,
      platform: params.platform ?? 'tiktok',
      niche: params.niche ?? 'general',
      style: params.style ?? 'educational',
      language: params.language ?? 'id',
      color_preset: params.colorPreset ?? 'cinematic',
      transition_style: params.transitionStyle ?? 'crossfade',
      overlay_text: params.overlayText ?? '',
      watermark_text: params.watermarkText ?? '',
      bgm_path: params.bgmPath ?? '',
      bgm_volume: params.bgmVolume ?? 0.15,
      add_subtitles: params.addSubtitles ?? true,
      subtitle_style: params.subtitleStyle ?? 'karaoke',
    });
    return resp.data;
  }

  // ── Video Upload ─────────────────────────────────────────

  async uploadVideo(filePath: string): Promise<{ success: boolean; path: string; filename: string }> {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const resp = await this.client.post('/upload/video', fileBuffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
      params: { filename },
    });
    return resp.data;
  }
}

export const contentFactoryService = new ContentFactoryService();
