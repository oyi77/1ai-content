/**
 * Trends & storyboard — viral trend data and storyboard template generation.
 */
import { logger } from "@/utils/logger";
import type { ViralTrend, Storyboard } from "./types";

const TREND_DATA: Record<string, ViralTrend> = {
  viral: {
    niche: "viral",
    patterns: [
      "Quick cuts (0.5-1s per scene)",
      "Beat-matching edits",
      "ASMR audio layer",
      "Text-to-speech overlay (Female voice)",
      "Hook in first 3 seconds",
      "Surprise ending",
    ],
    hashtags: ["#fyp", "#viral", "#trending", "#foryou", "#viral2026"],
    audioTypes: [
      "Trending sounds",
      "ASMR",
      "Text-to-speech",
      "Background music",
    ],
    editStyles: [
      "Fast-paced",
      "Smooth transitions",
      "Dynamic zoom",
      "Text overlays",
    ],
    topPerformers: ["@user1", "@user2", "@user3"],
  },
  fnb: {
    niche: "fnb",
    patterns: [
      "Food porn shots",
      "Steam/smoke effects",
      "Close-up texture shots",
      "Before/after reveal",
      "ASMR eating sounds",
      "Recipe steps",
    ],
    hashtags: ["#food", "#foodporn", "#yummy", "#delicious", "#foodie"],
    audioTypes: ["ASMR", "Cooking sounds", "Upbeat music", "Voice-over"],
    editStyles: ["Slow motion", "Top-down shots", "Close-ups", "Time-lapse"],
    topPerformers: ["@foodie1", "@chef2", "@restaurant3"],
  },
  realestate: {
    niche: "realestate",
    patterns: [
      "Room tours",
      "Drone shots",
      "Before/after renovation",
      "Luxury amenities showcase",
      "Walkthrough style",
      "Ambient music",
    ],
    hashtags: ["#realestate", "#property", "#home", "#luxury", "#interior"],
    audioTypes: ["Ambient music", "Voice-over", "Nature sounds", "Classical"],
    editStyles: ["Smooth pans", "Wide angles", "Steady cam", "Professional"],
    topPerformers: ["@realtor1", "@property2", "@luxury3"],
  },
  ecom: {
    niche: "ecom",
    patterns: [
      "Product unboxing",
      "Feature highlights",
      "User testimonials",
      "Before/after comparison",
      "Discount urgency",
      "Call-to-action",
    ],
    hashtags: ["#product", "#shopping", "#deal", "#sale", "#musthave"],
    audioTypes: ["Upbeat music", "Voice-over", "ASMR", "Trending sounds"],
    editStyles: [
      "Product focus",
      "Lifestyle shots",
      "Quick cuts",
      "Text overlays",
    ],
    topPerformers: ["@seller1", "@brand2", "@shop3"],
  },
};

const STORYBOARD_TEMPLATES: Record<string, Storyboard> = {
  product: {
    scenes: [
      {
        time: "0-3s",
        description: "Hook: Product reveal with dramatic lighting",
        text: "Wait for it...",
      },
      {
        time: "3-8s",
        description: "Feature 1: Close-up of key feature",
        text: "Feature highlight",
      },
      {
        time: "8-13s",
        description: "Feature 2: Different angle/use case",
        text: "Versatile design",
      },
      {
        time: "13-18s",
        description: "Lifestyle: Product in real-world setting",
        text: "Perfect for...",
      },
      {
        time: "18-25s",
        description: "Social proof: Testimonials/reviews",
        text: "5-star reviews",
      },
      {
        time: "25-30s",
        description: "CTA: Price + urgency + link",
        text: "Limited offer! Link in bio",
      },
    ],
    caption:
      "Check out this amazing product! Limited time offer. Link in bio! #product #musthave #viral",
  },
  fnb: {
    scenes: [
      {
        time: "0-3s",
        description: "Hook: Appetizing food shot",
        text: "This is NOT what you think...",
      },
      {
        time: "3-8s",
        description: "Preparation: Cooking process",
        text: "Made fresh daily",
      },
      {
        time: "8-13s",
        description: "Steam/close-up: Texture and details",
        text: "Sizzling hot!",
      },
      {
        time: "13-18s",
        description: "Plating: Final presentation",
        text: "Restaurant quality",
      },
      {
        time: "18-25s",
        description: "Eating: Satisfaction/ASMR",
        text: "So delicious!",
      },
      {
        time: "25-30s",
        description: "CTA: Location + hours",
        text: "Visit us today!",
      },
    ],
    caption:
      "You HAVE to try this! Best [food] in town! Location in bio #food #foodie #yummy",
  },
};

/**
 * Get viral trends for a niche.
 */
export async function getViralTrends(niche: string): Promise<ViralTrend> {
  logger.info(`Fetching viral trends for: ${niche}`);
  return TREND_DATA[niche] || TREND_DATA.viral;
}

/**
 * Generate storyboard from niche template.
 */
export async function generateStoryboard(
  niche: string,
  _duration: number,
): Promise<Storyboard> {
  return STORYBOARD_TEMPLATES[niche] || STORYBOARD_TEMPLATES.product;
}
