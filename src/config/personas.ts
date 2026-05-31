export type UserMode =
  | 'umkm'
  | 'content_creator'
  | 'movie_director'
  | 'anime_studio'
  | 'corporate'
  | 'agency';

export type AllowedNiches = string[] | 'ALL';
export type AllowedPresets = ('quick' | 'standard' | 'extended' | 'custom')[];

export interface PersonaConfig {
  id: UserMode;
  name: string;
  emoji: string;
  description: Record<string, string>;
  allowedNiches: AllowedNiches;
  allowedPresets: AllowedPresets;
  priceMultiplier: number;
}

export const PERSONA_CONFIG: Record<UserMode, PersonaConfig> = {
  umkm: {
    id: 'umkm',
    name: 'UMKM / Toko Kecil',
    emoji: '🏪',
    description: {
      id: 'Untuk pemilik usaha kecil, warung, dan toko online',
      en: 'For small business owners, local shops, and online stores',
    },
    allowedNiches: ['food_culinary', 'fashion_lifestyle', 'home_decor', 'beauty_skincare'],
    allowedPresets: ['quick'],
    priceMultiplier: 1.0,
  },
  content_creator: {
    id: 'content_creator',
    name: 'Content Creator',
    emoji: '🎥',
    description: {
      id: 'Untuk YouTuber, TikToker, dan influencer',
      en: 'For YouTubers, TikTokers, and influencers',
    },
    allowedNiches: 'ALL',
    allowedPresets: ['standard', 'extended'],
    priceMultiplier: 1.0,
  },
  movie_director: {
    id: 'movie_director',
    name: 'Movie Director',
    emoji: '🎬',
    description: {
      id: 'Untuk pembuat film pendek dan konten sinematik',
      en: 'For short film makers and cinematic content creators',
    },
    allowedNiches: ['cinematic', 'travel_adventure', 'entertainment'],
    allowedPresets: ['extended'],
    priceMultiplier: 1.0,
  },
  anime_studio: {
    id: 'anime_studio',
    name: 'Anime Studio',
    emoji: '🎌',
    description: {
      id: 'Untuk kreator konten anime dan ilustrasi',
      en: 'For anime and illustration content creators',
    },
    allowedNiches: ['anime', 'entertainment'],
    allowedPresets: ['quick', 'standard', 'extended'],
    priceMultiplier: 1.0,
  },
  corporate: {
    id: 'corporate',
    name: 'Corporate',
    emoji: '💼',
    description: {
      id: 'Untuk profil perusahaan dan marketing bisnis',
      en: 'For company profiles and business marketing',
    },
    allowedNiches: ['business_finance', 'tech_gadgets', 'education_knowledge'],
    allowedPresets: ['standard', 'extended'],
    priceMultiplier: 1.0,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    emoji: '🏢',
    description: {
      id: 'Untuk agensi yang mengelola banyak klien',
      en: 'For agencies managing multiple clients',
    },
    allowedNiches: 'ALL',
    allowedPresets: ['quick', 'standard', 'extended', 'custom'],
    priceMultiplier: 1.0,
  },
};

export const PERSONA_LIST = Object.values(PERSONA_CONFIG);
export const PERSONA_IDS = Object.keys(PERSONA_CONFIG) as UserMode[];

export function getPersonaForUser(userMode: string | null | undefined): PersonaConfig {
  if (!userMode || !(userMode in PERSONA_CONFIG)) {
    return PERSONA_CONFIG.content_creator;
  }
  return PERSONA_CONFIG[userMode as UserMode];
}

export function isNicheAllowedForPersona(persona: PersonaConfig, nicheId: string): boolean {
  if (persona.allowedNiches === 'ALL') return true;
  return persona.allowedNiches.includes(nicheId);
}

export function isPresetAllowedForPersona(persona: PersonaConfig, preset: string): boolean {
  return (persona.allowedPresets as string[]).includes(preset);
}

// Cache for 5 minutes
let personaCache: PersonaConfig[] | null = null;
let personaCacheTime = 0;
const PERSONA_CACHE_TTL = 5 * 60 * 1000;

export async function getPersonasAsync(): Promise<PersonaConfig[]> {
  if (personaCache && Date.now() - personaCacheTime < PERSONA_CACHE_TTL) {
    return personaCache;
  }
  try {
    const { prisma } = await import('./database.js');
    const dbPersonas = await prisma.pricingConfig.findMany({
      where: { category: 'persona' },
    });
    if (dbPersonas.length > 0) {
      const merged = { ...PERSONA_CONFIG };
      for (const dbP of dbPersonas) {
        const override = typeof dbP.value === 'string' ? JSON.parse(dbP.value) : dbP.value as Record<string, unknown>;
        const key = dbP.key as UserMode;
        if (merged[key]) {
          merged[key] = { ...merged[key], ...override, id: key };
        }
      }
      const result = Object.values(merged);
      personaCache = result;
      personaCacheTime = Date.now();
      return result;
    }
  } catch (err) {
    const { logger } = await import('../utils/logger.js');
    logger.warn('Failed to load personas from DB, using static config', { error: (err as Error).message });
  }
  return PERSONA_LIST;
}
