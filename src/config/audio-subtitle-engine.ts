/**
 * Audio, Subtitle & VO Engine — from Unified Visual Marketing Engine V2.2
 *
 * Covers: voice over persona, music recommendation, SFX, subtitle sync,
 * platform rendering specs, and cross-engine orchestration logic.
 *
 * Shared via: src/config/shared/unified-engine-v2.2.json
 */

// ── VO Persona Engine ──

export interface PersonaPreset {
  tone: string;
  speaking_speed: string;
  imperfection_level: string;
  gesture_intensity: string;
}

export const VO_PERSONA_MODES = [
  "credible_human_presenter",
  "warm_storyteller",
  "confident_explainer",
  "casual_creator",
  "empathetic_advisor",
  "high_energy_promoter",
] as const;

export type PersonaMode = (typeof VO_PERSONA_MODES)[number];

export const PERSONA_PRESETS: Record<PersonaMode, PersonaPreset> = {
  credible_human_presenter: {
    tone: "professional_friendly",
    speaking_speed: "medium_natural",
    imperfection_level: "subtle",
    gesture_intensity: "balanced",
  },
  warm_storyteller: {
    tone: "empathetic_warm",
    speaking_speed: "medium_slow",
    imperfection_level: "moderate",
    gesture_intensity: "soft",
  },
  confident_explainer: {
    tone: "clear_confident",
    speaking_speed: "medium",
    imperfection_level: "light",
    gesture_intensity: "controlled",
  },
  casual_creator: {
    tone: "relaxed_social",
    speaking_speed: "medium_fast",
    imperfection_level: "moderate",
    gesture_intensity: "natural",
  },
  empathetic_advisor: {
    tone: "calm_supportive",
    speaking_speed: "medium_slow",
    imperfection_level: "subtle",
    gesture_intensity: "soft",
  },
  high_energy_promoter: {
    tone: "energetic_persuasive",
    speaking_speed: "fast_controlled",
    imperfection_level: "light",
    gesture_intensity: "high",
  },
};

// ── AI Voice Profiles ──

export interface VoiceProfile {
  voice_id: string;
  language: string;
  style: string[];
  best_for: string[];
  reading_speed_wpm: number;
  caption_tone: string;
}

export const AI_VOICE_PROFILES: Record<string, VoiceProfile> = {
  indonesian_male_generative: {
    voice_id: "id-ID-Standard-A",
    language: "id",
    style: ["casual", "friendly", "trustworthy"],
    best_for: ["product_review", "tips_and_tricks"],
    reading_speed_wpm: 145,
    caption_tone: "clean_conversational",
  },
  indonesian_female_soft: {
    voice_id: "id-ID-Standard-B",
    language: "id",
    style: ["calm", "soothing", "elegant"],
    best_for: ["skincare", "decor", "storytelling"],
    reading_speed_wpm: 135,
    caption_tone: "soft_clean",
  },
  english_us_male_deep: {
    voice_id: "en-US-Deep-Male",
    language: "en",
    style: ["authoritative", "cinematic", "epic"],
    best_for: ["gadget", "automotive", "tech_review"],
    reading_speed_wpm: 150,
    caption_tone: "bold_clean",
  },
};

// ── Music Library ──

export type MusicMood =
  | "upbeat_energy"
  | "calm_focus"
  | "cinematic_epic"
  | "trendy_viral";

export const MUSIC_RECOMMENDATIONS: Record<
  MusicMood,
  { use_case: string[]; music_tags: string[]; platform_source: string }
> = {
  upbeat_energy: {
    use_case: ["video_promo", "travel_vlog", "unboxing"],
    music_tags: [
      "upbeat_pop",
      "energetic_funk",
      "tropical_house",
      "corporate_happy",
    ],
    platform_source: "youtube_audio_library",
  },
  calm_focus: {
    use_case: ["tutorial", "product_review", "education"],
    music_tags: ["ambient", "soft_piano", "lo_fi_chill", "modern_classical"],
    platform_source: "pixabay_music",
  },
  cinematic_epic: {
    use_case: ["property_video", "automotive", "drone_shot"],
    music_tags: ["orchestral_epic", "cinematic_trailer", "heroic_strings"],
    platform_source: "mixkit",
  },
  trendy_viral: {
    use_case: ["tiktok_style", "story_content", "gen_z_content"],
    music_tags: ["phonk", "trap_beat", "slap_house", "viral_instrumental"],
    platform_source: "tiktok_commercial_library",
  },
};

// ── Audio Mixing Rules ──

export const AUDIO_MIXING_RULES = {
  ducking: {
    enabled: true,
    voice_over_trigger_threshold_db: -24,
    music_reduction_percent: 60,
    fade_in_seconds: 0.5,
    fade_out_seconds: 0.5,
  },
  volume: {
    youtube: { integrated_lufs: -14, true_peak_db: -1 },
    tiktok: { integrated_lufs: -15, true_peak_db: -1 },
    instagram: { integrated_lufs: -14, true_peak_db: -1 },
  },
  voice_priority: {
    background_music_max_relative_level_db: -18,
    sfx_sidechain_to_voice: true,
  },
} as const;

