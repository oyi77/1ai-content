/**
 * Video Service — Facade
 *
 * Re-exports all video service methods from the split domain files:
 *   - video-lifecycle.service.ts (CRUD/lifecycle)
 *   - video-library.service.ts (favorites, trash, listing)
 *   - video-storyboard.service.ts (storyboard/prompt generation)
 *
 * This file exists for backward compatibility — 11+ files import from here.
 */

import { Video } from "@prisma/client";
import { VideoLifecycleService } from "./video-lifecycle.service";
import { VideoLibraryService } from "./video-library.service";
import { VideoStoryboardService } from "./video-storyboard.service";

// Re-export for direct imports
export { VideoLifecycleService } from "./video-lifecycle.service";
export { VideoLibraryService } from "./video-library.service";
export { VideoStoryboardService } from "./video-storyboard.service";

// Facade class for backward compatibility
// Consumers call `VideoService.methodName()` — this delegates to the right domain class.
export class VideoService {
  // Lifecycle
  static createJob = VideoLifecycleService.createJob;
  static updateProgress = VideoLifecycleService.updateProgress;
  static setOutput = VideoLifecycleService.setOutput;
  static updateStatus = VideoLifecycleService.updateStatus;
  static getByJobId = VideoLifecycleService.getByJobId;
  static upsertForInterception = VideoLifecycleService.upsertForInterception;
  static deleteVideo = VideoLifecycleService.deleteVideo;
  static restoreVideo = VideoLifecycleService.restoreVideo;
  static permanentlyDelete = VideoLifecycleService.permanentlyDelete;
  static processJob = VideoLifecycleService.processJob;

  // Library
  static toggleFavorite = VideoLibraryService.toggleFavorite;
  static getUserFavorites = VideoLibraryService.getUserFavorites;
  static getUserTrash = VideoLibraryService.getUserTrash;
  static getUserVideos = VideoLibraryService.getUserVideos;

  // Storyboard
  static generatePrompt = VideoStoryboardService.generatePrompt;
  static getCreditCost = VideoStoryboardService.getCreditCost;
  static getNiches = VideoStoryboardService.getNiches;
  static getPlatforms = VideoStoryboardService.getPlatforms;
  static generateStoryboard = VideoStoryboardService.generateStoryboard;
  static generateScenePrompt = VideoStoryboardService.generateScenePrompt;
  static generateCaption = VideoStoryboardService.generateCaption;
  static getStoryboardTemplate = VideoStoryboardService.getStoryboardTemplate;
  static updateStoryboardTemplate = VideoStoryboardService.updateStoryboardTemplate;
}
