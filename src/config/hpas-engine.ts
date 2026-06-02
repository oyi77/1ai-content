/**
 * HPAS Engine Configuration
 * Hook → Problem → Agitate → Solution (+ Discovery, Interaction, CTA)
 *
 * 7-scene framework for high-converting video ads
 * Used by OpenClaw SaaS v3.0
 */

import { getConfig } from '@/config/env';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { ConfigError, ProviderError } from '@/utils/app-errors';

// ── Types ────────────────────────────────────────────────────────────────────

export type SceneId = 'hook' | 'problem' | 'agitate' | 'discovery' | 'interaction' | 'result' | 'cta';
export type DurationPreset = 'quick' | 'standard' | 'extended' | 'custom';
export type IndustryId = 'beauty' | 'food' | 'fashion' | 'tech' | 'fitness' | 'general';

export interface SceneConfig {
  id: SceneId;
  name: string;
  nameId: string;          // Indonesian name
  order: number;
  durationRange: { min: number; max: number }; // in seconds
  emotionTarget: string;
  description: string;
  cinematographyTips: string[];
  aiPromptHints: string[];
}

export interface DurationPresetConfig {
  id: DurationPreset | string;
  name: string;
  totalSeconds: number;
  scenesIncluded: SceneId[];
  sceneDurations: Partial<Record<SceneId, number>>; // seconds per scene
  creditCost: number; // in units — DEPRECATED: use getUnitCostAsync() for billing; kept for legacy ratio calculations
  description: string;
}

export interface IndustryScenePrompt {
  sceneId: SceneId;
  promptId: string;
  promptEn: string;
  promptId_lang: string;  // Indonesian
  visualStyle: string;
  lighting: string;
  mood: string;
}

export interface IndustryTemplate {
  id: IndustryId;
  name: string;
  nameId: string;
  description: string;
  colorPalette: string[];
  scenes: IndustryScenePrompt[];
}

// ── 7 Scene Definitions ──────────────────────────────────────────────────────

export const HPAS_SCENES: Record<SceneId, SceneConfig> = {
  hook: {
    id: 'hook',
    name: 'Hook',
    nameId: 'Pancing Perhatian',
    order: 1,
    durationRange: { min: 2, max: 8 },
    emotionTarget: 'curiosity / shock / intrigue',
    description: 'Stop the scroll. Must grab attention within 1.5 seconds.',
    cinematographyTips: [
      'Extreme close-up of product texture or key detail',
      'High contrast lighting — dark background, product lit dramatically',
      'Pattern interrupt — unexpected angle or motion',
      'First frame must be visually striking',
      'Avoid slow pans — cut to the point immediately',
    ],
    aiPromptHints: [
      'dramatic close-up shot',
      'high contrast lighting',
      'eye-catching composition',
      'product as hero',
      'striking visual impact',
    ],
  },

  problem: {
    id: 'problem',
    name: 'Problem',
    nameId: 'Masalah',
    order: 2,
    durationRange: { min: 2, max: 8 },
    emotionTarget: 'recognition / frustration / empathy',
    description: 'Make viewer relate. Show their everyday problem.',
    cinematographyTips: [
      'Real-life setting — kitchen, bathroom, office, outdoors',
      'Show a person looking frustrated or stuck',
      'Warm desaturated tones to convey problem mood',
      'Medium shot — see the person and their environment',
      '"Oh that\'s me" moment — make it universal',
    ],
    aiPromptHints: [
      'frustrated person',
      'relatable everyday situation',
      'warm desaturated colors',
      'medium shot real environment',
      'problem visualization',
    ],
  },

  agitate: {
    id: 'agitate',
    name: 'Agitate',
    nameId: 'Pertegas Masalah',
    order: 3,
    durationRange: { min: 2, max: 8 },
    emotionTarget: 'urgency / anxiety / "I need to fix this NOW"',
    description: 'Make the problem feel URGENT. Show consequences of not acting.',
    cinematographyTips: [
      'Extreme close-up on the problem area',
      'Darker, more dramatic lighting',
      'Slow zoom in for tension',
      'Before state — worst version of the problem',
      'Red/dark color grading to signal urgency',
    ],
    aiPromptHints: [
      'extreme close-up problem area',
      'dramatic dark lighting',
      'tense atmosphere',
      'urgency visual cues',
      'worst-case scenario visualization',
    ],
  },

  discovery: {
    id: 'discovery',
    name: 'Discovery',
    nameId: 'Temukan Solusi',
    order: 4,
    durationRange: { min: 2, max: 10 },
    emotionTarget: 'hope / relief / "this is the answer"',
    description: 'Product reveal as the solution. Transition from dark to light.',
    cinematographyTips: [
      'Lighting shift: dark → bright (visual metaphor)',
      'Product hero shot — clean background, elegant presentation',
      'Hand reaching for/unveiling the product',
      'Unboxing or reveal moment',
      'Golden hour or studio lighting for product',
    ],
    aiPromptHints: [
      'product hero shot',
      'bright clean background',
      'elegant product reveal',
      'hope and relief atmosphere',
      'unboxing or discovery moment',
    ],
  },

  interaction: {
    id: 'interaction',
    name: 'Interaction',
    nameId: 'Penggunaan Produk',
    order: 5,
    durationRange: { min: 2, max: 10 },
    emotionTarget: 'desire / engagement / "I want that"',
    description: 'Show product BEING USED. Action shot, not static studio.',
    cinematographyTips: [
      'Real person using the product in natural setting',
      'Show product in action — applying, eating, wearing, using',
      'Soft natural lighting or warm artificial lighting',
      'Close-up of hands or face interacting with product',
      'Implicit social proof: "other people use this"',
    ],
    aiPromptHints: [
      'person using product',
      'natural usage environment',
      'hands-on interaction',
      'authentic lifestyle shot',
      'product in motion',
    ],
  },

  result: {
    id: 'result',
    name: 'Result',
    nameId: 'Hasil Nyata',
    order: 6,
    durationRange: { min: 2, max: 8 },
    emotionTarget: 'satisfaction / aspiration / transformation',
    description: 'Show the TRANSFORMATION. After state. "This could be you."',
    cinematographyTips: [
      'Before-after implicit — bright, glowing, transformed',
      'Happy, confident person or beautiful result',
      'High vibrancy, saturation boost',
      'Wide smile, confidence pose, or product result close-up',
      'Aspirational feel — lifestyle upgrade',
    ],
    aiPromptHints: [
      'transformation result',
      'happy satisfied person',
      'bright vibrant colors',
      'aspirational lifestyle',
      'after state beauty',
    ],
  },

  cta: {
    id: 'cta',
    name: 'CTA',
    nameId: 'Ajakan Bertindak',
    order: 7,
    durationRange: { min: 1.5, max: 8 },
    emotionTarget: 'confidence / decision / "I\'m doing this now"',
    description: 'Drive ACTION. Product centered, price visible, clear instruction.',
    cinematographyTips: [
      'Clean minimal background — product takes center stage',
      'Price tag or offer visible',
      'Text overlay: "Order Sekarang", "Link di Bio", "DM Kami"',
      'Brand colors prominent',
      'End card format — static or slow zoom out',
    ],
    aiPromptHints: [
      'product centered clean background',
      'call to action overlay text',
      'brand colors prominent',
      'price tag visible',
      'end card format',
    ],
  },
};

