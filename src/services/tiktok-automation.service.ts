/**
 * TikTok Automation Service — TypeScript bridge to Python services
 *
 * Bridges to the 1AI-Content Factory Python API for:
 * - Carousel generation
 * - AutoPilot scheduling & publishing
 * - Content calendar
 * - A/B testing
 * - Trending scan + auto-generate
 */

import axios, { type AxiosInstance } from 'axios';
import { getConfig } from '@/config/env';
import { logger } from '@/utils/logger';

// ── Types ─────────────────────────────────────────────────────

export interface CarouselSlide {
  index: number;
  type: 'cover' | 'content' | 'closing';
  headline: string;
  body: string;
  icon?: string;
  cta?: string;
}

export interface CarouselResult {
  success: boolean;
  job_id?: string;
  output_dir?: string;
  slides?: string[];
  content?: {
    title: string;
    slides: CarouselSlide[];
    caption: string;
    hashtags: string[];
  };
  caption?: string;
  hashtags?: string[];
  cover_text?: string;
  slide_count?: number;
  error?: string;
}

export interface AutoPilotJob {
  job_id: string;
  name: string;
  status: string;
  config: {
    niche: string;
    platforms: string[];
    videos_per_day: number;
    posting_times: string[];
    content_type: string;
    style: string;
    language: string;
    auto_publish: boolean;
    tiktok_profile_id: string;
  };
  last_run?: string;
  next_run?: string;
  run_count: number;
}

export interface AutoPilotStatus {
  active_jobs: number;
  total_jobs: number;
  jobs: AutoPilotJob[];
  recent_results: Record<string, unknown>[];
  last_run?: string;
}

export interface CalendarEntry {
  id: string;
  user_id: number;
  topic: string;
  scheduled_at: string;
  platform: string;
  content_type: string;
  caption: string;
  hashtags: string[];
  status: string;
  media_url?: string;
  auto_post: boolean;
  created_at: string;
}

export interface TrendingResult {
  youtube?: Record<string, unknown>[];
  google_trends?: Record<string, unknown>[];
  reddit?: Record<string, unknown>[];
}

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  platform: string;
  content_type: string;
  topic: string;
  variant_a: Record<string, unknown>;
  variant_b: Record<string, unknown>;
  metrics_a: { views: number; likes: number; shares: number; comments: number };
  metrics_b: { views: number; likes: number; shares: number; comments: number };
  status: string;
  winner?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface CarouselStyle {
  name: string;
  description: string;
}

// ── Service ───────────────────────────────────────────────────

export class TikTokAutomationService {
  private client: AxiosInstance;

