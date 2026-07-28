/**
 * Parse utilities — JSON extraction, fallback result builder.
 */
import type { VideoAnalysisResult } from './types';

/**
 * Extract JSON from a string that may contain markdown code fences or extra text.
 */
export function extractJSON(text: string): string {
  // Strip ```json ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Find first { ... } block
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) return bare[0];

  return text;
}

/**
 * Build a minimal fallback storyboard from a URL when Gemini is unavailable.
 */
export function buildFallbackResult(videoUrl: string): VideoAnalysisResult {
  return {
    success: true,
    niche: 'general',
    style: 'unknown',
    totalDuration: 15,
    transcript: '',
    storyboard: [
      {
        scene: 1,
        startTime: 0,
        duration: 15,
        description: 'Full video content (analysis unavailable)',
        prompt: `cinematic video recreation based on source: ${videoUrl.slice(0, 80)}`,
      },
    ],
    keyFramePaths: [],
  };
}
