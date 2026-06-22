/**
 * Thumbnail Service (FASE 2D)
 *
 * Generates YouTube thumbnails via AI image gen.
 * Style rules per niche vertical. All config from env.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { getMinThumbWidth, getMinThumbHeight } from "@/config/youtube.config";
import type { NicheVertical } from "@/config/youtube.config";

interface ThumbnailResult {
  thumbnailPath: string;
  width: number;
  height: number;
}

const STYLE_BY_NICHE: Record<string, { style: string; textFormula: string; colors: string }> = {
  folklore_history: { style: "clickbait expressive face", textFormula: "RAHASIA/TERSEMBUNYI + entity", colors: "dark bg, red/yellow accent" },
  music: { style: "minimalist genre indicator", textFormula: "GENRE — MOOD/DURATION", colors: "genre-specific palette" },
  true_crime: { style: "dark dramatic suspense", textFormula: "UNSOLVED/CASE NAME", colors: "dark desaturated, red accent" },
  science_nature: { style: "wonder awe", textFormula: "phenomenon name or question", colors: "blue/green for nature, dark for space" },
  educational: { style: "clean informative", textFormula: "topic name", colors: "neutral professional" },
};

export async function generateThumbnail(
  title: string,
  toneVariant: string,
  nicheVertical: NicheVertical,
  outputPath: string,
): Promise<ThumbnailResult> {
  const style = STYLE_BY_NICHE[nicheVertical] || STYLE_BY_NICHE.educational;
  const width = getMinThumbWidth();
  const height = getMinThumbHeight();

  const apiKey = getConfig().OPENAI_API_KEY || "";
  if (!apiKey) {
    logger.warn("[thumbnail] OPENAI_API_KEY not configured — generating placeholder");
    await generatePlaceholder(outputPath, title, width, height);
    return { thumbnailPath: outputPath, width, height };
  }

  try {
    const axios = (await import("axios")).default;
    const prompt = `YouTube thumbnail, ${style.style}, ${toneVariant} mood. Title text: "${title}". ${style.colors}. High contrast, readable at small sizes. ${width}x${height}px.`;

    const res = await axios.post(
      "https://api.openai.com/v1/images/generations",
      { model: "dall-e-3", prompt, size: "1792x1024", quality: "standard", n: 1 },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
    );

    const imageUrl = res.data.data[0].url;
    const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
    require("fs").writeFileSync(outputPath, imgRes.data);

    logger.info(`[thumbnail] Generated thumbnail for "${title}"`);
    return { thumbnailPath: outputPath, width, height };
  } catch (err) {
    logger.error(`[thumbnail] Generation failed: ${err}`);
    await generatePlaceholder(outputPath, title, width, height);
    return { thumbnailPath: outputPath, width, height };
  }
}

async function generatePlaceholder(outputPath: string, title: string, width: number, height: number): Promise<void> {
  try {
    await (promisify(require("child_process").execFile))("ffmpeg", [
      "-y", "-f", "lavfi", "-i",
      `color=c=0x1a1a2e:s=${width}x${height}:d=1`,
      "-vf", `drawtext=text='${title.substring(0, 30)}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-frames:v", "1", outputPath,
    ]);
  } catch {
    require("fs").writeFileSync(outputPath, Buffer.alloc(0));
  }
}

const { promisify } = require("util");