// ── Duration Presets ──────────────────────────────────────────────────────────

export const DURATION_PRESETS: Record<string, DurationPresetConfig> = {
  quick: {
    id: 'quick',
    name: 'Quick',
    totalSeconds: 15,
    scenesIncluded: ['hook', 'problem', 'discovery', 'result', 'cta'],
    sceneDurations: { hook: 3, problem: 3, discovery: 3, result: 3, cta: 3 },
    creditCost: 8,  // 0.8 credits (aligned with UNIT_COSTS.VIDEO_15S)
    description: '15s — 5 scenes, fast format. Best for TikTok paid ads.',
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    totalSeconds: 30,
    scenesIncluded: ['hook', 'problem', 'agitate', 'discovery', 'interaction', 'result', 'cta'],
    sceneDurations: { hook: 4, problem: 4, agitate: 4, discovery: 5, interaction: 5, result: 4, cta: 4 },
    creditCost: 15,  // 1.5 credits (aligned with UNIT_COSTS.VIDEO_30S)
    description: '30s — 7 scenes full HPAS. Most versatile, all platforms.',
  },
  extended: {
    id: 'extended',
    name: 'Extended',
    totalSeconds: 60,
    scenesIncluded: ['hook', 'problem', 'agitate', 'discovery', 'interaction', 'result', 'cta'],
    sceneDurations: { hook: 8, problem: 8, agitate: 8, discovery: 10, interaction: 10, result: 8, cta: 8 },
    creditCost: 30,  // 3.0 credits (aligned with UNIT_COSTS.VIDEO_60S)
    description: '60s — 7 scenes extended. Rich storytelling, YouTube/Facebook.',
  },
};

/**
 * Build a custom duration preset config for arbitrary durations (6-3600s).
 * Cycles through 7 HPAS scenes. Max 50 scenes.
 */
