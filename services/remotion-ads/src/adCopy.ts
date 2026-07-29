/**
 * Ad Copy Generator for Indonesian Shopee Affiliate Products
 * Generates category-specific hooks, descriptions, and CTAs in Indonesian.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AdCopyData {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  categoryLabel: string;
  categoryEmoji: string;
}

// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

const CATEGORY_CONFIG: Record<
  string,
  {
    label: string;
    emoji: string;
    gradient: [string, string];
    hooks: string[];
    bodies: string[];
    ctas: string[];
    hashtags: string[];
  }
> = {
  beauty: {
    label: "Kecantikan",
    emoji: "✨",
    gradient: ["#FF6B9D", "#C44569"],
    hooks: [
      "Kulit glowing dalam 7 hari! ✨",
      "Rahasia kulit artis Korea! 🇰🇷",
      "Bye bye jerawat! 👋",
      "Skincare viral TikTok! 🔥",
      "Kulit mulus tanpa filter! 💫",
      "Rahasia awet muda! 🌸",
      "Glow up challenge! ✨",
      "Wajah cerah alami! 🌿",
    ],
    bodies: [
      "Formulasi ringan dengan bahan alami yang teruji klinis. Cocok untuk semua jenis kulit!",
      "Diperkaya dengan {ingredient} untuk kulit lembab dan kenyal seharian.",
      "Sudah dipakai 10.000+ beauty enthusiast di Indonesia. Hasilnya bikin nagih!",
      "Tekstur ringan, cepat meresap, dan langsung terasa bedanya dari pemakaian pertama.",
    ],
    ctas: [
      "Link di Bio! 🔗",
      "Order sekarang, gratis ongkir! 🚚",
      "Stok terbatas, buruan! ⏰",
      "Klik link di bio sekarang! 👆",
    ],
    hashtags: [
      "#skincare",
      "#kecantikan",
      "#glowup",
      "#skintok",
      "#beautyhacks",
      "#glowing",
    ],
  },
  fashion: {
    label: "Fashion",
    emoji: "👗",
    gradient: ["#A855F7", "#7C3AED"],
    hooks: [
      "Outfit of the day! 🔥",
      "Style Korea harga lokal! 💰",
      "OOTD terbaru! 👗",
      "Fashion viral Shopee! 🛍️",
      "Look mahal, harga ramah! 💸",
      "Mix and match sempurna! 🎨",
      "Style idol K-pop! 🌟",
      "Dress to impress! 👑",
    ],
    bodies: [
      "Bahan premium, jahitan rapi, dan nyaman dipakai seharian. Worth every penny!",
      "Desain trendy yang bikin kamu jadi pusat perhatian. Tersedia berbagai ukuran!",
      "Koleksi terbaru dengan warna-warna earth tone yang lagi hits banget!",
      "Padu padan gampang untuk kasual maupun formal. Satu baju, seribu gaya!",
    ],
    ctas: [
      "Link di Bio! 🔗",
      "Order sebelum kehabisan! 🛒",
      "Gratis ongkir hari ini! 🚚",
      "Klik link di bio, pilih warnamu! 🎨",
    ],
    hashtags: [
      "#fashion",
      "#ootd",
      "#stylekorea",
      "#outfitinspo",
      "#shopeefashion",
      "#trendy",
    ],
  },
  hobi: {
    label: "Hobi",
    emoji: "🎮",
    gradient: ["#F97316", "#EA580C"],
    hooks: [
      "Wajib punya buat para gamers! 🎮",
      "Upgrade setup kamu! 🖥️",
      "Hobi makin seru! 🎯",
      "Gear terbaik harga terjangkau! 💪",
      "Collection wajib! 🏆",
      "Main makin jago! 🎯",
      "Setup impian! ✨",
      "Level up your game! 🚀",
    ],
    bodies: [
      "Kualitas pro, harga pemula. Cocok buat yang mau serius di hobinya!",
      "Material tahan lama dan ergonomis. Dibuat untuk penggunaan intensif!",
      "Best seller di kategorinya! Sudah terjual ribuan pcs dan review bintang 5!",
      "Desain compact dan portable. Bisa dibawa ke mana aja!",
    ],
    ctas: [
      "Link di Bio! 🔗",
      "Beli sekarang, langsung gas! 🚀",
      "Diskon spesial hari ini! 💰",
      "Klik link di bio, jangan sampai kehabisan! ⏰",
    ],
    hashtags: [
      "#hobi",
      "#gaming",
      "#setup",
      "#gear",
      "#tech",
      "#review",
    ],
  },
  kesehatan: {
    label: "Kesehatan",
    emoji: "💪",
    gradient: ["#10B981", "#059669"],
    hooks: [
      "Hidup sehat dimulai dari sini! 💪",
      "Rahasia tubuh bugar! 🏃",
      "Imun booster alami! 🛡️",
      "Badan sehat, pikiran tenang! 🧘",
      "Tips sehat ala artis! ⭐",
      "Vitamin terlaris 2024! 💊",
      "Investasi kesehatan terbaik! 🏥",
      "Sehat itu mahal, sakit lebih mahal! 💯",
    ],
    bodies: [
      "Bahan alami yang diformulasikan oleh ahli gizi. Aman untuk konsumsi harian!",
      "Sudah BPOM dan tersertifikasi halal. Kualitas terjamin!",
      "Ribuan pelanggan sudah merasakan manfaatnya. Review bintang 5!",
      "Dosis tepat, mudah dikonsumsi, dan langsung terasa khasiatnya!",
    ],
    ctas: [
      "Link di Bio! 🔗",
      "Mulai hidup sehat sekarang! 🌱",
      "Stok terbatas, pesan sekarang! ⏰",
      "Klik link di bio untuk info lengkap! 📋",
    ],
    hashtags: [
      "#sehat",
      "#kesehatan",
      "#vitamin",
      "#healthy",
      "#wellness",
      "#BPOM",
    ],
  },
  homeliving: {
    label: "Home & Living",
    emoji: "🏠",
    gradient: ["#F59E0B", "#D97706"],
    hooks: [
      "Rumah aesthetic on budget! 🏠",
      "Transformasi kamar impian! ✨",
      "Organize like a pro! 📦",
      "Dekorasi cozy vibes! 🕯️",
      "Rumah rapi, hati senang! 💕",
      "Makeover kamar kost! 🛏️",
      "Interior goals! 🎨",
      "Rumah minimalis, maksimalis! 🏡",
    ],
    bodies: [
      "Desain multifungsi yang hemat tempat. Cocok untuk ruangan kecil maupun besar!",
      "Material premium yang tahan lama dan mudah dibersihkan. Investasi jangka panjang!",
      "Warna netral yang gampang dipadukan dengan dekorasi apapun!",
      "Sudah viral di TikTok! Review positif dari ribuan pembeli!",
    ],
    ctas: [
      "Link di Bio! 🔗",
      "Dekorasi rumah sekarang! 🏠",
      "Gratis ongkir se-Indonesia! 🚚",
      "Klik link di bio, checkout sekarang! 🛒",
    ],
    hashtags: [
      "#homeliving",
      "#dekorasi",
      "#aesthetic",
      "#rumah",
      "#organize",
      "#interior",
    ],
  },
};

// ============================================================================
// AD COPY GENERATOR
// ============================================================================

/**
 * Generate ad copy for a product based on its category.
 * Picks random hooks/bodies/ctas for variety.
 */
