/**
 * Prompts Command — Data Layer
 *
 * PROMPT_LIBRARY, trending/mystery data, and data access helpers.
 * Extracted from prompts.ts to separate data from command logic.
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";

// ─── PROMPT LIBRARY DATA ────────────────────────────────────────────────────

export const PROMPT_LIBRARY: Record<
  string,
  {
    emoji: string;
    label: string;
    prompts: Array<{
      id: string;
      title: string;
      prompt: string;
      suitable: string;
      successRate: number;
    }>;
  }
> = {
  fnb: {
    emoji: "🍔",
    label: "F&B",
    prompts: [
      {
        id: "fnb_1",
        title: "Steam & Zoom Drama",
        prompt: "Cinematic food shot dengan steam rising effect dramatis, slow zoom in dari medium shot ke close-up revealing tekstur dan detail makanan, warm golden hour lighting dengan soft shadows, shallow depth of field untuk fokus pada hidangan utama, background blur bokeh lembut, color grading warm appetizing tones, professional food photography aesthetic dengan visible steam dan condensation",
        suitable: "Bakso, soto, mie ayam, makanan hangat, comfort food",
        successRate: 94,
      },
      {
        id: "fnb_2",
        title: "Fresh Splash Impact",
        prompt: "High-speed capture minuman dengan dramatic splash effect dan water droplets frozen in motion, bright colorful lighting dengan rim light pada gelas, ice cubes floating dan spinning dalam slow motion, condensation droplets visible pada permukaan glass, vibrant color palette, commercial beverage photography dengan clean background, refreshing dan thirst-quenching visual",
        suitable: "Kopi susu, bubble tea, jus, smoothie, minuman segar",
        successRate: 92,
      },
      {
        id: "fnb_3",
        title: "Cooking Assembly Story",
        prompt: "Step-by-step cooking montage dengan hands adding ingredients in artistic sequence, pan sizzle close-up showing oil bubbles dan steam, ingredients falling into pan dalam slow motion, final dish reveal dengan dramatic lighting change, overhead angle untuk plating shot, warm kitchen atmosphere, ASMR-style visual treatment dengan satisfying food preparation moments",
        suitable: "Recipe content, cooking tutorial, restaurant behind-the-scenes",
        successRate: 89,
      },
      {
        id: "fnb_4",
        title: "Bite Satisfaction",
        prompt: "Extreme close-up first bite moment dengan cross-section reveal showing layers dan textures, cheese pull atau sauce drip effect, crunch visual dengan crumbs falling, satisfied expression reaction shot, macro lens detail pada makanan, appetizing color grading, mouth-watering food photography yang trigger craving, social media optimized composition",
        suitable: "Burger, sandwich, pastry, pizza, comfort food",
        successRate: 91,
      },
      {
        id: "fnb_5",
        title: "Ambient Cafe Vibe",
        prompt: "Cozy cafe atmosphere dengan latte art being poured dalam slow motion, blurred customers background menciptakan depth, natural window lighting dengan golden hour warmth, morning lifestyle aesthetic, coffee beans scattered sebagai props, steam rising dari cup, warm dan inviting mood, lifestyle photography untuk coffee shop branding",
        suitable: "Cafe promo, coffee shop branding, brunch spot",
        successRate: 88,
      },
    ],
  },
  fashion: {
    emoji: "👗",
    label: "Fashion",
    prompts: [
      {
        id: "fashion_1",
        title: "Outfit Transition Reveal",
        prompt: "Model snap transition effect dengan outfit changes dari casual ke glam dalam satu gerakan, seamless morph transition antara looks, editorial lighting dengan dramatic shadows, confident pose dan expression, fashion show atmosphere, high-end aesthetic dengan clean background, movement dalam fabric captured beautifully, aspirational lifestyle mood",
        suitable: "Clothing line, outfit of the day, fashion brand launch",
        successRate: 92,
      },
      {
        id: "fashion_2",
        title: "Detail Showcase Flow",
        prompt: "Macro shot fabric texture dengan smooth tracking across clothing surface, button dan stitching details dalam extreme close-up, luxury aesthetic dengan soft lighting, craftsmanship visible dalam setiap detail, premium material showcase, professional product photography untuk e-commerce, elegant composition dengan minimal styling",
        suitable: "Premium fashion, fabric showcase, luxury brand",
        successRate: 88,
      },
      {
        id: "fashion_3",
        title: "Runway Walk Energy",
        prompt: "Model confident walk toward camera dengan dramatic lighting changes, slow-mo moments pada fabric movement, fashion show atmosphere dengan spotlights, powerful stride dan pose, editorial fashion video aesthetic, dynamic camera movement mengikuti model, high-energy dengan sophisticated mood",
        suitable: "Fashion brand, new collection launch, runway show",
        successRate: 90,
      },
      {
        id: "fashion_4",
        title: "Hijab Styling Story",
        prompt: "Elegant hijab styling sequence dengan hands adjusting fabric gracefully, modest fashion aesthetic yang empowering, soft natural lighting, graceful movements, empowering energy dan confidence, beautiful fabric draping, modern muslimah lifestyle, aspirational dan inclusive representation",
        suitable: "Hijab brand, modest fashion, muslimah lifestyle",
        successRate: 93,
      },
      {
        id: "fashion_5",
        title: "Accessory Sparkle",
        prompt: "Close-up jewelry dengan light reflection sparkle dan rainbow prisms, 360 rotation showing all angles, luxury box opening moment dengan anticipation, premium feel dengan velvet background, macro detail pada craftsmanship, elegant hand gestures, aspirational luxury lifestyle, Instagram-worthy composition",
        suitable: "Accessories, jewelry, bags, watches",
        successRate: 91,
      },
    ],
  },
  tech: {
    emoji: "📱",
    label: "Tech",
    prompts: [
      {
        id: "tech_1",
        title: "Unboxing Premium",
        prompt: "Sleek unboxing sequence dengan hands lifting lid slowly revealing product, dramatic lighting change saat product terlihat, tech reviewer aesthetic dengan clean workspace, premium packaging details visible, product reveal moment dengan anticipation, modern minimalist background, cinematic slow motion pada opening moment",
        suitable: "Gadget, smartphone, electronics, premium tech",
        successRate: 91,
      },
      {
        id: "tech_2",
        title: "Feature Highlight Demo",
        prompt: "Product in action dengan screen display changing menunjukkan features, feature demonstration cuts yang smooth, UI animation close-ups pada interface, hands interacting dengan device, professional product demo aesthetic, clean lighting, tech-focused composition, modern dan sleek presentation",
        suitable: "App, software, device demo, SaaS product",
        successRate: 89,
      },
      {
        id: "tech_3",
        title: "Gaming Setup Vibe",
        prompt: "RGB lighting ambient glow menciptakan mood, gaming gear lineup dengan dramatic angles, keyboard typing visual dengan satisfying clicks, esports energy dan excitement, neon accents dan cyberpunk aesthetic, setup tour dengan smooth camera movement, immersive gaming atmosphere",
        suitable: "Gaming peripherals, PC setup, esports brand",
        successRate: 90,
      },
      {
        id: "tech_4",
        title: "Minimal Showcase",
        prompt: "Clean white/black background dengan product floating dalam subtle rotation, Apple-style minimalist aesthetic, perfect lighting menciptakan depth dan dimension, premium product photography, elegant shadows, sophisticated composition, luxury tech brand visual, studio-quality presentation",
        suitable: "Premium gadget, earphones, wearables, luxury tech",
        successRate: 92,
      },
      {
        id: "tech_5",
        title: "Comparison Split",
        prompt: "Two products side by side dengan split screen comparison, before-after upgrade effect yang dramatic, feature callouts dan highlights, visual proof of improvement, comparison content yang engaging, clear differentiation antara products, persuasive visual storytelling",
        suitable: "Upgrade promo, comparison content, product launch",
        successRate: 87,
      },
    ],
  },
  health: {
    emoji: "💪",
    label: "Health",
    prompts: [
      {
        id: "health_1",
        title: "Before-After Transformation",
        prompt: "Split screen transformation dengan left side before dan right side after results, smooth morph transition showing progress, inspiring journey visual, dramatic improvement visible, powerful stride dan pose, motivational energy, clean aesthetic dengan professional lighting, credibility-building visual proof, transformation story yang compelling",
        suitable: "Skincare, fitness, supplement, weight loss",
        successRate: 93,
      },
      {
        id: "health_2",
        title: "Product Routine Story",
        prompt: "Morning/evening routine sequence dengan product application demonstration step-by-step, self-care pampering vibe yang relaxing, aesthetic bathroom/skincare setup, gentle hands applying product, glowing skin result, wellness lifestyle aesthetic, calming music visual feel, Instagram-worthy routine content",
        suitable: "Skincare routine, wellness products, self-care",
        successRate: 90,
      },
      {
        id: "health_3",
        title: "Ingredient Spotlight",
        prompt: "Natural ingredient close-ups dengan fresh botanical elements, lab-to-nature visual connection showing science meets nature, ingredient sourcing story, clean dan pure aesthetic, macro shots pada natural textures, trust-building visual untuk natural products, educational yet beautiful composition",
        suitable: "Natural supplement, herbal product, organic skincare",
        successRate: 88,
      },
      {
        id: "health_4",
        title: "Active Lifestyle",
        prompt: "Dynamic workout moments dengan sweat drip close-up, athletic movement freeze-frames dalam slow motion, gym/fitness environment, powerful dan energetic mood, motivational visual, sports photography aesthetic, achievement dan progress visual, inspiring active lifestyle content",
        suitable: "Fitness product, gym supplement, sportswear",
        successRate: 89,
      },
      {
        id: "health_5",
        title: "Testimonial Authentic",
        prompt: "Real customer sharing experience dengan conversational to camera style, authentic emotion dan genuine reaction, trust-building visual, before-after context, relatable story, professional yet personal presentation, social proof content, credibility dan authenticity focus",
        suitable: "Any health/beauty product with visible results",
        successRate: 91,
      },
    ],
  },
  travel: {
    emoji: "✈️",
    label: "Travel",
    prompts: [
      {
        id: "travel_1",
        title: "Destination Discovery",
        prompt: "Aerial drone shot revealing landscape secara dramatic, golden hour lighting menciptakan magic, wanderlust atmosphere yang kuat, cinematic travel film aesthetic, breathtaking vista reveal, smooth camera movement over scenery, adventure dan exploration mood, bucket-list destination visual",
        suitable: "Tour package, destination promo, travel agency",
        successRate: 89,
      },
      {
        id: "travel_2",
        title: "Hotel Villa Showcase",
        prompt: "Room reveal sequence dengan door opening to luxury space dramatis, pool dan view shots yang stunning, premium accommodation details, elegant interior design, relaxing atmosphere, hospitality photography aesthetic, aspirational travel lifestyle, five-star experience visual",
        suitable: "Hotel, villa, resort, accommodation",
        successRate: 88,
      },
      {
        id: "travel_3",
        title: "Experience Moment",
        prompt: "Traveler experiencing activity dengan genuine excitement, snorkeling underwater dengan colorful marine life, hiking viewpoint dengan rewarding vista, authentic adventure moments, action camera perspective, immersive travel experience, memory-making content, adventure travel aesthetic",
        suitable: "Activity tour, adventure travel, experience booking",
        successRate: 87,
      },
      {
        id: "travel_4",
        title: "Journey Story",
        prompt: "Travel montage sequence dari airport to destination, key moments compilation yang emotional, memory-making narrative dengan nostalgic feel, journey progression visual, travel diary aesthetic, personal dan relatable content, wanderlust-inducing storytelling",
        suitable: "Travel vlog, full trip recap, travel diary",
        successRate: 86,
      },
      {
        id: "travel_5",
        title: "Local Hidden Gem",
        prompt: "Undiscovered spot reveal dengan dramatic entrance, secret beach/waterfall yang pristine, off-the-beaten-path vibe yang exclusive, local tourism discovery, authentic dan untouched destination, explorer aesthetic, exclusive discovery feeling, hidden paradise visual",
        suitable: "Local tourism, unique destination, eco-tourism",
        successRate: 90,
      },
    ],
  },
  education: {
    emoji: "📚",
    label: "Education",
    prompts: [
      {
        id: "edu_1",
        title: "Learning Transformation",
        prompt: "Student journey dari confused to confident, study montage progression showing growth, aha moment visual dengan lightbulb effect, before-after learning outcome, inspiring educational content, professional academic aesthetic, achievement dan progress visual, success story narrative",
        suitable: "Online course, tutoring, educational platform",
        successRate: 88,
      },
      {
        id: "edu_2",
        title: "Expert Credibility",
        prompt: "Expert instructor dalam professional setting, teaching moment yang engaging, authority building visual, credentials dan experience showcase, trustworthy presentation, professional education aesthetic, knowledge sharing atmosphere, thought leadership content",
        suitable: "Course launch, training promo, masterclass",
        successRate: 90,
      },
      {
        id: "edu_3",
        title: "Course Content Preview",
        prompt: "Curriculum overview visual dengan module-by-module reveal, learning path journey yang clear, value proposition showcase, course structure explanation, engaging content preview, professional course marketing, educational content strategy visual",
        suitable: "Course promo, curriculum showcase, bootcamp",
        successRate: 87,
      },
      {
        id: "edu_4",
        title: "Student Success Story",
        prompt: "Alumni testimonial dengan career progression timeline, achievement showcase yang inspiring, graduation/success moment, real results visual, social proof content, inspiring proof of value, transformation story dari student to professional",
        suitable: "Bootcamp, certification course, career training",
        successRate: 89,
      },
      {
        id: "edu_5",
        title: "Interactive Learning Demo",
        prompt: "Platform UI demonstration dengan interactive features, learning in action showing user engagement, modern ed-tech aesthetic, product demo untuk education, feature highlights, user experience focus, technology-enabled learning visual",
        suitable: "EdTech platform, e-learning app, educational software",
        successRate: 86,
      },
    ],
  },
  finance: {
    emoji: "💰",
    label: "Finance",
    prompts: [
      {
        id: "fin_1",
        title: "Financial Growth Visual",
        prompt: "Chart animation showing growth dengan upward trend visualization, professional financial aesthetic, data visualization yang compelling, success metrics highlight, investment growth story, clean corporate visual, trustworthy financial presentation, modern fintech aesthetic",
        suitable: "Investment, fintech, trading, wealth management",
        successRate: 87,
      },
      {
        id: "fin_2",
        title: "Security & Trust",
        prompt: "Security features demonstration dengan lock dan shield imagery, protected assets visualization, trust-building visual elements, professional security aesthetic, banking-grade protection visual, customer confidence content, reliable financial institution image",
        suitable: "Insurance, banking, crypto wallet, security",
        successRate: 88,
      },
      {
        id: "fin_3",
        title: "Easy Financial Solution",
        prompt: "Simple app interface demonstration, one-click process yang seamless, modern fintech UI showcase, user-friendly financial solution, convenience-focused visual, mobile banking aesthetic, accessible finance untuk everyone, technology-enabled finance",
        suitable: "Payment app, e-wallet, lending, digital banking",
        successRate: 86,
      },
      {
        id: "fin_4",
        title: "Future Planning Dreams",
        prompt: "Life goal visualization dengan dream home/car/travel aspirations, retirement scene yang peaceful, financial freedom lifestyle visual, aspirational future content, planning dan preparation visual, long-term wealth building story, inspiring financial goals",
        suitable: "Investment, insurance, savings, retirement planning",
        successRate: 89,
      },
      {
        id: "fin_5",
        title: "Expert Advisor",
        prompt: "Professional advisor consultation scene, trustworthy expert presentation, personalized advice moment, financial planning session, credibility dan expertise visual, client-advisor relationship, professional services aesthetic, wealth management consultation",
        suitable: "Financial advisory, wealth management, consulting",
        successRate: 85,
      },
    ],
  },
  entertainment: {
    emoji: "🎭",
    label: "Entertainment",
    prompts: [
      {
        id: "ent_1",
        title: "Event Hype Trailer",
        prompt: "Event highlights compilation dengan crowd energy moments yang electric, performer on stage dengan dramatic lighting, FOMO-inducing atmosphere yang kuat, concert/festival vibes, exciting event promo, high-energy content, shareable social media moment, event marketing visual",
        suitable: "Concert, festival, event promo, nightlife",
        successRate: 92,
      },
      {
        id: "ent_2",
        title: "Behind The Scenes",
        prompt: "Exclusive BTS moments dengan preparation sequence, candid artist moments yang authentic, insider access visual, backstage atmosphere, real dan unfiltered content, fan engagement material, exclusive content untuk followers, authentic artist personality",
        suitable: "Artist content, production BTS, creator content",
        successRate: 90,
      },
      {
        id: "ent_3",
        title: "Content Teaser Hook",
        prompt: "Exciting moment preview dengan cliff-hanger ending, curiosity-inducing cut yang compelling, watch-more motivation visual, teaser content strategy, hook dalam 3 detik pertama, scroll-stopping content, viral potential visual, engaging preview material",
        suitable: "YouTube/TikTok content teaser, series promo",
        successRate: 91,
      },
      {
        id: "ent_4",
        title: "Community Vibes",
        prompt: "Community gathering moments dengan shared excitement, fandom energy yang contagious, belonging feeling visual, group celebration, community building content, inclusive atmosphere, fan culture showcase, social connection visual",
        suitable: "Fan content, community building, brand community",
        successRate: 88,
      },
      {
        id: "ent_5",
        title: "Gaming Reaction",
        prompt: "Streamer reaction moment yang genuine, gameplay highlight dengan exciting moments, winning celebration yang epic, shareable content creation, gaming culture visual, esports energy, entertainment value focus, viral gaming content",
        suitable: "Gaming content, esports highlight, streaming",
        successRate: 89,
      },
    ],
  },
};

// ─── Trending & Mystery Data ─────────────────────────────────────────────────

export const TRENDING_PROMPTS = [
  { niche: "fnb", promptId: "fnb_1", usageChange: 45 },
  { niche: "fashion", promptId: "fashion_1", usageChange: 38 },
  { niche: "tech", promptId: "tech_1", usageChange: 32 },
  { niche: "health", promptId: "health_1", usageChange: 28 },
  { niche: "travel", promptId: "travel_1", usageChange: 25 },
];

export const MYSTERY_PROMPTS = [
  { niche: "fnb", promptId: "fnb_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "fashion", promptId: "fashion_1", rarity: "⭐⭐ UNCOMMON" },
  { niche: "tech", promptId: "tech_4", rarity: "⭐⭐⭐⭐ EPIC" },
  { niche: "health", promptId: "health_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "travel", promptId: "travel_5", rarity: "⭐⭐⭐⭐ EPIC" },
  { niche: "entertainment", promptId: "ent_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "education", promptId: "edu_2", rarity: "⭐⭐ UNCOMMON" },
];

// ─── Data Access Helpers ────────────────────────────────────────────────────

export async function findAnyPrompt(promptId: string): Promise<{
  id: string;
  title: string;
  prompt: string;
  niche: string;
  type: "library" | "professional" | "db";
} | null> {
  // 1. Trace in PROMPT_LIBRARY (Standard)
  for (const nicheKey of Object.keys(PROMPT_LIBRARY)) {
    const found = PROMPT_LIBRARY[nicheKey].prompts.find(
      (p) => p.id === promptId,
    );
    if (found) return { ...found, niche: nicheKey, type: "library" };
  }

  // 2. Trace in PROFESSIONAL_PROMPT_LIBRARY (Professional)
  try {
    const { PROFESSIONAL_PROMPT_LIBRARY } =
      await import("../config/professional-prompts.js");
    for (const nicheKey of Object.keys(PROFESSIONAL_PROMPT_LIBRARY)) {
      const found = PROFESSIONAL_PROMPT_LIBRARY[nicheKey].find(
        (p) => p.id === promptId,
      );
      if (found)
        return { id: found.id, title: found.name, prompt: found.prompt, niche: nicheKey, type: "professional" };
    }
  } catch (err) {
    logger.error("findAnyPrompt professional lookup error:", err);
  }

  // 3. Trace in Database (Admin/Saved)
  if (!isNaN(Number(promptId))) {
    try {
      const dbPrompt = await prisma.savedPrompt.findUnique({
        where: { id: parseInt(promptId) },
      });
      if (dbPrompt) {
        return { id: String(dbPrompt.id), title: dbPrompt.title, prompt: dbPrompt.prompt, niche: dbPrompt.niche || "fnb", type: "db" };
      }
    } catch (err) {
      logger.error("findAnyPrompt DB lookup error:", err);
    }
  }

  return null;
}

/** Backward compatibility wrapper */
export async function getPromptById(promptId: string) {
  return await findAnyPrompt(promptId);
}

/** Generate a unique daily prompt for each user based on their ID and date */
export function getUserDailyPrompt(userId: number, date: Date) {
  const dateStr = date.toISOString().split("T")[0];
  const seedStr = `${userId}-${dateStr}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    const char = seedStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const allPrompts: Array<{ niche: string; promptId: string; rarity: string }> = [];
  Object.keys(PROMPT_LIBRARY).forEach((nicheKey) => {
    const niche = PROMPT_LIBRARY[nicheKey];
    niche.prompts.forEach((p) => {
      allPrompts.push({
        niche: nicheKey, promptId: p.id,
        rarity: p.successRate >= 90 ? "⭐⭐⭐⭐ EPIC" : p.successRate >= 85 ? "⭐⭐⭐ RARE" : p.successRate >= 80 ? "⭐⭐ UNCOMMON" : "⭐ COMMON",
      });
    });
  });
  const index = Math.abs(hash) % allPrompts.length;
  return allPrompts[index];
}
