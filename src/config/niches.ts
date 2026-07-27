export interface NicheConfig {
  id: string;
  name: string;
  emoji: string;
  defaultAspectRatio: string;
  sceneTemplates: {
    intro: string[];
    body: string[];
    outro: string[];
  };
  keywords: string[];
  colorPalettes: string[];
  negativeKeywords?: string[];
}

export const NICHE_CONFIG: Record<string, NicheConfig> = {
  fashion_lifestyle: {
    id: 'fashion_lifestyle',
    name: 'Fashion & Lifestyle',
    emoji: '👗',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'flat lay on {surface} with {lighting}',
        'model holding {product} in {setting}',
        'wardrobe reveal with {product} as focal point',
      ],
      body: [
        'outfit transition with {product} detail shot',
        'street style walking with {product} visible',
        'mirror selfie aesthetic showcasing {product}',
      ],
      outro: [
        'final look pose with {product} highlighted',
        'accessories close-up including {product}',
        'brand tag reveal with {product}',
      ],
    },
    keywords: ['trendy', 'aesthetic', 'OOTD', 'styling', 'fashion'],
    colorPalettes: ['neutral tones', 'pastel', 'monochrome', 'vibrant'],
  },

  food_culinary: {
    id: 'food_culinary',
    name: 'Food & Culinary',
    emoji: '🍜',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'ingredients flat lay with {product} as hero',
        'sizzling {product} in {cooking_method}',
        'table setting with {product} centerpiece',
      ],
      body: [
        'cooking process showing {product} transformation',
        'plating technique with {product} garnish',
        'steam rising from fresh {product}',
      ],
      outro: [
        'satisfaction shot of {product} being enjoyed',
        'final dish beauty shot with {product}',
        "chef's kiss moment with {product}",
      ],
    },
    keywords: ['delicious', 'fresh', 'homemade', 'satisfying', 'foodie'],
    colorPalettes: ['warm tones', 'rustic', 'bright', 'moody'],
  },

  tech_gadgets: {
    id: 'tech_gadgets',
    name: 'Tech & Gadgets',
    emoji: '📱',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'unboxing reveal of {product} with dramatic lighting',
        '{product} on minimal desk setup',
        'macro shot of {product} design details',
      ],
      body: [
        'feature demonstration of {product} capability',
        'comparison scale with hand holding {product}',
        'screen glow illuminating {product} interface',
      ],
      outro: [
        'lifestyle shot with {product} in use',
        'specs highlight floating around {product}',
        'call-to-action with {product} front center',
      ],
    },
    keywords: ['innovative', 'sleek', 'powerful', 'minimal', 'tech'],
    colorPalettes: ['neon accents', 'dark mode', 'white space', 'metallic'],
  },

  beauty_skincare: {
    id: 'beauty_skincare',
    name: 'Beauty & Skincare',
    emoji: '💄',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'vanity setup with {product} among essentials',
        'texture close-up of {product} formula',
        'packaging reveal of {product}',
      ],
      body: [
        'application process using {product}',
        'before/after transition with {product}',
        'routine integration of {product}',
      ],
      outro: [
        'glowing skin result from {product}',
        'shelfie with {product} featured',
        'satisfaction selfie with {product}',
      ],
    },
    keywords: ['glowing', 'radiant', 'luxury', 'self-care', 'beauty'],
    colorPalettes: ['soft pink', 'rose gold', 'clean white', 'natural'],
  },

  travel_adventure: {
    id: 'travel_adventure',
    name: 'Travel & Adventure',
    emoji: '✈️',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'destination reveal with {product} in frame',
        'packing moment with {product} being placed',
        'travel flat lay featuring {product}',
      ],
      body: [
        '{product} in use at scenic location',
        'local culture interaction with {product}',
        'adventure moment showcasing {product} durability',
      ],
      outro: [
        'sunset silhouette with {product}',
        'travel diary entry with {product} memory',
        'wanderlust shot featuring {product}',
      ],
    },
    keywords: ['adventure', 'wanderlust', 'explore', 'freedom', 'travel'],
    colorPalettes: ['golden hour', 'tropical', 'earthy', 'vibrant'],
  },

  fitness_health: {
    id: 'fitness_health',
    name: 'Fitness & Health',
    emoji: '💪',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'gym bag reveal with {product}',
        'pre-workout ritual with {product}',
        'motivation setup featuring {product}',
      ],
      body: [
        'workout in progress with {product} visible',
        'sweat and effort moment with {product}',
        'progress check using {product}',
      ],
      outro: [
        'post-workout satisfaction with {product}',
        'transformation reveal with {product}',
        'community moment sharing {product}',
      ],
    },
    keywords: ['strong', 'healthy', 'energy', 'discipline', 'fitness'],
    colorPalettes: ['high contrast', 'neon', 'natural', 'bold'],
  },

  home_decor: {
    id: 'home_decor',
    name: 'Home & Decor',
    emoji: '🏠',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'room transformation before with {product}',
        'cozy corner featuring {product}',
        'styling process with {product}',
      ],
      body: [
        'detail shot of {product} in context',
        'lifestyle moment with {product} functional',
        'seasonal styling with {product} adapted',
      ],
      outro: [
        'final reveal with {product} integrated',
        'room tour highlight of {product}',
        'satisfaction moment enjoying {product}',
      ],
    },
    keywords: ['cozy', 'aesthetic', 'organized', 'warm', 'home'],
    colorPalettes: ['neutral', 'scandinavian', 'boho', 'modern'],
  },

  business_finance: {
    id: 'business_finance',
    name: 'Business & Finance',
    emoji: '💼',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'professional desk setup with {product}',
        'productivity tools featuring {product}',
        'morning routine with {product}',
      ],
      body: [
        'workflow demonstration of {product}',
        'success metrics visualization with {product}',
        'professional using {product} effectively',
      ],
      outro: [
        'achievement moment with {product}',
        'growth chart alongside {product}',
        'professional recommendation of {product}',
      ],
    },
    keywords: ['professional', 'growth', 'success', 'efficiency', 'business'],
    colorPalettes: ['corporate blue', 'minimal', 'luxury', 'trust'],
  },

  education_knowledge: {
    id: 'education_knowledge',
    name: 'Education & Learning',
    emoji: '📚',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'study setup with {product} ready',
        'knowledge tools featuring {product}',
        'learning environment with {product}',
      ],
      body: [
        'demonstration of {product} feature',
        'problem-solving with {product}',
        'aha moment using {product}',
      ],
      outro: [
        'mastery showcase with {product}',
        'sharing knowledge about {product}',
        'achievement unlock with {product}',
      ],
    },
    keywords: ['smart', 'insightful', 'curious', 'knowledge', 'learn'],
    colorPalettes: ['clean', 'focused', 'inspiring', 'academic'],
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic & Film',
    emoji: '🎬',
    defaultAspectRatio: '16:9',
    sceneTemplates: {
      intro: [
        'establishing wide shot of {setting} with dramatic lighting',
        'dramatic close-up of {subject} in cinematic style',
        'atmospheric b-roll of {setting} with {lighting}',
      ],
      body: [
        'tension-building sequence featuring {product} as hero element',
        'narrative moment with {subject} and {product}',
        'visual metaphor using {product} in {setting}',
      ],
      outro: [
        'climactic reveal with {subject} front and center',
        'slow fade with {product} in frame, moody lighting',
        'title card over {setting} with {product} visible',
      ],
    },
    keywords: ['cinematic', 'narrative', 'dramatic', 'film', 'storytelling'],
    colorPalettes: ['moody dark', 'golden hour', 'desaturated', 'high contrast'],
  },
  anime: {
    id: 'anime',
    name: 'Anime & Illustration',
    emoji: '🎌',
    defaultAspectRatio: '16:9',
    sceneTemplates: {
      intro: [
        'anime-style character reveal with {product} as hero item',
        'stylized flat-lay illustration featuring {product}',
        'illustrated title card with {product} in vibrant colors',
      ],
      body: [
        'action sequence with {product} as key prop',
        'cute character interaction with {product}',
        'dramatic lighting effect on {product} in anime style',
      ],
      outro: [
        'kawaii satisfaction moment featuring {product}',
        'stylized end card with {product} and sparkle effects',
        'cel-shaded closeup of {product}',
      ],
    },
    keywords: ['anime', 'illustration', 'manga', 'stylized', 'vibrant'],
    colorPalettes: ['vibrant anime', 'pastel', 'neon', 'cel-shaded'],
  },
  music_video: {
    id: 'music_video',
    name: 'Music Video',
    emoji: '🎤',
    defaultAspectRatio: '16:9',
    sceneTemplates: {
      intro: [
        'beat-synced flash reveal of {product}',
        'performance stage reveal with {product} as focal point',
        'rhythm montage featuring {product} in motion',
      ],
      body: [
        'dance sequence with {product} prominently visible',
        'concert lighting on {product}',
        'lyrical visual interpretation featuring {product}',
      ],
      outro: [
        'final performance frame with {product} center stage',
        'crowd energy shot with {product}',
        'fade to black with {product} silhouette',
      ],
    },
    keywords: ['rhythm', 'beat', 'music', 'performance', 'visual'],
    colorPalettes: ['neon glow', 'concert lights', 'retro', 'high energy'],
  },
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment',
    emoji: '🎭',
    defaultAspectRatio: '9:16',
    sceneTemplates: {
      intro: [
        'vibrant opener showcasing {product} with bold energy',
        'high-energy reveal of {product} in entertainment context',
        'crowd-stopping visual with {product} as centerpiece',
      ],
      body: [
        'exciting action sequence featuring {product}',
        'entertaining moment with {product} in spotlight',
        'bold visual story built around {product}',
      ],
      outro: [
        'memorable finale with {product} center stage',
        'exciting close featuring {product}',
        'energetic end card with {product}',
      ],
    },
    keywords: ['vibrant', 'exciting', 'bold', 'entertaining', 'dynamic'],
    colorPalettes: ['vibrant', 'neon', 'bold contrast', 'electric'],
  },
};

