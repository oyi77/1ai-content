/**
 * Prompts Command — Prompt Library
 * Commands: /prompts, /daily, /trending, /fingerprint
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import { prisma } from "@/config/database";
import { canUseDailyFree, getNextDailyFreeReset } from "@/config/free-trial";
import type { InlineKeyboardButton } from '@telegraf/types/markup';
import { SavedPrompt } from '@prisma/client';
import { t } from "@/i18n/translations";

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
        prompt:
          "Cinematic food shot dengan steam rising effect dramatis, slow zoom in dari medium shot ke close-up revealing tekstur dan detail makanan, warm golden hour lighting dengan soft shadows, shallow depth of field untuk fokus pada hidangan utama, background blur bokeh lembut, color grading warm appetizing tones, professional food photography aesthetic dengan visible steam dan condensation",
        suitable: "Bakso, soto, mie ayam, makanan hangat, comfort food",
        successRate: 94,
      },
      {
        id: "fnb_2",
        title: "Fresh Splash Impact",
        prompt:
          "High-speed capture minuman dengan dramatic splash effect dan water droplets frozen in motion, bright colorful lighting dengan rim light pada gelas, ice cubes floating dan spinning dalam slow motion, condensation droplets visible pada permukaan glass, vibrant color palette, commercial beverage photography dengan clean background, refreshing dan thirst-quenching visual",
        suitable: "Kopi susu, bubble tea, jus, smoothie, minuman segar",
        successRate: 92,
      },
      {
        id: "fnb_3",
        title: "Cooking Assembly Story",
        prompt:
          "Step-by-step cooking montage dengan hands adding ingredients in artistic sequence, pan sizzle close-up showing oil bubbles dan steam, ingredients falling into pan dalam slow motion, final dish reveal dengan dramatic lighting change, overhead angle untuk plating shot, warm kitchen atmosphere, ASMR-style visual treatment dengan satisfying food preparation moments",
        suitable:
          "Recipe content, cooking tutorial, restaurant behind-the-scenes",
        successRate: 89,
      },
      {
        id: "fnb_4",
        title: "Bite Satisfaction",
        prompt:
          "Extreme close-up first bite moment dengan cross-section reveal showing layers dan textures, cheese pull atau sauce drip effect, crunch visual dengan crumbs falling, satisfied expression reaction shot, macro lens detail pada makanan, appetizing color grading, mouth-watering food photography yang trigger craving, social media optimized composition",
        suitable: "Burger, sandwich, pastry, pizza, comfort food",
        successRate: 91,
      },
      {
        id: "fnb_5",
        title: "Ambient Cafe Vibe",
        prompt:
          "Cozy cafe atmosphere dengan latte art being poured dalam slow motion, blurred customers background menciptakan depth, natural window lighting dengan golden hour warmth, morning lifestyle aesthetic, coffee beans scattered sebagai props, steam rising dari cup, warm dan inviting mood, lifestyle photography untuk coffee shop branding",
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
        prompt:
          "Model snap transition effect dengan outfit changes dari casual ke glam dalam satu gerakan, seamless morph transition antara looks, editorial lighting dengan dramatic shadows, confident pose dan expression, fashion show atmosphere, high-end aesthetic dengan clean background, movement dalam fabric captured beautifully, aspirational lifestyle mood",
        suitable: "Clothing line, outfit of the day, fashion brand launch",
        successRate: 92,
      },
      {
        id: "fashion_2",
        title: "Detail Showcase Flow",
        prompt:
          "Macro shot fabric texture dengan smooth tracking across clothing surface, button dan stitching details dalam extreme close-up, luxury aesthetic dengan soft lighting, craftsmanship visible dalam setiap detail, premium material showcase, professional product photography untuk e-commerce, elegant composition dengan minimal styling",
        suitable: "Premium fashion, fabric showcase, luxury brand",
        successRate: 88,
      },
      {
        id: "fashion_3",
        title: "Runway Walk Energy",
        prompt:
          "Model confident walk toward camera dengan dramatic lighting changes, slow-mo moments pada fabric movement, fashion show atmosphere dengan spotlights, powerful stride dan pose, editorial fashion video aesthetic, dynamic camera movement mengikuti model, high-energy dengan sophisticated mood",
        suitable: "Fashion brand, new collection launch, runway show",
        successRate: 90,
      },
      {
        id: "fashion_4",
        title: "Hijab Styling Story",
        prompt:
          "Elegant hijab styling sequence dengan hands adjusting fabric gracefully, modest fashion aesthetic yang empowering, soft natural lighting, graceful movements, empowering energy dan confidence, beautiful fabric draping, modern muslimah lifestyle, aspirational dan inclusive representation",
        suitable: "Hijab brand, modest fashion, muslimah lifestyle",
        successRate: 93,
      },
      {
        id: "fashion_5",
        title: "Accessory Sparkle",
        prompt:
          "Close-up jewelry dengan light reflection sparkle dan rainbow prisms, 360 rotation showing all angles, luxury box opening moment dengan anticipation, premium feel dengan velvet background, macro detail pada craftsmanship, elegant hand gestures, aspirational luxury lifestyle, Instagram-worthy composition",
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
        prompt:
          "Sleek unboxing sequence dengan hands lifting lid slowly revealing product, dramatic lighting change saat product terlihat, tech reviewer aesthetic dengan clean workspace, premium packaging details visible, product reveal moment dengan anticipation, modern minimalist background, cinematic slow motion pada opening moment",
        suitable: "Gadget, smartphone, electronics, premium tech",
        successRate: 91,
      },
      {
        id: "tech_2",
        title: "Feature Highlight Demo",
        prompt:
          "Product in action dengan screen display changing menunjukkan features, feature demonstration cuts yang smooth, UI animation close-ups pada interface, hands interacting dengan device, professional product demo aesthetic, clean lighting, tech-focused composition, modern dan sleek presentation",
        suitable: "App, software, device demo, SaaS product",
        successRate: 89,
      },
      {
        id: "tech_3",
        title: "Gaming Setup Vibe",
        prompt:
          "RGB lighting ambient glow menciptakan mood, gaming gear lineup dengan dramatic angles, keyboard typing visual dengan satisfying clicks, esports energy dan excitement, neon accents dan cyberpunk aesthetic, setup tour dengan smooth camera movement, immersive gaming atmosphere",
        suitable: "Gaming peripherals, PC setup, esports brand",
        successRate: 90,
      },
      {
        id: "tech_4",
        title: "Minimal Showcase",
        prompt:
          "Clean white/black background dengan product floating dalam subtle rotation, Apple-style minimalist aesthetic, perfect lighting menciptakan depth dan dimension, premium product photography, elegant shadows, sophisticated composition, luxury tech brand visual, studio-quality presentation",
        suitable: "Premium gadget, earphones, wearables, luxury tech",
        successRate: 92,
      },
      {
        id: "tech_5",
        title: "Comparison Split",
        prompt:
          "Two products side by side dengan split screen comparison, before-after upgrade effect yang dramatic, feature callouts dan highlights, visual proof of improvement, comparison content yang engaging, clear differentiation antara products, persuasive visual storytelling",
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
        prompt:
          "Split screen transformation dengan left side before dan right side after results, smooth morph transition showing progress, inspiring journey visual, dramatic improvement visible, motivational energy, clean aesthetic dengan professional lighting, credibility-building visual proof, transformation story yang compelling",
        suitable: "Skincare, fitness, supplement, weight loss",
        successRate: 93,
      },
      {
        id: "health_2",
        title: "Product Routine Story",
        prompt:
          "Morning/evening routine sequence dengan product application demonstration step-by-step, self-care pampering vibe yang relaxing, aesthetic bathroom/skincare setup, gentle hands applying product, glowing skin result, wellness lifestyle aesthetic, calming music visual feel, Instagram-worthy routine content",
        suitable: "Skincare routine, wellness products, self-care",
        successRate: 90,
      },
      {
        id: "health_3",
        title: "Ingredient Spotlight",
        prompt:
          "Natural ingredient close-ups dengan fresh botanical elements, lab-to-nature visual connection showing science meets nature, ingredient sourcing story, clean dan pure aesthetic, macro shots pada natural textures, trust-building visual untuk natural products, educational yet beautiful composition",
        suitable: "Natural supplement, herbal product, organic skincare",
        successRate: 88,
      },
      {
        id: "health_4",
        title: "Active Lifestyle",
        prompt:
          "Dynamic workout moments dengan sweat drip close-up, athletic movement freeze-frames dalam slow motion, gym/fitness environment, powerful dan energetic mood, motivational visual, sports photography aesthetic, achievement dan progress visual, inspiring active lifestyle content",
        suitable: "Fitness product, gym supplement, sportswear",
        successRate: 89,
      },
      {
        id: "health_5",
        title: "Testimonial Authentic",
        prompt:
          "Real customer sharing experience dengan conversational to camera style, authentic emotion dan genuine reaction, trust-building visual, before-after context, relatable story, professional yet personal presentation, social proof content, credibility dan authenticity focus",
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
        prompt:
          "Aerial drone shot revealing landscape secara dramatic, golden hour lighting menciptakan magic, wanderlust atmosphere yang kuat, cinematic travel film aesthetic, breathtaking vista reveal, smooth camera movement over scenery, adventure dan exploration mood, bucket-list destination visual",
        suitable: "Tour package, destination promo, travel agency",
        successRate: 89,
      },
      {
        id: "travel_2",
        title: "Hotel Villa Showcase",
        prompt:
          "Room reveal sequence dengan door opening to luxury space dramatis, pool dan view shots yang stunning, premium accommodation details, elegant interior design, relaxing atmosphere, hospitality photography aesthetic, aspirational travel lifestyle, five-star experience visual",
        suitable: "Hotel, villa, resort, accommodation",
        successRate: 88,
      },
      {
        id: "travel_3",
        title: "Experience Moment",
        prompt:
          "Traveler experiencing activity dengan genuine excitement, snorkeling underwater dengan colorful marine life, hiking viewpoint dengan rewarding vista, authentic adventure moments, action camera perspective, immersive travel experience, memory-making content, adventure travel aesthetic",
        suitable: "Activity tour, adventure travel, experience booking",
        successRate: 87,
      },
      {
        id: "travel_4",
        title: "Journey Story",
        prompt:
          "Travel montage sequence dari airport to destination, key moments compilation yang emotional, memory-making narrative dengan nostalgic feel, journey progression visual, travel diary aesthetic, personal dan relatable content, wanderlust-inducing storytelling",
        suitable: "Travel vlog, full trip recap, travel diary",
        successRate: 86,
      },
      {
        id: "travel_5",
        title: "Local Hidden Gem",
        prompt:
          "Undiscovered spot reveal dengan dramatic entrance, secret beach/waterfall yang pristine, off-the-beaten-path vibe yang exclusive, local tourism discovery, authentic dan untouched destination, explorer aesthetic, exclusive discovery feeling, hidden paradise visual",
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
        prompt:
          "Student journey dari confused to confident, study montage progression showing growth, aha moment visual dengan lightbulb effect, before-after learning outcome, inspiring educational content, professional academic aesthetic, achievement dan progress visual, success story narrative",
        suitable: "Online course, tutoring, educational platform",
        successRate: 88,
      },
      {
        id: "edu_2",
        title: "Expert Credibility",
        prompt:
          "Expert instructor dalam professional setting, teaching moment yang engaging, authority building visual, credentials dan experience showcase, trustworthy presentation, professional education aesthetic, knowledge sharing atmosphere, thought leadership content",
        suitable: "Course launch, training promo, masterclass",
        successRate: 90,
      },
      {
        id: "edu_3",
        title: "Course Content Preview",
        prompt:
          "Curriculum overview visual dengan module-by-module reveal, learning path journey yang clear, value proposition showcase, course structure explanation, engaging content preview, professional course marketing, educational content strategy visual",
        suitable: "Course promo, curriculum showcase, bootcamp",
        successRate: 87,
      },
      {
        id: "edu_4",
        title: "Student Success Story",
        prompt:
          "Alumni testimonial dengan career progression timeline, achievement showcase yang inspiring, graduation/success moment, real results visual, social proof content, inspiring proof of value, transformation story dari student to professional",
        suitable: "Bootcamp, certification course, career training",
        successRate: 89,
      },
      {
        id: "edu_5",
        title: "Interactive Learning Demo",
        prompt:
          "Platform UI demonstration dengan interactive features, learning in action showing user engagement, modern ed-tech aesthetic, product demo untuk education, feature highlights, user experience focus, technology-enabled learning visual",
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
        prompt:
          "Chart animation showing growth dengan upward trend visualization, professional financial aesthetic, data visualization yang compelling, success metrics highlight, investment growth story, clean corporate visual, trustworthy financial presentation, modern fintech aesthetic",
        suitable: "Investment, fintech, trading, wealth management",
        successRate: 87,
      },
      {
        id: "fin_2",
        title: "Security & Trust",
        prompt:
          "Security features demonstration dengan lock dan shield imagery, protected assets visualization, trust-building visual elements, professional security aesthetic, banking-grade protection visual, customer confidence content, reliable financial institution image",
        suitable: "Insurance, banking, crypto wallet, security",
        successRate: 88,
      },
      {
        id: "fin_3",
        title: "Easy Financial Solution",
        prompt:
          "Simple app interface demonstration, one-click process yang seamless, modern fintech UI showcase, user-friendly financial solution, convenience-focused visual, mobile banking aesthetic, accessible finance untuk everyone, technology-enabled finance",
        suitable: "Payment app, e-wallet, lending, digital banking",
        successRate: 86,
      },
      {
        id: "fin_4",
        title: "Future Planning Dreams",
        prompt:
          "Life goal visualization dengan dream home/car/travel aspirations, retirement scene yang peaceful, financial freedom lifestyle visual, aspirational future content, planning dan preparation visual, long-term wealth building story, inspiring financial goals",
        suitable: "Investment, insurance, savings, retirement planning",
        successRate: 89,
      },
      {
        id: "fin_5",
        title: "Expert Advisor",
        prompt:
          "Professional advisor consultation scene, trustworthy expert presentation, personalized advice moment, financial planning session, credibility dan expertise visual, client-advisor relationship, professional services aesthetic, wealth management consultation",
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
        prompt:
          "Event highlights compilation dengan crowd energy moments yang electric, performer on stage dengan dramatic lighting, FOMO-inducing atmosphere yang kuat, concert/festival vibes, exciting event promo, high-energy content, shareable social media moment, event marketing visual",
        suitable: "Concert, festival, event promo, nightlife",
        successRate: 92,
      },
      {
        id: "ent_2",
        title: "Behind The Scenes",
        prompt:
          "Exclusive BTS moments dengan preparation sequence, candid artist moments yang authentic, insider access visual, backstage atmosphere, real dan unfiltered content, fan engagement material, exclusive content untuk followers, authentic artist personality",
        suitable: "Artist content, production BTS, creator content",
        successRate: 90,
      },
      {
        id: "ent_3",
        title: "Content Teaser Hook",
        prompt:
          "Exciting moment preview dengan cliff-hanger ending, curiosity-inducing cut yang compelling, watch-more motivation visual, teaser content strategy, hook dalam 3 detik pertama, scroll-stopping content, viral potential visual, engaging preview material",
        suitable: "YouTube/TikTok content teaser, series promo",
        successRate: 91,
      },
      {
        id: "ent_4",
        title: "Community Vibes",
        prompt:
          "Community gathering moments dengan shared excitement, fandom energy yang contagious, belonging feeling visual, group celebration, community building content, inclusive atmosphere, fan culture showcase, social connection visual",
        suitable: "Fan content, community building, brand community",
        successRate: 88,
      },
      {
        id: "ent_5",
        title: "Gaming Reaction",
        prompt:
          "Streamer reaction moment yang genuine, gameplay highlight dengan exciting moments, winning celebration yang epic, shareable content creation, gaming culture visual, esports energy, entertainment value focus, viral gaming content",
        suitable: "Gaming content, esports highlight, streaming",
        successRate: 89,
      },
    ],
  },
};

// Trending order (most used this week)
export const TRENDING_PROMPTS = [
  { niche: "fnb", promptId: "fnb_1", usageChange: 45 },
  { niche: "fashion", promptId: "fashion_1", usageChange: 38 },
  { niche: "tech", promptId: "tech_1", usageChange: 32 },
  { niche: "health", promptId: "health_1", usageChange: 28 },
  { niche: "travel", promptId: "travel_1", usageChange: 25 },
];

// Daily mystery prompts rotation (based on day of week)
export const MYSTERY_PROMPTS = [
  { niche: "fnb", promptId: "fnb_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "fashion", promptId: "fashion_1", rarity: "⭐⭐ UNCOMMON" },
  { niche: "tech", promptId: "tech_4", rarity: "⭐⭐⭐⭐ EPIC" },
  { niche: "health", promptId: "health_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "travel", promptId: "travel_5", rarity: "⭐⭐⭐⭐ EPIC" },
  { niche: "entertainment", promptId: "ent_1", rarity: "⭐⭐⭐ RARE" },
  { niche: "education", promptId: "edu_2", rarity: "⭐⭐ UNCOMMON" },
];

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
        return {
          id: found.id,
          title: found.name,
          prompt: found.prompt,
          niche: nicheKey,
          type: "professional",
        };
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
        return {
          id: String(dbPrompt.id),
          title: dbPrompt.title,
          prompt: dbPrompt.prompt,
          niche: dbPrompt.niche || "fnb",
          type: "db",
        };
      }
    } catch (err) {
      logger.error("findAnyPrompt DB lookup error:", err);
    }
  }

  return null;
}

// Backward compatibility wrapper
export async function getPromptById(promptId: string) {
  return await findAnyPrompt(promptId);
}

// ─── /prompts ────────────────────────────────────────────────────────────────

export async function promptsCommand(ctx: BotContext): Promise<void> {
  try {
    const rawText = (ctx.message as { text?: string })?.text || "";
    const arg = rawText
      .replace(/^\/prompts\s*/, "")
      .trim()
      .toLowerCase();

    if (arg && PROMPT_LIBRARY[arg]) {
      await showNichePrompts(ctx, arg);
      return;
    }

    const lang = ctx.session?.userLang || ctx.from?.language_code || "id";
    await ctx.reply(t("prompts.library_menu", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🍔 F&B", callback_data: "prompts_fnb" },
            { text: "👗 Fashion", callback_data: "prompts_fashion" },
          ],
          [
            { text: "📱 Tech", callback_data: "prompts_tech" },
            { text: "💪 Health", callback_data: "prompts_health" },
          ],
          [
            { text: "✈️ Travel", callback_data: "prompts_travel" },
            { text: "📚 Education", callback_data: "prompts_education" },
          ],
          [
            { text: "💰 Finance", callback_data: "prompts_finance" },
            {
              text: "🎭 Entertainment",
              callback_data: "prompts_entertainment",
            },
          ],
          [
            { text: "🔥 Trending", callback_data: "prompts_trending" },
            { text: "✨ Custom AI", callback_data: "prompts_custom" },
          ],
        ],
      },
    });
  } catch (err) {
    logger.error("promptsCommand error:", err);
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("prompt.library_load_failed", lang));
  }
}

