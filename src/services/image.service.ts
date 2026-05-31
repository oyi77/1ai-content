/**
 * Image Generation Service — Multi-Provider Smart Routing
 *
 * Routes to the right provider based on capability:
 *   - Text-to-image (no reference): full fallback chain
 *   - Image-to-image (with reference): only img2img-capable providers
 *   - IP-Adapter (avatar consistency): only IP-Adapter-capable providers
 *
 * Providers:
 *   1. GeminiGen (nano-banana-pro) — text-to-image only
 *   2. Fal.ai (flux/dev) — text-to-image + img2img + IP-Adapter
 *   3. SiliconFlow (FLUX.1-schnell) — text-to-image only
 *   4. NVIDIA (SDXL) — text-to-image only
 *   5. Google Gemini — text-to-image + img2img (multimodal context)
 *   → Demo fallback (category-matched placeholders)
 */

import { logger } from "@/utils/logger";
import { sendAdminAlert } from "@/services/admin-alert.service";
import { trackTokens } from "@/services/token-tracker.service";
import { AdminConfigService } from "@/services/admin-config.service";
import { CircuitBreaker } from "./circuit-breaker.service";
import { ContentAnalysisService } from "./content-analysis.service";
import { WatermarkService } from "./watermark.service";
import { PromptEngine } from "@/config/prompt-engine";
import { AIPromptOptimizer } from "./ai-prompt-optimizer.service";
import { getConfig } from "@/config/env";
import axios from "axios";
import FormData from "form-data";
import * as fs from "fs";

const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

// Read dynamically so tests can toggle it
function isDemoMode(): boolean {
  return getConfig().DEMO_MODE;
}

export type ImageGenerationMode = "text2img" | "img2img" | "ip_adapter";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  provider?: string;
  mode?: ImageGenerationMode;
  metadata?: Record<string, any>;
}

export interface ImageGenerationParams {
  prompt: string;
  style?: string;
  aspectRatio?: string;
  category: string;
  referenceImageUrl?: string;
  referenceImagePath?: string;
  avatarImageUrl?: string;
  avatarImagePath?: string;
  mode?: ImageGenerationMode;
  resolution?: "standard" | "hd" | "ultra";
  elementSelection?: {
    keepProduct: boolean;
    keepCharacter: boolean;
    keepBackground: boolean;
  };
  elementAnalysis?: {
    productDesc: string;
    characterDesc: string;
    backgroundDesc: string;
  };
  _forceProvider?: string;
}

/** Get target width/height from params (set by generateImage) or fall back to aspect-ratio lookup */
function getDims(params: ImageGenerationParams): {
  width: number;
  height: number;
} {
  const p = params as unknown as Record<string, unknown>;
  if (p._targetWidth && p._targetHeight)
    return { width: p._targetWidth as number, height: p._targetHeight as number };
  return getImageDimensions(params.aspectRatio, params.resolution);
}

// Resolution multipliers — maps resolution tier to pixel dimension multiplier
const RESOLUTION_MULTIPLIERS: Record<string, number> = {
  standard: 1,
  hd: 2,
  ultra: 4,
};

/** Get pixel dimensions for given aspect ratio and resolution tier */
export function getImageDimensions(
  aspectRatio: string = "1:1",
  resolution: string = "standard",
): { width: number; height: number } {
  const mult = RESOLUTION_MULTIPLIERS[resolution] || 1;
  const base: Record<string, { width: number; height: number }> = {
    "9:16": { width: 576, height: 1024 },
    "16:9": { width: 1024, height: 576 },
    "1:1": { width: 1024, height: 1024 },
    "4:5": { width: 896, height: 1120 },
  };
  const dims = base[aspectRatio] || base["1:1"];
  return { width: dims.width * mult, height: dims.height * mult };
}

// Category-specific demo images — last-resort fallback
const DEMO_IMAGES: Record<string, string[]> = {
  product: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1024",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1024",
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1024",
  ],
  fnb: [
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1024",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1024",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1024",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1024",
  ],
  realestate: [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1024",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1024",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1024",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1024",
  ],
  car: [
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1024",
    "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1024",
    "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1024",
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1024",
  ],
};

// ── Provider implementations ──

type ProviderFn = (
  prompt: string,
  params: ImageGenerationParams,
) => Promise<ImageGenerationResult>;

interface ImageProvider {
  key: string;
  name: string;
  enabled: boolean;
  supportsImg2Img: boolean;
  supportsIPAdapter: boolean;
  generate: ProviderFn;
  generateImg2Img?: ProviderFn;
  generateIPAdapter?: ProviderFn;
}

/** Tier 1: GeminiGen — nano-banana-pro (text-to-image only) */
async function generateViaGeminiGen(
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

  const response = await axios.post(
    `${GEMINIGEN_API_BASE}/generate_image`,
    formData,
    {
      headers: {
        "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
        ...formData.getHeaders(),
      },
      timeout: 60000,
    },
  );

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
          thumbnailUrl:
            thumbnail_url || generated_image[0].thumbnails?.[0]?.url || "",
          provider: "geminigen",
          mode: "text2img",
        };
      }
      if (s === 3) throw new Error("GeminiGen: generation failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("GeminiGen: poll timeout");
  }
  throw new Error(`GeminiGen: unexpected status ${status}`);
}

/** Tier 2: Fal.ai — flux/dev text-to-image */
async function generateViaFalai(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://fal.run/fal-ai/flux/dev",
    {
      prompt,
      image_size:
        params.aspectRatio === "16:9"
          ? "landscape_16_9"
          : params.aspectRatio === "9:16"
            ? "portrait_16_9"
            : "square_hd",
      num_images: 1,
    },
    {
      headers: {
        Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    },
  );

  const images = response.data?.images;
  if (images?.length > 0 && images[0].url) {
    return {
      success: true,
      imageUrl: images[0].url,
      provider: "falai",
      mode: "text2img",
    };
  }
  throw new Error("Fal.ai: no images returned");
}