// ── SFX Library ──

export const SFX_LIBRARY = {
  transition: {
    slide_left: "whoosh_swipe_left.wav",
    zoom_in: "swoosh_fast.wav",
    glitch: "digital_glitch_static.wav",
    pop_up: "pop_bubble.wav",
  },
  action: {
    product_appear: "soft_chime_magic.wav",
    impact_fall: "heavy_thud_impact.wav",
    liquid_splash: "water_splash_clear.wav",
    typing_text: "keyboard_typing_fast.wav",
  },
  ui: {
    sale_badge: "cash_register_cha_ching.wav",
    info_pop: "notification_ping.wav",
    success: "correct_ding.wav",
  },
} as const;

// ── Subtitle Sync Engine ──

export interface SubtitleStylePreset {
  font_style: string;
  case_mode: string;
  stroke: string;
  shadow: string;
  placement: string;
}

export const SUBTITLE_STYLE_PRESETS: Record<string, SubtitleStylePreset> = {
  clean_minimal: {
    font_style: "sans_bold",
    case_mode: "sentence_case",
    stroke: "medium",
    shadow: "soft",
    placement: "bottom_center",
  },
  viral_bold: {
    font_style: "sans_extra_bold",
    case_mode: "upper_or_title_case",
    stroke: "strong",
    shadow: "medium",
    placement: "center_lower_third",
  },
  cinematic_soft: {
    font_style: "clean_semi_bold",
    case_mode: "sentence_case",
    stroke: "light",
    shadow: "soft",
    placement: "bottom_safe",
  },
};

export const SUBTITLE_SEGMENTATION = {
  max_characters_per_line: 32,
  max_lines_per_block: 2,
  min_caption_duration_seconds: 0.8,
  max_caption_duration_seconds: 3.5,
  min_gap_between_blocks_ms: 80,
  break_on: ["comma", "period", "natural_pause", "conjunction_if_needed"],
  avoid_breaking: [
    "person_name",
    "brand_phrase",
    "currency_value",
    "number_unit_pair",
  ],
} as const;

// ── Platform Rendering ──

export interface PlatformPreset {
  aspect_ratio: string;
  resolution: string;
  fps_options: number[];
  bitrate_mbps: { min: number; max: number };
  safe_area: {
    bottom_margin_percent: number;
    top_margin_percent: number;
    horizontal_padding_percent: number;
  };
}

export const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
  tiktok_reels_shorts: {
    aspect_ratio: "9:16",
    resolution: "1080x1920",
    fps_options: [30, 60],
    bitrate_mbps: { min: 8, max: 12 },
    safe_area: {
      bottom_margin_percent: 18,
      top_margin_percent: 10,
      horizontal_padding_percent: 8,
    },
  },
  youtube_feed_ads: {
    aspect_ratio: "16:9",
    resolution: "1920x1080",
    fps_options: [24, 30],
    bitrate_mbps: { min: 5, max: 8 },
    safe_area: {
      bottom_margin_percent: 10,
      top_margin_percent: 8,
      horizontal_padding_percent: 6,
    },
  },
  instagram_stories: {
    aspect_ratio: "9:16",
    resolution: "1080x1920",
    fps_options: [30],
    bitrate_mbps: { min: 4, max: 8 },
    safe_area: {
      bottom_margin_percent: 20,
      top_margin_percent: 12,
      horizontal_padding_percent: 8,
    },
  },
};

// ── Cross-Engine Orchestration Logic ──

export type ContentType =
  | "tutorial"
  | "sales_promo"
  | "storytelling"
  | "product_review"
  | "social_content";

export interface ContentTypeConfig {
  persona: PersonaMode;
  subtitle_preset: string;
  music_mood: MusicMood;
  video_mood: string;
  storyboard: string;
}

export const CONTENT_TYPE_RULES: Record<ContentType, ContentTypeConfig> = {
  tutorial: {
    persona: "confident_explainer",
    subtitle_preset: "clean_minimal",
    music_mood: "calm_focus",
    video_mood: "professional",
    storyboard: "problem_solution",
  },
  sales_promo: {
    persona: "high_energy_promoter",
    subtitle_preset: "viral_bold",
    music_mood: "upbeat_energy",
    video_mood: "energetic",
    storyboard: "unboxing_reveal",
  },
  storytelling: {
    persona: "warm_storyteller",
    subtitle_preset: "cinematic_soft",
    music_mood: "calm_focus",
    video_mood: "aspirational",
    storyboard: "before_after",
  },
  product_review: {
    persona: "credible_human_presenter",
    subtitle_preset: "clean_minimal",
    music_mood: "calm_focus",
    video_mood: "premium",
    storyboard: "problem_solution",
  },
  social_content: {
    persona: "casual_creator",
    subtitle_preset: "viral_bold",
    music_mood: "trendy_viral",
    video_mood: "playful",
    storyboard: "unboxing_reveal",
  },
};