// ─── Show prompts for a specific niche ───────────────────────────────────────

export async function showNichePrompts(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  const niche = PROMPT_LIBRARY[nicheKey];
  if (!niche) {
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("prompt.niche_not_found", lang));
    return;
  }

  // Load user's saved prompts + admin prompts for this niche
  const telegramId = ctx.from?.id;
  let savedPrompts: unknown[] = [];
  let adminPrompts: SavedPrompt[] = [];
  try {
    // Admin prompts (userId=0) — global, added via admin panel
    adminPrompts = await prisma.savedPrompt.findMany({
      where: { userId: BigInt(0), niche: nicheKey },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch {
    /* non-critical */
  }

  if (telegramId) {
    try {
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (dbUser) {
        savedPrompts = await SavedPromptService.getByUser(
          dbUser.id as unknown as bigint,
          nicheKey,
        );
      }
    } catch {
      /* non-critical */
    }
  }

  const hasAdmin = adminPrompts.length > 0;
  const hasSaved = savedPrompts.length > 0;

  let msg = `${niche.emoji} **${niche.label} PROMPT TEMPLATES**\n`;
  msg += `────────────────────────────────────────────\n\n`;
  msg += `Berikut prompt terbaik untuk niche ${niche.label}:\n\n`;

  const rows: InlineKeyboardButton[][] = [];
  let rowNum = 1;

  // My saved prompts (user-specific)
  if (hasSaved) {
    rows.push([
      {
        text: `📌 Prompt Tersimpan Saya (${savedPrompts.length})`,
        callback_data: `my_prompts_${nicheKey}`,
      },
    ]);
  }

  // Admin prompts (from admin panel) — appear first, unlimited
  if (hasAdmin) {
    msg += `⭐ **Dari Admin:**\n`;
    adminPrompts.forEach(p => {
      msg += `**${rowNum}. ${p.title}**\n`;
      msg += `\`${p.prompt.slice(0, 100)}${p.prompt.length > 100 ? "..." : ""}\`\n\n`;
      rows.push([
        {
          text: `${rowNum++}. ${p.title} ⭐`,
          callback_data: `use_admin_prompt_${p.id}`,
        },
      ]);
    });
  }

  // Built-in template prompts
  msg += `**PROMPT TEMPLATES:**\n`;
  niche.prompts.forEach((p) => {
    msg += `**${rowNum}. ${p.title}** ⭐ ${p.successRate}% success\n`;
    msg += `───────────────────────────\n`;
    msg += `\`${p.prompt.slice(0, 100)}${p.prompt.length > 100 ? "..." : ""}\`\n\n`;
    msg += `✅ Cocok untuk: ${p.suitable}\n\n`;
    rows.push([
      {
        text: `${rowNum++}. ${p.title} ⭐`,
        callback_data: `use_prompt_${p.id}`,
      },
    ]);
  });

  msg += `────────────────────────────────────────────\n`;
  msg += `💡 **Cara Pakai:**\n`;
  msg += `Ketik \`/use 1\` untuk pakai prompt #1\n`;
  msg += `Ketik \`/customize 1\` untuk modifikasi prompt`;

  rows.push([
    {
      text: "➕ Tambah Custom Prompt",
      callback_data: `add_custom_prompt_${nicheKey}`,
    },
  ]);
  rows.push([
    { text: "◀️ Kembali ke Semua Niche", callback_data: "back_prompts" },
  ]);

  const markup = { inline_keyboard: rows };

  try {
    if (edit) {
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    } else {
      await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
    }
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }
}

// ─── Use prompt (show detail + action buttons) ───────────────────────────────

export async function showPromptDetail(
  ctx: BotContext,
  promptId: string,
  edit = false,
): Promise<void> {
  const p = await findAnyPrompt(promptId);
  if (!p) {
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("cb.prompt_not_found", lang));
    return;
  }

  // Get user credits
  let credits = "?";
  try {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (dbUser) credits = String(dbUser.creditBalance);
    }
  } catch {
    /* ignore */
  }

  const credLine =
    credits !== "?" ? `💰 Saldo kamu: **${credits} credits** ✓\n\n` : "";

  const msg =
    `✅ **Prompt Aktif!**\n\n` +
    `─────────────────────────────────────\n` +
    `📋 **${p.title}**\n` +
    `─────────────────────────────────────\n\n` +
    `\`${p.prompt}\`\n\n` +
    `─────────────────────────────────────\n\n` +
    `🎬 **Langkah Selanjutnya:**\n\n` +
    `1. **Upload foto produk kamu** (opsional)\n` +
    `→ AI akan animasikan foto jadi video\n\n` +
    `2. **Atau langsung generate**\n` +
    `→ AI akan buat visual dari prompt ini\n\n` +
    `─────────────────────────────────────\n` +
    `📊 **Credit Estimator:**\n` +
    `${credLine}` +
    `• Video 5 detik: 0.2 credits\n` +
    `• Video 15 detik: 0.5 credits\n` +
    `• Video 30 detik: 1.0 credits\n` +
    `• Video 60 detik: 2.0 credits`;

  const markup = {
    inline_keyboard: [
      // Primary CTA -> Redirect to V3 Flow
      [{ text: "🚀 Buat Video Sekarang!", callback_data: "create_video_new" }],
      [
        {
          text: "🖼️ Buat Gambar Saja",
          callback_data: `generate_image_v3_${promptId}`,
        },
      ],
      [
        { text: "🔧 Customize", callback_data: `customize_prompt_${promptId}` },
        { text: "💾 Simpan", callback_data: `save_prompt_${promptId}` },
      ],
      [
        {
          text: `◀️ Kembali ke Niche`,
          callback_data: `prompts_niche_${p.niche}`,
        },
      ],
    ],
  };

  try {
    if (edit) {
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    } else {
      await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
    }
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }

  // Save selected prompt to session for V3 flow
  if (ctx.session) {
    ctx.session.generateProductDesc = p.prompt; // Used by V3 Flow
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      selectedPrompt: p.prompt, // Legacy support
      selectedPromptId: p.id,
    };
  }
}

