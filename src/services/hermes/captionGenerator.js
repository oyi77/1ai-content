/**
 * HERMES Content Generator — Caption & Hashtag Engine
 * Lives in 1ai-content: AI-powered content creation.
 * 
 * This module handles:
 * - Caption generation (20+ CTA variations per category)
 * - Hashtag generation (category-specific, rotated)
 * - Content validation
 */

// ── CTA Variations (keyed by sheet category) ────────────────────

const CTA_VARIATIONS = {
  'fashion': [
    '✨ Lagi cari outfit kece? Koleksi terbaru sudah ready nih!\n👉 {AFFILIATE_LINK}',
    '🔥 Outfit ini lagi viral! Banyak yang udah pada beli lho.\n👉 {AFFILIATE_LINK}',
    '💕 Cocok banget buat daily outfit kamu!\n👉 {AFFILIATE_LINK}',
    '👀 Lihat detail produknya di sini ya:\n👉 {AFFILIATE_LINK}',
    '🛒 Klik aja langsung, lagi diskon besar-besaran!\n👉 {AFFILIATE_LINK}',
    '✨ Fashion kekinian yang wajib kamu punya!\n👉 {AFFILIATE_LINK}',
    '💫 Bisa jadi ini yang sedang kamu cari:\n👉 {AFFILIATE_LINK}',
    '🌟 Simpan dulu, siapa tahu nanti kepakai:\n👉 {AFFILIATE_LINK}',
    '🔥 Produk paling dicari minggu ini!\n👉 {AFFILIATE_LINK}',
    '✨ Tampil beda dengan koleksi terbaru:\n👉 {AFFILIATE_LINK}',
    '💖 Recommended banget! Worth it untuk harga segini.\n👉 {AFFILIATE_LINK}',
    '🛍️ Belanja hemat, tetap stylish!\n👉 {AFFILIATE_LINK}',
    '✨ Lagi trending nih, buruan sebelum kehabisan!\n👉 {AFFILIATE_LINK}',
    '👗 Outfit impian kamu ada di sini:\n👉 {AFFILIATE_LINK}',
    '🔥 Jangan sampai kehabisan, stok terbatas!\n👉 {AFFILIATE_LINK}',
  ],
  'fashion muslim': [
    '✨ Koleksi fashion muslim terbaru yang lagi hits!\n👉 {AFFILIATE_LINK}',
    '🕌 Tampil syari tetap stylish dan kekinian.\n👉 {AFFILIATE_LINK}',
    '💕 Outfit muslimah yang cocok untuk segala acara.\n👉 {AFFILIATE_LINK}',
    '🔥 Banyak yang udah pakai, kamu kapan?\n👉 {AFFILIATE_LINK}',
    '✨ Modest fashion yang bikin pede setiap hari.\n👉 {AFFILIATE_LINK}',
    '🌟 Rekomendasi outfit muslim terbaik:\n👉 {AFFILIATE_LINK}',
    '💫 Simpel, elegan, dan tetap sopan.\n👉 {AFFILIATE_LINK}',
    '🛒 Belanja fashion muslim hemat di sini:\n👉 {AFFILIATE_LINK}',
    '✨ Inspirasi hijab outfit untuk kamu:\n👉 {AFFILIATE_LINK}',
    '🔥 Produk paling dicari di kategori fashion muslim!\n👉 {AFFILIATE_LINK}',
    '💖 Kualitas premium, harga terjangkau.\n👉 {AFFILIATE_LINK}',
    '✨ Tampil percaya diri dengan koleksi terbaru.\n👉 {AFFILIATE_LINK}',
    '🕌 Fashion muslim yang lagi trending:\n👉 {AFFILIATE_LINK}',
    '💕 Cocok untuk sehari-hari dan acara spesial.\n👉 {AFFILIATE_LINK}',
    '✨ Jangan sampai kehabisan, stok terbatas!\n👉 {AFFILIATE_LINK}',
  ],
  'kesehatan': [
    '💊 Produk kesehatan yang lagi banyak dicari:\n👉 {AFFILIATE_LINK}',
    '🌿 Bahan alami, aman dikonsumsi setiap hari.\n👉 {AFFILIATE_LINK}',
    '✨ Investasi kesehatan terbaik untuk kamu!\n👉 {AFFILIATE_LINK}',
    '🏥 Sudah teruji dan banyak review positif.\n👉 {AFFILIATE_LINK}',
    '💪 Mulai hidup sehat dari sekarang!\n👉 {AFFILIATE_LINK}',
    '🌱 Solusi kesehatan alami yang terpercaya:\n👉 {AFFILIATE_LINK}',
    '✨ Rekomendasi dari para ahli kesehatan.\n👉 {AFFILIATE_LINK}',
    '💚 Jaga kesehatanmu dengan produk terbaik:\n👉 {AFFILIATE_LINK}',
    '🔬 Sudah BPOM dan bersertifikat.\n👉 {AFFILIATE_LINK}',
    '✨ Banyak yang sudah merasakan manfaatnya!\n👉 {AFFILIATE_LINK}',
    '🌿 Herbal alami untuk kesehatan optimal.\n👉 {AFFILIATE_LINK}',
    '💊 Promo spesial, jangan sampai kelewatan!\n👉 {AFFILIATE_LINK}',
    '✨ Tubuh sehat, hidup bahagia.\n👉 {AFFILIATE_LINK}',
    '🏥 Konsultasi gratis sebelum beli!\n👉 {AFFILIATE_LINK}',
    '💪 Stamina prima setiap hari:\n👉 {AFFILIATE_LINK}',
  ],
  'home living': [
    '🏠 Rumah makin aesthetic dengan koleksi ini!\n👉 {AFFILIATE_LINK}',
    '✨ Ide dekorasi rumah yang lagi trending:\n👉 {AFFILIATE_LINK}',
    '🏡 Buat rumah jadi lebih nyaman dan cantik.\n👉 {AFFILIATE_LINK}',
    '🛋️ Furniture dan aksesoris rumah terbaik:\n👉 {AFFILIATE_LINK}',
    '✨ Transformasi rumah kamu jadi lebih modern!\n👉 {AFFILIATE_LINK}',
    '🏠 Peralatan rumah tangga yang wajib punya:\n👉 {AFFILIATE_LINK}',
    '✨ Rumah rapi, hati senang!\n👉 {AFFILIATE_LINK}',
    '🏡 Inspirasi desain interior terbaru:\n👉 {AFFILIATE_LINK}',
    '✨ Quality time di rumah makin berkualitas!\n👉 {AFFILIATE_LINK}',
    '🏠 Belanja perabotan hemat dan berkualitas:\n👉 {AFFILIATE_LINK}',
    '✨ Rumah impian dimulai dari sini.\n👉 {AFFILIATE_LINK}',
    '🏡 Investasi terbaik untuk kenyamanan keluarga.\n👉 {AFFILIATE_LINK}',
    '✨ Ide kreatif untuk ruangan kecil:\n👉 {AFFILIATE_LINK}',
    '🏠 Promo spesial perabotan rumah tangga!\n👉 {AFFILIATE_LINK}',
    '✨ Solusi cerdas untuk rumah modern:\n👉 {AFFILIATE_LINK}',
  ],
  '_default': [
    '✨ Cek produknya di sini 👇\n👉 {AFFILIATE_LINK}',
    '🔥 Produk viral yang lagi banyak dicari:\n👉 {AFFILIATE_LINK}',
    '💫 Bisa jadi ini yang sedang kamu butuhkan:\n👉 {AFFILIATE_LINK}',
    '🌟 Simpan dulu, siapa tahu nanti kepakai:\n👉 {AFFILIATE_LINK}',
    '👉 Klik aja langsung, lagi diskon!\n👉 {AFFILIATE_LINK}',
    '✨ Kami hanya ingin memberikan rekomendasi produk yang bermanfaat dan menarik untuk para pembaca. ❤️\n👉 {AFFILIATE_LINK}',
    '🔥 Jangan sampai kehabisan, stok terbatas!\n👉 {AFFILIATE_LINK}',
    '✨ Worth it banget! Banyak review positif.\n👉 {AFFILIATE_LINK}',
    '💫 Belanja cerdas, hemat, dan berkualitas.\n👉 {AFFILIATE_LINK}',
    '✨ Produk terbaik dengan harga terjangkau:\n👉 {AFFILIATE_LINK}',
    '🔥 Lagi diskon besar-besaran nih!\n👉 {AFFILIATE_LINK}',
    '✨ Recommended banget buat kamu!\n👉 {AFFILIATE_LINK}',
    '💫 Buruan sebelum promo habis!\n👉 {AFFILIATE_LINK}',
    '✨ Tidak akan menyesal beli ini.\n👉 {AFFILIATE_LINK}',
    '🔥 Best seller minggu ini!\n👉 {AFFILIATE_LINK}',
  ],
};

