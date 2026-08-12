/**
 * Image Engine — Fashion Ultra Realistic Master
 */
import type { StyleEntry, MaterialEntry } from "../types";

export const FASHION_DETECTION: Record<
  string,
  {
    keywords: string[];
    label: string;
    default_subgenre: string;
    default_lens: string;
  }
> = {
  tops_shirts: {
    keywords: [
      "shirt",
      "t-shirt",
      "blouse",
      "hoodie",
      "sweater",
      "jacket",
      "blazer",
      "polo",
      "tank top",
    ],
    label: "Tops & Outer",
    default_subgenre: "casual_street",
    default_lens: "portrait_85mm",
  },
  bottoms_pants: {
    keywords: [
      "pants",
      "jeans",
      "trousers",
      "skirt",
      "shorts",
      "leggings",
      "cargo",
    ],
    label: "Bottoms",
    default_subgenre: "casual_street",
    default_lens: "wide_angle_24mm",
  },
  footwear_shoes: {
    keywords: [
      "shoes",
      "sneakers",
      "heels",
      "boots",
      "sandals",
      "slippers",
      "loafers",
    ],
    label: "Shoes & Sandals",
    default_subgenre: "casual_street",
    default_lens: "macro_100mm",
  },
  accessories_jewelry: {
    keywords: [
      "watch",
      "bag",
      "necklace",
      "ring",
      "glasses",
      "hat",
      "earrings",
      "bracelet",
      "sunglasses",
    ],
    label: "Accessories",
    default_subgenre: "formal_office",
    default_lens: "macro_100mm",
  },
  full_outfit_dress: {
    keywords: ["dress", "gown", "suit", "jumpsuit", "robe", "caftan", "kimono"],
    label: "Full Outfit",
    default_subgenre: "party_glamour",
    default_lens: "portrait_85mm",
  },
  hijab_modest: {
    keywords: ["hijab", "scarf", "veil", "tudung", "shawl", "khimar", "niqab"],
    label: "Hijab & Modest Wear",
    default_subgenre: "traditional_cultural",
    default_lens: "portrait_85mm",
  },
};

export const FASHION_SUB_GENRES: Record<string, StyleEntry> = {
  casual_street: {
    label: "Casual & Streetwear",
    prompt_val:
      "streetwear fashion, urban vibe, casual look, trendy style, comfortable fit",
  },
  formal_office: {
    label: "Formal & Office",
    prompt_val:
      "business professional attire, office environment, sharp and clean look, formal elegance, corporate style",
  },
  party_glamour: {
    label: "Party & Glamour",
    prompt_val:
      "red carpet look, glamour style, sparkling details, luxury party attire, night event",
  },
  sport_activewear: {
    label: "Sport & Activewear",
    prompt_val:
      "athletic wear, fitness model, dynamic sporty look, sweat glistening, performance gear",
  },
  traditional_cultural: {
    label: "Traditional & Cultural",
    prompt_val:
      "cultural heritage fashion, traditional attire, elegant draping, rich patterns, ceremonial look",
  },
  swimwear_resort: {
    label: "Swimwear & Resort",
    prompt_val:
      "beach resort style, summer vibes, golden sunlight, swimwear photography, exotic location",
  },
};

export const FASHION_CAMERA_SETTINGS = {
  depth_of_field: {
    shallow_dof: {
      label: "Blur Background (Bokeh)",
      prompt_val:
        "shallow depth of field, bokeh background, f/1.8 aperture, subject isolation, sharp focus on product",
    },
    deep_dof: {
      label: "Sharp All (Landscape)",
      prompt_val:
        "deep depth of field, sharp focus throughout, f/11 aperture, environmental context clear",
    },
  },
  lens_simulation: {
    portrait_85mm: {
      label: "85mm Portrait",
      prompt_val:
        "shot on 85mm lens, flattering compression, perfect for portrait, natural proportions",
    },
    wide_angle_24mm: {
      label: "24mm Wide",
      prompt_val:
        "shot on 24mm wide angle lens, capturing full body and environment, dynamic perspective",
    },
    macro_100mm: {
      label: "Macro 100mm",
      prompt_val:
        "macro photography, extreme detail, texture sharpness, close up focus, fabric threads visible",
    },
  },
  shot_angle: {
    eye_level: {
      label: "Eye Level",
      prompt_val: "eye level shot, natural perspective",
    },
    low_angle_hero: {
      label: "Low Angle (Heroic)",
      prompt_val:
        "low angle shot, looking up, powerful stance, tall silhouette",
    },
    high_angle_bird: {
      label: "High Angle (Bird Eye)",
      prompt_val: "high angle shot, looking down, unique perspective",
    },
    dutch_angle: {
      label: "Dutch Angle",
      prompt_val: "tilted frame, dynamic composition, edgy look",
    },
  },
} as const;

export const FASHION_ENVIRONMENTS: Record<string, StyleEntry> = {
  studio_minimal: {
    label: "Studio Minimalist",
    prompt_val:
      "clean studio background, seamless background paper, professional lighting setup",
  },
  urban_industrial: {
    label: "Urban Industrial",
    prompt_val:
      "concrete wall background, warehouse setting, brick texture, moody city atmosphere",
  },
  nature_outdoors: {
    label: "Nature Outdoors",
    prompt_val:
      "natural outdoor background, park, forest, or beach, soft natural light",
  },
  luxury_interior: {
    label: "Luxury Interior",
    prompt_val:
      "expensive furniture background, hotel lobby, penthouse view, elegant interior design",
  },
  urban_street: {
    label: "Urban Street",
    prompt_val:
      "city street background, neon signs, traffic lights, night city life",
  },
  pastel_dream: {
    label: "Pastel Dream",
    prompt_val:
      "pastel colored background, soft pink or blue, dreamy clouds, surreal atmosphere",
  },
};

export const FASHION_ACCESSORY_EFFECTS: Record<string, StyleEntry> = {
  sparkle_shine: {
    label: "Sparkle & Shine",
    prompt_val:
      "gemstone sparkle, light reflections, jewelry glint, polished metal surface",
  },
  water_droplets: {
    label: "Fresh Water Drops",
    prompt_val:
      "water droplets on product, fresh look, wet surface, hydrating vibe",
  },
  floating_levitation: {
    label: "Levitation",
    prompt_val:
      "product floating in mid air, zero gravity, invisible stand, dynamic view",
  },
  fire_ice: {
    label: "Fire & Ice",
    prompt_val:
      "contrasting elements, fire and ice surrounding product, dramatic effect",
  },
};

export const FASHION_MATERIALS: Record<string, MaterialEntry> = {
  cotton: {
    label: "Cotton",
    prompt_val: "soft cotton texture, breathable, matte finish",
  },
  denim: {
    label: "Denim",
    prompt_val: "classic denim texture, visible weave, rugged",
  },
  silk: {
    label: "Silk",
    prompt_val: "shiny silk texture, smooth, luxurious drape",
  },
  leather: {
    label: "Leather",
    prompt_val: "genuine leather texture, grain patterns, glossy",
  },
  wool: { label: "Wool", prompt_val: "knitted texture, wool fibers, cozy" },
};