/** Fal.ai — flux/dev/image-to-image (reference image → styled output) */
async function generateViaFalaiImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new Error("Fal.ai img2img: no reference image URL provided");

  const negativePrompt = (params as unknown as Record<string, unknown>)._negativePrompt as string | undefined;
  const response = await axios.post(
    "https://fal.run/fal-ai/flux/dev/image-to-image",
    {
      prompt,
      image_url: imageUrl,
      strength: ((params as unknown as Record<string, unknown>)._elementStrengthOverride as number) ?? await AdminConfigService.getAiParam('falai_img2img_strength', 0.75),
      ...(negativePrompt ? { negative_prompt: negativePrompt.replace(/^,\s*/, '') } : {}),
      image_size:
        params.aspectRatio === "16:9"
          ? "landscape_16_9"
          : params.aspectRatio === "9:16"
            ? "portrait_16_9"
            : "square_hd",
      num_images: 1,
      num_inference_steps: await AdminConfigService.getAiParam('falai_inference_steps', 28),
      guidance_scale: await AdminConfigService.getAiParam('falai_guidance_scale', 3.5),
    },
    {
      headers: {
        Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: await AdminConfigService.getTimeout('falai_img2img_ms', 90000),
    },
  );

  const images = response.data?.images;
  if (images?.length > 0 && images[0].url) {
    return {
      success: true,
      imageUrl: images[0].url,
      provider: "falai_img2img",
      mode: "img2img",
    };
  }
  throw new Error("Fal.ai img2img: no images returned");
}

/** Fal.ai — IP-Adapter (preserves face/identity from avatar across generations) */
async function generateViaFalaiIPAdapter(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const avatarUrl = params.avatarImageUrl;
  if (!avatarUrl)
    throw new Error("Fal.ai IP-Adapter: no avatar image URL provided");

  const response = await axios.post(
    "https://fal.run/fal-ai/flux/dev/ip-adapter",
    {
      prompt,
      ip_adapter_image_url: avatarUrl,
      ip_adapter_scale: await AdminConfigService.getAiParam('falai_ip_adapter_scale', 0.7),
      image_size:
        params.aspectRatio === "16:9"
          ? "landscape_16_9"
          : params.aspectRatio === "9:16"
            ? "portrait_16_9"
            : "square_hd",
      num_images: 1,
      num_inference_steps: await AdminConfigService.getAiParam('falai_inference_steps', 28),
      guidance_scale: await AdminConfigService.getAiParam('falai_guidance_scale', 3.5),
    },
    {
      headers: {
        Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: await AdminConfigService.getTimeout('falai_ip_adapter_ms', 90000),
    },
  );

  const images = response.data?.images;
  if (images?.length > 0 && images[0].url) {
    return {
      success: true,
      imageUrl: images[0].url,
      provider: "falai_ip_adapter",
      mode: "ip_adapter",
    };
  }
  throw new Error("Fal.ai IP-Adapter: no images returned");
}

/** Tier 3: SiliconFlow — Flux/SDXL (text-to-image only) */
async function generateViaSiliconFlow(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://api.siliconflow.cn/v1/images/generations",
    {
      model: "black-forest-labs/FLUX.1-schnell",
      prompt,
      image_size: `${getDims(params).width}x${getDims(params).height}`,
      num_inference_steps: await AdminConfigService.getAiParam('siliconflow_inference_steps', 20),
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
        url.startsWith("data:") || url.startsWith("http")
          ? url
          : `data:image/png;base64,${url}`;
      return {
        success: true,
        imageUrl,
        provider: "siliconflow",
        mode: "text2img",
      };
    }
  }
  throw new Error("SiliconFlow: no images returned");
}

/** Tier 4: NVIDIA — SDXL (text-to-image only) */
async function generateViaNvidia(
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
  throw new Error("NVIDIA: no artifacts returned");
}

/** Tier 5: Google Gemini — text-to-image */
async function generateViaGemini(
  prompt: string,
  _params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${getConfig().GEMINI_API_KEY || ""}`,
    {
      contents: [
        {
          parts: [{ text: `Generate a high-quality image: ${prompt}` }],
        },
      ],
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
  throw new Error("Gemini: no image in response");
}

/** Google Gemini — img2img (multimodal: reference image + prompt → new image) */
async function generateViaGeminiImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  // Read reference image as base64
  let imageBase64: string;
  let mimeType = "image/jpeg";

  if (params.referenceImagePath && fs.existsSync(params.referenceImagePath)) {
    const imgBuffer = fs.readFileSync(params.referenceImagePath);
    imageBase64 = imgBuffer.toString("base64");
    if (params.referenceImagePath.endsWith(".png")) mimeType = "image/png";
  } else if (params.referenceImageUrl) {
    const imgResponse = await axios.get(params.referenceImageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    imageBase64 = Buffer.from(imgResponse.data).toString("base64");
    const ct = String(imgResponse.headers["content-type"] || "image/jpeg");
    if (ct.includes("png")) mimeType = "image/png";
  } else {
    throw new Error("Gemini img2img: no reference image");
  }

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${getConfig().GEMINI_API_KEY || ""}`,
    {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text:
                `Using this image as a reference, generate a new high-quality marketing image. ` +
                `Keep the product/subject from the reference but create it in this style: ${prompt}. ` +
                `Maintain the identity and key features of the original subject.`,
            },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    },
    { headers: { "Content-Type": "application/json" }, timeout: 90000 },
  );

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return {
        success: true,
        imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        provider: "gemini_img2img",
        mode: "img2img",
      };
    }
  }
  throw new Error("Gemini img2img: no image in response");
}

