/**
 * Image Engine — FnB Global Engine
 */
import type { StyleEntry } from '../types';

export interface FnBDetectionEntry {
  keywords: string[];
  identified_as: string;
  global_label: string;
  auto_suggestion: {
    style: string;
    angle: string;
    effects: string[];
    reasoning: string;
  };
}

export const FNB_CATEGORY_DETECTION: Record<string, FnBDetectionEntry> = {
  wet_savory_dishes: {
    keywords: ['soup', 'stew', 'curry', 'broth', 'bowl', 'liquid', 'gravy', 'ramen', 'pho', 'meatball', 'soto', 'gulai'],
    identified_as: 'Soups, Stews & Curries',
    global_label: 'Wet Savory Dishes',
    auto_suggestion: { style: 'steamy_cozy', angle: 'eye_level_or_close_up', effects: ['steam_hot', 'glossy_wet'], reasoning: 'Emphasizing the hot broth and glossy texture makes the dish look comforting and savory.' },
  },
  dry_carb_main: {
    keywords: ['rice', 'pasta', 'noodle', 'fried rice', 'risotto', 'biriyani', 'spaghetti', 'paella', 'nasi goreng', 'fried noodle'],
    identified_as: 'Rice, Pasta & Noodles',
    global_label: 'Dry Carb Mains',
    auto_suggestion: { style: 'appetizing_top_view', angle: 'top_view_or_45_degree', effects: ['glossy_wet', 'fresh_greens'], reasoning: 'Showing the mix of ingredients and sauce coating from an angle highlights the flavor profile.' },
  },
  burgers_sandwiches: {
    keywords: ['burger', 'sandwich', 'hotdog', 'bun', 'bread', 'patty', 'kebab', 'subway', 'tacos'],
    identified_as: 'Burgers, Sandwiches & Wraps',
    global_label: 'Handhelds & Sandwiches',
    auto_suggestion: { style: 'dark_moody_grill', angle: 'close_up_hero', effects: ['melting_dripping', 'crispy_texture'], reasoning: 'Close-ups with dramatic lighting emphasize the juicy patty and fresh vegetables.' },
  },
  pizza_baked_goods: {
    keywords: ['pizza', 'pie', 'pastry', 'baked', 'cheese', 'dough', 'bread', 'croissant', 'flatbread'],
    identified_as: 'Pizza, Pastries & Baked Savory',
    global_label: 'Pizza & Baked Savory',
    auto_suggestion: { style: 'rustic_artisan', angle: 'close_up_hero', effects: ['melting_dripping', 'crispy_texture'], reasoning: 'Highlighting the texture of the crust and the melt of the cheese is key.' },
  },
  grilled_meats_seafood: {
    keywords: ['steak', 'grill', 'bbq', 'barbecue', 'roast', 'chicken', 'fish', 'shrimp', 'prawn', 'satay', 'skewer'],
    identified_as: 'Grilled Meats & Seafood',
    global_label: 'Grill & Roast',
    auto_suggestion: { style: 'dark_moody_grill', angle: 'eye_level', effects: ['glossy_wet', 'steam_hot'], reasoning: 'Side lighting creates shadows that define the meat texture and grill marks.' },
  },
  desserts_sweets: {
    keywords: ['cake', 'dessert', 'ice cream', 'chocolate', 'sweet', 'waffle', 'pancake', 'pudding', 'pastry sweet', 'donut'],
    identified_as: 'Desserts & Sweets',
    global_label: 'Desserts',
    auto_suggestion: { style: 'bright_lifestyle', angle: 'close_up_or_flatlay', effects: ['melting_dripping', 'soft_creamy'], reasoning: 'Bright, soft lighting makes desserts look delicate and indulgent.' },
  },
  cold_beverages: {
    keywords: ['drink', 'beverage', 'juice', 'soda', 'cocktail', 'smoothie', 'milkshake', 'iced', 'coffee cold', 'water'],
    identified_as: 'Cold Beverages',
    global_label: 'Cold Drinks',
    auto_suggestion: { style: 'refreshing_splash', angle: 'eye_level_or_close_up', effects: ['frozen_crystallized', 'splash_explosion'], reasoning: 'Condensation and splashes communicate instant freshness and cold temperature.' },
  },
  hot_beverages: {
    keywords: ['coffee', 'tea', 'latte', 'cappuccino', 'hot chocolate', 'mug', 'cup', 'steam'],
    identified_as: 'Hot Beverages',
    global_label: 'Hot Drinks',
    auto_suggestion: { style: 'cozy_warm', angle: 'eye_level_or_top_view', effects: ['steam_hot', 'latte_art'], reasoning: 'Cozy lighting and steam evoke a warm, relaxing feeling.' },
  },
};

