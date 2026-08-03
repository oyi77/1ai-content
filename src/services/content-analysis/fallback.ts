/**
 * Fallback templates when all vision providers fail.
 */
import type { AnalysisResult } from './types';

const FALLBACK_TEMPLATES: Record<string, string> = {
  video:
    'Dynamic marketing video: opening hook shot (2s) with bold text overlay and dramatic zoom-in on product, ' +
    'problem scene (3s) showing pain point with desaturated color grade, solution reveal (4s) with product ' +
    'hero shot and warm lighting transition, social proof scene (3s) with testimonial text animation, CTA ' +
    'closing (3s) with brand colors and urgency text. Pacing: 2-3 cuts/second, transitions: mix of hard cuts ' +
    'and zoom transitions, color grade: warm highlights with teal shadows, camera: mix of static close-ups ' +
    'and smooth slider movements.',
  image:
    'Professional commercial product photography: subject positioned using rule-of-thirds, warm key light ' +
    'from 45° upper-left with soft fill, rim light on edges for separation. Color palette: warm neutrals ' +
    '(cream, beige) with one accent color. Shot on 85mm f/1.8 lens, shallow depth of field with creamy ' +
    'bokeh background. Surface: clean matte backdrop or lifestyle setting. Post-processing: slight warm ' +
    'grade, enhanced shadows, commercial skin retouching if applicable. Mood: premium, aspirational, ' +
    'clean minimalist aesthetic.',
};

const FALLBACK_ELEMENTS = [
  'Professional lighting setup',
  'Deliberate composition',
  'Technical camera settings',
  'Color grading applied',
  'Commercial aesthetic',
];

/**
 * Generate fallback result when API key is missing or all providers fail.
 */
export function getFallbackResult(mediaType: 'video' | 'image'): AnalysisResult {
  return {
    success: false,
    error: 'All vision providers failed',
    prompt: FALLBACK_TEMPLATES[mediaType] || FALLBACK_TEMPLATES.image,
    style: 'commercial',
    elements: [...FALLBACK_ELEMENTS],
  };
}