// ─── Customize prompt ────────────────────────────────────────────────────────

export async function showCustomizePrompt(
  ctx: BotContext,
  promptId: string,
  edit = false,
): Promise<void> {
  const p = await getPromptById(promptId);
  const base = p ? p.prompt : "Prompt kustom";

  const msg =
    `🔧 **PROMPT CUSTOMIZER**\n` +
    `─────────────────────────────────────\n\n` +
    `Base prompt:\n\`${base.slice(0, 100)}${base.length > 100 ? "..." : ""}\`\n\n` +
    `─────────────────────────────────────\n` +
    `**MODIFY OPTIONS:**\n` +
    `─────────────────────────────────────\n\n` +
    `📐 **Style**\n` +
    `[Cinematic] [Minimalist] [Editorial] [Dramatic] [Fun]\n\n` +
    `💡 **Lighting**\n` +
    `[Golden Hour] [Studio] [Natural] [Neon] [Moody]\n\n` +
    `🎭 **Mood**\n` +
    `[Cozy] [Energetic] [Luxury] [Professional] [Casual]\n\n` +
    `⏱️ **Duration**\n` +
    `[5 sec] [15 sec] [30 sec] [60 sec]\n\n` +
    `📱 **Platform**\n` +
    `[TikTok 9:16] [IG Reels] [YouTube Shorts] [FB Reels]\n\n` +
    `─────────────────────────────────────\n\n` +
    `Ketik pilihanmu, contoh:\n` +
    `"style dramatic, lighting neon, duration 10 sec"\n\n` +
    `atau jelaskan perubahan yang kamu mau!`;

  const markup = {
    inline_keyboard: [
      [
        {
          text: "🎬 Cinematic",
          callback_data: `cust_style_cinematic_${promptId}`,
        },
        {
          text: "⚡ Dramatic",
          callback_data: `cust_style_dramatic_${promptId}`,
        },
        {
          text: "✨ Minimalist",
          callback_data: `cust_style_minimal_${promptId}`,
        },
      ],
      [
        {
          text: "🌅 Golden Hour",
          callback_data: `cust_light_golden_${promptId}`,
        },
        { text: "💡 Studio", callback_data: `cust_light_studio_${promptId}` },
        { text: "🌙 Moody", callback_data: `cust_light_moody_${promptId}` },
      ],
      [{ text: "◀️ Kembali", callback_data: `use_prompt_${promptId}` }],
    ],
  };

  if (ctx.session) {
    ctx.session.state = "CUSTOMIZING_PROMPT";
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      customizingPromptId: promptId,
      basePrompt: base,
    };
  }

  try {
    if (edit) {
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    } else {
      await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
    }
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }
}