export const FNB_STYLE_OPTIONS: Record<string, StyleEntry & { desc: string }> = {
  steamy_cozy: { label: 'Steamy & Cozy', desc: 'Warm, comfortable — ideal for soups and stews.', prompt_val: 'steaming hot, cozy atmosphere, warm tones, comfort food vibe, appetizing' },
  dark_moody_grill: { label: 'Dark & Moody Grill', desc: 'Dramatic, premium — ideal for steak and burgers.', prompt_val: 'dark atmospheric background, black table, cinematic side lighting, smoke, grill marks, intense shadows, dramatic food photography' },
  bright_lifestyle: { label: 'Bright Lifestyle', desc: 'Bright, happy — ideal for desserts and drinks.', prompt_val: 'bright natural daylight, high key lighting, soft shadows, happy mood, fresh colors' },
  refreshing_splash: { label: 'Refreshing Splash', desc: 'Fresh, dynamic — ideal for cold beverages.', prompt_val: 'condensation, ice crystals, water splashes, refreshing feel, freezing cold, dynamic motion' },
  rustic_artisan: { label: 'Rustic Artisan', desc: 'Natural, traditional — ideal for bread and pizza.', prompt_val: 'wooden table, flour dust, rustic background, natural textures, artisan look' },
  minimalist_commercial: { label: 'Minimalist Commercial', desc: 'Clean, catalog style.', prompt_val: 'clean white background, studio lighting, product photography, sharp focus' },
  appetizing_top_view: { label: 'Appetizing Top View', desc: 'Top-down appetizing presentation.', prompt_val: 'top down view, appetizing presentation, colorful ingredients visible, warm tones' },
  cozy_warm: { label: 'Cozy & Warm', desc: 'Warm, relaxing — ideal for hot beverages.', prompt_val: 'warm cozy atmosphere, soft warm lighting, wooden table, comfort, relaxing feel' },
};

export const FNB_EFFECT_OPTIONS: Record<string, StyleEntry> = {
  steam_hot: { label: 'Hot Steam', prompt_val: 'rising steam, freshly cooked, hot temperature' },
  glossy_wet: { label: 'Glossy/Shiny', prompt_val: 'glistening oil, glossy sauce, shiny surface, wet look' },
  melting_dripping: { label: 'Melting/Dripping', prompt_val: 'melting cheese, dripping sauce, oozing texture' },
  frozen_crystallized: { label: 'Iced/Frozen', prompt_val: 'frosty glass, ice crystals, condensation droplets' },
  splash_explosion: { label: 'Splash/Explosion', prompt_val: 'high speed photography, liquid splash, ingredients flying, dynamic action' },
  fresh_greens: { label: 'Fresh Veggies', prompt_val: 'fresh herbs, green leaves, crisp vegetables, healthy look' },
  crispy_texture: { label: 'Crispy Texture', prompt_val: 'crispy golden texture, crunchy surface, freshly fried' },
  soft_creamy: { label: 'Soft & Creamy', prompt_val: 'soft creamy texture, smooth surface, delicate, indulgent' },
  latte_art: { label: 'Latte Art', prompt_val: 'beautiful latte art, foam pattern, barista quality' },
};