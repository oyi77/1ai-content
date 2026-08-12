/**
 * Video Engine V3 — Production-grade video prompt orchestration config.
 *
 * Converted from the Video Engine V3 JSON specification.
 * Provides smart-logic rules for 14 industry categories, motion/camera/speed
 * libraries, mood settings, and a resolver function that composes all layers
 * into a single cohesive video prompt.
 */

// ── Types ──

export interface SmartLogicRule {
  label: string;
  description: string;
  recommended_motion: string[];
  recommended_camera: string[];
  recommended_speed: string;
  recommended_mood: string[];
}

export interface MotionEffect {
  label: string;
  description: string;
  prompt_val: string;
}

export interface CameraMovement {
  label: string;
  description: string;
  prompt_val: string;
}

export interface SpeedSetting {
  label: string;
  description: string;
  prompt_val: string;
  mood_alignment: string[];
}

export interface MoodSetting {
  label: string;
  description: string;
}

export interface SoundMoodSetting {
  label: string;
  description: string;
}

export interface VideoPromptResult {
  full: string;
  motion: string[];
  camera: string[];
  speed: string;
  mood: string;
}

// ── Smart Logic Rules — 14 industry categories ──

export const SMART_LOGIC_RULES: Record<string, SmartLogicRule> = {
  smartphone_gadget: {
    label: "Smartphone & Gadget",
    description:
      "Optimized for tech products, UI showcase, device launch visuals, and clean modern motion.",
    recommended_motion: ["screen_glow", "floating_levitation", "light_leaks"],
    recommended_camera: ["orbit_360", "push_in_zoom", "close_up_detail"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["premium", "aspirational"],
  },
  fashion_apparel: {
    label: "Fashion & Apparel",
    description:
      "Designed for apparel campaigns, catalog visuals, movement-focused styling, and brand storytelling.",
    recommended_motion: ["fabric_flow", "wind_blow", "light_leaks"],
    recommended_camera: ["tracking_follow", "static_portrait", "dynamic_angle"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["aspirational", "premium"],
  },
  skincare_cosmetic: {
    label: "Skincare & Cosmetic",
    description:
      "Supports texture-driven product visuals, routine demos, luxury beauty ads, and macro detail shots.",
    recommended_motion: [
      "liquid_splash",
      "texture_press",
      "steam_rise",
      "coffee_steam",
      "light_leaks",
    ],
    recommended_camera: ["macro_slider", "push_in_zoom", "close_up_detail"],
    recommended_speed: "super_slow_mo",
    recommended_mood: ["calm", "premium", "aspirational"],
  },
  fnb_food_drink: {
    label: "Food & Beverage",
    description:
      "Best for hot drinks, chilled products, food closeups, pouring scenes, and appetite-driven storytelling.",
    recommended_motion: [
      "steam_rise",
      "pouring_action",
      "cheese_stretch",
      "coffee_steam",
      "confetti_blast",
    ],
    recommended_camera: ["static_tripod", "push_in_zoom", "macro_slider"],
    recommended_speed: "super_slow_mo",
    recommended_mood: ["calm", "aspirational", "energetic"],
  },
  service_professional: {
    label: "Service & Professional",
    description:
      "Built for expertise-led businesses, consultation services, maintenance, and trust-based communication.",
    recommended_motion: ["tool_action", "cleaning_wipe", "light_glow"],
    recommended_camera: ["static_tripod", "close_up_detail", "pull_out_reveal"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["professional", "calm"],
  },
  travel_lifestyle: {
    label: "Travel & Lifestyle",
    description:
      "Supports destination, leisure, hospitality, and everyday aesthetic storytelling with flexible scene coverage.",
    recommended_motion: [
      "cloud_move",
      "water_flow",
      "leaves_rustle",
      "light_leaks",
    ],
    recommended_camera: [
      "wide_angle_panning",
      "tracking_follow",
      "pull_out_reveal",
    ],
    recommended_speed: "timelapse_fast",
    recommended_mood: ["aspirational", "calm", "premium"],
  },
  health_fitness: {
    label: "Health & Fitness",
    description:
      "Designed for training content, wellness campaigns, supplement visuals, and high-energy movement stories.",
    recommended_motion: [
      "sweat_drip",
      "impact_fall",
      "powder_explosion",
      "smoke_flare",
    ],
    recommended_camera: ["tracking_follow", "dynamic_angle", "close_up_detail"],
    recommended_speed: "energetic_fast",
    recommended_mood: ["energetic", "aspirational"],
  },
  finance_business: {
    label: "Finance & Business",
    description:
      "Suitable for corporate content, dashboards, business trust signals, reports, and premium service messaging.",
    recommended_motion: ["data_visualization", "light_glow"],
    recommended_camera: ["static_tripod", "push_in_zoom", "pull_out_reveal"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["professional", "premium"],
  },
  entertainment_art: {
    label: "Entertainment & Art",
    description:
      "Good for performance, creative campaigns, launch teasers, event visuals, and expressive storytelling.",
    recommended_motion: [
      "confetti_blast",
      "stage_smoke",
      "glitch_effect",
      "smoke_flare",
    ],
    recommended_camera: ["dynamic_angle", "orbit_360", "tracking_follow"],
    recommended_speed: "beat_sync_fast",
    recommended_mood: ["energetic", "aspirational"],
  },
  real_estate: {
    label: "Real Estate",
    description:
      "Made for property listing videos, interior walkthroughs, luxury housing, and commercial space presentation.",
    recommended_motion: ["light_glow", "leaves_rustle", "window_sheer_flow"],
    recommended_camera: [
      "wide_angle_panning",
      "pull_out_reveal",
      "static_tripod",
    ],
    recommended_speed: "calm_showcase",
    recommended_mood: ["premium", "calm", "professional"],
  },
  professional_services: {
    label: "Professional Services",
    description:
      "Works well for agencies, consultants, legal, accounting, B2B offers, and trust-based service marketing.",
    recommended_motion: ["light_glow", "tool_action", "cleaning_wipe"],
    recommended_camera: ["static_tripod", "push_in_zoom", "close_up_detail"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["professional", "premium"],
  },
  automotive_parts: {
    label: "Automotive Parts",
    description:
      "Designed for spare parts, machine detail shots, performance features, installation flow, and precision products.",
    recommended_motion: [
      "tool_action",
      "impact_fall",
      "smoke_flare",
      "light_leaks",
    ],
    recommended_camera: ["orbit_360", "close_up_detail", "dynamic_angle"],
    recommended_speed: "energetic_fast",
    recommended_mood: ["energetic", "professional"],
  },
  kids_toys: {
    label: "Kids Toys",
    description:
      "Built for playful motion, colorful reveals, packaging moments, imaginative movement, and family-friendly promo content.",
    recommended_motion: ["confetti_blast", "floating_levitation", "light_glow"],
    recommended_camera: ["tracking_follow", "orbit_360", "push_in_zoom"],
    recommended_speed: "playful_fast",
    recommended_mood: ["playful", "energetic", "aspirational"],
  },
  custom: {
    label: "Custom",
    description:
      "Fallback category for power users who want to compose their own motion, camera, speed, and mood combinations.",
    recommended_motion: ["light_glow"],
    recommended_camera: ["static_tripod"],
    recommended_speed: "normal_realtime",
    recommended_mood: ["custom"],
  },
};

// ── Motion Library — 24 effects ──

export const MOTION_LIBRARY: Record<string, MotionEffect> = {
  steam_rise: {
    label: "Steam Rising",
    description:
      "Soft vapor movement for hot food, drinks, and premium warmth cues.",
    prompt_val: "steam rising gently, hot temperature",
  },
  coffee_steam: {
    label: "Coffee Steam",
    description:
      "Focused warm steam effect for coffee and fresh beverage storytelling.",
    prompt_val: "fresh coffee steam curling upward, warm aroma feel",
  },
  pouring_action: {
    label: "Pouring Liquid",
    description:
      "Dynamic pouring action for drinks, sauces, and fluid product reveals.",
    prompt_val: "pouring liquid, dynamic flow",
  },
  liquid_splash: {
    label: "Liquid Splash",
    description:
      "High-energy splash effect for cosmetic, beverage, or freshness visuals.",
    prompt_val: "water splashing, liquid explosion",
  },
  texture_press: {
    label: "Texture Press",
    description:
      "Macro texture interaction for creams, gels, or soft products.",
    prompt_val: "pressing cream, finger indentation, texture",
  },
  fabric_flow: {
    label: "Fabric Flowing",
    description:
      "Smooth fabric movement for fashion, elegance, and premium apparel visuals.",
    prompt_val: "fabric flowing in wind, silk movement",
  },
  wind_blow: {
    label: "Wind Blowing",
    description: "Adds organic motion to hair, fabric, or outdoor scenes.",
    prompt_val: "strong wind effect, hair blowing",
  },
  product_spin: {
    label: "Product Spin",
    description: "Centered rotational presentation for products and objects.",
    prompt_val: "rotating product, turntable view",
  },
  screen_glow: {
    label: "Screen Glow",
    description:
      "Highlights screens, interfaces, and illuminated device surfaces.",
    prompt_val: "screen lighting up, display animation",
  },
  floating_levitation: {
    label: "Levitation",
    description:
      "Zero-gravity floating effect for product emphasis and magical reveals.",
    prompt_val: "floating in mid air, zero gravity",
  },
  sweat_drip: {
    label: "Sweat Drip",
    description: "Performance and effort cue for fitness and training visuals.",
    prompt_val: "sweat dripping, water droplet",
  },
  impact_fall: {
    label: "Impact Fall",
    description:
      "Heavy product contact and kinetic impact for dramatic emphasis.",
    prompt_val: "dropping to ground, impact, debris",
  },
  powder_explosion: {
    label: "Powder Explosion",
    description: "Burst effect for supplement, sports, or bold product scenes.",
    prompt_val: "powder exploding, dust cloud",
  },
  confetti_blast: {
    label: "Confetti Blast",
    description:
      "Playful celebratory particles for launch, toys, and entertainment content.",
    prompt_val: "confetti explosion, celebration",
  },
  stage_smoke: {
    label: "Stage Smoke",
    description:
      "Atmospheric haze for performance, dramatic reveal, or cinematic depth.",
    prompt_val: "stage smoke machine, atmospheric haze",
  },
  glitch_effect: {
    label: "Glitch Effect",
    description:
      "Digital distortion style for edgy, entertainment, and tech-forward visuals.",
    prompt_val: "digital glitch, screen flicker, distortion",
  },
  cloud_move: {
    label: "Cloud Movement",
    description:
      "Sky motion for travel, outdoor atmosphere, and scene transition.",
    prompt_val: "time-lapse clouds moving, fast sky",
  },
  water_flow: {
    label: "Water Flowing",
    description: "Nature and freshness cue for outdoor and lifestyle scenes.",
    prompt_val: "river flowing, stream movement",
  },
  leaves_rustle: {
    label: "Leaves Rustling",
    description:
      "Subtle organic motion for nature, property, and calm visuals.",
    prompt_val: "leaves moving in wind, nature movement",
  },
  data_visualization: {
    label: "Data Visualization",
    description:
      "Animated chart and interface styling for business or finance content.",
    prompt_val: "holographic charts, graph moving, futuristic interface",
  },
  light_glow: {
    label: "Light Glow",
    description:
      "Soft illumination for premium, calm, and polished presentation scenes.",
    prompt_val: "lights turning on, warm glow",
  },
  tool_action: {
    label: "Tool Action",
    description:
      "Mechanical or hand-tool movement for service and technical products.",
    prompt_val: "wrench turning, screwing, mechanical movement",
  },
  cleaning_wipe: {
    label: "Cleaning Wipe",
    description:
      "Surface-cleaning action for care, service, and before-after storytelling.",
    prompt_val: "cloth wiping surface, cleaning action",
  },
  light_leaks: {
    label: "Light Leaks",
    description:
      "Creative cinematic light streaks for premium and aspirational scenes.",
    prompt_val: "cinematic light leaks, subtle flare, premium atmosphere",
  },
  smoke_flare: {
    label: "Smoke Flare",
    description:
      "Dramatic smoke burst or haze accent for action-oriented reveals.",
    prompt_val: "smoke flare, cinematic haze burst",
  },
  window_sheer_flow: {
    label: "Curtain Flow",
    description:
      "Soft curtain movement for real estate, hospitality, and calm interior visuals.",
    prompt_val: "window sheer curtain flowing softly in natural light",
  },
  cheese_stretch: {
    label: "Cheese Stretch",
    description: "Food texture pull for appetizing comfort-food visuals.",
    prompt_val: "cheese stretch, hot melty texture",
  },
};

// ── Camera Library — 12 movements ──

export const CAMERA_LIBRARY: Record<string, CameraMovement> = {
  static_tripod: {
    label: "Static Tripod",
    description: "Locked shot for stable presentation and clean framing.",
    prompt_val: "static camera, locked off",
  },
  push_in_zoom: {
    label: "Push In Zoom",
    description: "Forward motion for emphasis and reveal.",
    prompt_val: "camera moving forward, zoom in",
  },
  pull_out_reveal: {
    label: "Pull Out Reveal",
    description: "Backward camera move to reveal context or environment.",
    prompt_val: "camera moving backward, revealing context",
  },
  orbit_360: {
    label: "Orbit 360",
    description:
      "Circular camera move around subject for dimensional product focus.",
    prompt_val: "circling around subject, rotating view",
  },
  tracking_follow: {
    label: "Tracking Follow",
    description:
      "Follow movement for action, lifestyle, or character-based scenes.",
    prompt_val: "tracking shot, following subject",
  },
  low_angle_hero: {
    label: "Low Angle Hero",
    description: "Heroic upward framing for power and confidence.",
    prompt_val: "low angle shot, looking up, heroic",
  },
  drone_flyover: {
    label: "Drone Flyover",
    description: "Aerial travel or property perspective.",
    prompt_val: "aerial view, drone shot",
  },
  wide_angle_panning: {
    label: "Wide Angle Panning",
    description: "Landscape or room panning for scene context.",
    prompt_val: "wide angle, panning landscape",
  },
  macro_slider: {
    label: "Macro Slider",
    description: "Detailed close-range move for texture and premium closeups.",
    prompt_val: "extreme close up, slider movement",
  },
  dynamic_angle: {
    label: "Dynamic Angle",
    description: "Tilted or expressive framing for energy and edge.",
    prompt_val: "dutch angle, tilted frame, edgy",
  },
  close_up_detail: {
    label: "Close Up Detail",
    description:
      "Focused detail framing for materials, mechanisms, and product highlights.",
    prompt_val: "close up detail shot, product texture focus",
  },
  static_portrait: {
    label: "Static Portrait",
    description:
      "Centered portrait composition for talent, product, or spokesperson framing.",
    prompt_val: "static portrait framing, centered composition",
  },
};

// ── Speed Settings — 7 presets ──

export const SPEED_SETTINGS: Record<string, SpeedSetting> = {
  super_slow_mo: {
    label: "Super Slow Motion",
    description: "Premium detail emphasis and cinematic texture pacing.",
    prompt_val: "super slow motion, 1000fps",
    mood_alignment: ["premium", "calm", "aspirational"],
  },
  normal_realtime: {
    label: "Normal Realtime",
    description:
      "Balanced natural pacing for most product and service content.",
    prompt_val: "normal speed",
    mood_alignment: ["professional", "premium"],
  },
  timelapse_fast: {
    label: "Timelapse Fast",
    description:
      "Compressed time storytelling for outdoor, travel, and environment scenes.",
    prompt_val: "timelapse, fast motion",
    mood_alignment: ["aspirational", "calm"],
  },
  beat_sync_fast: {
    label: "Beat Sync Fast",
    description:
      "Fast rhythmic pacing for entertainment and high-energy edits.",
    prompt_val: "fast cuts, dynamic speed",
    mood_alignment: ["energetic", "playful"],
  },
  calm_showcase: {
    label: "Calm Showcase",
    description:
      "Soft, steady pacing for property, luxury, and premium display content.",
    prompt_val: "smooth slow pacing, elegant camera rhythm",
    mood_alignment: ["calm", "premium"],
  },
  energetic_fast: {
    label: "Energetic Fast",
    description:
      "Fast-impact pacing for sports, automotive, and action-heavy visuals.",
    prompt_val: "fast dynamic movement, energetic pacing",
    mood_alignment: ["energetic", "aspirational"],
  },
  playful_fast: {
    label: "Playful Fast",
    description: "Lively upbeat pacing for toys and fun consumer content.",
    prompt_val: "playful fast movement, bright upbeat pacing",
    mood_alignment: ["playful", "energetic"],
  },
};

// ── Mood Settings — 7 types ──

export const MOOD_SETTINGS: Record<string, MoodSetting> = {
  calm: {
    label: "Calm",
    description:
      "Soft, clean, minimal, steady, and reassuring visual direction.",
  },
  energetic: {
    label: "Energetic",
    description: "Fast, bold, active, and attention-grabbing visual direction.",
  },
  aspirational: {
    label: "Aspirational",
    description:
      "Lifestyle-forward, polished, emotionally elevated, and inspiring.",
  },
  premium: {
    label: "Premium",
    description: "Luxurious, refined, cinematic, and high-trust presentation.",
  },
  professional: {
    label: "Professional",
    description: "Reliable, credible, clean, and business-appropriate tone.",
  },
  playful: {
    label: "Playful",
    description: "Fun, colorful, imaginative, and light-hearted direction.",
  },
  custom: {
    label: "Custom",
    description: "User-defined mood composition for advanced workflows.",
  },
};

// ── Sound Mood Settings — 5 audio moods ──

export const SOUND_MOOD_SETTINGS: Record<string, SoundMoodSetting> = {
  aspirational: {
    label: "Aspirational",
    description:
      "Uplifting, modern, polished music mood for lifestyle and premium content.",
  },
  energetic: {
    label: "Energetic",
    description: "Punchy, upbeat, rhythmic audio mood for active campaigns.",
  },
  calm: {
    label: "Calm",
    description: "Gentle, clean, spacious sound mood for trust and elegance.",
  },
  professional: {
    label: "Professional",
    description: "Neutral, clear, corporate-safe audio mood.",
  },
  playful: {
    label: "Playful",
    description:
      "Bright and cheerful sound mood for family-friendly or toy content.",
  },
};

// ── Niche-to-V3 category mapping ──
// Maps the bot's existing niche IDs (from niches.ts) to V3 smart_logic_rules keys.

export const NICHE_TO_V3_CATEGORY: Record<string, string> = {
  // Bot niche IDs -> V3 category keys
  food_culinary: "fnb_food_drink",
  fnb: "fnb_food_drink",
  fashion_lifestyle: "fashion_apparel",
  fashion: "fashion_apparel",
  tech_gadgets: "smartphone_gadget",
  tech: "smartphone_gadget",
  beauty_skincare: "skincare_cosmetic",
  skincare: "skincare_cosmetic",
  travel_adventure: "travel_lifestyle",
  travel: "travel_lifestyle",
  fitness_health: "health_fitness",
  health: "health_fitness",
  home_decor: "real_estate",
  business_finance: "finance_business",
  finance: "finance_business",
  education_knowledge: "service_professional",
  education: "service_professional",
  entertainment: "entertainment_art",
};

// ── Resolver Function ──

/**
 * Resolve a complete video prompt from a category, optional mood override,
 * and optional user description.
 *
 * 1. Looks up the category in smart_logic_rules (with niche mapping fallback)
 * 2. Resolves recommended motion, camera, speed from the libraries
 * 3. Combines all prompt_vals into a cohesive prompt string
 * 4. Appends the user's description
 * 5. Returns structured result
 */
export function resolveVideoPrompt(
  category: string,
  mood?: string,
  userPrompt?: string,
): VideoPromptResult {
  // Resolve category — try direct match, then niche mapping, then fallback to custom
  const v3Key = SMART_LOGIC_RULES[category]
    ? category
    : NICHE_TO_V3_CATEGORY[category] || "custom";

  const rule = SMART_LOGIC_RULES[v3Key] || SMART_LOGIC_RULES.custom;

  // Resolve mood — use provided or first recommended
  const resolvedMood =
    mood && MOOD_SETTINGS[mood] ? mood : rule.recommended_mood[0] || "premium";

  // Resolve motion prompt_vals
  const motionKeys = rule.recommended_motion;
  const motionPrompts = motionKeys
    .map((k) => MOTION_LIBRARY[k]?.prompt_val)
    .filter(Boolean);

  // Resolve camera prompt_vals
  const cameraKeys = rule.recommended_camera;
  const cameraPrompts = cameraKeys
    .map((k) => CAMERA_LIBRARY[k]?.prompt_val)
    .filter(Boolean);

  // Resolve speed prompt_val
  const speedKey = rule.recommended_speed;
  const speedPrompt = SPEED_SETTINGS[speedKey]?.prompt_val || "normal speed";

  // Resolve mood description for prompt flavoring
  const moodDesc = MOOD_SETTINGS[resolvedMood]?.description || "";

  // Build the full combined prompt
  const segments: string[] = [];

  // Motion layer
  if (motionPrompts.length > 0) {
    segments.push(motionPrompts.join(", "));
  }

  // Camera layer
  if (cameraPrompts.length > 0) {
    segments.push(cameraPrompts.join(", "));
  }

  // Speed layer
  segments.push(speedPrompt);

  // Mood flavor
  if (moodDesc) {
    segments.push(moodDesc.toLowerCase());
  }

  // User description last (highest semantic weight at end for most generators)
  if (userPrompt && userPrompt.trim().length > 0) {
    segments.push(userPrompt.trim());
  }

  // Quality baseline
  segments.push(
    "photorealistic, 4K resolution, cinematic color grading, professional videography",
  );

  return {
    full: segments.join(", "),
    motion: motionKeys,
    camera: cameraKeys,
    speed: speedKey,
    mood: resolvedMood,
  };
}