export function buildCustomPresetConfig(durationSeconds: number): DurationPresetConfig {
  const clamped = Math.max(6, Math.min(3600, durationSeconds));
  const FULL_CYCLE: SceneId[] = ['hook', 'problem', 'agitate', 'discovery', 'interaction', 'result', 'cta'];

  // Calculate scene count: ~5-8s per scene, cycle through HPAS
  const targetSceneDuration = clamped <= 60 ? 5 : clamped <= 300 ? 6 : 7;
  let sceneCount = Math.max(3, Math.ceil(clamped / targetSceneDuration));
  sceneCount = Math.min(sceneCount, 50); // hard cap

  // Build scene list by cycling through HPAS
  const scenesIncluded: SceneId[] = [];
  for (let i = 0; i < sceneCount; i++) {
    scenesIncluded.push(FULL_CYCLE[i % FULL_CYCLE.length]);
  }

  // Distribute duration proportionally (standard ratios)
  const ratios: Record<SceneId, number> = {
    hook: 4, problem: 4, agitate: 4, discovery: 5, interaction: 5, result: 4, cta: 4,
  };
  const totalRatio = scenesIncluded.reduce((s, id) => s + ratios[id], 0);
  const sceneDurations: Partial<Record<SceneId, number>> = {};
  let assigned = 0;
  scenesIncluded.forEach((id, i) => {
    if (i === scenesIncluded.length - 1) {
      sceneDurations[id] = clamped - assigned; // last scene gets remainder
    } else {
      const dur = Math.max(2, Math.round((ratios[id] / totalRatio) * clamped));
      sceneDurations[id] = dur;
      assigned += dur;
    }
  });

  // Tiered pricing: 0.035/s first 60s, 0.030/s 61-300s, 0.025/s 300+s
  let creditCost = 0;
  if (clamped <= 60) {
    creditCost = clamped * 0.035;
  } else if (clamped <= 300) {
    creditCost = 60 * 0.035 + (clamped - 60) * 0.030;
  } else {
    creditCost = 60 * 0.035 + 240 * 0.030 + (clamped - 300) * 0.025;
  }
  creditCost = Math.max(0.5, Math.round(creditCost * 10) / 10); // min 0.5, round to 0.1

  const minutes = Math.floor(clamped / 60);
  const secs = clamped % 60;
  const durLabel = minutes > 0 ? `${minutes}m${secs > 0 ? `${secs}s` : ''}` : `${secs}s`;

  return {
    id: 'custom',
    name: `Custom ${durLabel}`,
    totalSeconds: clamped,
    scenesIncluded,
    sceneDurations,
    creditCost,
    description: `${durLabel} — ${sceneCount} scenes, custom duration.`,
  };
}

// ── Industry Templates ────────────────────────────────────────────────────────