// ── Hashtag Pool ─────────────────────────────────────────────────

const HASHTAG_POOL = {
  'fashion': {
    general: ['#fashion', '#style', '#ootd', '#fashioninspo', '#trendy'],
    category: ['#fashionkekinian', '#fashionwanita', '#ootdhijab', '#hijabstyle', '#outfitinspiration', '#belanjamurah', '#racunfashion', '#fashionindonesia'],
    trending: ['#trending2025', '#viral'],
  },
  'fashion muslim': {
    general: ['#fashionmuslim', '#hijab', '#muslimah'],
    category: ['#hijabstyle', '#hijabfashion', '#muslimfashion', '#ootdhijab', '#modestfashion', '#kerudung', '#jilbab', '#hijabers'],
    trending: ['#trending2025', '#viral'],
  },
  'kesehatan': {
    general: ['#health', '#wellness', '#healthy'],
    category: ['#hidupsehat', '#tipskesehatan', '#kesehatanalami', '#gayahidupsehat', '#suplemen', '#herbal', '#obatherbal', '#sehatalami'],
    trending: ['#trending2025', '#viral'],
  },
  'home living': {
    general: ['#homeliving', '#home', '#decor'],
    category: ['#rumahminimalis', '#peralatandapur', '#perlengkapanrumah', '#idekreatif', '#alatrumah', '#dekorasirumah', '#interiordesign', '#rumahtangga'],
    trending: ['#trending2025', '#viral'],
  },
  '_default': {
    general: ['#shopping', '#deals', '#recommendation'],
    category: ['#belanjamurah', '#promo', '#diskon', '#rekomendasi', '#viral', '#trending', '#bestseller', '#shopee'],
    trending: ['#trending2025', '#viral'],
  },
};

