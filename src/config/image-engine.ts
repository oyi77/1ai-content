/**
 * Image Engine — Production-grade image prompt orchestration config.
 *
 * BARREL — re-exports resolveImagePrompt() and all category data from sub-modules.
 */
export {
  resolveImagePrompt,
  DEFAULT_DETECTION,
  NICHE_TO_IMAGE_MODULE,
} from "./image-engine/index";
export type {
  ProductDetectionEntry,
  StyleEntry,
  MaterialEntry,
  ImagePromptResult,
  DetectedCategory,
} from "./image-engine/types";
export {
  ADDITIONAL_CATEGORIES_DETECTION,
  ADDITIONAL_CATEGORY_STYLES,
  ADDITIONAL_MATERIALS,
} from "./image-engine/categories/additional";
export {
  HOME_DECOR_DETECTION,
  INTERIOR_STYLES,
  HOME_MATERIAL_ENGINE,
  HOME_STYLING_PROPS,
  HOME_AMBIENT_MOODS,
  HOME_CAMERA_COMPOSITION,
} from "./image-engine/categories/home-decor";
export {
  ELECTRONICS_COLOR_PALETTES,
  ELECTRONICS_LIFESTYLE_VIBES,
  ELECTRONICS_AD_ATMOSPHERE,
} from "./image-engine/categories/electronics";
export {
  FASHION_DETECTION,
  FASHION_SUB_GENRES,
  FASHION_CAMERA_SETTINGS,
  FASHION_ENVIRONMENTS,
  FASHION_ACCESSORY_EFFECTS,
  FASHION_MATERIALS,
} from "./image-engine/categories/fashion";
export {
  FNB_CATEGORY_DETECTION,
  FNB_STYLE_OPTIONS,
  FNB_EFFECT_OPTIONS,
} from "./image-engine/categories/fnb";
export {
  SKINCARE_PRODUCT_SPECIFICS,
  SKINCARE_STYLE_THEMES,
  SKINCARE_TEXTURE_EFFECTS,
  SKINCARE_LIGHTING,
  SKINCARE_QUALITY_TAGS,
} from "./image-engine/categories/skincare";
