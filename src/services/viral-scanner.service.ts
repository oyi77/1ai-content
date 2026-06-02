import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';

const execFileAsync = promisify(execFile);

export interface ViralVideo {
  url: string;
  title: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'twitter';
  views: number;
  likes: number;
  shares: number;
  comments: number;
  uploadDate: string;
  duration: number;
  thumbnail: string;
  author: string;
  hashtags: string[];
  viralityScore: number; // 0-100
}

export interface TrendingTopic {
  topic: string;
  volume: number;
  growth: number; // percentage
  platform: string;
  relatedVideos: ViralVideo[];
}

export interface ScanOptions {
  platform?: 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'all';
  niche?: string;
  minViews?: number;
  maxAge?: number; // days
  limit?: number;
  sortBy?: 'views' | 'likes' | 'shares' | 'virality';
}

export class ViralScannerService {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private cacheTTL = 3600000; // 1 hour

  /**
   * Scan for viral videos in a niche
   */
  async scanViralVideos(options: ScanOptions = {}): Promise<ViralVideo[]> {
    const {
      platform = 'all',
      niche,
      minViews = 10000,
      maxAge = 7,
      limit = 50,
      sortBy = 'virality',
    } = options;

    logger.info(`Scanning viral videos: platform=${platform}, niche=${niche}`);

    const cacheKey = `viral:${platform}:${niche}:${minViews}:${maxAge}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let videos: ViralVideo[] = [];

    try {
      // Scan YouTube trending
      if (platform === 'all' || platform === 'youtube') {
        const youtubeVideos = await this.scanYouTube(niche, minViews, maxAge, limit);
        videos.push(...youtubeVideos);
      }

      // Scan TikTok trending
      if (platform === 'all' || platform === 'tiktok') {
        const tiktokVideos = await this.scanTikTok(niche, minViews, maxAge, limit);
        videos.push(...tiktokVideos);
      }

      // Scan Instagram Reels
      if (platform === 'all' || platform === 'instagram') {
        const instagramVideos = await this.scanInstagram(niche, minViews, maxAge, limit);
        videos.push(...instagramVideos);
      }

      // Sort by virality score
      videos.sort((a, b) => {
        switch (sortBy) {
          case 'views': return b.views - a.views;
          case 'likes': return b.likes - a.likes;
          case 'shares': return b.shares - a.shares;
          default: return b.viralityScore - a.viralityScore;
        }
      });

      // Limit results
      videos = videos.slice(0, limit);

      this.setCache(cacheKey, videos);
      return videos;
    } catch (error: any) {
      logger.error('Viral scan failed:', error);
      return [];
    }
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(platform: string = 'all', limit = 20): Promise<TrendingTopic[]> {
    logger.info(`Getting trending topics for ${platform}`);

    const cacheKey = `trending:${platform}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const topics: TrendingTopic[] = [];

    try {
      // YouTube trending
      if (platform === 'all' || platform === 'youtube') {
        const { stdout } = await execFileAsync('yt-dlp', [
          '--dump-json',
          '--no-download',
          '--flat-playlist',
          '--playlist-end', '50',
          'https://www.youtube.com/feed/trending',
        ], { timeout: 60000 });

        const lines = stdout.trim().split('\n');
        const videos = lines.map(line => JSON.parse(line));

        // Extract trending topics from video titles
        const topicMap = new Map<string, ViralVideo[]>();
        for (const video of videos) {
          const words = (video.title || '').split(/\s+/).filter((w: string) => w.length > 3);
          for (const word of words) {
            const topic = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (topic.length > 3) {
              if (!topicMap.has(topic)) topicMap.set(topic, []);
              topicMap.get(topic)!.push({
                url: video.url || video.webpage_url || '',
                title: video.title || '',
                platform: 'youtube',
                views: video.view_count || 0,
                likes: video.like_count || 0,
                shares: 0,
                comments: video.comment_count || 0,
                uploadDate: video.upload_date || '',
                duration: video.duration || 0,
                thumbnail: video.thumbnail || '',
                author: video.uploader || video.channel || '',
                hashtags: [],
                viralityScore: this.calculateViralityScore(video),
              });
            }
          }
        }

        // Convert to trending topics
        for (const [topic, relatedVideos] of topicMap) {
          if (relatedVideos.length >= 2) {
            topics.push({
              topic,
              volume: relatedVideos.reduce((sum, v) => sum + v.views, 0),
              growth: 0, // Would need historical data
              platform: 'youtube',
              relatedVideos: relatedVideos.slice(0, 5),
            });
          }
        }
      }

      // Sort by volume
      topics.sort((a, b) => b.volume - a.volume);
      topics.splice(limit);

      this.setCache(cacheKey, topics);
      return topics;
    } catch (error: any) {
      logger.error('Trending topics failed:', error);
      return [];
    }
  }

