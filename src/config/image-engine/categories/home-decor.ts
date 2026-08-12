/**
 * Image Engine — Home Decor & Furniture
 */
import type { StyleEntry } from "../types";

export const HOME_DECOR_DETECTION: Record<
  string,
  {
    keywords: string[];
    label: string;
    focus_point: string;
    default_subgenre: string;
  }
> = {
  seating_sofa: {
    keywords: [
      "sofa",
      "couch",
      "armchair",
      "loveseat",
      "sectional",
      "ottoman",
      "bean bag",
    ],
    label: "Seating & Sofa",
    focus_point: "fabric texture, cushion plumpness, ergonomic curves",
    default_subgenre: "scandinavian_hygge",
  },
  table_desk: {
    keywords: [
      "table",
      "desk",
      "coffee table",
      "dining table",
      "side table",
      "console",
    ],
    label: "Table & Desk",
    focus_point: "surface finish, leg structure, wood grain or marble vein",
    default_subgenre: "mid_century_modern",
  },
  bedding_mattress: {
    keywords: ["bed", "mattress", "headboard", "bedframe", "pillow", "blanket"],
    label: "Bedding & Mattress",
    focus_point: "linen texture, layering, headboard material",
    default_subgenre: "luxury_hotel_suite",
  },
  lighting_decor: {
    keywords: [
      "lamp",
      "chandelier",
      "pendant",
      "sconce",
      "lantern",
      "floor lamp",
    ],
    label: "Lighting Fixture",
    focus_point: "material shade, wire detail, light glow temperature",
    default_subgenre: "moody_ambience",
  },
  decor_accessories: {
    keywords: [
      "vase",
      "planter",
      "mirror",
      "clock",
      "candle",
      "frame",
      "sculpture",
    ],
    label: "Decor & Accessories",
    focus_point: "ceramic glaze, reflection, intricate patterns",
    default_subgenre: "bohemian_eclectic",
  },
  kitchen_dining: {
    keywords: ["plate", "bowl", "cutlery", "glassware", "mug", "jar", "tray"],
    label: "Kitchen & Dining Ware",
    focus_point: "stacking arrangement, food pairing, gloss finish",
    default_subgenre: "flatlay_editorial",
  },
};

export const INTERIOR_STYLES: Record<string, StyleEntry> = {
  scandinavian_hygge: {
    label: "Scandinavian Hygge",
    prompt_val:
      "scandinavian interior, light wood floors, white walls, minimalist, cozy throws, bright natural light",
  },
  mid_century_modern: {
    label: "Mid-Century Modern",
    prompt_val:
      "mid century modern furniture, tapered legs, rich walnut wood, retro vibe, stylish living room",
  },
  japandi_fusion: {
    label: "Japandi Zen",
    prompt_val:
      "japandi style, low profile furniture, neutral tones, paper lanterns, natural wood, zen atmosphere",
  },
  modern_farmhouse: {
    label: "Modern Farmhouse",
    prompt_val:
      "modern farmhouse interior, shiplap walls, rustic wood, black metal accents, apron sink, cozy",
  },
  luxury_hotel_suite: {
    label: "Luxury Hotel Suite",
    prompt_val:
      "luxury hotel room, king size bed, ambient lighting, city view window, marble details, expensive",
  },
  bohemian_eclectic: {
    label: "Bohemian Eclectic",
    prompt_val:
      "boho chic interior, layered rugs, rattan furniture, hanging plants, macrame, colorful cushions",
  },
  industrial_loft: {
    label: "Industrial Loft",
    prompt_val:
      "converted warehouse, exposed brick walls, concrete floor, steel beams, leather sofa",
  },
};