// ─── /daily ──────────────────────────────────────────────────────────────────

// Generate a unique daily prompt for each user based on their ID and date
function getUserDailyPrompt(userId: number, date: Date) {
  // Create a seed from userId + date string (YYYY-MM-DD)
  const dateStr = date.toISOString().split("T")[0];
  const seedStr = `${userId}-${dateStr}`;

  // Simple hash function to get consistent random number
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    const char = seedStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  // Get all available prompts
  const allPrompts: Array<{ niche: string; promptId: string; rarity: string }> =
    [];

  // Add all prompts from PROMPT_LIBRARY
  Object.keys(PROMPT_LIBRARY).forEach((nicheKey) => {
    const niche = PROMPT_LIBRARY[nicheKey];
    niche.prompts.forEach((p) => {
      allPrompts.push({
        niche: nicheKey,
        promptId: p.id,
        rarity:
          p.successRate >= 90
            ? "⭐⭐⭐⭐ EPIC"
            : p.successRate >= 85
              ? "⭐⭐⭐ RARE"
              : p.successRate >= 80
                ? "⭐⭐ UNCOMMON"
                : "⭐ COMMON",
      });
    });
  });

  // Use hash to select a prompt (guarantees same prompt for same user on same day)
  const index = Math.abs(hash) % allPrompts.length;
  return allPrompts[index];
}

