export interface StylePreset {
  id: string;
  name: string;
  emoji: string;
  promptModifiers: {
    prefix: string;
    suffix: string;
    negative: string;
  };
  cameraAngles: string[];
  lighting: string[];
  special?: {
    sceneStructure?: string;
    transitionType?: string;
  };
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  realistic: {
    id: "realistic",
    name: "Realistic",
    emoji: "📷",
    promptModifiers: {
      prefix: "photorealistic, 8k resolution, professional photography",
      suffix: "shot on Sony A7IV, 85mm lens, f/1.8, natural lighting",
      negative: "cartoon, anime, illustration, painting, 3d render, artificial",
    },
    cameraAngles: [
      "eye level shot",
      "slight low angle",
      "natural perspective",
      "documentary style",
      "candid moment",
    ],
    lighting: [
      "golden hour natural light",
      "soft window light",
      "professional studio lighting",
      "overcast diffused light",
    ],
  },

  cartoon: {
    id: "cartoon",
    name: "Cartoon",
    emoji: "🎨",
    promptModifiers: {
      prefix: "3D cartoon animation style, Pixar inspired, vibrant colors",
      suffix: "smooth shading, expressive characters, playful atmosphere",
      negative: "realistic, photorealistic, live action, dark, scary",
    },
    cameraAngles: [
      "dynamic angle",
      "exaggerated perspective",
      "playful framing",
      "whimsical composition",
      "storybook view",
    ],
    lighting: [
      "bright even lighting",
      "colorful rim light",
      "soft cartoon shading",
      "vibrant ambient light",
    ],
  },

  anime: {
    id: "anime",
    name: "Anime",
    emoji: "🇯🇵",
    promptModifiers: {
      prefix: "anime style, Studio Ghibli inspired, detailed line art",
      suffix:
        "cel shading, expressive eyes, atmospheric background, sakuga quality",
      negative: "realistic, 3d render, western cartoon, photorealistic, CGI",
    },
    cameraAngles: [
      "dramatic anime angle",
      "emotional close-up",
      "establishing shot",
      "dynamic action frame",
      "intimate portrait angle",
    ],
    lighting: [
      "dramatic sunset lighting",
      "soft anime lighting",
      "emotional rim light",
      "magical atmosphere",
    ],
  },

  closeup_product: {
    id: "closeup_product",
    name: "Close-up Product",
    emoji: "🔍",
    promptModifiers: {
      prefix: "macro product photography, extreme detail, texture focus",
      suffix: "shallow depth of field, product highlight, commercial quality",
      negative: "wide shot, environmental, people, busy background",
    },
    cameraAngles: [
      "macro 100mm",
      "detail extreme close-up",
      "texture focus",
      "product hero shot",
      "feature highlight angle",
    ],
    lighting: [
      "studio product lighting",
      "soft box lighting",
      "rim light for edges",
      "even surface illumination",
    ],
  },

  daily_life: {
    id: "daily_life",
    name: "Daily Life",
    emoji: "🏠",
    promptModifiers: {
      prefix: "lifestyle photography, authentic moment, real world context",
      suffix: "candid shot, natural environment, relatable scene",
      negative: "studio, artificial, posed, stock photo, fake",
    },
    cameraAngles: [
      "over the shoulder",
      "point of view",
      "environmental portrait",
      "lifestyle wide",
      "intimate medium shot",
    ],
    lighting: [
      "natural home lighting",
      "golden hour lifestyle",
      "cozy indoor light",
      "authentic ambient light",
    ],
  },

  comparison: {
    id: "comparison",
    name: "Comparison",
    emoji: "⚖️",
    promptModifiers: {
      prefix: "split screen comparison, before and after, side by side",
      suffix:
        "clear visual difference, transformation highlight, dramatic contrast",
      negative: "single shot, no comparison, ambiguous, unclear",
    },
    cameraAngles: [
      "split screen composition",
      "matching angle pair",
      "transformation reveal",
      "swipe transition setup",
    ],
    lighting: [
      "consistent lighting pair",
      "before/after same light",
      "dramatic reveal lighting",
      "contrast enhancement",
    ],
    special: {
      sceneStructure: "split_screen",
      transitionType: "wipe",
    },
  },

  cinematic: {
    id: "cinematic",
    name: "Cinematic",
    emoji: "🎬",
    promptModifiers: {
      prefix: "cinematic film look, anamorphic style, movie quality",
      suffix: "letterbox aspect, film grain, color graded, blockbuster style",
      negative: "amateur, phone video, flat lighting, documentary",
    },
    cameraAngles: [
      "epic wide shot",
      "dramatic low angle",
      "helicopter view",
      "tracking shot",
      "cinematic reveal",
    ],
    lighting: [
      "cinematic lighting",
      "dramatic chiaroscuro",
      "movie set lighting",
      "volumetric light rays",
    ],
  },

  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    emoji: "⬜",
    promptModifiers: {
      prefix: "minimalist composition, negative space, clean aesthetic",
      suffix: "isolated subject, white background, essential only",
      negative: "cluttered, busy, complex background, many elements",
    },
    cameraAngles: [
      "centered composition",
      "symmetrical framing",
      "isolated subject",
      "clean backdrop angle",
    ],
    lighting: [
      "even soft lighting",
      "shadowless illumination",
      "clean white light",
      "minimal contrast",
    ],
  },

  luxury: {
    id: "luxury",
    name: "Luxury",
    emoji: "💎",
    promptModifiers: {
      prefix: "luxury brand aesthetic, premium quality, high-end atmosphere",
      suffix: "gold accents, sophisticated styling, exclusive feel",
      negative: "cheap, casual, amateur, cluttered, loud",
    },
    cameraAngles: [
      "premium product angle",
      "editorial composition",
      "luxury showcase",
      "sophisticated framing",
    ],
    lighting: [
      "luxury soft lighting",
      "warm gold tones",
      "premium ambiance",
      "elegant shadows",
    ],
  },
};

export const STYLE_LIST = Object.values(STYLE_PRESETS);
export const STYLE_IDS = Object.keys(STYLE_PRESETS);