export const NICHE_LIST = Object.values(NICHE_CONFIG);
export const NICHE_IDS = Object.keys(NICHE_CONFIG);

// Maps old/alternate niche keys to canonical NICHE_CONFIG keys
export const NICHE_KEY_ALIASES: Record<string, string> = {
  // Old NICHES object keys (video-generation.service.ts)
  fnb: 'food_culinary',
  fashion: 'fashion_lifestyle',
  tech: 'tech_gadgets',
  health: 'fitness_health',
  travel: 'travel_adventure',
  education: 'education_knowledge',
  finance: 'business_finance',
  entertainment: 'entertainment',

  // Lang handler onboarding keys (onboarding.ts)
  beauty: 'beauty_skincare',
  property: 'home_decor',
  general: 'food_culinary',

  // NICHE_MOOD_MAP keys (scene-consistency.service.ts)
  cooking: 'food_culinary',
  fitness: 'fitness_health',
  trading: 'business_finance',
  retail: 'food_culinary',
  services: 'business_finance',
  professional: 'business_finance',
  hospitality: 'food_culinary',
};

export function resolveNicheKey(key: string): string {
  return NICHE_KEY_ALIASES[key] || key;
}

// Always use this — never NICHE_CONFIG[key] directly
export function getNicheConfig(key: string): NicheConfig | undefined {
  return NICHE_CONFIG[resolveNicheKey(key) as keyof typeof NICHE_CONFIG];
}

// Cache for 5 minutes
let nicheCache: typeof NICHE_LIST | null = null;
let nicheCacheTime = 0;
const NICHE_CACHE_TTL = 5 * 60 * 1000;

export async function getNichesAsync(): Promise<typeof NICHE_LIST> {
  if (nicheCache && Date.now() - nicheCacheTime < NICHE_CACHE_TTL) {
    return nicheCache as typeof NICHE_LIST;
  }
  try {
    const { prisma } = await import('./database.js');
    const dbNiches = await prisma.pricingConfig.findMany({
      where: { category: 'niche' },
    });
    if (dbNiches.length > 0) {
      const parsed = dbNiches.map(n => ({
        id: n.key,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON field spread
        ...((typeof n.value === 'string' ? JSON.parse(n.value) : n.value) as any),
      }));
      nicheCache = parsed;
      nicheCacheTime = Date.now();
      return parsed;
    }
  } catch (err) {
    const { logger } = await import('../utils/logger.js');
    logger.warn('Failed to load niches from DB, using static config', { error: (err as Error).message });
  }
  return NICHE_LIST;
}
