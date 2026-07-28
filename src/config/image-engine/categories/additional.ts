/**
 * Image Engine — Additional Categories (kids, auto, pets, health, jewelry, sports)
 */
import type { ProductDetectionEntry, StyleEntry, MaterialEntry } from '../types';

export const ADDITIONAL_CATEGORIES_DETECTION: Record<string, ProductDetectionEntry> = {
  kids_baby_goods: {
    keywords: ['toy', 'doll', 'baby clothes', 'stroller', 'diaper', 'milk bottle', 'bib'],
    label: 'Kids & Baby',
    focus: 'soft edges, safety material, playful colors',
    default_style: 'soft_pastel',
  },
  automotive_parts: {
    keywords: ['helmet', 'tire', 'rim', 'oil', 'car accessories', 'spark plug', 'muffler'],
    label: 'Automotive',
    focus: 'glossy finish, metal reflection, rugged texture',
    default_style: 'masculine_industrial',
  },
  pet_supplies: {
    keywords: ['pet food', 'cat tree', 'leash', 'collar', 'aquarium', 'pet toy'],
    label: 'Pet Supplies',
    focus: 'fur interaction, food freshness, durable fabric',
    default_style: 'playful_natural',
  },
  health_medical: {
    keywords: ['mask', 'vitamin', 'medicine', 'thermometer', 'stethoscope', 'bandage'],
    label: 'Health & Medical',
    focus: 'sterile packaging, clinical precision, clean label',
    default_style: 'clinical_clean',
  },
  jewelry_luxury: {
    keywords: ['ring', 'necklace', 'earring', 'bracelet', 'diamond', 'gold', 'silver'],
    label: 'Jewelry',
    focus: 'gemstone sparkle, metal polish, intricate details',
    default_style: 'velvet_luxury',
  },
  sports_outdoor: {
    keywords: ['yoga mat', 'dumbbell', 'tent', 'hiking bag', 'soccer ball', 'bottle'],
    label: 'Sports & Outdoor',
    focus: 'sweat resistance, durable texture, dynamic shape',
    default_style: 'action_lifestyle',
  },
};

export const ADDITIONAL_CATEGORY_STYLES: Record<string, StyleEntry> = {
  soft_pastel: {
    label: 'Soft Pastel',
    prompt_val: 'soft pastel colors, baby pink and blue, bright soft lighting, innocent, safe and clean, dreamy atmosphere',
  },
  playful_colorful: {
    label: 'Playful Colorful',
    prompt_val: 'vibrant colors, playful background, toys scattered, happy vibe, children room setting',
  },
  masculine_industrial: {
    label: 'Masculine Industrial',
    prompt_val: 'industrial garage background, concrete floor, dramatic lighting, masculine, rugged, high contrast',
  },
  glossy_showroom: {
    label: 'Glossy Showroom',
    prompt_val: 'car showroom lighting, glossy floor reflection, sleek, premium automotive display',
  },
  playful_natural: {
    label: 'Natural Pet Vibe',
    prompt_val: 'natural lighting, wooden floor, blurred greenery background, pet-friendly environment',
  },
  cozy_home: {
    label: 'Cozy Home',
    prompt_val: 'living room carpet, soft blanket, warm home atmosphere, cozy',
  },
  clinical_clean: {
    label: 'Clinical Clean',
    prompt_val: 'clean white background, medical blue accents, sterile, professional, scientific, high key lighting',
  },
  lab_professional: {
    label: 'Lab Professional',
    prompt_val: 'blurred laboratory background, scientist in background, professional equipment, trust',
  },
  velvet_luxury: {
    label: 'Velvet Luxury',
    prompt_val: 'black velvet background, spotlight, sparkling gems, high end jewelry, dramatic contrast',
  },
  editorial_fashion: {
    label: 'Editorial Fashion',
    prompt_val: 'vogue magazine style, model neck or hand, fashion editorial, artistic lighting',
  },
  action_lifestyle: {
    label: 'Action Lifestyle',
    prompt_val: 'sweat droplets, dynamic pose, gym background, energetic, high energy lighting',
  },
  outdoor_adventure: {
    label: 'Outdoor Adventure',
    prompt_val: 'mountain peak background, snow or forest, extreme conditions, durable',
  },
};

export const ADDITIONAL_MATERIALS: Record<string, MaterialEntry> = {
  metal_chrome: { label: 'Chrome Metal', prompt_val: 'chrome finish, shiny metal, reflection' },
  gold_silver: { label: 'Precious Metal', prompt_val: 'polished gold, sterling silver, shiny texture' },
  rubber_tire: { label: 'Rubber/Thread', prompt_val: 'rubber texture, tire tread pattern, grippy' },
  plastic_toy: { label: 'Plastic ABS', prompt_val: 'matte plastic, colorful, durable toy material' },
  fabric_sport: { label: 'Sport Fabric', prompt_val: 'breathable fabric texture' },
};