export const CATEGORY_TO_VOICE: Record<string, string> = {
  home_decor: "indonesian_female_soft",
  skincare_cosmetic: "indonesian_female_soft",
  electronics: "english_us_male_deep",
  fashion: "indonesian_female_soft",
  fnb_food_drink: "indonesian_female_soft",
  service_professional: "indonesian_male_generative",
  travel_lifestyle: "indonesian_female_soft",
  health_fitness: "indonesian_male_generative",
  finance_business: "indonesian_male_generative",
  automotive_parts: "english_us_male_deep",
  jewelry: "indonesian_female_soft",
};

export const CATEGORY_TO_AUDIO_MOOD: Record<string, MusicMood> = {
  skincare_cosmetic: "calm_focus",
  home_decor: "calm_focus",
  electronics: "cinematic_epic",
  fashion: "upbeat_energy",
  fnb_food_drink: "upbeat_energy",
  travel_lifestyle: "upbeat_energy",
  finance_business: "calm_focus",
  automotive_parts: "cinematic_epic",
  social_content: "trendy_viral",
};

// ── Marketing Engine ──

export const MARKETING_HOOKS = [
  "baru tahu ternyata ini bikin hidup lebih gampang",
  "jangan beli sebelum lihat ini",
  "ternyata bedanya jauh banget",
  "ini alasan kenapa banyak orang pindah ke produk ini",
];

export const MARKETING_BENEFITS = [
  "lebih hemat waktu untuk aktivitas harian",
  "lebih rapi, nyaman, dan enak dipakai",
  "terlihat premium tanpa ribet",
  "praktis dipakai untuk kebutuhan harian",
];

export const MARKETING_CTAS = [
  "cek detailnya sekarang",
  "save dulu buat nanti",
  "coba lihat varian lengkapnya",
  "pilih yang paling cocok buat kamu",
];

export const STORYBOARD_TEMPLATES: Record<string, string[]> = {
  problem_solution: [
    "hook_problem",
    "pain_point",
    "product_intro",
    "benefit_demo",
    "result",
    "cta",
  ],
  unboxing_reveal: [
    "hook",
    "package_reveal",
    "detail_close_up",
    "hero_moment",
    "benefit_text",
    "cta",
  ],
  before_after: [
    "before_state",
    "contrast_moment",
    "solution_intro",
    "after_result",
    "cta",
  ],
};

// ── Resolver ──

export interface ContentOrchestration {
  persona: PersonaPreset;
  voice: VoiceProfile;
  music: { mood: MusicMood; tags: string[]; source: string };
  subtitle: SubtitleStylePreset;
  platform: PlatformPreset;
  storyboard: string[];
  marketing_bias: string;
}

/**
 * Resolve the full content orchestration config from category + content type + platform.
 */
export function resolveContentOrchestration(
  category: string,
  contentType: ContentType = "sales_promo",
  platform: string = "tiktok_reels_shorts",
): ContentOrchestration {
  const ctConfig =
    CONTENT_TYPE_RULES[contentType] || CONTENT_TYPE_RULES.sales_promo;

  // Voice
  const voiceKey = CATEGORY_TO_VOICE[category] || "indonesian_female_soft";
  const voice =
    AI_VOICE_PROFILES[voiceKey] || AI_VOICE_PROFILES.indonesian_female_soft;

  // Persona
  const persona =
    PERSONA_PRESETS[ctConfig.persona] ||
    PERSONA_PRESETS.credible_human_presenter;

  // Music
  const musicMood = CATEGORY_TO_AUDIO_MOOD[category] || ctConfig.music_mood;
  const musicConfig =
    MUSIC_RECOMMENDATIONS[musicMood] || MUSIC_RECOMMENDATIONS.upbeat_energy;

  // Subtitle
  const subtitle =
    SUBTITLE_STYLE_PRESETS[ctConfig.subtitle_preset] ||
    SUBTITLE_STYLE_PRESETS.clean_minimal;

  // Platform
  const platformConfig =
    PLATFORM_PRESETS[platform] || PLATFORM_PRESETS.tiktok_reels_shorts;

  // Storyboard
  const storyboard =
    STORYBOARD_TEMPLATES[ctConfig.storyboard] ||
    STORYBOARD_TEMPLATES.problem_solution;

  // Marketing bias
  const biasMap: Record<string, string> = {
    home_decor: "comfort_and_premium_lifestyle",
    skincare_cosmetic: "beauty_and_trust",
    electronics: "innovation_and_clean_design",
    fashion: "style_and_identity",
    fnb_food_drink: "taste_and_craving",
    service_professional: "trust_and_clarity",
    travel_lifestyle: "aspiration_and_escape",
    health_fitness: "energy_and_results",
    finance_business: "trust_and_growth",
    automotive_parts: "performance_and_precision",
    jewelry: "luxury_and_giftability",
  };

  return {
    persona,
    voice,
    music: {
      mood: musicMood,
      tags: musicConfig.music_tags,
      source: musicConfig.platform_source,
    },
    subtitle,
    platform: platformConfig,
    storyboard,
    marketing_bias: biasMap[category] || "general_quality",
  };
}
