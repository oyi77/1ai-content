/**
 * Image Text-to-Image Providers
 *
 * All providers that generate images from text prompts only (no reference image).
 * Split from image/providers.ts to reduce file size and enable per-provider testing.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { ProviderError, ProviderTimeoutError, AllProvidersFailedError } from "@/utils/app-errors";
import axios from "axios";
import FormData from "form-data";
import type { ImageGenerationParams, ImageGenerationResult } from "../../image.service";

// ── Shared Constants & Helpers ─────────────────────────────────────────────

export const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

export type ProviderFn = (
  prompt: string,
  params: ImageGenerationParams,
) => Promise<ImageGenerationResult>;

/** Get target width/height from params or fall back to aspect-ratio lookup */
export function getDims(params: ImageGenerationParams): { width: number; height: number } {
  const p = params as unknown as Record<string, unknown>;
  const w = p._targetWidth as number | undefined;
  const h = p._targetHeight as number | undefined;
  if (w && h) return { width: w, height: h };

  const map: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1344, height: 768 },
    "9:16": { width: 768, height: 1344 },
    "4:5": { width: 896, height: 1152 },
    "5:4": { width: 1152, height: 896 },
  };
  return map[params.aspectRatio || "1:1"] || { width: 1024, height: 1024 };
}

/** Get target dimensions accounting for resolution tier */
export function getImageDimensions(
  aspectRatio?: string,
  resolution?: string,
): { width: number; height: number } {
  const base = getDims({ aspectRatio } as ImageGenerationParams);
  if (resolution === "ultra") {
    return { width: Math.round(base.width * 1.5), height: Math.round(base.height * 1.5) };
  }
  if (resolution === "hd") {
    return { width: Math.round(base.width * 1.25), height: Math.round(base.height * 1.25) };
  }
  return base;
}

export function mapAspectRatio(ratio?: string): string {
  const map: Record<string, string> = {
    "1:1": "square",
    "16:9": "landscape",
    "9:16": "portrait",
  };
  return map[ratio || "1:1"] || "square";
}

// ── Provider Implementations ────────────────────────────────────────────────

export async function generateViaGeminiGen(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("model", "nano-banana-pro");
  formData.append("style", "Photorealistic");
  formData.append("output_format", "jpeg");
  formData.append("resolution", "1K");
  formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio));

  const response = await axios.post(`${GEMINIGEN_API_BASE}/generate_image`, formData, {
    headers: {
      "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
      ...formData.getHeaders(),
    },
    timeout: 60000,
  });

  const { uuid, status } = response.data;
  if (status === 2 || status === 1) {
    for (let i = 0; i < 30; i++) {
      const poll = await axios.get(`${GEMINIGEN_API_BASE}/history/${uuid}`, {
        headers: { "x-api-key": getConfig().GEMINIGEN_API_KEY || "" },
        timeout: 10000,
      });
      const { status: s, generated_image, thumbnail_url } = poll.data;
      if (s === 2 && generated_image?.length > 0) {
        return {
          success: true,
          imageUrl: generated_image[0].image_url || "",
          thumbnailUrl: thumbnail_url || generated_image[0].thumbnails?.[0]?.url || "",
          provider: "geminigen",
          mode: "text2img",
        };
      }
      if (s === 3) throw new ProviderError("GeminiGen", "generation failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new ProviderTimeoutError("GeminiGen", 0);
  }
  throw new ProviderError("GeminiGen", `unexpected status ${status}`);
}

export async function generateViaSiliconFlow(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://api.siliconflow.cn/v1/images/generations",
    {
      model: "black-forest-labs/FLUX.1-schnell",
      prompt,
      image_size: `${getDims(params).width}x${getDims(params).height}`,
      num_inference_steps: 20,
    },
    {
      headers: {
        Authorization: `Bearer ${getConfig().SILICONFLOW_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    },
  );

  const images = response.data?.images || response.data?.data;
  if (images?.length > 0) {
    const url = images[0].url || images[0].b64_json;
    if (url) {
      const imageUrl =
        url.startsWith("data:") || url.startsWith("http") ? url : `data:image/png;base64,${url}`;
      return { success: true, imageUrl, provider: "siliconflow", mode: "text2img" };
    }
  }
  throw new ProviderError("SiliconFlow", "no images returned");
}

export async function generateViaNvidia(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
    {
      text_prompts: [{ text: prompt, weight: 1 }],
      cfg_scale: 7,
      height: getDims(params).height,
      width: getDims(params).width,
      samples: 1,
      steps: 30,
    },
    {
      headers: {
        Authorization: `Bearer ${getConfig().NVIDIA_API_KEY || ""}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
    },
  );

  const artifacts = response.data?.artifacts;
  if (artifacts?.length > 0 && artifacts[0].base64) {
    return {
      success: true,
      imageUrl: `data:image/png;base64,${artifacts[0].base64}`,
      provider: "nvidia",
      mode: "text2img",
    };
  }
  throw new ProviderError("NVIDIA", "no artifacts returned");
}

export async function generateViaGemini(
  prompt: string,
  _params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${getConfig().GEMINI_API_KEY || ""}`,
    {
      contents: [{ parts: [{ text: `Generate a high-quality image: ${prompt}` }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    },
    { headers: { "Content-Type": "application/json" }, timeout: 60000 },
  );

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return {
        success: true,
        imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        provider: "gemini",
        mode: "text2img",
      };
    }
  }
  throw new ProviderError("Gemini", "no image in response");
}

export async function generateViaLaoZhangGptImage(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const models = ["dall-e-3", "gpt-image-1"];
  const d = getDims(params);
  const size = `${d.width}x${d.height}`;

  for (const model of models) {
    try {
      const response = await axios.post(
        "https://api.laozhang.ai/v1/images/generations",
        { model, prompt, n: 1, size },
        {
          headers: {
            Authorization: `Bearer ${getConfig().LAOZHANG_API_KEY || ""}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      );

      const data = response.data?.data;
      if (data?.length > 0) {
        const url =
          data[0].url || (data[0].b64_json ? `data:image/png;base64,${data[0].b64_json}` : null);
        if (url)
          return {
            success: true,
            imageUrl: url,
            provider: `laozhang_${model.replace(/-/g, "_")}`,
            mode: "text2img",
          };
      }
    } catch (err) {
      logger.warn(`LaoZhang ${model} failed: ${(err as any).response?.status || (err as Error).message}`);
    }
  }
  throw new AllProvidersFailedError("LaoZhang text2img");
}

