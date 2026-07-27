/**
 * Create Command — Shared Helpers
 *
 * Utility functions used by the legacy create flow.
 * Extracted from create.ts god object.
 */

/**
 * Build prompt based on scene description
 */
export function buildPrompt(
  description: string,
  platform: string,
  duration: number,
  customPrompt?: string | null
): string {
  const baseDescription = customPrompt ? `${customPrompt} - ${description}` : description;
  return `${duration}s ${baseDescription}, high quality, ${platform} format, professional style`;
}

/**
 * Get aspect ratio for platform
 */
export function getAspectRatio(platform: string): string {
  const ratios: { [key: string]: string } = {
    tiktok: "9:16",
    shorts: "9:16",
    reels: "9:16",
    facebook: "16:9",
    youtube: "16:9",
    instagram: "4:5",
    square: "1:1",
  };
  return ratios[platform] || "9:16";
}

/**
 * Get style for niche
 */
export function getStyleForNiche(niche: string): string {
  const styles: { [key: string]: string } = {
    trading: "professional",
    fitness: "energetic",
    cooking: "appetizing",
    tech: "modern",
    travel: "cinematic",
    education: "clear",
  };
  return styles[niche] || "professional";
}