export async function dailyCommand(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply(t("social.unable_identify_user", "id"));
      return;
    }

    const dbUser = await UserService.findByTelegramId(BigInt(userId));
    if (!dbUser) {
      await ctx.reply(t("error.user_not_found", "id"));
      return;
    }

    // Check if daily free is available
    if (!canUseDailyFree(dbUser)) {
      const resetAt = dbUser.dailyFreeResetAt || getNextDailyFreeReset();
      const hoursLeft = Math.ceil(
        (resetAt.getTime() - Date.now()) / (1000 * 60 * 60),
      );

      await ctx.reply(
        `🎁 **MYSTERY PROMPT BOX**\n\n` +
          `⏰ **Daily reward sudah diklaim!**\n\n` +
          `Prompt baru akan tersedia dalam: *${hoursLeft} jam*.\n\n` +
          `_Ingin lebih banyak prompt? Jelajahi Library atau upgrade ke PRO!_`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const today = new Date();
    // Get unique prompt for this user on this day
    const userPrompt = getUserDailyPrompt(userId, today);
    const niche = PROMPT_LIBRARY[userPrompt.niche];
    const p = niche.prompts.find((x) => x.id === userPrompt.promptId)!;

    const msg =
      `🎁 **MYSTERY PROMPT BOX**\n` +
      `─────────────────────────────────────\n\n` +
      `✨ **PROMPT UNLOCKED!**\n\n` +
      `─────────────────────────────────────\n` +
      `📂 Niche: **${niche.label}**\n` +
      `⭐ Rarity: **${userPrompt.rarity}**\n` +
      `─────────────────────────────────────\n\n` +
      `**${p.title}**\n\n` +
      `\`${p.prompt}\`\n\n` +
      `─────────────────────────────────────\n` +
      `💡 Prompt ini bisa langsung dipakai untuk generate!\n` +
      `─────────────────────────────────────\n\n` +
      `⏰ Prompt baru setiap hari — jangan sampai ketinggalan!`;

    if (ctx.session) {
      ctx.session.stateData = {
        ...(ctx.session.stateData || {}),
        selectedPrompt: p.prompt,
      };
    }

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚀 Pakai Sekarang", callback_data: `use_prompt_${p.id}` },
            { text: "💾 Simpan", callback_data: `daily_save_${p.id}` },
          ],
          [{ text: "🔄 Prompt Lain", callback_data: "daily_another" }],
          [{ text: "📚 Lihat Semua Prompt", callback_data: "back_prompts" }],
        ],
      },
    });
  } catch (err) {
    logger.error("dailyCommand error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.daily_load_failed", errLang));
  }
}

