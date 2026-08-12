/**
 * Template Library for Video/Image Generation
 * Based on redesign workflow PDF
 */

export interface Template {
  id: string;
  name: string;
  theme: string;
  vibe: string;
  sceneCount: number;
  creditCost: number;
  description: string;
  colors: string[];
  lighting: string;
  mood: string;
  layout: string;
  isPopular?: boolean;
  isTrending?: boolean;
}

export const TEMPLATES: Template[] = [
  // Editorial Templates
  {
    id: "luxury-editorial-16",
    name: "Luxury Editorial 16-Scene",
    theme: "editorial",
    vibe: "luxury",
    sceneCount: 16,
    creditCost: 8.0,
    description:
      "High-end editorial dengan 16 scene, lighting dramatis, warna monochrome + gold accent",
    colors: ["black", "white", "gold"],
    lighting: "dramatic studio",
    mood: "sophisticated",
    layout: "grid 4x4",
    isPopular: true,
  },
  {
    id: "minimalist-editorial-9",
    name: "Minimalist Editorial 9-Scene",
    theme: "editorial",
    vibe: "minimalist",
    sceneCount: 9,
    creditCost: 4.5,
    description:
      "Clean minimalist dengan 9 scene, natural lighting, warna soft neutral",
    colors: ["beige", "white", "grey"],
    lighting: "natural soft",
    mood: "calm",
    layout: "grid 3x3",
    isPopular: true,
  },
  {
    id: "bold-editorial-9",
    name: "Bold Contemporary Editorial 9-Scene",
    theme: "editorial",
    vibe: "bold",
    sceneCount: 9,
    creditCost: 4.5,
    description:
      "Bold contemporary dengan warna vibrant, high contrast lighting",
    colors: ["red", "blue", "yellow"],
    lighting: "high contrast",
    mood: "energetic",
    layout: "grid 3x3",
  },

  // Streetwear Templates
  {
    id: "streetwear-product-9",
    name: "Streetwear Product 9-Scene",
    theme: "streetwear",
    vibe: "urban",
    sceneCount: 9,
    creditCost: 4.5,
    description:
      "Urban streetwear dengan 9 scene, outdoor lighting, warna bold",
    colors: ["black", "white", "neon"],
    lighting: "urban outdoor",
    mood: "edgy",
    layout: "grid 3x3",
    isTrending: true,
  },
  {
    id: "streetwear-hero-1",
    name: "Monochrome Streetwear Hero (Single Shot)",
    theme: "streetwear",
    vibe: "monochrome",
    sceneCount: 1,
    creditCost: 0.5,
    description: "Single hero shot monochrome, dramatic lighting",
    colors: ["black", "white"],
    lighting: "dramatic",
    mood: "bold",
    layout: "single hero",
  },

  // Lifestyle Templates
  {
    id: "lifestyle-natural-6",
    name: "Natural Lifestyle 6-Scene",
    theme: "lifestyle",
    vibe: "natural",
    sceneCount: 6,
    creditCost: 3.0,
    description:
      "Natural lifestyle dengan 6 scene, soft lighting, warna earth tone",
    colors: ["brown", "green", "beige"],
    lighting: "natural soft",
    mood: "relaxed",
    layout: "grid 2x3",
  },

  // F&B Templates
  {
    id: "fnb-food-hero-1",
    name: "Food Hero Shot",
    theme: "fnb",
    vibe: "appetizing",
    sceneCount: 1,
    creditCost: 0.5,
    description: "Single food hero shot, warm lighting, close-up detail",
    colors: ["warm tones"],
    lighting: "warm studio",
    mood: "appetizing",
    layout: "single hero",
  },
  {
    id: "fnb-menu-9",
    name: "Menu Showcase 9-Scene",
    theme: "fnb",
    vibe: "commercial",
    sceneCount: 9,
    creditCost: 4.5,
    description:
      "Menu showcase dengan 9 scene, consistent lighting, food photography",
    colors: ["warm", "natural"],
    lighting: "consistent studio",
    mood: "appetizing",
    layout: "grid 3x3",
  },

  // Tech Templates
  {
    id: "tech-product-4",
    name: "Tech Product 4-Scene",
    theme: "tech",
    vibe: "modern",
    sceneCount: 4,
    creditCost: 2.0,
    description:
      "Modern tech product dengan 4 scene, clean lighting, futuristic vibe",
    colors: ["blue", "white", "grey"],
    lighting: "clean studio",
    mood: "futuristic",
    layout: "grid 2x2",
  },

  // Beauty Templates
  {
    id: "beauty-closeup-6",
    name: "Beauty Close-Up 6-Scene",
    theme: "beauty",
    vibe: "soft",
    sceneCount: 6,
    creditCost: 3.0,
    description: "Beauty close-up dengan 6 scene, soft lighting, pastel colors",
    colors: ["pink", "white", "gold"],
    lighting: "soft diffused",
    mood: "elegant",
    layout: "grid 2x3",
  },

  // Luxury Templates
  {
    id: "luxury-product-4",
    name: "Luxury Product 4-Scene",
    theme: "luxury",
    vibe: "premium",
    sceneCount: 4,
    creditCost: 2.0,
    description:
      "Luxury product dengan 4 scene, dramatic lighting, premium feel",
    colors: ["black", "gold", "white"],
    lighting: "dramatic studio",
    mood: "sophisticated",
    layout: "grid 2x2",
    isPopular: true,
  },
];

export function getTemplatesByTheme(theme: string): Template[] {
  return TEMPLATES.filter((t) => t.theme === theme);
}

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getPopularTemplates(): Template[] {
  return TEMPLATES.filter((t) => t.isPopular);
}

export function getTrendingTemplates(): Template[] {
  return TEMPLATES.filter((t) => t.isTrending);
}