export function generateAdCopy(
  category: string,
  title?: string,
): AdCopyData {
  const key = normalizeCategory(category);
  const config = CATEGORY_CONFIG[key] ?? CATEGORY_CONFIG.beauty;

  const hook = pickRandom(config.hooks);
  const body = pickRandom(config.bodies);
  const cta = pickRandom(config.ctas);
  const hashtags = shuffleArray(config.hashtags).slice(0, 4);

  return {
    hook,
    body: body.replace("{ingredient}", extractIngredient(title)),
    cta,
    hashtags,
    categoryLabel: config.label,
    categoryEmoji: config.emoji,
  };
}

/**
 * Get category-specific gradient colors for background styling.
 */
export function getCategoryGradient(category: string): [string, string] {
  const key = normalizeCategory(category);
  return CATEGORY_CONFIG[key]?.gradient ?? CATEGORY_CONFIG.beauty.gradient;
}

/**
 * Normalize category name variations to a canonical key.
 */
function normalizeCategory(category: string): string {
  const c = (category ?? "").toLowerCase().trim();
  if (c.includes("beauty") || c.includes("cantik") || c.includes("skincare"))
    return "beauty";
  if (c.includes("fashion") || c.includes("pakaian") || c.includes("baju"))
    return "fashion";
  if (c.includes("hobi") || c.includes("hobby") || c.includes("game") || c.includes("tech"))
    return "hobi";
  if (c.includes("kesehatan") || c.includes("health") || c.includes("vitamin") || c.includes("sehat"))
    return "kesehatan";
  if (c.includes("home") || c.includes("living") || c.includes("rumah") || c.includes("dekor"))
    return "homeliving";
  return "beauty";
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractIngredient(title?: string): string {
  if (!title) return "Vitamin E & Hyaluronic Acid";
  const lower = title.toLowerCase();
  if (lower.includes("niacinamide")) return "Niacinamide";
  if (lower.includes("vitamin c") || lower.includes("vit c")) return "Vitamin C";
  if (lower.includes("retinol")) return "Retinol";
  if (lower.includes("aha") || lower.includes("bha")) return "AHA/BHA";
  if (lower.includes("collagen") || lower.includes("kolagen")) return "Collagen";
  if (lower.includes("aloe") || lower.includes("lidah buaya")) return "Aloe Vera";
  return "Vitamin E & Hyaluronic Acid";
}

// ============================================================================
// DETERMINISTIC AD COPY (for consistent rendering)
// ============================================================================

/**
 * Deterministic ad copy — same inputs always produce same output.
 * Used for rendering where random would cause inconsistent re-renders.
 */
export function generateDeterministicAdCopy(
  category: string,
  title?: string,
  seed: number = 0,
): AdCopyData {
  const key = normalizeCategory(category);
  const config = CATEGORY_CONFIG[key] ?? CATEGORY_CONFIG.beauty;

  const hook = config.hooks[seed % config.hooks.length];
  const body = config.bodies[seed % config.bodies.length];
  const cta = config.ctas[seed % config.ctas.length];
  const hashtags = config.hashtags.slice(0, 4);

  return {
    hook,
    body: body.replace("{ingredient}", extractIngredient(title)),
    cta,
    hashtags,
    categoryLabel: config.label,
    categoryEmoji: config.emoji,
  };
}
