/**
 * render.ts — Programmatic HyperFrames renderer.
 * Renders the product-ad composition with dynamic props.
 */

import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

interface RenderInput {
  image_url?: string;
  title?: string;
  category?: string;
  brand_name?: string;
  ad_copy?: string;
  hook_text?: string;
  cta_text?: string;
  output_path?: string;
  fps?: number;
  width?: number;
  height?: number;
}

interface RenderResult {
  success: boolean;
  videoPath?: string;
  framesRendered?: number;
  duration?: number;
  width?: number;
  height?: number;
  file_size?: number;
  error?: string;
}

// ============================================================================
// CATEGORY CONFIGURATION (mirrors adCopy.ts)
// ============================================================================

const CATEGORY_CONFIG: Record<string, {
  emoji: string;
  gradientStart: string;
  gradientEnd: string;
  hooks: string[];
  bodies: string[];
  ctas: string[];
}> = {
  beauty: {
    emoji: "✨",
    gradientStart: "#ff6b35",
    gradientEnd: "#f7931e",
    hooks: [
      "Wajah Glowing dalam 7 Hari!",
      "Rahasia Kulit Cantik Alami",
      "Skincare yang Bikin Kamu Pede",
    ],
    bodies: [
      "Formula aktif dengan Vitamin C dan Niacinamide",
      "Mencerahkan, melembapkan, melindungi",
      "Cocok untuk semua jenis kulit",
    ],
    ctas: ["Beli Sekarang", "Link di Bio! 🔗", "Cek Promo"],
  },
  fashion: {
    emoji: "👗",
    gradientStart: "#667eea",
    gradientEnd: "#764ba2",
    hooks: [
      "Tren Terbaru yang Wajib Punya!",
      "Style Kekinian, Harga Terjangkau",
      "Koleksi Eksklusif Edisi Terbatas",
    ],
    bodies: [
      "Desain premium dengan bahan berkualitas",
      "Tersedia dalam berbagai ukuran dan warna",
      "Garansi 100% uang kembali",
    ],
    ctas: ["Shop Now", "Link di Bio! 🔗", "Cek Koleksi"],
  },
  hobi: {
    emoji: "🎯",
    gradientStart: "#f093fb",
    gradientEnd: "#f5576c",
    hooks: [
      "Waktumu untuk Hobi!",
      "Kualitas Premium untuk Hobimu",
      "Dapatkan yang Terbaik untuk Hobimu",
    ],
    bodies: [
      "Produk berkualitas dengan harga bersaing",
      "Terbukti dan dipercaya oleh ribuan pelanggan",
      "Pengiriman cepat ke seluruh Indonesia",
    ],
    ctas: ["Beli Sekarang", "Link di Bio! 🔗", "Cek Detail"],
  },
  kesehatan: {
    emoji: "💪",
    gradientStart: "#4facfe",
    gradientEnd: "#00f2fe",
    hooks: [
      "Jaga Kesehatanmu Sekarang!",
      "Suplemen Berkualitas untuk Tubuh",
      "Investasi Terbaik untuk Kesehatan",
    ],
    bodies: [
      "Teruji klinis dan aman dikonsumsi",
      "Mengandung bahan alami berkualitas tinggi",
      "BPOM certified dan halal",
    ],
    ctas: ["Pesan Sekarang", "Link di Bio! 🔗", "Cek Manfaat"],
  },
  homeliving: {
    emoji: "🏠",
    gradientStart: "#43e97b",
    gradientEnd: "#38f9d7",
    hooks: [
      "Rumah Nyaman, Hidup Bahagia!",
      "Dekorasi Estetik dengan Harga Ramah",
      "Sentuhan Modern untuk Hunianmu",
    ],
    bodies: [
      "Material premium tahan lama",
      "Desain minimalis yang elegan",
      "Mudah dirawat dan dibersihkan",
    ],
    ctas: ["Beli Sekarang", "Link di Bio! 🔗", "Cek Katalog"],
  },
};

function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase().trim();
  if (CATEGORY_CONFIG[normalized]) return normalized;
  if (normalized.includes("kecantikan") || normalized.includes("beauty")) return "beauty";
  if (normalized.includes("fashion") || normalized.includes("pakaian")) return "fashion";
  if (normalized.includes("hobi") || normalized.includes("hobby")) return "hobi";
  if (normalized.includes("kesehatan") || normalized.includes("health")) return "kesehatan";
  if (normalized.includes("rumah") || normalized.includes("home")) return "homeliving";
  return "beauty";
}

function pickDeterministic(items: string[], seed: number): string {
  return items[seed % items.length];
}

function generateAdCopy(category: string, _title: string | undefined, seed: number = 0) {
  const cfg = CATEGORY_CONFIG[normalizeCategory(category)];
  return {
    hook: pickDeterministic(cfg.hooks, seed),
    body: pickDeterministic(cfg.bodies, seed + 1),
    cta: pickDeterministic(cfg.ctas, seed + 2),
    emoji: cfg.emoji,
    gradientStart: cfg.gradientStart,
    gradientEnd: cfg.gradientEnd,
  };
}