export const INDUSTRY_TEMPLATES: Record<IndustryId, IndustryTemplate> = {
  beauty: {
    id: 'beauty',
    name: 'Beauty & Skincare',
    nameId: 'Kecantikan & Skincare',
    description: 'Skincare, makeup, perawatan wajah, produk kecantikan',
    colorPalette: ['#F8E8EE', '#FFB6C1', '#D4A5A5', '#8B4F6B', '#FFF0F5'],
    scenes: [
      { sceneId: 'hook', promptId: 'beauty_hook', promptEn: 'Extreme close-up of skin texture — pores, texture, imperfections visible. High contrast beauty lighting.', promptId_lang: 'Close-up ekstrem tekstur kulit — pori-pori dan bekas jerawat terlihat jelas. Pencahayaan beauty yang dramatis.', visualStyle: 'Ultra macro beauty photography', lighting: 'High contrast single source', mood: 'Intriguing, slightly uncomfortable' },
      { sceneId: 'problem', promptId: 'beauty_problem', promptEn: 'Woman looking frustrated in bathroom mirror, touching problematic skin, desaturated warm tones.', promptId_lang: 'Wanita menatap cermin kamar mandi dengan ekspresi frustrasi, menyentuh kulit bermasalah, warna desaturasi hangat.', visualStyle: 'Lifestyle documentary', lighting: 'Natural bathroom window light', mood: 'Frustration, recognition' },
      { sceneId: 'agitate', promptId: 'beauty_agitate', promptEn: 'Extreme close-up of skin problem — dark spots, uneven tone, under harsh lighting. Tense dark atmosphere.', promptId_lang: 'Close-up ekstrem masalah kulit — noda gelap, warna tidak merata, pencahayaan keras. Atmosfer tegang dan gelap.', visualStyle: 'Harsh clinical close-up', lighting: 'Harsh overhead light', mood: 'Urgency, anxiety' },
      { sceneId: 'discovery', promptId: 'beauty_discovery', promptEn: 'Elegant skincare product on white marble surface, soft golden light, hand reaching to pick it up. Light, airy, hopeful.', promptId_lang: 'Produk skincare elegan di permukaan marmer putih, cahaya emas lembut, tangan meraih produk. Terang, ringan, penuh harapan.', visualStyle: 'Luxury product photography', lighting: 'Soft golden hour', mood: 'Hope, elegance, relief' },
      { sceneId: 'interaction', promptId: 'beauty_interaction', promptEn: 'Woman applying serum to glowing skin, gentle massage motion, warm natural lighting. Authentic, natural moment.', promptId_lang: 'Wanita mengaplikasikan serum ke kulit bercahaya, gerakan pijat lembut, pencahayaan alami hangat. Momen autentik dan natural.', visualStyle: 'Natural lifestyle beauty', lighting: 'Warm natural window light', mood: 'Desire, engagement, care' },
      { sceneId: 'result', promptId: 'beauty_result', promptEn: 'Close-up of glowing, radiant skin — smooth texture, even tone, dewy finish. Woman smiling confidently. High vibrancy.', promptId_lang: 'Close-up kulit bercahaya — tekstur halus, warna merata, tampak segar. Wanita tersenyum percaya diri. Saturasi tinggi.', visualStyle: 'High vibrancy beauty', lighting: 'Bright even lighting with warmth', mood: 'Transformation, confidence, satisfaction' },
      { sceneId: 'cta', promptId: 'beauty_cta', promptEn: 'Product centered on clean pink/white background, price tag visible, "Order Sekarang" text overlay. Brand colors.', promptId_lang: 'Produk di tengah background merah muda/putih bersih, harga terlihat, teks "Order Sekarang". Warna brand.', visualStyle: 'Clean product end card', lighting: 'Even studio light', mood: 'Action, confidence, decision' },
    ],
  },

  food: {
    id: 'food',
    name: 'Food & Culinary',
    nameId: 'Makanan & Kuliner',
    description: 'Restoran, kafe, makanan jadi, minuman, katering',
    colorPalette: ['#FFF8DC', '#FF6B35', '#F7C59F', '#3D5A80', '#E8B86D'],
    scenes: [
      { sceneId: 'hook', promptId: 'food_hook', promptEn: 'Extreme close-up of food — steam rising, sizzling, cheese pull, or perfect pour. Dramatic food lighting.', promptId_lang: 'Close-up ekstrem makanan — uap mengepul, mendesis, keju meleleh, atau minuman dituang. Pencahayaan makanan dramatis.', visualStyle: 'Food macro photography', lighting: 'Side backlight for steam/texture', mood: 'Temptation, appetite trigger' },
      { sceneId: 'problem', promptId: 'food_problem', promptEn: 'Person looking bored at plain/unappealing meal, scrolling phone while eating, uninspired expression.', promptId_lang: 'Orang menatap makanan biasa dengan ekspresi bosan, main hp sambil makan, kurang bersemangat.', visualStyle: 'Relatable everyday dining', lighting: 'Flat neutral light', mood: 'Boredom, dissatisfaction' },
      { sceneId: 'agitate', promptId: 'food_agitate', promptEn: 'Failed cooking attempt — burnt food, messy kitchen, wasted ingredients. Frustration and time wasted.', promptId_lang: 'Percobaan masak yang gagal — makanan gosong, dapur berantakan, bahan terbuang. Frustrasi dan waktu terbuang.', visualStyle: 'Kitchen disaster documentary', lighting: 'Unflattering overhead', mood: 'Urgency, wasted effort' },
      { sceneId: 'discovery', promptId: 'food_discovery', promptEn: 'Beautiful food plating revealed — professional restaurant quality, steam rising, perfect presentation. Wow moment.', promptId_lang: 'Sajian makanan indah terungkap — kualitas restoran profesional, uap mengepul, presentasi sempurna. Momen wow.', visualStyle: 'Professional food photography', lighting: 'Perfect food lighting', mood: 'Wow, delight, hunger' },
      { sceneId: 'interaction', promptId: 'food_interaction', promptEn: 'Chef/person preparing the food — skilled hands, beautiful ingredients, cooking process. Authentic behind-the-scenes.', promptId_lang: 'Chef/orang mempersiapkan makanan — tangan terampil, bahan-bahan indah, proses memasak. Autentik di balik layar.', visualStyle: 'Kitchen process documentary', lighting: 'Warm kitchen light', mood: 'Craft, desire, engagement' },
      { sceneId: 'result', promptId: 'food_result', promptEn: 'Happy family/friends eating together, big smiles, thumbs up. Beautiful table setting, joy and satisfaction.', promptId_lang: 'Keluarga/teman makan bersama bahagia, senyum lebar, jempol atas. Meja makan indah, sukacita dan kepuasan.', visualStyle: 'Joyful lifestyle dining', lighting: 'Warm golden lifestyle', mood: 'Joy, satisfaction, togetherness' },
      { sceneId: 'cta', promptId: 'food_cta', promptEn: 'Hero food shot centered, price + menu visible, "Pesan Sekarang" or "Kunjungi Kami". Brand restaurant colors.', promptId_lang: 'Foto makanan hero di tengah, harga + menu terlihat, "Pesan Sekarang" atau "Kunjungi Kami". Warna brand restoran.', visualStyle: 'Restaurant end card', lighting: 'Appetizing product light', mood: 'Decision, appetite, action' },
    ],
  },

  fashion: {
    id: 'fashion',
    name: 'Fashion & Lifestyle',
    nameId: 'Fashion & Gaya Hidup',
    description: 'Pakaian, tas, sepatu, aksesori, fashion online',
    colorPalette: ['#1A1A2E', '#16213E', '#0F3460', '#E94560', '#FFFFFF'],
    scenes: [
      { sceneId: 'hook', promptId: 'fashion_hook', promptEn: 'Fashion model walking confidently toward camera, dramatic outfit reveal, high fashion lighting. Power pose.', promptId_lang: 'Model fashion berjalan percaya diri ke arah kamera, reveal outfit dramatis, pencahayaan high fashion. Pose power.', visualStyle: 'High fashion editorial', lighting: 'Dramatic high contrast', mood: 'Confidence, intrigue, power' },
      { sceneId: 'problem', promptId: 'fashion_problem', promptEn: 'Person standing in front of full wardrobe, overwhelmed, "nothing to wear" expression. Clothes everywhere.', promptId_lang: 'Orang berdiri di depan lemari penuh, kewalahan, ekspresi "tidak ada yang cocok dipakai". Baju berserakan.', visualStyle: 'Relatable wardrobe chaos', lighting: 'Flat bedroom light', mood: 'Overwhelm, fashion crisis' },
      { sceneId: 'agitate', promptId: 'fashion_agitate', promptEn: 'Late for event, outfit not working, rushing, stress. Clock visible. Outfit embarrassment scenario.', promptId_lang: 'Telat ke acara, outfit tidak cocok, terburu-buru, stres. Jam terlihat. Skenario memalukan karena penampilan.', visualStyle: 'Stress lifestyle documentary', lighting: 'Harsh rushed lighting', mood: 'Urgency, style anxiety' },
      { sceneId: 'discovery', promptId: 'fashion_discovery', promptEn: 'Beautiful fashion item revealed from box — unboxing moment, tissue paper, product in elegant packaging.', promptId_lang: 'Item fashion indah terungkap dari kotak — momen unboxing, kertas tissue, produk dalam kemasan elegan.', visualStyle: 'Luxury unboxing', lighting: 'Soft elegant light', mood: 'Excitement, hope, desire' },
      { sceneId: 'interaction', promptId: 'fashion_interaction', promptEn: 'Person trying on outfit, looking in mirror, smiling with approval. Trying different looks, confident.', promptId_lang: 'Orang mencoba outfit, berkaca, tersenyum puas. Mencoba berbagai tampilan, percaya diri.', visualStyle: 'Authentic try-on lifestyle', lighting: 'Natural mirror light', mood: 'Desire, self-discovery' },
      { sceneId: 'result', promptId: 'fashion_result', promptEn: 'Complete polished look — person walking confidently in public, compliments, heads turning. Style transformation complete.', promptId_lang: 'Tampilan lengkap dan rapi — orang berjalan percaya diri di tempat umum, mendapat pujian, semua melirik. Transformasi style selesai.', visualStyle: 'Aspirational lifestyle', lighting: 'Golden hour outdoor', mood: 'Confidence, aspiration, transformation' },
      { sceneId: 'cta', promptId: 'fashion_cta', promptEn: 'Fashion item on minimal background, price, sizes available, "Shop Now" / "Order via DM". Clean brand aesthetic.', promptId_lang: 'Item fashion di background minimal, harga, ukuran tersedia, "Beli Sekarang" / "Order via DM". Estetika brand bersih.', visualStyle: 'Minimal fashion end card', lighting: 'Clean studio', mood: 'Action, style, decision' },
    ],
  },

  tech: {
    id: 'tech',
    name: 'Tech & Gadgets',
    nameId: 'Teknologi & Gadget',
    description: 'Smartphone, laptop, aksesori tech, software, gadget',
    colorPalette: ['#0A0A0A', '#1E1E2E', '#00B4D8', '#48CAE4', '#FFFFFF'],
    scenes: [
      { sceneId: 'hook', promptId: 'tech_hook', promptEn: 'Sleek device powering on, LED glow, unboxing reveal. Dark dramatic background, blue-white tech lighting.', promptId_lang: 'Perangkat ramping menyala, cahaya LED, reveal unboxing. Background gelap dramatis, pencahayaan tech biru-putih.', visualStyle: 'Premium tech product shot', lighting: 'Dark background with LED accent', mood: 'Intrigue, innovation, power' },
      { sceneId: 'problem', promptId: 'tech_problem', promptEn: 'Person frustrated with slow/old device, spinning loading icon, missed deadline. Stress and wasted time.', promptId_lang: 'Orang frustrasi dengan perangkat lambat/lama, ikon loading berputar, deadline terlewat. Stres dan waktu terbuang.', visualStyle: 'Tech frustration documentary', lighting: 'Screen glow only, frustrated', mood: 'Frustration, time waste' },
      { sceneId: 'agitate', promptId: 'tech_agitate', promptEn: 'Device crash at critical moment — presentation about to start, data loss, battery dying. Critical failure close-up.', promptId_lang: 'Perangkat crash di momen kritis — presentasi akan dimulai, data hilang, baterai habis. Close-up kegagalan kritis.', visualStyle: 'Critical tech failure', lighting: 'Red/warning light accent', mood: 'Urgency, critical failure anxiety' },
      { sceneId: 'discovery', promptId: 'tech_discovery', promptEn: 'New device reveal in stylish box, unboxing, product glowing in hands. Premium packaging, anticipation.', promptId_lang: 'Reveal perangkat baru dalam kotak stylish, unboxing, produk bercahaya di tangan. Kemasan premium, antisipasi.', visualStyle: 'Premium tech unboxing', lighting: 'Soft premium backlight', mood: 'Excitement, innovation, hope' },
      { sceneId: 'interaction', promptId: 'tech_interaction', promptEn: 'Person using device effortlessly — fast typing, smooth scrolling, feature demo. Speed and responsiveness visible.', promptId_lang: 'Orang menggunakan perangkat dengan mudah — ketik cepat, scroll mulus, demo fitur. Kecepatan dan responsivitas terlihat.', visualStyle: 'Tech usage lifestyle', lighting: 'Clean office/home setup', mood: 'Capability, desire, efficiency' },
      { sceneId: 'result', promptId: 'tech_result', promptEn: 'Person finishing work efficiently, relaxed and happy. Productivity achieved, project done, satisfied smile.', promptId_lang: 'Orang menyelesaikan pekerjaan efisien, santai dan bahagia. Produktivitas tercapai, proyek selesai, senyum puas.', visualStyle: 'Productivity success lifestyle', lighting: 'Bright productive environment', mood: 'Success, efficiency, satisfaction' },
      { sceneId: 'cta', promptId: 'tech_cta', promptEn: 'Device centered on dark background, specs visible, price, "Beli Sekarang" / "Dapatkan Sekarang". Tech brand colors.', promptId_lang: 'Perangkat di tengah background gelap, spesifikasi terlihat, harga, "Beli Sekarang" / "Dapatkan Sekarang". Warna brand tech.', visualStyle: 'Dark tech end card', lighting: 'Dark background LED accent', mood: 'Action, innovation, decision' },
    ],
  },

  fitness: {
    id: 'fitness',
    name: 'Fitness & Health',
    nameId: 'Kebugaran & Kesehatan',
    description: 'Gym, suplemen, alat olahraga, program diet, kesehatan',
    colorPalette: ['#1A1A1A', '#FF4500', '#FF6B35', '#2ECC71', '#FFFFFF'],
    scenes: [
      { sceneId: 'hook', promptId: 'fitness_hook', promptEn: 'Impressive workout clip — athlete performing feat, body transformation tease, dynamic motion. High energy.', promptId_lang: 'Klip olahraga mengesankan — atlet melakukan gerakan, tease transformasi tubuh, gerakan dinamis. Energi tinggi.', visualStyle: 'High energy sports photography', lighting: 'Dramatic gym lighting', mood: 'Inspiration, aspiration, energy' },
      { sceneId: 'problem', promptId: 'fitness_problem', promptEn: 'Out of breath climbing stairs, clothes not fitting, tired face. Sedentary lifestyle visible. Low energy relatable.', promptId_lang: 'Ngos-ngosan naik tangga, baju tidak muat, wajah lelah. Gaya hidup sedentari terlihat. Energi rendah yang relatable.', visualStyle: 'Relatable health struggle', lighting: 'Flat natural light', mood: 'Struggle, recognition, motivation needed' },
      { sceneId: 'agitate', promptId: 'fitness_agitate', promptEn: 'Mirror showing unflattering angle, scale with high number, doctor warning. Consequences of unhealthy lifestyle.', promptId_lang: 'Cermin menunjukkan sudut yang tidak menyenangkan, timbangan angka tinggi, peringatan dokter. Konsekuensi gaya hidup tidak sehat.', visualStyle: 'Reality check close-up', lighting: 'Harsh confrontational light', mood: 'Urgency, health anxiety, wake-up call' },
      { sceneId: 'discovery', promptId: 'fitness_discovery', promptEn: 'Fitness product/supplement reveal — sleek packaging, natural ingredients, professional presentation.', promptId_lang: 'Reveal produk fitness/suplemen — kemasan ramping, bahan alami, presentasi profesional.', visualStyle: 'Health product hero shot', lighting: 'Clean bright product light', mood: 'Hope, solution found, energy' },
      { sceneId: 'interaction', promptId: 'fitness_interaction', promptEn: 'Person working out using product — exercise demo, supplement usage, transformation in progress. Authentic movement.', promptId_lang: 'Orang berolahraga menggunakan produk — demo latihan, penggunaan suplemen, transformasi sedang berlangsung. Gerakan autentik.', visualStyle: 'Authentic fitness documentary', lighting: 'Natural gym/outdoor light', mood: 'Action, capability, desire' },
      { sceneId: 'result', promptId: 'fitness_result', promptEn: 'Body transformation reveal — before/after implied, confident pose, energy visible, healthy glow. Achievement unlocked.', promptId_lang: 'Reveal transformasi tubuh — sebelum/sesudah tersirat, pose percaya diri, energi terlihat, kilau sehat. Pencapaian terbuka.', visualStyle: 'Transformation aspirational', lighting: 'Golden ratio hero shot', mood: 'Transformation, confidence, achievement' },
      { sceneId: 'cta', promptId: 'fitness_cta', promptEn: 'Product centered, results mentioned, price/offer visible. "Mulai Sekarang" / "Coba 30 Hari". Energy brand colors.', promptId_lang: 'Produk di tengah, hasil disebutkan, harga/penawaran terlihat. "Mulai Sekarang" / "Coba 30 Hari". Warna brand energi.', visualStyle: 'Motivational end card', lighting: 'Energetic bright', mood: 'Action, motivation, decision' },
    ],
  },

  general: {
    id: 'general',
    name: 'General',
    nameId: 'Umum',
    description: 'Template umum untuk semua jenis produk',
    colorPalette: ['#FFFFFF', '#F5F5F5', '#333333', '#007AFF', '#FF9500'],
    scenes: [
      { sceneId: 'hook', promptId: 'general_hook', promptEn: 'Intriguing product close-up from unexpected angle. High contrast, clean background, attention-grabbing composition.', promptId_lang: 'Close-up produk menarik dari sudut yang tidak terduga. Kontras tinggi, background bersih, komposisi eye-catching.', visualStyle: 'Clean product macro', lighting: 'High contrast studio', mood: 'Curiosity, intrigue' },
      { sceneId: 'problem', promptId: 'general_problem', promptEn: 'Person dealing with everyday frustration related to the product category. Relatable struggle, desaturated.', promptId_lang: 'Orang menghadapi frustrasi sehari-hari terkait kategori produk. Perjuangan yang relatable, warna desaturasi.', visualStyle: 'Everyday documentary', lighting: 'Natural desaturated', mood: 'Recognition, frustration' },
      { sceneId: 'agitate', promptId: 'general_agitate', promptEn: 'Problem intensified — consequences visible, urgency implied. Close-up on pain point. Dramatic lighting.', promptId_lang: 'Masalah dipertegas — konsekuensi terlihat, urgensi tersirat. Close-up pada pain point. Pencahayaan dramatis.', visualStyle: 'Problem intensification', lighting: 'Dramatic shadow', mood: 'Urgency, need for solution' },
      { sceneId: 'discovery', promptId: 'general_discovery', promptEn: 'Product revealed as solution — clean presentation, hero shot, bright hopeful lighting. Product is the answer.', promptId_lang: 'Produk terungkap sebagai solusi — presentasi bersih, hero shot, pencahayaan terang penuh harapan. Produk adalah jawabannya.', visualStyle: 'Product hero revelation', lighting: 'Bright clean hopeful', mood: 'Relief, hope, discovery' },
      { sceneId: 'interaction', promptId: 'general_interaction', promptEn: 'Person using product in natural setting. Hands-on usage, authentic moment, product integrated into life.', promptId_lang: 'Orang menggunakan produk dalam setting natural. Penggunaan hands-on, momen autentik, produk terintegrasi dalam kehidupan.', visualStyle: 'Authentic usage lifestyle', lighting: 'Natural warm', mood: 'Desire, engagement, natural fit' },
      { sceneId: 'result', promptId: 'general_result', promptEn: 'Happy person with solved problem. Before state vs after implied. Satisfied, confident, life improved.', promptId_lang: 'Orang bahagia dengan masalah yang teratasi. Kondisi sebelum vs sesudah tersirat. Puas, percaya diri, hidup membaik.', visualStyle: 'Aspirational after state', lighting: 'Bright vibrant', mood: 'Satisfaction, transformation, aspiration' },
      { sceneId: 'cta', promptId: 'general_cta', promptEn: 'Product on clean background, price visible, clear call to action text. Brand colors. Professional end card.', promptId_lang: 'Produk di background bersih, harga terlihat, teks ajakan bertindak yang jelas. Warna brand. End card profesional.', visualStyle: 'Professional end card', lighting: 'Clean even', mood: 'Action, confidence, decision' },
    ],
  },
};

// ── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Get scene durations for a given preset
 */
export function getSceneDurations(preset: DurationPreset): Partial<Record<SceneId, number>> {
  return DURATION_PRESETS[preset].sceneDurations;
}

/**
 * Get scenes included in a preset
 */
export function getScenesForPreset(preset: DurationPreset): SceneConfig[] {
  const presetConfig = DURATION_PRESETS[preset];
  return presetConfig.scenesIncluded.map((id) => HPAS_SCENES[id]);
}

/**
 * Get industry template
 */
export function getIndustryTemplate(industry: IndustryId): IndustryTemplate {
  return INDUSTRY_TEMPLATES[industry];
}

/**
 * Get scene prompt for a specific industry and scene
 */
export function getScenePrompt(industry: IndustryId, sceneId: SceneId): IndustryScenePrompt | undefined {
  const template = INDUSTRY_TEMPLATES[industry];
  return template.scenes.find((s) => s.sceneId === sceneId);
}

/**
 * Build a scene prompt combining industry template with product description
 */
export function buildScenePrompt(
  sceneId: SceneId,
  industry: IndustryId,
  productDescription: string,
  language: 'en' | 'id' = 'id'
): string {
  const scenePrompt = getScenePrompt(industry, sceneId);
  const sceneConfig = HPAS_SCENES[sceneId];

  if (!scenePrompt) {
    // Fallback to general
    const generalPrompt = getScenePrompt('general', sceneId);
    const basePrompt = language === 'id' ? generalPrompt?.promptId_lang : generalPrompt?.promptEn;
    return `${basePrompt || sceneConfig.description}. Product: ${productDescription}`;
  }

  const basePrompt = language === 'id' ? scenePrompt.promptId_lang : scenePrompt.promptEn;
  return `${basePrompt}. Produk: ${productDescription}`;
}