export async function generateViaTogether(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://api.together.xyz/v1/images/generations",
    {
      model: "black-forest-labs/FLUX.1-schnell",
      prompt,
      n: 1,
      steps: 4,
      width: getDims(params).width,
      height: getDims(params).height,
    },
    {
      headers: {
        Authorization: `Bearer ${getConfig().TOGETHER_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    },
  );

  const data = response.data?.data;
  if (data?.length > 0) {
    const url = data[0].url || (data[0].b64_json ? `data:image/png;base64,${data[0].b64_json}` : null);
    if (url) return { success: true, imageUrl: url, provider: "together_schnell", mode: "text2img" };
  }
  throw new ProviderError("Together.ai", "no image returned");
}

export async function generateViaRunwareImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().RUNWARE_API_KEY;
  if (!API_KEY) return { success: false, error: "RUNWARE_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.runware.ai/v1/images",
    { prompt, model: "runware-100", width: dims.width, height: dims.height },
    {
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      timeout: 30000,
    },
  );
  const url = resp.data?.data?.[0]?.url || resp.data?.image_url;
  if (url) return { success: true, imageUrl: url, provider: "runware", mode: "text2img" };
  throw new ProviderError("Runware", "image: no URL returned");
}

export async function generateViaWaveSpeedImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().WAVESPEED_API_KEY;
  if (!API_KEY) return { success: false, error: "WAVESPEED_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.wavespeed.ai/v1/image/generations",
    { prompt, width: dims.width, height: dims.height },
    {
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      timeout: 30000,
    },
  );
  const url = resp.data?.url || resp.data?.image_url || resp.data?.output?.url;
  if (url) return { success: true, imageUrl: url, provider: "wavespeed", mode: "text2img" };
  throw new ProviderError("WaveSpeed", "image: no URL returned");
}

export async function generateViaZAIImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().ZAI_API_KEY;
  if (!API_KEY) return { success: false, error: "ZAI_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.z.ai/v1/images/generate",
    { prompt, width: dims.width, height: dims.height },
    {
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      timeout: 30000,
    },
  );
  const url = resp.data?.url || resp.data?.image_url || resp.data?.data?.[0]?.url;
  if (url) return { success: true, imageUrl: url, provider: "zai", mode: "text2img" };
  throw new ProviderError("Z.ai", "image: no URL returned");
}

export async function generateViaOmniRoute(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const config = getConfig();
  const OMNIROUTE_URL = config.OMNIROUTE_URL;
  const OMNIROUTE_API_KEY = config.OMNIROUTE_API_KEY || "";
  if (!OMNIROUTE_API_KEY) return { success: false, error: "OMNIROUTE_API_KEY not configured" };

  const dims = getDims(params);
  const response = await axios.post(
    `${OMNIROUTE_URL}/images/generations`,
    { model: "dall-e-3", prompt, n: 1, size: `${dims.width}x${dims.height}`, response_format: "url" },
    {
      headers: { Authorization: `Bearer ${OMNIROUTE_API_KEY}`, "Content-Type": "application/json" },
      timeout: 60000,
    },
  );

  const data = response.data?.data;
  if (data?.length > 0 && data[0].url) {
    return { success: true, imageUrl: data[0].url, provider: "omniroute", mode: "text2img" };
  }
  throw new ProviderError("OmniRoute", "no image returned");
}