// ============================================================================
// COMPOSITION TEMPLATE
// ============================================================================

const COMPOSITION_TEMPLATE = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Product Ad</title>
    <style>
      :root {
        --color-bg: #0a0a0a;
        --color-text: #ffffff;
        --font-display: "Inter", system-ui, sans-serif;
      }

      * { margin: 0; padding: 0; box-sizing: border-box; }

      html, body {
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: var(--color-bg);
        font-family: var(--font-display);
        color: var(--color-text);
      }

      #main {
        position: relative;
        width: {{WIDTH}}px;
        height: {{HEIGHT}}px;
        overflow: hidden;
      }

      .scene-bg {
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity 0.5s ease;
      }

      .scene-bg.active { opacity: 1; }

      .hook-bg {
        background: linear-gradient(135deg, {{GRAD_START}} 0%, {{GRAD_END}} 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        padding: 80px;
        text-align: center;
      }

      .hook-text {
        font-size: 72px;
        font-weight: 800;
        line-height: 1.1;
        text-shadow: 0 4px 20px rgba(0,0,0,0.3);
        transform: translateY(40px);
        opacity: 0;
      }

      .hook-image {
        width: 600px;
        height: 600px;
        object-fit: cover;
        border-radius: 30px;
        margin-top: 60px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        transform: scale(0.8);
        opacity: 0;
      }

      .showcase-bg {
        background: linear-gradient(180deg, {{GRAD_START}} 0%, {{GRAD_END}} 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px;
        text-align: center;
      }

      .showcase-image {
        width: 700px;
        height: 700px;
        object-fit: cover;
        border-radius: 40px;
        box-shadow: 0 30px 80px rgba(0,0,0,0.5);
        transform: scale(0.7) rotate(-5deg);
        opacity: 0;
      }

      .showcase-title {
        font-size: 64px;
        font-weight: 700;
        margin-top: 60px;
        line-height: 1.2;
        transform: translateY(30px);
        opacity: 0;
      }

      .showcase-copy {
        font-size: 36px;
        margin-top: 30px;
        opacity: 0.85;
        max-width: 800px;
        line-height: 1.4;
        transform: translateY(20px);
        opacity: 0;
      }

      .showcase-category {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-size: 28px;
        margin-top: 40px;
        padding: 16px 32px;
        background: rgba(255,255,255,0.15);
        border-radius: 50px;
        backdrop-filter: blur(10px);
        transform: translateY(20px);
        opacity: 0;
      }

      .cta-bg {
        background: linear-gradient(135deg, {{GRAD_END}} 0%, {{GRAD_START}} 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px;
        text-align: center;
      }

      .cta-badge {
        font-size: 120px;
        margin-bottom: 40px;
        transform: scale(0);
      }

      .cta-title {
        font-size: 80px;
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 40px;
        transform: translateY(40px);
        opacity: 0;
      }

      .cta-button {
        display: inline-block;
        font-size: 42px;
        font-weight: 700;
        padding: 28px 64px;
        background: #ffffff;
        color: #000000;
        border-radius: 60px;
        text-decoration: none;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        transform: translateY(30px) scale(0.9);
        opacity: 0;
      }

      .cta-brand {
        font-size: 28px;
        margin-top: 60px;
        opacity: 0.7;
        transform: translateY(20px);
        opacity: 0;
      }

      .animate-in {
        animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .animate-scale {
        animation: scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .animate-bounce {
        animation: bounceIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes fadeInUp {
        from { transform: translateY(40px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      @keyframes scaleIn {
        from { transform: scale(0.7) rotate(-5deg); opacity: 0; }
        to { transform: scale(1) rotate(0deg); opacity: 1; }
      }

      @keyframes bounceIn {
        0% { transform: scale(0); opacity: 0; }
        60% { transform: scale(1.1); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }

      .delay-1 { animation-delay: 0.1s; }
      .delay-2 { animation-delay: 0.3s; }
      .delay-3 { animation-delay: 0.5s; }
      .delay-4 { animation-delay: 0.7s; }
      .delay-5 { animation-delay: 0.9s; }
    </style>
  </head>
  <body>
    <div
      id="main"
      data-composition-id="product-ad"
      data-start="0"
      data-duration="15"
      data-width="{{WIDTH}}"
      data-height="{{HEIGHT}}"
      data-fps="{{FPS}}"
    >
      <!-- Scene 1: Hook (0-5s) -->
      <div
        class="scene-bg hook-bg"
        data-start="0"
        data-duration="5"
        data-track-index="0"
      >
        <h1 class="hook-text animate-in" data-start="0.5" data-duration="4">
          {{HOOK_TEXT}}
        </h1>
        <img
          class="hook-image animate-scale delay-2"
          data-start="1"
          data-duration="3.5"
          src="{{IMAGE_URL}}"
          alt="Product"
        />
      </div>

      <!-- Scene 2: Showcase (5-10s) -->
      <div
        class="scene-bg showcase-bg"
        data-start="5"
        data-duration="5"
        data-track-index="1"
      >
        <img
          class="showcase-image animate-scale"
          data-start="5.2"
          data-duration="4.5"
          src="{{IMAGE_URL}}"
          alt="Product"
        />
        <h2 class="showcase-title animate-in delay-2" data-start="5.5" data-duration="4">
          {{TITLE}}
        </h2>
        <p class="showcase-copy animate-in delay-3" data-start="6" data-duration="3.5">
          {{AD_COPY}}
        </p>
        <span class="showcase-category animate-in delay-4" data-start="6.5" data-duration="3">
          <span class="category-emoji">{{EMOJI}}</span>
          <span class="category-label">{{CATEGORY_LABEL}}</span>
        </span>
      </div>

      <!-- Scene 3: CTA (10-15s) -->
      <div
        class="scene-bg cta-bg"
        data-start="10"
        data-duration="5"
        data-track-index="2"
      >
        <div class="cta-badge animate-bounce" data-start="10.2" data-duration="4.5">
          🛒
        </div>
        <h2 class="cta-title animate-in delay-2" data-start="10.5" data-duration="4">
          {{CTA_TEXT}}
        </h2>
        <a class="cta-button animate-scale delay-3" data-start="11" data-duration="3.5">
          Beli Sekarang
        </a>
        <p class="cta-brand animate-in delay-4" data-start="11.5" data-duration="3">
          {{BRAND_NAME}}
        </p>
      </div>
    </div>
  </body>
</html>
`;

// ============================================================================
// RENDER FUNCTION
// ============================================================================

async function downloadImage(url: string, dest: string): Promise<string> {
  if (!url) return "";
  if (url.startsWith("/")) return url;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
  return dest;
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr, stdout }));
  });
}

async function renderProductAd(input: RenderInput): Promise<RenderResult> {
  const fps = input.fps ?? 30;
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;
  const duration = 15;
  const totalFrames = fps * duration;

  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const tmpDir = path.join(projectRoot, "data", "hyperframes-tmp");
  const outputDir = path.join(projectRoot, "data", "hyperframes");

  await mkdir(tmpDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const seed = Math.floor(Math.random() * 1000);
  const adCopy = generateAdCopy(input.category || "beauty", input.title, seed);

  let localImagePath = "";
  if (input.image_url) {
    const ext = path.extname(new URL(input.image_url).pathname) || ".jpg";
    localImagePath = path.join(tmpDir, `image-${seed}${ext}`);
    await downloadImage(input.image_url, localImagePath);
  }

  // Build composition HTML
  let html = COMPOSITION_TEMPLATE;
  html = html.split("{{WIDTH}}").join(String(width));
  html = html.split("{{HEIGHT}}").join(String(height));
  html = html.split("{{FPS}}").join(String(fps));
  html = html.split("{{GRAD_START}}").join(adCopy.gradientStart);
  html = html.split("{{GRAD_END}}").join(adCopy.gradientEnd);
  html = html.split("{{HOOK_TEXT}}").join(input.hook_text || adCopy.hook);
  html = html.split("{{TITLE}}").join(input.title || "Produk Terbaru");
  html = html.split("{{AD_COPY}}").join(input.ad_copy || adCopy.body);
  html = html.split("{{CTA_TEXT}}").join(input.cta_text || adCopy.cta);
  html = html.split("{{EMOJI}}").join(adCopy.emoji);
  html = html.split("{{CATEGORY_LABEL}}").join((input.category || "beauty").toUpperCase());
  html = html.split("{{BRAND_NAME}}").join(input.brand_name || "Shopee Affiliate");
  html = html.split("{{IMAGE_URL}}").join(localImagePath || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23333'%3E%3Crect width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='24'%3EProduct%3C/text%3E%3C/svg%3E");

  const projDir = path.join(tmpDir, `proj-${seed}`);
  await mkdir(projDir, { recursive: true });
  await writeFile(path.join(projDir, "index.html"), html);

  const outputPath = input.output_path || path.join(outputDir, `product-ad-${seed}.mp4`);
  const hfBin = path.join(__dirname, "..", "node_modules", ".bin", "hyperframes");
  const result = await runCommand(hfBin, ["render", projDir, "--output", outputPath, "--fps", String(fps)], __dirname);

  if (result.exitCode !== 0) {
    return { success: false, error: `HyperFrames render failed: ${result.stderr || "unknown error"}` };
  }

  const statResult = await runCommand("stat", ["-c", "%s", outputPath], __dirname);
  const fileSize = parseInt(statResult.stdout?.toString().trim() || "0", 10) || 0;

  return {
    success: true,
    videoPath: outputPath,
    framesRendered: totalFrames,
    duration,
    width,
    height,
    file_size: fileSize,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let input: RenderInput = {};

  if (args.length > 0) {
    try {
      input = JSON.parse(args[0]);
    } catch {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (raw) {
        input = JSON.parse(raw);
      }
    }
  }

  const result = await renderProductAd(input);
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: String(err) }));
  process.exit(1);
});