/** LaoZhang — flux-kontext-pro (native img2img via multipart) */
async function generateViaLaoZhangKontext(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl) throw new Error("LaoZhang Kontext: no reference image URL");

  const imgResponse = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  const formData = new FormData();
  formData.append("image", Buffer.from(imgResponse.data), {
    filename: "reference.jpg",
    contentType: "image/jpeg",
  });
  formData.append("prompt", prompt);
  formData.append("model", "flux-kontext-pro");

  const response = await axios.post(
    "https://api.laozhang.ai/v1/images/edits",
    formData,
    {
      headers: {
        Authorization: `Bearer ${getConfig().LAOZHANG_API_KEY || ""}`,
        ...formData.getHeaders(),
      },
      timeout: 120000,
    },
  );

  const data = response.data?.data;
  if (data?.length > 0) {
    const url =
      data[0].url ||
      (data[0].b64_json ? `data:image/png;base64,${data[0].b64_json}` : null);
    if (url)
      return {
        success: true,
        imageUrl: url,
        provider: "laozhang_kontext",
        mode: "img2img",
      };
  }
  throw new Error("LaoZhang Kontext: no image returned");
}

/** LaoZhang — text2img with model cascade (cheapest first) */
async function generateViaLaoZhangGptImage(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  // Try models cheapest first: dall-e-3 ($0.04) → gpt-image-1-mini ($0.005 but lower quality) → gpt-image-1 ($0.05)
  const models = ["dall-e-3", "gpt-image-1"];
  const d = getDims(params);
  const size = `${d.width}x${d.height}`;

  for (const model of models) {
    try {
      const response = await axios.post(
        "https://api.laozhang.ai/v1/images/generations",
        {
          model,
          prompt,
          n: 1,
          size,
        },
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
          data[0].url ||
          (data[0].b64_json
            ? `data:image/png;base64,${data[0].b64_json}`
            : null);
        if (url)
          return {
            success: true,
            imageUrl: url,
            provider: `laozhang_${model.replace(/-/g, "_")}`,
            mode: "text2img",
          };
      }
    } catch (err: any) {
      logger.warn(
        `LaoZhang ${model} failed: ${err.response?.status || err.message}`,
      );
    }
  }
  throw new Error("LaoZhang text2img: all models failed");
}

/** EvoLink — img2img with model cascade (fastest first) */
async function generateViaEvoLinkImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl) throw new Error("EvoLink img2img: no reference image URL");

  // Try qwen-image-edit-plus first (11s) then wan2.5-image-to-image (66s)
  const models = ["qwen-image-edit-plus", "wan2.5-image-to-image"];
  for (const model of models) {
    try {
      return await evolinkImageGenerate(model, prompt, imageUrl);
    } catch (err: any) {
      logger.warn(`EvoLink ${model} failed: ${err.message}`);
    }
  }
  throw new Error("EvoLink img2img: all models failed");
}