// ─── /trending ───────────────────────────────────────────────────────────────

export async function trendingCommand(ctx: BotContext): Promise<void> {
  try {
    let msg = `🔥 **TRENDING PROMPTS THIS WEEK**\n`;
    msg += `─────────────────────────────────────\n\n`;
    msg += `Diupdate setiap hari berdasarkan penggunaan real user!\n\n`;
    msg += `─────────────────────────────────────\n\n`;

    const buttons: InlineKeyboardButton[][] = [];

    TRENDING_PROMPTS.forEach((t, i) => {
      const niche = PROMPT_LIBRARY[t.niche];
      const p = niche.prompts.find((x) => x.id === t.promptId)!;

      msg += `**#${i + 1}** ${niche.emoji} ${p.title}\n`;
      msg += `📈 +${t.usageChange}% usage | ⭐ ${p.successRate}% success\n`;
      msg += `Top niche: ${niche.label}\n`;
      msg += `\`"${p.prompt.slice(0, 60)}..."\`\n\n`;
      msg += `─────────────────────────────────────\n\n`;

      buttons.push([
        {
          text: `🔥 Use #${i + 1} ${p.title}`,
          callback_data: `use_prompt_${p.id}`,
        },
      ]);
    });

    msg += `💡 Tip: Trending prompts biasanya punya higher success rate karena sudah ditest ribuan user!`;

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...buttons,
          [{ text: "📚 Browse Semua Niche", callback_data: "back_prompts" }],
        ],
      },
    });
  } catch (err) {
    logger.error("trendingCommand error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.trending_load_failed", errLang));
  }
}

