/**
 * Video Service Split Files — Direct Tests
 *
 * Tests the new domain-specific service classes:
 * - VideoLifecycleService
 * - VideoLibraryService
 * - VideoStoryboardService
 */

import { VideoLifecycleService } from '@/services/video-lifecycle.service';
import { VideoLibraryService } from '@/services/video-library.service';
import { VideoStoryboardService } from '@/services/video-storyboard.service';

// ── VideoLifecycleService ──
describe('VideoLifecycleService', () => {
  it('should be defined', () => {
    expect(VideoLifecycleService).toBeDefined();
    expect(typeof VideoLifecycleService.createJob).toBe('function');
    expect(typeof VideoLifecycleService.updateProgress).toBe('function');
    expect(typeof VideoLifecycleService.setOutput).toBe('function');
    expect(typeof VideoLifecycleService.updateStatus).toBe('function');
    expect(typeof VideoLifecycleService.getByJobId).toBe('function');
    expect(typeof VideoLifecycleService.upsertForInterception).toBe('function');
    expect(typeof VideoLifecycleService.deleteVideo).toBe('function');
    expect(typeof VideoLifecycleService.restoreVideo).toBe('function');
    expect(typeof VideoLifecycleService.permanentlyDelete).toBe('function');
    expect(typeof VideoLifecycleService.processJob).toBe('function');
  });
});

// ── VideoLibraryService ──
describe('VideoLibraryService', () => {
  it('should be defined', () => {
    expect(VideoLibraryService).toBeDefined();
    expect(typeof VideoLibraryService.toggleFavorite).toBe('function');
    expect(typeof VideoLibraryService.getUserFavorites).toBe('function');
    expect(typeof VideoLibraryService.getUserTrash).toBe('function');
    expect(typeof VideoLibraryService.getUserVideos).toBe('function');
  });
});

// ── VideoStoryboardService ──
describe('VideoStoryboardService', () => {
  it('should be defined', () => {
    expect(VideoStoryboardService).toBeDefined();
    expect(typeof VideoStoryboardService.generatePrompt).toBe('function');
    expect(typeof VideoStoryboardService.getCreditCost).toBe('function');
    expect(typeof VideoStoryboardService.getNiches).toBe('function');
    expect(typeof VideoStoryboardService.getPlatforms).toBe('function');
    expect(typeof VideoStoryboardService.generateStoryboard).toBe('function');
    expect(typeof VideoStoryboardService.generateScenePrompt).toBe('function');
    expect(typeof VideoStoryboardService.generateCaption).toBe('function');
    expect(typeof VideoStoryboardService.getStoryboardTemplate).toBe('function');
    expect(typeof VideoStoryboardService.updateStoryboardTemplate).toBe('function');
  });

  it('should return niche list', () => {
    const niches = VideoStoryboardService.getNiches();
    expect(Array.isArray(niches)).toBe(true);
    expect(niches.length).toBeGreaterThan(0);
    expect(niches[0]).toHaveProperty('id');
    expect(niches[0]).toHaveProperty('name');
  });

  it('should return platform list', () => {
    const platforms = VideoStoryboardService.getPlatforms();
    expect(Array.isArray(platforms)).toBe(true);
    expect(platforms.length).toBeGreaterThan(0);
    expect(platforms[0]).toHaveProperty('id');
  });

  it('should generate a prompt for a known niche', () => {
    const prompt = VideoStoryboardService.generatePrompt({
      niche: 'fnb',
      platform: 'tiktok',
      duration: 15,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should generate a scene prompt', () => {
    const scenePrompt = VideoStoryboardService.generateScenePrompt({
      niche: 'fnb',
      sceneType: 'hook',
      description: 'Close-up of burger',
    });
    expect(typeof scenePrompt).toBe('string');
    expect(scenePrompt).toContain('Close-up of burger');
  });
});