// ── Normalize Category ───────────────────────────────────────────

function normalizeCategory(raw) {
  if (!raw) return 'uncategorized';
  return raw.trim().toLowerCase();
}

// ── Generate Hashtags ────────────────────────────────────────────

function generateHashtags(category, count = 10) {
  const key = normalizeCategory(category);
  const pool = HASHTAG_POOL[key] || HASHTAG_POOL['_default'];
  const result = [
    ...pool.general.sort(() => Math.random() - 0.5).slice(0, 3),
    ...pool.category.sort(() => Math.random() - 0.5).slice(0, 5),
    ...pool.trending.sort(() => Math.random() - 0.5).slice(0, 2),
  ];
  return result.join(' ');
}

// ── Generate Caption ─────────────────────────────────────────────

function generateCaption(category, affiliateLink) {
  const key = normalizeCategory(category);
  const variations = CTA_VARIATIONS[key] || CTA_VARIATIONS['_default'];
  const cta = variations[Math.floor(Math.random() * variations.length)];
  const hashtags = generateHashtags(key, 10);
  return `${cta.replace('{AFFILIATE_LINK}', affiliateLink)}\n\n${hashtags}`;
}

// ── Generate Multiple Captions ───────────────────────────────────

function generateCaptionBatch(category, affiliateLink, count = 5) {
  const captions = [];
  for (let i = 0; i < Math.min(count, 20); i++) {
    captions.push(generateCaption(category, affiliateLink));
  }
  return captions;
}

// ── Get Categories ───────────────────────────────────────────────

function getCategories() {
  return Object.keys(CTA_VARIATIONS).filter(k => k !== '_default');
}

// ── Exports ──────────────────────────────────────────────────────

module.exports = {
  CTA_VARIATIONS,
  HASHTAG_POOL,
  normalizeCategory,
  generateHashtags,
  generateCaption,
  generateCaptionBatch,
  getCategories,
};