  /**
   * Get competitor's viral content
   */
  async getCompetitorViralContent(competitorUrl: string, limit = 20): Promise<ViralVideo[]> {
    logger.info(`Scanning competitor: ${competitorUrl}`);

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', String(limit),
        competitorUrl,
      ], { timeout: 60000 });

      const lines = stdout.trim().split('\n');
      return lines
        .map(line => {
          const video = JSON.parse(line);
          return {
            url: video.url || video.webpage_url || '',
            title: video.title || '',
            platform: this.detectPlatform(competitorUrl),
            views: video.view_count || 0,
            likes: video.like_count || 0,
            shares: 0,
            comments: video.comment_count || 0,
            uploadDate: video.upload_date || '',
            duration: video.duration || 0,
            thumbnail: video.thumbnail || '',
            author: video.uploader || video.channel || '',
            hashtags: this.extractHashtags(video.title || video.description || ''),
            viralityScore: this.calculateViralityScore(video),
          };
        })
        .sort((a, b) => b.viralityScore - a.viralityScore);
    } catch (error: any) {
      logger.error('Competitor scan failed:', error);
      return [];
    }
  }

  /**
   * Scan YouTube for viral videos
   */
  private async scanYouTube(niche?: string, minViews = 10000, maxAge = 7, limit = 50): Promise<ViralVideo[]> {
    const searchQuery = niche ? `ytsearch${limit}:${niche} viral` : `https://www.youtube.com/feed/trending`;

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', String(limit),
        '--dateafter', this.getDateAfter(maxAge),
        searchQuery,
      ], { timeout: 60000 });

      const lines = stdout.trim().split('\n');
      return lines
        .map(line => {
          const video = JSON.parse(line);
          return {
            url: video.url || video.webpage_url || '',
            title: video.title || '',
            platform: 'youtube' as const,
            views: video.view_count || 0,
            likes: video.like_count || 0,
            shares: 0,
            comments: video.comment_count || 0,
            uploadDate: video.upload_date || '',
            duration: video.duration || 0,
            thumbnail: video.thumbnail || '',
            author: video.uploader || video.channel || '',
            hashtags: this.extractHashtags(video.title || ''),
            viralityScore: this.calculateViralityScore(video),
          };
        })
        .filter(v => v.views >= minViews);
    } catch {
      return [];
    }
  }

  /**
   * Scan TikTok for viral videos
   */
  private async scanTikTok(niche?: string, minViews = 10000, maxAge = 7, limit = 50): Promise<ViralVideo[]> {
    // TikTok search via yt-dlp
    const searchUrl = niche
      ? `https://www.tiktok.com/search?q=${encodeURIComponent(niche)}`
      : 'https://www.tiktok.com/discover';

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', String(limit),
        searchUrl,
      ], { timeout: 60000 });

      const lines = stdout.trim().split('\n');
      return lines
        .map(line => {
          const video = JSON.parse(line);
          return {
            url: video.url || video.webpage_url || '',
            title: video.title || video.description || '',
            platform: 'tiktok' as const,
            views: video.view_count || video.play_count || 0,
            likes: video.like_count || video.digg_count || 0,
            shares: video.share_count || 0,
            comments: video.comment_count || 0,
            uploadDate: video.upload_date || '',
            duration: video.duration || 0,
            thumbnail: video.thumbnail || '',
            author: video.uploader || video.author || '',
            hashtags: this.extractHashtags(video.description || ''),
            viralityScore: this.calculateViralityScore(video),
          };
        })
        .filter(v => v.views >= minViews);
    } catch {
      return [];
    }
  }

  /**
   * Scan Instagram for viral reels
   */
  private async scanInstagram(niche?: string, minViews = 10000, maxAge = 7, limit = 50): Promise<ViralVideo[]> {
    // Instagram is harder to scrape - use hashtag pages
    const searchUrl = niche
      ? `https://www.instagram.com/explore/tags/${encodeURIComponent(niche)}/`
      : 'https://www.instagram.com/explore/';

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', String(limit),
        searchUrl,
      ], { timeout: 60000 });

      const lines = stdout.trim().split('\n');
      return lines
        .map(line => {
          const video = JSON.parse(line);
          return {
            url: video.url || video.webpage_url || '',
            title: video.title || video.description || '',
            platform: 'instagram' as const,
            views: video.view_count || video.play_count || 0,
            likes: video.like_count || 0,
            shares: 0,
            comments: video.comment_count || 0,
            uploadDate: video.upload_date || '',
            duration: video.duration || 0,
            thumbnail: video.thumbnail || '',
            author: video.uploader || '',
            hashtags: this.extractHashtags(video.description || ''),
            viralityScore: this.calculateViralityScore(video),
          };
        })
        .filter(v => v.views >= minViews);
    } catch {
      return [];
    }
  }

  /**
   * Calculate virality score (0-100)
   */
  private calculateViralityScore(video: any): number {
    const views = video.view_count || 0;
    const likes = video.like_count || 0;
    const comments = video.comment_count || 0;
    const duration = video.duration || 0;

    // Weight factors
    const viewScore = Math.min(views / 1000000, 40); // max 40 points for 1M+ views
    const engagementRate = views > 0 ? (likes + comments) / views : 0;
    const engagementScore = Math.min(engagementRate * 1000, 30); // max 30 points
    const recencyScore = this.getRecencyScore(video.upload_date || '');
    const durationScore = duration >= 15 && duration <= 60 ? 20 : 10; // sweet spot: 15-60s

    return Math.min(
      Math.round(viewScore + engagementScore + recencyScore + durationScore),
      100
    );
  }

  /**
   * Get recency score (0-10)
   */
  private getRecencyScore(uploadDate: string): number {
    if (!uploadDate) return 5;

    const now = new Date();
    const upload = new Date(
      parseInt(uploadDate.slice(0, 4)),
      parseInt(uploadDate.slice(4, 6)) - 1,
      parseInt(uploadDate.slice(6, 8))
    );

    const daysDiff = (now.getTime() - upload.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 1) return 10;
    if (daysDiff <= 3) return 8;
    if (daysDiff <= 7) return 6;
    if (daysDiff <= 30) return 4;
    return 2;
  }

  /**
   * Extract hashtags from text
   */
  private extractHashtags(text: string): string[] {
    const matches = text.match(/#[\w\u4e00-\u9fff]+/g);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): 'youtube' | 'tiktok' | 'instagram' | 'twitter' {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    return 'youtube';
  }

  /**
   * Get date string for N days ago
   */
  private getDateAfter(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  private getFromCache(key: string): any {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.cacheTTL,
    });
  }
}

export const viralScannerService = new ViralScannerService();