export const HOME_MATERIAL_ENGINE = {
  wood_finishes: {
    oak_light: {
      label: "Light Oak",
      prompt_val:
        "natural light oak wood grain, blonde wood, scandinavian finish",
    },
    walnut_dark: {
      label: "Dark Walnut",
      prompt_val: "rich dark walnut wood, deep brown grain, premium varnish",
    },
    reclaimed_rustic: {
      label: "Reclaimed Wood",
      prompt_val: "reclaimed barn wood, distressed texture, rustic feel",
    },
  },
  stone_surfaces: {
    marble_white: {
      label: "Carrara Marble",
      prompt_val: "white carrara marble surface, soft grey veins, polished",
    },
    marble_gold: {
      label: "Calacatta Gold",
      prompt_val: "calacatta gold marble, bold gold veins, dramatic luxury",
    },
    concrete_raw: {
      label: "Raw Concrete",
      prompt_val: "industrial concrete surface, micro-cement, smooth grey",
    },
    terrazzo_speckle: {
      label: "Terrazzo",
      prompt_val: "colorful terrazzo pattern, speckled surface, modern retro",
    },
  },
  upholstery_fabric: {
    boucle_curly: {
      label: "Boucle",
      prompt_val: "boucle fabric texture, curly wool, soft nubby, cozy",
    },
    velvet_lush: {
      label: "Velvet",
      prompt_val: "luxurious velvet texture, light catching, soft pile",
    },
    linen_natural: {
      label: "Linen",
      prompt_val: "natural linen texture, relaxed wrinkles, breathable",
    },
    leather_saddle: {
      label: "Saddle Leather",
      prompt_val: "genuine saddle leather, aged patina, rich brown",
    },
  },
} as const;

export const HOME_STYLING_PROPS: Record<string, StyleEntry> = {
  coffee_table_styling: {
    label: "Coffee Table Vibe",
    prompt_val:
      "decorated with stack of design books, ceramic vase, coffee cup, candle",
  },
  bed_linen_layering: {
    label: "Bed Linen Layering",
    prompt_val:
      "styled with fluffy pillows, duvet cover, folded throw blanket, textured cushion",
  },
  plant_greenery: {
    label: "Greenery Accents",
    prompt_val:
      "surrounded by indoor plants, monstera, potted succulent, fresh flowers",
  },
  kitchen_prep: {
    label: "Kitchen Prep Scene",
    prompt_val: "ingredients on counter, cutting board, olive oil, fresh herbs",
  },
  bathroom_spa: {
    label: "Spa Bathroom",
    prompt_val:
      "towel rolled in basket, bath bomb, essential oil, eucalyptus branch",
  },
};

export const HOME_AMBIENT_MOODS: Record<string, StyleEntry> = {
  golden_hour_magic: {
    label: "Golden Hour",
    prompt_val:
      "warm sunset light, sun rays through window, golden glow, cinematic",
  },
  blue_hour_twilight: {
    label: "Blue Hour",
    prompt_val:
      "blue hour lighting, twilight sky, city lights, calm atmosphere",
  },
  moody_night: {
    label: "Moody Night",
    prompt_val:
      "evening ambience, lamp turned on, warm low light, intimate setting",
  },
  rainy_cozy: {
    label: "Rainy Day",
    prompt_val: "raindrops on window, grey sky outside, cozy indoor lighting",
  },
  fireplace_cozy: {
    label: "Fireplace Glow",
    prompt_val:
      "glow from fireplace, warm and inviting, winter evening, orange ambient light",
  },
};

export const HOME_CAMERA_COMPOSITION: Record<string, StyleEntry> = {
  wide_architectural: {
    label: "Wide Architectural",
    prompt_val: "wide angle lens, architectural photography, full room layout",
  },
  detail_texture: {
    label: "Macro Detail",
    prompt_val: "extreme close up, texture focus, fabric weave, wood grain",
  },
  flatlay_editorial: {
    label: "Flatlay Editorial",
    prompt_val: "top down view, flat lay, styled arrangement, magazine spread",
  },
  rule_of_thirds: {
    label: "Rule of Thirds",
    prompt_val:
      "product placed on one third, balanced composition, negative space",
  },
};
