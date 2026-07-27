import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { ProviderError } from '@/utils/app-errors';

const execFileAsync = promisify(execFile);

export interface ClipOptions {
  url: string;
  startTime?: string; // HH:MM:SS or seconds
  endTime?: string;
  format?: 'mp4' | 'webm' | 'mkv';
  quality?: 'best' | 'worst' | '720p' | '1080p';
  outputPath?: string;
}

export interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  viewCount: number;
  likeCount: number;
  uploadDate: string;
  description: string;
  formats: Array<{
    formatId: string;
    ext: string;
    resolution: string;
    filesize: number;
  }>;
}

export class VideoClipperService {
  private downloadDir: string;

  constructor() {
    this.downloadDir = join(tmpdir(), '1ai-content', 'clips');
    this.ensureDir();
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }

  private async ensureDir() {
    await mkdir(this.downloadDir, { recursive: true });
  }

  /**
   * Get video info without downloading
   */
  async getVideoInfo(url: string): Promise<VideoInfo> {
    logger.info(`Getting video info: ${url}`);

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        url,
      ], { timeout: 30000 });

      const info = JSON.parse(stdout);

      return {
        title: info.title || 'Unknown',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        uploader: info.uploader || 'Unknown',
        viewCount: info.view_count || 0,
        likeCount: info.like_count || 0,
        uploadDate: info.upload_date || '',
        description: (info.description || '').slice(0, 500),
        formats: (info.formats || []).slice(0, 10).map((f: Record<string, unknown>) => ({
          formatId: f.format_id,
          ext: f.ext,
          resolution: f.resolution || 'audio only',
          filesize: f.filesize || 0,
        })),
      };
    } catch (error) {
      logger.error('Failed to get video info:', error);
      throw new ProviderError('VideoClipper', `Cannot fetch video info: ${(error as Error).message}`);
    }
  }

  /**
   * Download full video or clip
   */
  async downloadClip(options: ClipOptions): Promise<string> {
    const {
      url,
      startTime,
      endTime,
      format = 'mp4',
      quality = 'best',
      outputPath,
    } = options;

    const outputId = randomUUID();
    const outputFile = outputPath || join(this.downloadDir, `${outputId}.${format}`);

    logger.info(`Downloading clip: ${url} → ${outputFile}`);

    const args: string[] = [
      '--no-warnings',
      '--no-playlist',
      '-f', this.getFormatString(quality, format),
      '-o', outputFile,
    ];

    // Add time range if specified
    if (startTime || endTime) {
      args.push('--download-sections', `*${startTime || '0'}-${endTime || ''}`);
    }

    args.push(url);

    try {
      await execFileAsync('yt-dlp', args, { timeout: 300000 }); // 5 min timeout
      logger.info(`Download complete: ${outputFile}`);
      return outputFile;
    } catch (error) {
      logger.error('Download failed:', error);
      throw new ProviderError('VideoClipper', `Download failed: ${(error as Error).message}`);
    }
  }

  /**
   * Download multiple clips (batch)
   */
  async downloadBatch(urls: string[], options?: Partial<ClipOptions>): Promise<string[]> {
    const results: string[] = [];

    for (const url of urls) {
      try {
        const path = await this.downloadClip({ url, ...options });
        results.push(path);
      } catch (error) {
        logger.warn(`Failed to download ${url}: ${(error as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Extract audio from video
   */
  async extractAudio(url: string, format: 'mp3' | 'wav' | 'aac' = 'mp3'): Promise<string> {
    const outputId = randomUUID();
    const outputFile = join(this.downloadDir, `${outputId}.${format}`);

    logger.info(`Extracting audio: ${url}`);

    const args: string[] = [
      '--no-warnings',
      '--no-playlist',
      '-x',
      '--audio-format', format,
      '--audio-quality', '0',
      '-o', outputFile,
      url,
    ];

    try {
      await execFileAsync('yt-dlp', args, { timeout: 180000 });
      return outputFile;
    } catch (error) {
      throw new ProviderError('VideoClipper', `Audio extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Search for videos on a platform
   */
  async searchVideos(query: string, platform: 'youtube' | 'tiktok' | 'instagram' = 'youtube', limit = 10): Promise<VideoInfo[]> {
    logger.info(`Searching ${platform} for: ${query}`);

    const searchUrl = this.buildSearchUrl(query, platform);

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', String(limit),
        searchUrl,
      ], { timeout: 60000 });

      const lines = stdout.trim().split('\n');
      return lines.map(line => {
        const info = JSON.parse(line);
        return {
          title: info.title || 'Unknown',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          uploader: info.uploader || info.channel || 'Unknown',
          viewCount: info.view_count || 0,
          likeCount: info.like_count || 0,
          uploadDate: info.upload_date || '',
          description: '',
          formats: [],
        };
      });
    } catch (error) {
      logger.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Get trending videos (YouTube)
   */
  async getTrending(country = 'US', limit = 20): Promise<VideoInfo[]> {
    logger.info(`Getting trending videos for ${country}`);
    return this.searchVideos(`https://www.youtube.com/feed/trending?gl=${country}`, 'youtube', limit);
  }

  private getFormatString(quality: string, format: string): string {
    switch (quality) {
      case 'best':
        return `bestvideo[ext=${format}]+bestaudio/best[ext=${format}]/best`;
      case 'worst':
        return `worstvideo[ext=${format}]+worstaudio/worst[ext=${format}]/worst`;
      case '720p':
        return `bestvideo[height<=720][ext=${format}]+bestaudio/best[height<=720]`;
      case '1080p':
        return `bestvideo[height<=1080][ext=${format}]+bestaudio/best[height<=1080]`;
      default:
        return `bestvideo[ext=${format}]+bestaudio/best`;
    }
  }

  private buildSearchUrl(query: string, platform: string): string {
    switch (platform) {
      case 'youtube':
        return `ytsearch${10}:${query}`;
      case 'tiktok':
        return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      case 'instagram':
        return `https://www.instagram.com/explore/tags/${encodeURIComponent(query)}`;
      default:
        return `ytsearch${10}:${query}`;
    }
  }

  /**
   * Clean up temp files
   */
  async cleanup(maxAgeMs = 3600000): Promise<number> {
    // Clean files older than maxAgeMs (default 1 hour)
    // Implementation depends on file system monitoring
    return 0;
  }
}

export const videoClipperService = new VideoClipperService();
