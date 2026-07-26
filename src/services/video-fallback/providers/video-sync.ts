/**
 * Video Sync Providers — synchronous providers that don't need polling.
 * Split from video-fallback/providers.ts to reduce file size.
 */

import axios from "axios";
import * as fs from "fs";
import { getConfig } from "@/config/env";
import type { VideoFallbackResult } from "../../video-fallback.service";
import { ProviderError } from "@/utils/app-errors";

interface VideoFallbackParams {
  prompt: string;
  duration: number;
  aspectRatio: string;
  style?: string;
  niche?: string;
  referenceImage?: string | null;
  _forceProvider?: string;
}

function readRefImageBase64(refPath: string): string | null {
  if (refPath && fs.existsSync(refPath) && fs.statSync(refPath).size > 0) {
    return `data:image/jpeg;base64,${fs.readFileSync(refPath).toString("base64")}`;
  }
  return null;
}

async function generateViaLaoZhang(
  params: VideoFallbackParams,
): Promise<VideoFallbackResult> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: params.prompt },
  ];

  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) {
      content.push({ type: "image_url", image_url: { url: imgBase64 } });
    }
  }

  let model = "sora_video2";
  if (params.aspectRatio === "16:9" || params.aspectRatio === "landscape") {
    model = "sora_video2-landscape";
  }

  const response = await axios.post(
    "https://api.laozhang.ai/v1/chat/completions",
    {
      model,
      messages: [{ role: "user", content }],
      stream: false,
      max_tokens: params.duration * 30,
    },
    {
      headers: {
        Authorization: `Bearer ${getConfig().LAOZHANG_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    },
  );

  const choices = response.data?.choices;
  if (!choices?.length) throw new ProviderError("laozhang", "No choices in response");

  const messageContent = choices[0]?.message?.content || "";
  const urlMatch =
    typeof messageContent === "string"
      ? messageContent.match(/https?:\/\/[^\s"'<>]+/)
      : null;

  if (!urlMatch) {
    throw new ProviderError("laozhang", `No video URL in response: ${String(messageContent).substring(0, 200)}`);
  }

  return { success: true, videoUrl: urlMatch[0], provider: "laozhang" };
}

export { generateViaLaoZhang };