/** EvoLink internal — submit + poll for a single model */
async function evolinkImageGenerate(
  model: string,
  prompt: string,
  imageUrl?: string,
): Promise<ImageGenerationResult> {
  const body: any = { model, prompt };
  if (imageUrl) body.image_url = imageUrl;

  const response = await axios.post(
    "https://api.evolink.ai/v1/images/generations",
    body,
    {
      headers: {
        Authorization: `Bearer ${getConfig().EVOLINK_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const taskId = response.data?.id;
  if (!taskId) throw new Error(`EvoLink img2img: no task ID`);

  // Poll for completion (same pattern as video-fallback.service.ts)
  for (let i = 0; i < 60; i++) {
    const poll = await axios.get(`https://api.evolink.ai/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${getConfig().EVOLINK_API_KEY || ""}` },
      timeout: 10000,
    });
    const status = poll.data?.status;
    if (status === "completed") {
      const results = poll.data?.results || poll.data?.data || [];
      const url =
        Array.isArray(results) && results.length > 0
          ? typeof results[0] === "object"
            ? results[0].url
            : String(results[0])
          : poll.data?.output?.url || poll.data?.output?.image_url || "";
      if (url)
        return {
          success: true,
          imageUrl: url,
          provider: `evolink_${model.replace(/[.-]/g, "_")}`,
          mode: imageUrl ? "img2img" : "text2img",
        };
      throw new Error("EvoLink img2img: completed but no URL");
    }
    if (status === "failed" || status === "error") {
      throw new Error(
        `EvoLink img2img: ${poll.data?.error || "generation failed"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("EvoLink img2img: poll timeout");
}

/** PiAPI — Flux Pro text2img (high quality, async polling) */
async function generateViaPiAPI(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const response = await axios.post(
    "https://api.piapi.ai/api/v1/task",
    {
      model: "Qubico/flux1-dev",
      task_type: "txt2img",
      input: {
        prompt,
        width: getDims(params).width,
        height: getDims(params).height,
        guidance_scale: 3.5,
        num_inference_steps: 28,
      },
    },
    {
      headers: {
        "x-api-key": getConfig().PIAPI_API_KEY || "",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const taskId = response.data?.data?.task_id;
  if (!taskId)
    throw new Error(
      `PiAPI: no task_id in response: ${JSON.stringify(response.data).slice(0, 200)}`,
    );

  // Poll for completion
  for (let i = 0; i < 60; i++) {
    const poll = await axios.get(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { "x-api-key": getConfig().PIAPI_API_KEY || "" },
      timeout: 10000,
    });
    const pollData = poll.data?.data;
    const status = pollData?.status;

    // Handle rate limit responses
    if (poll.status === 429) {
      logger.warn("PiAPI: rate limited, backing off");
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    if (status === "completed") {
      const output = pollData?.output;
      logger.info("PiAPI response: " + JSON.stringify(pollData).slice(0, 500));
      const url =
        output?.image_url ||
        (Array.isArray(output?.images) ? output.images[0] : null) ||
        (Array.isArray(output?.image_urls) ? output.image_urls[0] : null) ||
        output?.result?.image_url ||
        output?.url;
      if (url)
        return {
          success: true,
          imageUrl: url,
          provider: "piapi_flux",
          mode: "text2img",
        };
      throw new Error("PiAPI: completed but no image URL");
    }
    if (status === "failed") {
      throw new Error(
        `PiAPI: task failed: ${pollData?.error || "Unknown error"}`,
      );
    }
    if (status === "processing") {
      // Still processing — continue polling
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("PiAPI: poll timeout");
}

/** PiAPI — Midjourney img2img */
async function generateViaPiAPIImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl) throw new Error("PiAPI img2img: no reference image URL");

  const response = await axios.post(
    "https://api.piapi.ai/api/v1/task",
    {
      model: "Qubico/flux1-dev",
      task_type: "img2img",
      input: {
        prompt,
        image_url: imageUrl,
        strength: 0.65,
        guidance_scale: 3.5,
        num_inference_steps: 28,
        width: getDims(params).width,
        height: getDims(params).height,
      },
    },
    {
      headers: {
        "x-api-key": getConfig().PIAPI_API_KEY || "",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const taskId = response.data?.data?.task_id;
  if (!taskId) throw new Error(`PiAPI img2img: no task_id`);

  for (let i = 0; i < 60; i++) {
    const poll = await axios.get(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { "x-api-key": getConfig().PIAPI_API_KEY || "" },
      timeout: 10000,
    });
    const pollData = poll.data?.data;
    const status = pollData?.status;

    // Handle rate limit responses
    if (poll.status === 429) {
      logger.warn("PiAPI img2img: rate limited, backing off");
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    if (status === "completed") {
      const output = pollData?.output;
      logger.info(
        "PiAPI img2img response: " + JSON.stringify(pollData).slice(0, 500),
      );
      const url =
        output?.image_url ||
        (Array.isArray(output?.images) ? output.images[0] : null) ||
        (Array.isArray(output?.image_urls) ? output.image_urls[0] : null) ||
        output?.result?.image_url ||
        output?.url;
      if (url)
        return {
          success: true,
          imageUrl: url,
          provider: "piapi_img2img",
          mode: "img2img",
        };
      throw new Error("PiAPI img2img: completed but no image URL");
    }
    if (status === "failed")
      throw new Error(`PiAPI img2img: ${pollData?.error || "failed"}`);
    if (status === "processing") {
      // Still processing — continue polling
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("PiAPI img2img: poll timeout");
}

/** Together.ai — FLUX.1 Schnell (cheapest text2img at ~$0.003/img, OpenAI-compatible) */
async function generateViaTogether(
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
    const url =
      data[0].url ||
      (data[0].b64_json ? `data:image/png;base64,${data[0].b64_json}` : null);
    if (url)
      return {
        success: true,
        imageUrl: url,
        provider: "together_schnell",
        mode: "text2img",
      };
  }
  throw new Error("Together.ai: no image returned");
}

/** SegMind — Flux IP-Adapter (cheap IP-Adapter at ~$0.01/img) */
async function generateViaSegmindIPAdapter(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const avatarUrl = params.avatarImageUrl;
  if (!avatarUrl) throw new Error("SegMind IP-Adapter: no avatar image URL");

  const response = await axios.post(
    "https://api.segmind.com/v1/flux-ipadapter",
    {
      prompt,
      image_url: avatarUrl,
      cn_strength: 0.7,
      steps: 28,
      guidance_scale: 3.5,
      seed: Math.floor(Math.random() * 2147483647),
      width: getDims(params).width,
      height: getDims(params).height,
    },
    {
      headers: {
        "x-api-key": getConfig().SEGMIND_API_KEY || "",
        "Content-Type": "application/json",
      },
      timeout: 90000,
      responseType: "arraybuffer",
    },
  );

  if (response.data && String(response.headers["content-type"] || "").includes("image")) {
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = String(response.headers["content-type"] || "image/png");
    return {
      success: true,
      imageUrl: `data:${mimeType};base64,${base64}`,
      provider: "segmind_ip_adapter",
      mode: "ip_adapter",
    };
  }
  throw new Error("SegMind IP-Adapter: no image returned");
}

/** SegMind — SDXL img2img (cheap img2img at ~$0.005/img) */
async function generateViaSegmindImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl) throw new Error("SegMind img2img: no reference image URL");

  const response = await axios.post(
    "https://api.segmind.com/v1/sdxl1.0-img2img",
    {
      prompt,
      image: imageUrl,
      strength: 0.75,
      steps: 30,
      guidance_scale: 7,
      seed: Math.floor(Math.random() * 2147483647),
    },
    {
      headers: {
        "x-api-key": getConfig().SEGMIND_API_KEY || "",
        "Content-Type": "application/json",
      },
      timeout: 90000,
      responseType: "arraybuffer",
    },
  );

  if (response.data && String(response.headers["content-type"] || "").includes("image")) {
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = String(response.headers["content-type"] || "image/png");
    return {
      success: true,
      imageUrl: `data:${mimeType};base64,${base64}`,
      provider: "segmind_img2img",
      mode: "img2img",
    };
  }
  throw new Error("SegMind img2img: no image returned");
}

/** Runware image generation */
async function generateViaRunwareImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().RUNWARE_API_KEY;
  if (!API_KEY)
    return { success: false, error: "RUNWARE_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.runware.ai/v1/images",
    {
      prompt,
      model: "runware-100",
      width: dims.width,
      height: dims.height,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  const url = resp.data?.data?.[0]?.url || resp.data?.image_url;
  if (url)
    return {
      success: true,
      imageUrl: url,
      provider: "runware",
      mode: "text2img",
    };
  throw new Error("Runware image: no URL returned");
}

/** WaveSpeed image generation */
async function generateViaWaveSpeedImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().WAVESPEED_API_KEY;
  if (!API_KEY)
    return { success: false, error: "WAVESPEED_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.wavespeed.ai/v1/image/generations",
    {
      prompt,
      width: dims.width,
      height: dims.height,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  const url = resp.data?.url || resp.data?.image_url || resp.data?.output?.url;
  if (url)
    return {
      success: true,
      imageUrl: url,
      provider: "wavespeed",
      mode: "text2img",
    };
  throw new Error("WaveSpeed image: no URL returned");
}

/** Z.ai image generation */
async function generateViaZAIImg(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const API_KEY = getConfig().ZAI_API_KEY;
  if (!API_KEY) return { success: false, error: "ZAI_API_KEY not configured" };
  const dims = getDims(params);
  const resp = await axios.post(
    "https://api.z.ai/v1/images/generate",
    {
      prompt,
      width: dims.width,
      height: dims.height,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  const url =
    resp.data?.url || resp.data?.image_url || resp.data?.data?.[0]?.url;
  if (url)
    return { success: true, imageUrl: url, provider: "zai", mode: "text2img" };
  throw new Error("Z.ai image: no URL returned");
}

/** OmniRoute — OpenAI-compatible image generation (routes to cheapest provider) */
async function generateViaOmniRoute(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const config = getConfig();
  const OMNIROUTE_URL = config.OMNIROUTE_URL || "http://localhost:20128/v1";
  const OMNIROUTE_API_KEY = config.OMNIROUTE_API_KEY || "";
  if (!OMNIROUTE_API_KEY)
    return { success: false, error: "OMNIROUTE_API_KEY not configured" };

  const dims = getDims(params);
  const response = await axios.post(
    `${OMNIROUTE_URL}/images/generations`,
    {
      model: "dall-e-3", // OmniRoute routes to cheapest image provider
      prompt,
      n: 1,
      size: `${dims.width}x${dims.height}`,
      response_format: "url",
    },
    {
      headers: {
        Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    },
  );

  const data = response.data?.data;
  if (data?.length > 0 && data[0].url) {
    return {
      success: true,
      imageUrl: data[0].url,
      provider: "omniroute",
      mode: "text2img",
    };
  }
  throw new Error("OmniRoute: no image returned");
}

// ── Provider chain (priority order) ──

function getProviders(): ImageProvider[] {
  return [
    // Tier 0: OmniRoute (routes to cheapest/free providers)
    {
      key: "omniroute",
      name: "OmniRoute (Smart Routing)",
      enabled: !!getConfig().OMNIROUTE_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaOmniRoute,
    },
    // Tier 1: Cheapest text2img ($0.003/img)
    {
      key: "together",
      name: "Together.ai (FLUX Schnell)",
      enabled: !!getConfig().TOGETHER_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaTogether,
    },
    // Tier 2: LaoZhang kontext-pro — best for product editing/preservation
    {
      key: "laozhang",
      name: "LaoZhang (Kontext + GPT-Image)",
      enabled: !!getConfig().LAOZHANG_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaLaoZhangGptImage,
      generateImg2Img: generateViaLaoZhangKontext,
    },
    // Tier 3: PiAPI — high quality Flux Dev text2img + img2img
    {
      key: "piapi",
      name: "PiAPI (Flux Dev)",
      enabled: !!getConfig().PIAPI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaPiAPI,
      generateImg2Img: generateViaPiAPIImg2Img,
    },
    // Tier 4: Good quality, free tier
    {
      key: "gemini",
      name: "Google Gemini",
      enabled: !!getConfig().GEMINI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaGemini,
      generateImg2Img: generateViaGeminiImg2Img,
    },
    // Tier 4: Cheap img2img + IP-Adapter ($0.005-0.01/img)
    {
      key: "segmind",
      name: "SegMind (SDXL + IP-Adapter)",
      enabled: !!getConfig().SEGMIND_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: true,
      generate: generateViaSegmindImg2Img,
      generateImg2Img: generateViaSegmindImg2Img,
      generateIPAdapter: generateViaSegmindIPAdapter,
    },
    // Tier 5: Reliable text2img ($0.01/img)
    {
      key: "siliconflow",
      name: "SiliconFlow Flux",
      enabled: !!getConfig().SILICONFLOW_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaSiliconFlow,
    },
    // Tier 6: Fal.ai — good img2img + IP-Adapter quality ($0.03/img)
    {
      key: "falai",
      name: "Fal.ai Flux",
      enabled: !!getConfig().FALAI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: true,
      generate: generateViaFalai,
      generateImg2Img: generateViaFalaiImg2Img,
      generateIPAdapter: generateViaFalaiIPAdapter,
    },
    // Tier 8: EvoLink — async img2img ($0.03/img)
    {
      key: "evolink",
      name: "EvoLink (Wan2.5 + Qwen)",
      enabled: !!getConfig().EVOLINK_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaEvoLinkImg2Img,
      generateImg2Img: generateViaEvoLinkImg2Img,
    },
    // Tier 9: NVIDIA — reliable fallback ($0.01/img)
    {
      key: "nvidia",
      name: "NVIDIA SDXL",
      enabled: !!getConfig().NVIDIA_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaNvidia,
    },
    // Tier 10: GeminiGen — currently returning 500 errors, lowest priority
    {
      key: "geminigen",
      name: "GeminiGen",
      enabled: !!getConfig().GEMINIGEN_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaGeminiGen,
    },
    // Tier 11: Runware
    {
      key: "runware",
      name: "Runware",
      enabled: !!getConfig().RUNWARE_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaRunwareImg,
      generateImg2Img: generateViaRunwareImg,
    },
    // Tier 12: WaveSpeed
    {
      key: "wavespeed",
      name: "WaveSpeed",
      enabled: !!getConfig().WAVESPEED_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaWaveSpeedImg,
    },
    // Tier 13: Z.ai
    {
      key: "zai",
      name: "Z.ai Image",
      enabled: !!getConfig().ZAI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaZAIImg,
      generateImg2Img: generateViaZAIImg,
    },
  ];
}

// ── Mode detection ──

function detectMode(params: ImageGenerationParams): ImageGenerationMode {
  if (params.mode) return params.mode;
  if (params.avatarImageUrl || params.avatarImagePath) return "ip_adapter";
  if (params.referenceImageUrl || params.referenceImagePath) return "img2img";
  return "text2img";
}

// ── Main service ──

export class ImageGenerationService {
  static async generateImage(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    if (isDemoMode()) {
      logger.warn("🖼️ DEMO_MODE forced — returning placeholder");
      return this.generateDemoImage(params);
    }

    const mode = detectMode(params);
    logger.info(`🖼️ Generation mode: ${mode}`);

    // ── Watermark pre-processing ──
    // Clean reference images before using them (free: Gemini Vision + FFmpeg)
    const cleanedRefUrl = params.referenceImageUrl;
    if (cleanedRefUrl && (mode === "img2img" || mode === "ip_adapter")) {
      try {
        const cleanedPath = await WatermarkService.cleanImage(cleanedRefUrl);
        if (cleanedPath) {
          // Replace URL with local cleaned file path for providers that support it
          params = { ...params, referenceImagePath: cleanedPath };
          logger.info("🧹 Reference image cleaned of watermarks");
        }
      } catch (err) {
        logger.warn("🧹 Watermark pre-processing skipped");
      }
    }

    // ── Vision-based prompt enrichment ──
    // When a reference image is provided, analyse it with Gemini Vision
    // and inject the description into the prompt. This makes the reference
    // work with ALL providers, even text-only ones.
    let visionEnrichedPrompt = params.prompt;
    const refUrl = cleanedRefUrl || params.avatarImageUrl;

    if (refUrl && (mode === "img2img" || mode === "ip_adapter")) {
      try {
        logger.info("🖼️ Analysing reference image with Vision AI...");
        const analysis = await ContentAnalysisService.extractPrompt(
          refUrl,
          "image",
        );
        if (analysis.success && analysis.prompt) {
          // Merge reference image analysis with user prompt.
          // Frame as product/subject reference so AI preserves the subject identity.
          const refAnalysis = analysis.prompt;
          visionEnrichedPrompt =
            refAnalysis.length > 20
              ? `${params.prompt}. Reference subject/product appearance: ${refAnalysis}`
              : params.prompt;
          logger.info(
            `🖼️ Style enrichment added (${refAnalysis.length} chars)`,
          );
        }
      } catch (err) {
        logger.warn(
          "🖼️ Vision analysis failed, continuing with original prompt",
        );
        // Flag for downstream — callers can warn user about degraded quality
        (params as unknown as Record<string, unknown>)._visionAnalysisFailed = true;
      }
    }

    // ── Element selection prompt/strength adjustment ──
    // When the user selected which elements to keep from the reference image,
    // tailor the prompt and override the img2img strength accordingly.
    let elementStrengthOverride: number | undefined;
    if (params.elementSelection && params.elementAnalysis) {
      const sel = params.elementSelection;
      const ea = params.elementAnalysis;
      const keepCount = [sel.keepProduct, sel.keepCharacter, sel.keepBackground].filter(Boolean).length;

      if (keepCount === 0) {
        // keepNone — pure text2img, discard reference
        params = { ...params, mode: "text2img", referenceImageUrl: undefined, referenceImagePath: undefined };
        logger.info("🎯 Element selection: keepNone — switching to text2img");
      } else if (sel.keepProduct && !sel.keepCharacter && !sel.keepBackground) {
        // Most common UMKM case: preserve product, change background/scene
        // NOTE: strength ~0.55 = enough noise to follow prompt for background,
        // low enough to preserve product shape/colors from reference.
        const productRef = ea.productDesc ? ` Exact product to preserve: ${ea.productDesc}.` : '';
        visionEnrichedPrompt = `Keep the product exactly as shown in the reference image.${productRef} ${params.prompt}. Change only the background and scene as described. Do not alter the product itself.`;
        elementStrengthOverride = 0.55;
        (params as unknown as Record<string, unknown>)._negativePrompt = ((params as unknown as Record<string, unknown>)._negativePrompt || '') + ', person, human, model, hands, body';
        logger.info("🎯 Element selection: keepProduct only (strength=0.55)");
      } else if (sel.keepCharacter && !sel.keepProduct && !sel.keepBackground) {
        const charRef = ea.characterDesc ? ` Character appearance to preserve: ${ea.characterDesc}.` : '';
        visionEnrichedPrompt = `Preserve the person/character appearance from the reference.${charRef} ${params.prompt}.`;
        elementStrengthOverride = 0.65;
        logger.info("🎯 Element selection: keepCharacter only (strength=0.65)");
      } else if (sel.keepProduct && sel.keepCharacter && !sel.keepBackground) {
        const refs = [ea.productDesc && `Product: ${ea.productDesc}`, ea.characterDesc && `Character: ${ea.characterDesc}`].filter(Boolean).join('. ');
        visionEnrichedPrompt = `Keep both the product and person from the reference. ${refs}. ${params.prompt}. Change only the background.`;
        elementStrengthOverride = 0.60;
        logger.info("🎯 Element selection: keepProduct + keepCharacter (strength=0.60)");
      } else if (sel.keepBackground && !sel.keepProduct && !sel.keepCharacter) {
        const bgRef = ea.backgroundDesc ? ` Background to preserve: ${ea.backgroundDesc}.` : '';
        visionEnrichedPrompt = `Preserve the background scene from the reference.${bgRef} ${params.prompt}.`;
        elementStrengthOverride = 0.50;
        logger.info("🎯 Element selection: keepBackground only (strength=0.50)");
      } else {
        // keepAll or other combos
        elementStrengthOverride = 0.55;
        logger.info("🎯 Element selection: keepAll/multi (strength=0.55)");
      }

      // Store strength override for downstream providers
      if (elementStrengthOverride !== undefined) {
        (params as unknown as Record<string, unknown>)._elementStrengthOverride = elementStrengthOverride;
      }

      // Always add anti-UI/screenshot negative prompt for img2img to prevent
      // garbled text when user uploads screenshots instead of clean product photos
      (params as unknown as Record<string, unknown>)._negativePrompt = ((params as unknown as Record<string, unknown>)._negativePrompt || '') +
        ', text overlay, ui elements, interface, screenshot, watermark, button, icon, timestamp, chat bubble, telegram, mobile app';
    }

    // Resolve target dimensions from aspect ratio + resolution tier
    const dims = getImageDimensions(params.aspectRatio, params.resolution);
    params = {
      ...params,
      _targetWidth: dims.width,
      _targetHeight: dims.height,
    } as any;

    const enrichedBase = PromptEngine.enrichForImage(
      visionEnrichedPrompt,
      params.category,
      {
        aspectRatio: params.aspectRatio,
      },
    );

    // AI-optimise the enriched prompt (LLM rotation with fallback)
    const optimizedFull = await AIPromptOptimizer.optimize(enrichedBase.full, {
      niche: params.category,
      style: params.style || "commercial",
      category: params.category,
    }).catch(() => enrichedBase.full);

    const enriched = {
      ...enrichedBase,
      full: optimizedFull || enrichedBase.full,
    };

    logger.info(
      `🖼️ Enriched prompt (${enriched.full.length} chars): ${enriched.full.slice(0, 100)}...`,
    );

    let providers = getProviders();

    // Handle playground/debug force provider
    if (params._forceProvider) {
      const target = providers.find((p) => p.key === params._forceProvider);
      if (target) {
        logger.info(`🛠️ [Playground] Forcing provider: ${target.name}`);
        const promptForProvider = [
          "geminigen",
          "falai",
          "siliconflow",
        ].includes(target.key)
          ? enriched.full
          : enriched.provider_hint;
        return target.generate(promptForProvider, params);
      }
    }

    // Apply admin dynamic overrides (disable/reorder providers via dashboard)
    try {
      const { ProviderSettingsService } =
        await import("./provider-settings.service.js");
      const overrides = await ProviderSettingsService.getDynamicSettings();
      const imageOverrides = overrides?.image || {};
      if (Object.keys(imageOverrides).length > 0) {
        providers = providers
          .map((p) => {
            const ov = imageOverrides[p.key];
            if (ov?.enabled === false) return { ...p, enabled: false };
            return p;
          })
          .filter((p) => p.enabled);
      }
    } catch {
      /* ignore — use default ordering */
    }

    // ── Smart routing: try native providers first, then universal fallback ──

    if (mode === "ip_adapter") {
      const nativeProviders = providers.filter(
        (p) => p.enabled && p.supportsIPAdapter && p.generateIPAdapter,
      );
      logger.info(
        `🖼️ IP-Adapter mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(", ")}`,
      );

      if (nativeProviders.length > 0) {
        const result = await this.generateWithProviders(
          nativeProviders,
          enriched,
          params,
          "ip_adapter",
        );
        if (result.success && result.provider !== "demo") return result;
      }

      // Native failed → fall through to ALL providers with vision-enriched prompt
      logger.warn(
        "🖼️ Native IP-Adapter failed — avatar consistency may be reduced",
      );
      const allProviders = providers.filter((p) => p.enabled);
      if (allProviders.length > 0) {
        const fallbackResult = await this.generateWithProviders(
          allProviders,
          enriched,
          { ...params, mode: "text2img" },
          "text2img",
        );
        if (fallbackResult.success)
          fallbackResult.metadata = {
            ...fallbackResult.metadata,
            avatarConsistencyDegraded: true,
          };
        return fallbackResult;
      }
    } else if (mode === "img2img") {
      const nativeProviders = providers.filter(
        (p) => p.enabled && p.supportsImg2Img && p.generateImg2Img,
      );
      logger.info(
        `🖼️ Img2Img mode — ${nativeProviders.length} native providers: ${nativeProviders.map((p) => p.name).join(", ")}`,
      );

      if (nativeProviders.length > 0) {
        const result = await this.generateWithProviders(
          nativeProviders,
          enriched,
          params,
          "img2img",
        );
        if (result.success && result.provider !== "demo") return result;
      }

      // Native failed → fall through to ALL providers with vision-enriched prompt
      logger.info(
        "🖼️ Native img2img failed — using vision-enriched prompt on all providers",
      );
      const allProviders = providers.filter((p) => p.enabled);
      if (allProviders.length > 0) {
        return this.generateWithProviders(
          allProviders,
          enriched,
          { ...params, mode: "text2img" },
          "text2img",
        );
      }
    } else {
      // Pure text2img
      const enabledProviders = providers.filter((p) => p.enabled);
      logger.info(
        `🖼️ Text2Img mode — ${enabledProviders.length} providers available: ${enabledProviders.map((p) => p.name).join(", ")}`,
      );

      if (enabledProviders.length > 0) {
        return this.generateWithProviders(
          enabledProviders,
          enriched,
          params,
          "text2img",
        );
      }
    }

    logger.warn("🖼️ No image providers configured — returning demo image");
    return this.generateDemoImage(params);
  }

  private static async generateWithProviders(
    providers: ImageProvider[],
    enriched: { full: string; provider_hint: string },
    params: ImageGenerationParams,
    mode: ImageGenerationMode,
  ): Promise<ImageGenerationResult> {
    // Dynamic reordering: move providers with recent failures to the end
    const reordered = [...providers];
    try {
      const { redis } = await import("../config/redis.js");
      const failScores = await Promise.all(
        reordered.map(async (p) => {
          const raw = await redis.get(`cb:${p.key}`).catch(() => null);
          if (!raw) return 0;
          const state = JSON.parse(raw);
          // Penalize providers that failed recently (within 60s)
          if (
            state.failureCount > 0 &&
            state.lastFailure &&
            Date.now() - state.lastFailure < 60000
          ) {
            return state.failureCount;
          }
          return 0;
        }),
      );
      reordered.sort((a, b) => {
        const scoreA = failScores[providers.indexOf(a)] || 0;
        const scoreB = failScores[providers.indexOf(b)] || 0;
        return scoreA - scoreB;
      });
      if (failScores.some((s) => s > 0)) {
        logger.info(
          `🖼️ Reordered providers by health: ${reordered.map((p) => p.name).join(", ")}`,
        );
      }
    } catch {
      /* Redis unavailable, use original order */
    }

    for (const provider of reordered) {
      const canExecute = await CircuitBreaker.canExecute(provider.key).catch(
        () => true,
      );
      if (!canExecute) {
        logger.info(`🖼️ Circuit breaker OPEN for ${provider.name} — skipping`);
        continue;
      }

      try {
        logger.info(`🖼️ Trying ${provider.name} (${mode})...`);
        const promptForProvider = [
          "geminigen",
          "falai",
          "siliconflow",
        ].includes(provider.key)
          ? enriched.full
          : enriched.provider_hint;

        let result: ImageGenerationResult;

        if (mode === "ip_adapter" && provider.generateIPAdapter) {
          result = await provider.generateIPAdapter(promptForProvider, params);
        } else if (mode === "img2img" && provider.generateImg2Img) {
          result = await provider.generateImg2Img(promptForProvider, params);
        } else {
          result = await provider.generate(promptForProvider, params);
        }

        if (result.success) {
          await CircuitBreaker.recordSuccess(provider.key).catch((err) =>
            logger.warn("Circuit breaker update failed", {
              error: err.message,
            }),
          );
          logger.info(`🖼️ ${provider.name} succeeded (${mode})`);
          // Track image generation (use fixed token estimate — not token-based billing)
          trackTokens({
            provider: provider.key,
            model: provider.key,
            service: "image_gen",
            promptTokens: 0,
            completionTokens: 0,
          }).catch((err) =>
            logger.warn("Image provider tracking failed", {
              error: err.message,
            }),
          );
          return result;
        }
      } catch (error: any) {
        await CircuitBreaker.recordFailure(provider.key).catch((err) =>
          logger.warn("Circuit breaker update failed", { error: err.message }),
        );
        logger.warn(`🖼️ ${provider.name} failed (${mode}): ${error.message}`);
      }
    }

    logger.error(
      `🖼️ All ${providers.length} providers failed (${mode}) — demo fallback`,
    );
    sendAdminAlert("critical", "All Image Providers Failed", {
      mode,
      providers: providers.length,
      category: params.category,
    });
    return this.generateDemoImage(params);
  }

  private static generateDemoImage(
    params: ImageGenerationParams,
  ): ImageGenerationResult {
    const categoryImages = DEMO_IMAGES[params.category] || DEMO_IMAGES.product;
    const demoImage =
      categoryImages[Math.floor(Math.random() * categoryImages.length)];

    // Match requested aspect ratio for demo images
    const aspectSizes: Record<string, string> = {
      "9:16": "w=576&h=1024",
      "16:9": "w=1024&h=576",
      "4:5": "w=820&h=1024",
      "1:1": "w=1024&h=1024",
    };
    const sizeParams = aspectSizes[params.aspectRatio || "1:1"] || "w=1024";
    const sizedUrl = demoImage.replace("w=1024", sizeParams);

    return {
      success: true,
      imageUrl: sizedUrl,
      thumbnailUrl: sizedUrl.replace(sizeParams, "w=256"),
      provider: "demo",
    };
  }

  // ── Convenience methods ──

  static async generateProductImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "product",
      aspectRatio: "1:1",
      style: "commercial",
      referenceImageUrl,
    });
  }

  static async generateFoodImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "fnb",
      aspectRatio: "4:5",
      style: "food photography",
      referenceImageUrl,
    });
  }

  static async generateRealEstateImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "realestate",
      aspectRatio: "16:9",
      style: "architectural",
      referenceImageUrl,
    });
  }

  static async generateCarImage(
    description: string,
    referenceImageUrl?: string,
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category: "car",
      aspectRatio: "16:9",
      style: "automotive",
      referenceImageUrl,
    });
  }

  /** Generate image with avatar consistency (IP-Adapter) */
  static async generateWithAvatar(
    description: string,
    avatarImageUrl: string,
    category: string = "product",
    aspectRatio: string = "1:1",
  ): Promise<ImageGenerationResult> {
    return this.generateImage({
      prompt: description,
      category,
      aspectRatio,
      style: "commercial",
      avatarImageUrl,
      mode: "ip_adapter",
    });
  }
}

function mapAspectRatio(ratio?: string): string {
  const map: Record<string, string> = {
    "1:1": "square",
    "16:9": "landscape",
    "9:16": "portrait",
  };
  return map[ratio || "1:1"] || "square";
}
