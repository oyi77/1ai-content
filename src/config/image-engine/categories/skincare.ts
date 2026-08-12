/**
 * Image Engine — Skincare & Kosmetik
 */
import type { StyleEntry } from "../types";

export const SKINCARE_PRODUCT_SPECIFICS: Record<
  string,
  {
    label: string;
    prompt_hint: string;
  }
> = {
  serum_face: {
    label: "Serum Wajah (Botol Kaca/Dropper)",
    prompt_hint:
      "glass serum bottle with dropper, skincare product, glowing liquid",
  },
  moisturizer_cream: {
    label: "Krim Wajah/Tubuh (Jar/Tube)",
    prompt_hint:
      "cream jar, moisturizer texture, soft texture, body lotion tube",
  },
  face_mask: {
    label: "Masker Wajah (Sheet/Clay)",
    prompt_hint: "sheet mask packaging, clay mask texture, face mask product",
  },
  lipstick_makeup: {
    label: "Lipstick & Make Up",
    prompt_hint:
      "lipstick tube, makeup palette, cosmetic product, vibrant color",
  },
  soap_cleanser: {
    label: "Sabun & Pembersih",
    prompt_hint: "bar soap, foam cleanser bottle, hand soap, bubbly texture",
  },
};

export const SKINCARE_STYLE_THEMES: Record<
  string,
  StyleEntry & { desc: string }
> = {
  natural_organic: {
    label: "Natural & Organic",
    desc: "Natural, green, herbal look.",
    prompt_val:
      "surrounded by green leaves, aloe vera texture, wood background, natural sunlight, herbal concept, fresh ingredients, eco friendly vibe",
  },
  luxury_elegant: {
    label: "Luxury & Elegant",
    desc: "Premium, marble, gold accents.",
    prompt_val:
      "placed on white marble surface, gold accents, soft satin cloth, elegant shadows, premium beauty product, cinematic lighting, high class",
  },
  soft_feminine: {
    label: "Soft & Feminine",
    desc: "Soft, pastel, flower petals.",
    prompt_val:
      "soft pastel pink or lavender background, flower petals, silky texture, dreamy atmosphere, beauty magazine style, romantic mood",
  },
  clinical_clean: {
    label: "Clinical & Dermatologist",
    desc: "Medical, sterile, trustworthy.",
    prompt_val:
      "clean white laboratory background, medical aesthetic, minimalist, professional lighting, clinical look, trusted brand, sterile",
  },
  minimalist_studio: {
    label: "Minimalist Studio",
    desc: "Clean background for catalog.",
    prompt_val:
      "solid white background, soft shadows, professional studio photography, product shot, sharp focus, no distraction",
  },
};

export const SKINCARE_TEXTURE_EFFECTS: Record<string, StyleEntry> = {
  none: { label: "Normal", prompt_val: "clean surface" },
  water_droplets: {
    label: "Water Drops (Dewy)",
    prompt_val:
      "water droplets on bottle, condensation, wet surface, fresh look, hydrating concept",
  },
  cream_texture: {
    label: "Cream Texture",
    prompt_val:
      "visible cream texture, soft scoop, smooth surface, product consistency, close up texture",
  },
  flower_decor: {
    label: "Flower Decoration",
    prompt_val:
      "decorated with fresh flowers, rose petals, lavender, botanical arrangement",
  },
  splash_liquid: {
    label: "Liquid Splash",
    prompt_val: "dynamic water splash, liquid explosion, wet look, fresh burst",
  },
};

export const SKINCARE_LIGHTING: Record<string, StyleEntry> = {
  bright_airry: {
    label: "Bright & Airy",
    prompt_val:
      "bright natural daylight, high key lighting, soft shadows, airy atmosphere",
  },
  golden_hour: {
    label: "Golden Hour",
    prompt_val: "warm sunlight, golden glow, sunset vibes, cozy feeling",
  },
  studio_softbox: {
    label: "Studio Softbox",
    prompt_val:
      "professional studio lighting, soft box light, balanced exposure, clear detail",
  },
  moody_dramatic: {
    label: "Dramatic & Dark",
    prompt_val:
      "dark background, spotlight effect, low key lighting, elegant and mysterious",
  },
};

export const SKINCARE_QUALITY_TAGS = [
  "8k resolution",
  "photorealistic",
  "ultra detailed",
  "skin care photography",
  "commercial ad",
  "unreal engine 5",
  "macro lens",
  "sharp focus",
] as const;
