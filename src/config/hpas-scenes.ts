// HPAS 7-scene definitions (split from hpas-engine.ts — re-exported there).

import type { SceneConfig, SceneId } from "./hpas-types";

// ── 7 Scene Definitions ──────────────────────────────────────────────────────

export const HPAS_SCENES: Record<SceneId, SceneConfig> = {
  hook: {
    id: "hook",
    name: "Hook",
    nameId: "Pancing Perhatian",
    order: 1,
    durationRange: { min: 2, max: 8 },
    emotionTarget: "curiosity / shock / intrigue",
    description: "Stop the scroll. Must grab attention within 1.5 seconds.",
    cinematographyTips: [
      "Extreme close-up of product texture or key detail",
      "High contrast lighting — dark background, product lit dramatically",
      "Pattern interrupt — unexpected angle or motion",
      "First frame must be visually striking",
      "Avoid slow pans — cut to the point immediately",
    ],
    aiPromptHints: [
      "dramatic close-up shot",
      "high contrast lighting",
      "eye-catching composition",
      "product as hero",
      "striking visual impact",
    ],
  },

  problem: {
    id: "problem",
    name: "Problem",
    nameId: "Masalah",
    order: 2,
    durationRange: { min: 2, max: 8 },
    emotionTarget: "recognition / frustration / empathy",
    description: "Make viewer relate. Show their everyday problem.",
    cinematographyTips: [
      "Real-life setting — kitchen, bathroom, office, outdoors",
      "Show a person looking frustrated or stuck",
      "Warm desaturated tones to convey problem mood",
      "Medium shot — see the person and their environment",
      '"Oh that\'s me" moment — make it universal',
    ],
    aiPromptHints: [
      "frustrated person",
      "relatable everyday situation",
      "warm desaturated colors",
      "medium shot real environment",
      "problem visualization",
    ],
  },

  agitate: {
    id: "agitate",
    name: "Agitate",
    nameId: "Pertegas Masalah",
    order: 3,
    durationRange: { min: 2, max: 8 },
    emotionTarget: 'urgency / anxiety / "I need to fix this NOW"',
    description:
      "Make the problem feel URGENT. Show consequences of not acting.",
    cinematographyTips: [
      "Extreme close-up on the problem area",
      "Darker, more dramatic lighting",
      "Slow zoom in for tension",
      "Before state — worst version of the problem",
      "Red/dark color grading to signal urgency",
    ],
    aiPromptHints: [
      "extreme close-up problem area",
      "dramatic dark lighting",
      "tense atmosphere",
      "urgency visual cues",
      "worst-case scenario visualization",
    ],
  },

  discovery: {
    id: "discovery",
    name: "Discovery",
    nameId: "Temukan Solusi",
    order: 4,
    durationRange: { min: 2, max: 10 },
    emotionTarget: 'hope / relief / "this is the answer"',
    description:
      "Product reveal as the solution. Transition from dark to light.",
    cinematographyTips: [
      "Lighting shift: dark → bright (visual metaphor)",
      "Product hero shot — clean background, elegant presentation",
      "Hand reaching for/unveiling the product",
      "Unboxing or reveal moment",
      "Golden hour or studio lighting for product",
    ],
    aiPromptHints: [
      "product hero shot",
      "bright clean background",
      "elegant product reveal",
      "hope and relief atmosphere",
      "unboxing or discovery moment",
    ],
  },

  interaction: {
    id: "interaction",
    name: "Interaction",
    nameId: "Penggunaan Produk",
    order: 5,
    durationRange: { min: 2, max: 10 },
    emotionTarget: 'desire / engagement / "I want that"',
    description: "Show product BEING USED. Action shot, not static studio.",
    cinematographyTips: [
      "Real person using the product in natural setting",
      "Show product in action — applying, eating, wearing, using",
      "Soft natural lighting or warm artificial lighting",
      "Close-up of hands or face interacting with product",
      'Implicit social proof: "other people use this"',
    ],
    aiPromptHints: [
      "person using product",
      "natural usage environment",
      "hands-on interaction",
      "authentic lifestyle shot",
      "product in motion",
    ],
  },

  result: {
    id: "result",
    name: "Result",
    nameId: "Hasil Nyata",
    order: 6,
    durationRange: { min: 2, max: 8 },
    emotionTarget: "satisfaction / aspiration / transformation",
    description: 'Show the TRANSFORMATION. After state. "This could be you."',
    cinematographyTips: [
      "Before-after implicit — bright, glowing, transformed",
      "Happy, confident person or beautiful result",
      "High vibrancy, saturation boost",
      "Wide smile, confidence pose, or product result close-up",
      "Aspirational feel — lifestyle upgrade",
    ],
    aiPromptHints: [
      "transformation result",
      "happy satisfied person",
      "bright vibrant colors",
      "aspirational lifestyle",
      "after state beauty",
    ],
  },

  cta: {
    id: "cta",
    name: "CTA",
    nameId: "Ajakan Bertindak",
    order: 7,
    durationRange: { min: 1.5, max: 8 },
    emotionTarget: 'confidence / decision / "I\'m doing this now"',
    description:
      "Drive ACTION. Product centered, price visible, clear instruction.",
    cinematographyTips: [
      "Clean minimal background — product takes center stage",
      "Price tag or offer visible",
      'Text overlay: "Order Sekarang", "Link di Bio", "DM Kami"',
      "Brand colors prominent",
      "End card format — static or slow zoom out",
    ],
    aiPromptHints: [
      "product centered clean background",
      "call to action overlay text",
      "brand colors prominent",
      "price tag visible",
      "end card format",
    ],
  },
};
