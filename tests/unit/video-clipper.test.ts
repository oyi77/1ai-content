import { VideoClipperService } from '../../src/services/video-clipper.service';

describe('VideoClipperService', () => {
  let service: VideoClipperService;

  beforeEach(() => {
    service = new VideoClipperService();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service.downloadDir).toBeDefined();
    });
  });

  describe('getFormatString', () => {
    it('should return best format string', () => {
      const result = (service as any).getFormatString('best', 'mp4');
      expect(result).toContain('bestvideo');
      expect(result).toContain('mp4');
    });

    it('should return 720p format string', () => {
      const result = (service as any).getFormatString('720p', 'mp4');
      expect(result).toContain('720');
    });

    it('should return worst format string', () => {
      const result = (service as any).getFormatString('worst', 'mp4');
      expect(result).toContain('worst');
    });
  });

  describe('buildSearchUrl', () => {
    it('should build YouTube search URL', () => {
      const result = (service as any).buildSearchUrl('fitness', 'youtube');
      expect(result).toContain('ytsearch');
      expect(result).toContain('fitness');
    });

    it('should build TikTok search URL', () => {
      const result = (service as any).buildSearchUrl('fitness', 'tiktok');
      expect(result).toContain('tiktok.com');
      expect(result).toContain('fitness');
    });

    it('should build Instagram search URL', () => {
      const result = (service as any).buildSearchUrl('fitness', 'instagram');
      expect(result).toContain('instagram.com');
      expect(result).toContain('fitness');
    });
  });
});
