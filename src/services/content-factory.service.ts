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
    this.baseUrl = process.env.CONTENT_FACTORY_URL || 'http://localhost:8767';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300_000, // 5 min — video/loop generation can be slow
      headers: { 'Content-Type': 'application/json' },
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
    const resp = await this.client.post('/storyboard/create', {
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
      const resp = await this.client.get(`/storyboard/image/${relativePath}`, {
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
    const resp = await this.client.post('/tts/synthesize', {
      text,
      language: opts.language || 'id',
      voice: opts.voice,
      rate: opts.rate || '+0%',
      pitch: opts.pitch || '+0Hz',
    });
    return resp.data;
  }

  async listVoices(language?: string): Promise<{ voices: Array<{ name: string; language: string; gender: string }> }> {
    const resp = await this.client.get('/tts/voices', {
      params: language ? { language } : {},
    });
    return resp.data;
  }

  /** Get TTS audio as Buffer */
  async getTTSAudio(audioPath: string): Promise<Buffer | null> {
    try {
      const filename = path.basename(audioPath);
      const resp = await this.client.get(`/tts/audio/${filename}`, {
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
    const resp = await this.client.post('/suno/generate', {
      prompt,
      style: opts.style,
      lyrics: opts.lyrics,
      instrumental: opts.instrumental ?? true,
    });
    return resp.data;
  }

  async generateLofi(mood: string = 'chill'): Promise<SunoResult> {
    const resp = await this.client.post('/suno/lofi', null, {
      params: { mood },
    });
    return resp.data;
  }

  async generateBGM(theme: string = 'corporate'): Promise<SunoResult> {
    const resp = await this.client.post('/suno/bgm', null, {
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
    const resp = await this.client.post('/music/generate', {
      prompt,
      duration_seconds: opts.duration || 60,
      engine: opts.engine || 'auto',
      style: opts.style,
    });
    return resp.data;
  }

  async generateThemedBGM(theme: string = 'corporate'): Promise<MusicResult> {
    const resp = await this.client.post('/music/bgm', null, {
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
    const resp = await this.client.post('/loop/create', {
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
}

export const contentFactoryService = new ContentFactoryService();
