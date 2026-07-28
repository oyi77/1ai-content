/**
 * Image Engine — Electronics Lifestyle Matching
 */
import type { StyleEntry } from '../types';

export const ELECTRONICS_COLOR_PALETTES: Record<string, StyleEntry> = {
  orange_theme: {
    label: 'Orange / Bronze / Copper',
    prompt_val: 'matching with oranges, autumn leaves, copper metal, terracotta pot, warm sunset vibe, bronze texture',
  },
  blue_theme: {
    label: 'Blue / Navy / Cyan',
    prompt_val: 'matching with blue sky, ocean water, blue denim jeans, blue hydrangea flowers, swimming pool',
  },
  green_theme: {
    label: 'Green / Olive / Mint',
    prompt_val: 'matching with monstera leaves, avocado, matcha latte, grass field, mint ice cream, forest',
  },
  pink_theme: {
    label: 'Pink / Rose / Magenta',
    prompt_val: 'matching with pink flowers, strawberry, pink cotton candy, sunset clouds, rose gold accessories',
  },
  white_silver: {
    label: 'White / Silver / Grey',
    prompt_val: 'matching with white marble, clouds, pearls, silver jewelry, minimalist white room, milk',
  },
  black_dark: {
    label: 'Black / Midnight / Space',
    prompt_val: 'matching with black coffee, dark volcanic rock, midnight sky, shadows, matte black car',
  },
  gold_premium: {
    label: 'Gold / Champagne',
    prompt_val: 'matching with gold jewelry, champagne glass, honey, golden hour sunlight, sand dune',
  },
};

export const ELECTRONICS_LIFESTYLE_VIBES: Record<string, StyleEntry & { desc: string }> = {
  editorial_flatlay: {
    label: 'Editorial Flatlay',
    desc: 'Top-down product shot surrounded by matching objects.',
    prompt_val: 'flat lay photography, top view, arranged neatly on table, aesthetic composition, magazine layout, ample negative space',
  },
  handheld_lifestyle: {
    label: 'Handheld Lifestyle',
    desc: 'Product held in hand with color-matched blur background.',
    prompt_val: 'hand holding the product, blurred background matching the product color, human touch, soft sunlight, outdoor vibe',
  },
  props_matching: {
    label: 'Props & Environment',
    desc: 'Product on surface with surrounding aesthetic props.',
    prompt_val: 'product placed on textured surface, surrounded by aesthetic props like bag, watch, or fruit, fashion style, cozy interior',
  },
  liquid_splash_color: {
    label: 'Colored Liquid Splash',
    desc: 'Color-matched liquid splash effect.',
    prompt_val: 'colored liquid splash matching product color, dynamic motion, frozen action, studio lighting, high speed photography',
  },
};

export const ELECTRONICS_AD_ATMOSPHERE: Record<string, StyleEntry> = {
  soft_natural: { label: 'Soft Natural Light', prompt_val: 'soft diffused daylight, bright and airy, clean look, morning light' },
  warm_golden: { label: 'Warm Golden Hour', prompt_val: 'warm sunset glow, golden hour, orange tones, cozy feeling' },
  studio_clean: { label: 'Studio Clean', prompt_val: 'professional studio lighting, shadowless, pure white or gradient background' },
};