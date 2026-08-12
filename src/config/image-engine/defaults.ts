/**
 * Image Engine — defaults + niche-to-module mapping
 */
import type { DetectedCategory } from "./types";
import { ADDITIONAL_CATEGORY_STYLES } from "./categories/additional";

export const DEFAULT_DETECTION: DetectedCategory = {
  module: "additional_categories",
  category_key: "generic_product",
  label: "Product",
  default_style_key: "clinical_clean",
  default_style_prompt: ADDITIONAL_CATEGORY_STYLES.clinical_clean.prompt_val,
  focus_prompt: "product photography, hero placement, clean staging",
  effects: [],
};

export const NICHE_TO_IMAGE_MODULE: Record<
  string,
  { module: string; default_style_key: string; label: string }
> = {
  food_culinary: {
    module: "fnb",
    default_style_key: "steamy_cozy",
    label: "Food & Beverage",
  },
  fnb: {
    module: "fnb",
    default_style_key: "steamy_cozy",
    label: "Food & Beverage",
  },
  fashion_lifestyle: {
    module: "fashion",
    default_style_key: "casual_street",
    label: "Fashion",
  },
  fashion: {
    module: "fashion",
    default_style_key: "casual_street",
    label: "Fashion",
  },
  tech_gadgets: {
    module: "additional_categories",
    default_style_key: "glossy_showroom",
    label: "Electronics",
  },
  tech: {
    module: "additional_categories",
    default_style_key: "glossy_showroom",
    label: "Electronics",
  },
  beauty_skincare: {
    module: "skincare",
    default_style_key: "luxury_elegant",
    label: "Skincare & Cosmetic",
  },
  skincare: {
    module: "skincare",
    default_style_key: "luxury_elegant",
    label: "Skincare & Cosmetic",
  },
  travel_adventure: {
    module: "home_decor",
    default_style_key: "luxury_hotel_suite",
    label: "Travel & Lifestyle",
  },
  travel: {
    module: "home_decor",
    default_style_key: "luxury_hotel_suite",
    label: "Travel & Lifestyle",
  },
  fitness_health: {
    module: "additional_categories",
    default_style_key: "action_lifestyle",
    label: "Health & Fitness",
  },
  health: {
    module: "additional_categories",
    default_style_key: "action_lifestyle",
    label: "Health & Fitness",
  },
  home_decor: {
    module: "home_decor",
    default_style_key: "scandinavian_hygge",
    label: "Home & Decor",
  },
  business_finance: {
    module: "additional_categories",
    default_style_key: "clinical_clean",
    label: "Business & Finance",
  },
  finance: {
    module: "additional_categories",
    default_style_key: "clinical_clean",
    label: "Business & Finance",
  },
  education_knowledge: {
    module: "additional_categories",
    default_style_key: "clinical_clean",
    label: "Education",
  },
  education: {
    module: "additional_categories",
    default_style_key: "clinical_clean",
    label: "Education",
  },
  entertainment: {
    module: "additional_categories",
    default_style_key: "playful_colorful",
    label: "Entertainment",
  },
};