/**
 * Generate all scene prompts for a video
 */
export function generateVideoScenePrompts(
  industry: IndustryId,
  productDescription: string,
  preset: DurationPreset = 'standard',
  language: 'en' | 'id' = 'id'
): Array<{ sceneId: SceneId; scene: SceneConfig; prompt: string; durationSeconds: number }> {
  const presetConfig = DURATION_PRESETS[preset];

  return presetConfig.scenesIncluded.map((sceneId) => ({
    sceneId,
    scene: HPAS_SCENES[sceneId],
    prompt: buildScenePrompt(sceneId, industry, productDescription, language),
    durationSeconds: presetConfig.sceneDurations[sceneId] || 4,
  }));
}

/**
 * Detect industry from product description
 */
export function detectIndustry(productDescription: string): IndustryId {
  const desc = productDescription.toLowerCase();

  if (/skin|cream|serum|lotion|wajah|jerawat|moisturizer|makeup|lipstik|kosmetik|kecantikan/.test(desc)) return 'beauty';
  if (/makanan|minuman|restoran|cafe|kafe|food|kuliner|catering|snack|kue|masakan|makan/.test(desc)) return 'food';
  if (/baju|kaos|dress|fashion|pakaian|celana|jaket|tas|sepatu|aksesori|outfit|clothing/.test(desc)) return 'fashion';
  if (/hp|handphone|laptop|gadget|tech|teknologi|software|apps|charging|earphone|speaker/.test(desc)) return 'tech';
  if (/gym|olahraga|fitness|suplemen|diet|protein|workout|sport|sehat|kesehatan/.test(desc)) return 'fitness';

  return 'general';
}

