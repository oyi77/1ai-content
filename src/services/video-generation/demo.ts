// Demo-mode video stub (split from video-generation.service.ts).
import type { VideoGenerationParams, VideoGenerationResult } from "./types";

/**
 * Generate demo video for testing
 */
export function generateDemoVideo(
  _params: VideoGenerationParams,
  _duration: number,
  _niche: string,
  _styles: string[],
): VideoGenerationResult {
  const sampleVideos = [
    "https://media.giphy.com/media/RJ8SJ3dIKdCf2/giphy.mp4",
    "https://media.giphy.com/media/3o7TKQfp3x8G5hLJiE/giphy.mp4",
    "https://media.giphy.com/media/26uf1EKv0ZN5sKtJS/giphy.mp4",
    "https://media.giphy.com/media/jW38p3xgeF23rW6KG8/giphy.mp4",
    "https://media.giphy.com/media/12NlCFUvTokWXe/giphy.mp4",
  ];

  const randomVideo =
    sampleVideos[Math.floor(Math.random() * sampleVideos.length)];

  return {
    success: true,
    videoUrl: randomVideo,
    thumbnailUrl:
      "https://via.placeholder.com/1080x1920/000000/ffffff?text=Demo+Video",
    jobId: `demo-${Date.now()}`,
  };
}