// ─── /fingerprint ────────────────────────────────────────────────────────────

export async function fingerprintCommand(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  await ctx.reply(
    `${t("fingerprint.preview_title", lang)}\n\n${t("fingerprint.preview_desc", lang)}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("fingerprint.try_library", lang), callback_data: "prompts_menu" }],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    },
  );
}

// ─── Save prompt from library ─────────────────────────────────────────────────

export async function saveLibraryPrompt(
  ctx: BotContext,
  promptId: string,
): Promise<void> {
  try {
    const p = await getPromptById(promptId);
    if (!p) {
      await ctx.answerCbQuery(t("cb.prompt_not_found", "id"));
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.answerCbQuery(t("error.user_not_found", "id"));
      return;
    }

    const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
    if (!dbUser) {
      await ctx.answerCbQuery(t("error.user_not_found", "id"));
      return;
    }

    const count = await SavedPromptService.count(
      dbUser.id as unknown as bigint,
    );
    if (count >= 20) {
      await ctx.answerCbQuery(
        "⚠️ Max 20 prompt tersimpan. Hapus dulu yang lama.",
      );
      return;
    }

    await SavedPromptService.save(dbUser.id as unknown as bigint, {
      title: p.title,
      prompt: p.prompt,
      niche: p.niche,
      source: "library",
      sourceId: promptId,
    });

    await ctx.answerCbQuery(`✅ "${p.title}" tersimpan!`);
  } catch (err) {
    logger.error("saveLibraryPrompt error:", err);
    await ctx.answerCbQuery(t("prompt.save_failed", "id"));
  }
}

// ─── Show user's saved prompts for a niche ───────────────────────────────────

export async function showMyPrompts(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
    if (!dbUser) return;

    const saved = await SavedPromptService.getByUser(
      dbUser.id as unknown as bigint,
      nicheKey,
    );
    const niche = PROMPT_LIBRARY[nicheKey];

    if (saved.length === 0) {
      const msg = `📌 *Prompt Tersimpan — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n\nBelum ada prompt tersimpan di niche ini.\n\n_Tap 💾 Simpan di detail prompt untuk menyimpan!_`;
      const markup = {
        inline_keyboard: [
          [
            {
              text: `◀️ Kembali ke ${niche?.emoji} ${niche?.label}`,
              callback_data: `prompts_${nicheKey}`,
            },
          ],
        ],
      };
      if (edit)
        await ctx
          .editMessageText(msg, {
            parse_mode: "Markdown",
            reply_markup: markup,
          })
          .catch(() =>
            ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
          );
      else
        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
      return;
    }

    let msg = `📌 *Prompt Tersimpan — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n`;
    msg += `_${saved.length} prompt kamu_ 👇\n\n`;
    saved.forEach((p, i) => {
      msg += `*${i + 1}. ${p.title}*\n`;
      msg += `\`${p.prompt.slice(0, 80)}${p.prompt.length > 80 ? "..." : ""}\`\n`;
      msg += `📊 Dipakai ${p.usageCount}x\n\n`;
    });

    const rows: InlineKeyboardButton[][] = saved.map((p, i) => [
      { text: `${i + 1}. ${p.title}`, callback_data: `use_saved_${p.id}` },
      { text: "🗑️", callback_data: `del_saved_${p.id}_${nicheKey}` },
    ]);
    rows.push([
      {
        text: "➕ Tambah Custom Prompt",
        callback_data: `add_custom_prompt_${nicheKey}`,
      },
    ]);
    rows.push([
      {
        text: `◀️ Kembali ke ${niche?.emoji} ${niche?.label}`,
        callback_data: `prompts_${nicheKey}`,
      },
    ]);

    const markup = { inline_keyboard: rows };
    if (edit)
      await ctx
        .editMessageText(msg, { parse_mode: "Markdown", reply_markup: markup })
        .catch(() =>
          ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
        );
    else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  } catch (err) {
    logger.error("showMyPrompts error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.saved_load_failed", errLang));
  }
}

// ─── Add custom prompt flow ───────────────────────────────────────────────────

export async function startAddCustomPrompt(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  const niche = PROMPT_LIBRARY[nicheKey];
  const msg =
    `➕ *Tambah Custom Prompt — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n\n` +
    `Ketik prompt kamu sekarang.\n\n` +
    `*Tips prompt yang baik:*\n` +
    `• Minimal 10 kata\n` +
    `• Sertakan: subjek, style, lighting, mood\n` +
    `• Contoh: _"Cinematic shot produk skincare dengan golden hour lighting, soft bokeh background, premium aesthetic"_\n\n` +
    `_Ketik promptnya langsung, atau tap Batal_`;

  const markup = {
    inline_keyboard: [
      [{ text: "❌ Batal", callback_data: `prompts_${nicheKey}` }],
    ],
  };

  if (ctx.session) {
    ctx.session.state = "CUSTOM_PROMPT_CREATION";
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      addingPromptNiche: nicheKey,
    };
  }

  if (edit)
    await ctx
      .editMessageText(msg, { parse_mode: "Markdown", reply_markup: markup })
      .catch(() =>
        ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
      );
  else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
}