/**
 * AI-powered storyboard generator using Gemini.
 * Falls back to static template generation if Gemini is unavailable.
 */
export async function generateScenePromptsWithAI(
  productDescription: string,
  preset: DurationPreset = 'standard',
  language: 'en' | 'id' = 'id'
): Promise<Array<{ sceneId: SceneId; scene: SceneConfig; prompt: string; durationSeconds: number }>> {
  const presetConfig = DURATION_PRESETS[preset];
  const scenes = presetConfig.scenesIncluded;
  const apiKey = getConfig().GEMINI_API_KEY;
  if (!apiKey) throw new ConfigError('GEMINI_API_KEY');

  const sceneDescriptions = scenes.map(id => `${id}: ${HPAS_SCENES[id].description}`).join('\n');

  const prompt = language === 'id'
    ? `Kamu adalah sutradara iklan video viral. Buat storyboard untuk video iklan produk berikut:\n\nPRODUK: ${productDescription}\n\nBuat prompt visual yang spesifik dan menarik untuk setiap scene berikut:\n${sceneDescriptions}\n\nFormat output (JSON array, satu objek per scene):\n[{"sceneId":"hook","prompt":"<visual prompt dalam bahasa Indonesia>"},...]`
    : `You are a viral video ad director. Create a storyboard for this product:\n\nPRODUCT: ${productDescription}\n\nCreate specific, compelling visual prompts for each scene:\n${sceneDescriptions}\n\nOutput format (JSON array):\n[{"sceneId":"hook","prompt":"<visual prompt>"},...]`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1500 },
    },
    { timeout: 30000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract first valid JSON array from response (robust against multiple arrays in output)
  let aiScenes: Array<{ sceneId: SceneId; prompt: string }> = [];
  const arrayMatches = [...text.matchAll(/\[[\s\S]*?\]/g)];
  let parsed = false;
  for (const m of arrayMatches) {
    try {
      const candidate = JSON.parse(m[0]);
      if (Array.isArray(candidate) && candidate.length > 0) {
        aiScenes = candidate;
        parsed = true;
        break;
      }
    } catch {
      // try next match
    }
  }
  // Fallback: try the whole greedy match if non-greedy found nothing
  if (!parsed) {
    const greedyMatch = text.match(/\[[\s\S]*\]/);
    if (greedyMatch) {
      try {
        const candidate = JSON.parse(greedyMatch[0]);
        if (Array.isArray(candidate)) aiScenes = candidate;
      } catch {
        // ignore
      }
    }
  }
  if (aiScenes.length === 0) throw new ProviderError("gemini-storyboard", "no valid JSON array in response");

  // Validate match rate — warn if Gemini returned wrong sceneId keys
  const matchedCount = scenes.filter(sceneId => aiScenes.some(s => s.sceneId === sceneId)).length;
  if (matchedCount < Math.ceil(scenes.length / 2)) {
    logger.warn(`[hpas-engine] Gemini storyboard: only ${matchedCount}/${scenes.length} scene IDs matched. ` +
      `Expected: ${scenes.join(', ')}. Got: ${aiScenes.map(s => s.sceneId).join(', ')}. Falling back to static for unmatched.`);
  }

  return scenes.map(sceneId => {
    const aiScene = aiScenes.find(s => s.sceneId === sceneId);
    return {
      sceneId,
      scene: HPAS_SCENES[sceneId],
      prompt: aiScene?.prompt || buildScenePrompt(sceneId, detectIndustry(productDescription), productDescription, language),
      durationSeconds: presetConfig.sceneDurations[sceneId] || 4,
    };
  });
}

// ── Exports Summary ───────────────────────────────────────────────────────────

export default {
  scenes: HPAS_SCENES,
  presets: DURATION_PRESETS,
  industries: INDUSTRY_TEMPLATES,
  helpers: {
    getSceneDurations,
    getScenesForPreset,
    getIndustryTemplate,
    getScenePrompt,
    buildScenePrompt,
    generateVideoScenePrompts,
    generateScenePromptsWithAI,
    detectIndustry,
  },
};
