/**
 * render.ts — Programmatic Remotion renderer.
 *
 * Usage:
 *   node --import tsx src/render.ts '{"imageUrl":"...","title":"...","category":"beauty",...}'
 *   node --import tsx src/render.ts --input /path/to/input.json --output /path/to/output.mp4
 *
 * Called by the Python API endpoint to render product ad videos.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { generateDeterministicAdCopy } from "./adCopy";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

interface RenderInput {
  imageUrl: string;
  title: string;
  category: string;
  affiliateLink?: string;
  brandName?: string;
  adCopy?: string;
  hookText?: string;
  ctaText?: string;
  ctaTextOverride?: string;
  outputPath?: string;
}

interface RenderResult {
  file_path: string;
  file_size: number;
  duration: number;
  width: number;
  height: number;
}

// ============================================================================
// IMAGE PREPARATION
// ============================================================================

/**
 * Prepare image for Remotion rendering.
 * - Local files: copied to public/ directory, returns filename for staticFile()
 * - HTTP/HTTPS URLs: downloaded to public/, returns filename for staticFile()
 *
 * Remotion's Img component works best with staticFile() references to the public/ dir.
 */
async function prepareImage(
  imageUrl: string,
  publicDir: string,
): Promise<string> {
  const ext = path.extname(imageUrl.split("?")[0]) || ".jpg";
  const filename = `product-${randomUUID().slice(0, 8)}${ext}`;
  const dest = path.join(publicDir, filename);

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    // Download remote image to public/
    console.log(`[Remotion] Downloading image: ${imageUrl.slice(0, 80)}...`);
    try {
      const resp = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.tiktok.com/",
        },
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(
        `[Remotion] Downloaded to public/${filename} (${(buffer.length / 1024).toFixed(1)} KB)`,
      );
    } catch (err) {
      console.warn(
        `[Remotion] Failed to download image: ${err}. Using URL directly.`,
      );
      return imageUrl; // Fall back to direct URL
    }
  } else {
    // Local file — copy to public/
    const resolved = path.resolve(imageUrl);
    if (!fs.existsSync(resolved)) {
      console.warn(`[Remotion] Image not found: ${resolved}`);
      return imageUrl;
    }
    fs.copyFileSync(resolved, dest);
    console.log(`[Remotion] Copied to public/${filename}`);
  }

  return filename;
}

// ============================================================================
// RENDER FUNCTION
// ============================================================================

async function renderProductAd(input: RenderInput): Promise<RenderResult> {
  const entryPoint = path.resolve(__dirname, "./index.tsx");
  const rendersDir = path.resolve(__dirname, "../renders");
  const cacheDir = path.join(rendersDir, "cache");
  const outputDir = path.join(rendersDir, "videos");
  const buildDir = path.join(rendersDir, "build");
  const bundlesDir = path.join(rendersDir, "bundles");

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(bundlesDir, { recursive: true });

  // Prepare image for rendering
  const preparedImage = await prepareImage(input.imageUrl, cacheDir);

  // Generate deterministic ad copy
  const adCopyData = generateDeterministicAdCopy(
    input.category,
    input.title,
    0,
  );

  const outputFilename =
    input.outputPath ??
    path.join(outputDir, `product-ad-${input.category}-${Date.now()}.mp4`);

  console.log(`[Remotion] Bundling project...`);
  const bundleLocation = await bundle({
    entryPoint,
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        console.log(`[Remotion] Bundle progress: ${progress}%`);
      }
    },
  });

  console.log(`[Remotion] Selecting composition...`);
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "ProductAd",
    inputProps: {
      imageUrl: preparedImage,
      title: input.title,
      category: input.category,
      affiliateLink: input.affiliateLink ?? "",
      brandName: input.brandName ?? "Shopee Affiliate",
      adCopy: input.adCopy ?? adCopyData.body,
      hookText: input.hookText ?? adCopyData.hook,
      ctaText: input.ctaTextOverride ?? input.ctaText ?? adCopyData.cta,
      categoryLabel: adCopyData.categoryLabel,
      categoryEmoji: adCopyData.categoryEmoji,
    },
  });

  console.log(
    `[Remotion] Rendering ${composition.width}×${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames...`,
  );

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputFilename,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 10 === 0) {
        console.log(`[Remotion] Render progress: ${pct}%`);
      }
    },
  });

  const stats = fs.statSync(outputFilename);
  console.log(
    `[Remotion] Done! ${outputFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
  );

  return {
    file_path: outputFilename,
    file_size: stats.size,
    duration: composition.durationInFrames / composition.fps,
    width: composition.width,
    height: composition.height,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let input: RenderInput;

  if (args[0] === "--input" && args[1]) {
    const inputPath = args[1];
    console.log(`[Remotion] Reading input from ${inputPath}`);
    input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } else if (args[0] && !args[0].startsWith("--")) {
    input = JSON.parse(args[0]);
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    if (!raw) {
      console.error(
        "Usage: node --import tsx src/render.ts '<json>' | --input file.json | < stdin",
      );
      process.exit(1);
    }
    input = JSON.parse(raw);
  }

  if (!input.imageUrl || !input.title || !input.category) {
    console.error("Missing required fields: imageUrl, title, category");
    process.exit(1);
  }

  const result = await renderProductAd(input);
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error("[Remotion] Fatal error:", err);
  process.exit(1);
});