  constructor() {
    const appConfig = getConfig();
    const baseURL = appConfig.CONTENT_FACTORY_URL || 'http://127.0.0.1:8767';
    this.client = axios.create({
      baseURL,
      timeout: 120_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Carousel ──────────────────────────────────────────────

  async createCarousel(options: {
    topic: string;
    numSlides?: number;
    style?: string;
    platform?: string;
    language?: string;
  }): Promise<CarouselResult> {
    try {
      const { data } = await this.client.post<CarouselResult>('/carousel/create', {
        topic: options.topic,
        num_slides: options.numSlides ?? 7,
        style: options.style ?? 'outline',
        platform: options.platform ?? 'tiktok',
        language: options.language ?? 'id',
      });
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[TikTokAutomation] Carousel create failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async getCarouselStyles(): Promise<Record<string, CarouselStyle>> {
    try {
      const { data } = await this.client.get<{ styles: Record<string, CarouselStyle> }>('/carousel/styles');
      return data.styles ?? {};
    } catch {
      return {};
    }
  }

  // ── AutoPilot ─────────────────────────────────────────────

  async createAutoPilotJob(options: {
    name: string;
    niche: string;
    platforms?: string[];
    videosPerDay?: number;
    postingTimes?: string[];
    contentType?: string;
    style?: string;
    language?: string;
    autoPublish?: boolean;
    tiktokProfileId?: string;
  }): Promise<AutoPilotJob> {
    const { data } = await this.client.post<AutoPilotJob>('/autopilot/create', {
      name: options.name,
      niche: options.niche,
      platforms: options.platforms ?? ['tiktok'],
      videos_per_day: options.videosPerDay ?? 3,
      posting_times: options.postingTimes ?? ['11:00', '15:00', '19:00'],
      content_type: options.contentType ?? 'video',
      style: options.style ?? 'educational',
      language: options.language ?? 'id',
      auto_publish: options.autoPublish ?? true,
      tiktok_profile_id: options.tiktokProfileId ?? '',
    });
    return data;
  }

  async getAutoPilotStatus(): Promise<AutoPilotStatus> {
    try {
      const { data } = await this.client.get<AutoPilotStatus>('/autopilot/status');
      return data;
    } catch {
      return { active_jobs: 0, total_jobs: 0, jobs: [], recent_results: [] };
    }
  }

  async runAutoPilot(): Promise<{ jobs_run: number; results: Record<string, unknown>[] }> {
    const { data } = await this.client.post<{ jobs_run: number; results: Record<string, unknown>[] }>('/autopilot/run');
    return data;
  }

  // ── Trending ──────────────────────────────────────────────

  async scanTrending(niche?: string, region?: string): Promise<TrendingResult> {
    try {
      const { data } = await this.client.get<TrendingResult>('/trending/scan', {
        params: { niche: niche ?? '', region: region ?? 'ID' },
      });
      return data;
    } catch {
      return {};
    }
  }

  async generateFromTrending(options: {
    topic: string;
    contentType?: string;
    platform?: string;
    language?: string;
  }): Promise<CarouselResult> {
    const { data } = await this.client.post<CarouselResult>('/trending/generate', null, {
      params: {
        topic: options.topic,
        content_type: options.contentType ?? 'video',
        platform: options.platform ?? 'tiktok',
        language: options.language ?? 'id',
      },
    });
    return data;
  }

  // ── Calendar ──────────────────────────────────────────────

  async scheduleContent(options: {
    userId: number;
    topic: string;
    scheduledAt: string;
    platform?: string;
    contentType?: string;
    caption?: string;
    hashtags?: string[];
    niche?: string;
    style?: string;
    language?: string;
    autoPost?: boolean;
  }): Promise<CalendarEntry> {
    const { data } = await this.client.post<CalendarEntry>('/calendar/schedule', {
      user_id: options.userId,
      topic: options.topic,
      scheduled_at: options.scheduledAt,
      platform: options.platform ?? 'tiktok',
      content_type: options.contentType ?? 'video',
      caption: options.caption ?? '',
      hashtags: options.hashtags ?? [],
      niche: options.niche ?? '',
      style: options.style ?? 'educational',
      language: options.language ?? 'id',
      auto_post: options.autoPost ?? false,
    });
    return data;
  }

  async getCalendarEntries(userId: number, status?: string, platform?: string): Promise<CalendarEntry[]> {
    try {
      const { data } = await this.client.get<{ entries: CalendarEntry[] }>(`/calendar/list/${userId}`, {
        params: { status, platform },
      });
      return data.entries ?? [];
    } catch {
      return [];
    }
  }

  // ── A/B Testing ───────────────────────────────────────────

  async createABTest(options: {
    userId: number;
    name: string;
    topic: string;
    platform?: string;
    contentType?: string;
    language?: string;
  }): Promise<ABTest> {
    const { data } = await this.client.post<ABTest>('/ab-test/create', {
      user_id: options.userId,
      name: options.name,
      topic: options.topic,
      platform: options.platform ?? 'tiktok',
      content_type: options.contentType ?? 'caption',
      language: options.language ?? 'id',
    });
    return data;
  }

  async getABTests(userId: number, status?: string): Promise<ABTest[]> {
    try {
      const { data } = await this.client.get<{ tests: ABTest[] }>(`/ab-test/list/${userId}`, {
        params: { status },
      });
      return data.tests ?? [];
    } catch {
      return [];
    }
  }

  async startABTest(userId: number, testId: string): Promise<ABTest | null> {
    try {
      const { data } = await this.client.post<ABTest>(`/ab-test/${testId}/start`, null, {
        params: { user_id: userId },
      });
      return data;
    } catch {
      return null;
    }
  }

  async endABTest(userId: number, testId: string): Promise<ABTest | null> {
    try {
      const { data } = await this.client.post<ABTest>(`/ab-test/${testId}/end`, null, {
        params: { user_id: userId },
      });
      return data;
    } catch {
      return null;
    }
  }

  // ── Content Repurpose (anti-copyright remix) ─────────────

  async repurposeContent(options: {
    sources: string[];
    targetDuration?: number;
    platform?: string;
    niche?: string;
    style?: string;
    language?: string;
    colorPreset?: string;
    transitionStyle?: string;
    overlayText?: string;
    overlayPosition?: string;
    watermarkText?: string;
    watermarkImage?: string;
    bgmPath?: string;
    bgmVolume?: number;
    voiceoverPath?: string;
    speedMin?: number;
    speedMax?: number;
    addSubtitles?: boolean;
    subtitleStyle?: string;
  }): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/repurpose', {
      sources: options.sources,
      target_duration: options.targetDuration ?? 180,
      platform: options.platform ?? 'tiktok',
      niche: options.niche ?? 'general',
      style: options.style ?? 'educational',
      language: options.language ?? 'id',
      color_preset: options.colorPreset ?? 'cinematic',
      transition_style: options.transitionStyle ?? 'crossfade',
      overlay_text: options.overlayText ?? '',
      overlay_position: options.overlayPosition ?? 'lower_third',
      watermark_text: options.watermarkText ?? '',
      watermark_image: options.watermarkImage ?? '',
      bgm_path: options.bgmPath ?? '',
      bgm_volume: options.bgmVolume ?? 0.15,
      voiceover_path: options.voiceoverPath ?? '',
      speed_min: options.speedMin ?? 0.8,
      speed_max: options.speedMax ?? 1.5,
      add_subtitles: options.addSubtitles ?? true,
      subtitle_style: options.subtitleStyle ?? 'karaoke',
    });
    return data as Record<string, unknown>;
  }

  /** Backward compat alias */
  async regenerateContent(options: {
    sources: string[];
    targetDuration?: number;
    niche?: string;
    style?: string;
    language?: string;
  }): Promise<Record<string, unknown>> {
    return this.repurposeContent(options);
  }

  // ── Content Re-Metadata (simple re-render) ──────────────

  async remetaContent(options: {
    source: string;
    overlay?: string;
    watermark?: string;
    position?: string;
    speed?: number;
    colorShift?: boolean;
    niche?: string;
    platform?: string;
    language?: string;
  }): Promise<Record<string, unknown>> {
    const { data } = await this.client.post('/remeta', {
      source: options.source,
      overlay: options.overlay ?? '',
      watermark: options.watermark ?? '',
      position: options.position ?? 'bottom_right',
      speed: options.speed ?? 0,
      color_shift: options.colorShift ?? true,
      niche: options.niche ?? 'general',
      platform: options.platform ?? 'tiktok',
      language: options.language ?? 'id',
    });
    return data as Record<string, unknown>;
  }
}

// Singleton
export const tiktokAutomation = new TikTokAutomationService();
