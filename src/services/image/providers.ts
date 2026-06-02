import { logger } from "@/utils/logger";
import { AdminConfigService } from "@/services/admin-config.service";
import { getConfig } from "@/config/env";
import { secureRandomInt } from "@/utils/crypto";
import { ProviderError, ProviderTimeoutError, AllProvidersFailedError, ValidationError } from "@/utils/app-errors";
import axios from "axios";
import FormData from "form-data";
import * as fs from "fs";
import type {
  ImageGenerationParams,
  ImageGenerationResult,
} from "../image.service";

const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

export type ProviderFn = (
  prompt: string,
  params: ImageGenerationParams,
) => Promise<ImageGenerationResult>;

export interface ImageProvider {
  key: string;
  name: string;
  enabled: boolean;
  supportsImg2Img: boolean;
  supportsIPAdapter: boolean;
  generate: ProviderFn;
  generateImg2Img?: ProviderFn;
  generateIPAdapter?: ProviderFn;
}

/** Get target width/height from params (set by generateImage) or fall back to aspect-ratio lookup */
export function getDims(params: ImageGenerationParams): {
  width: number;
  height: number;
} {
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
      if (s === 3) throw new ProviderError("GeminiGen", "generation failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new ProviderTimeoutError("GeminiGen", 0);
  }
  throw new Error(`GeminiGen: unexpected status ${status}`);
}

export async function generateViaFalai(
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
  throw new ProviderError("Fal.ai", "no images returned");
}

export async function generateViaFalaiImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new ValidationError("reference image URL required", "referenceImageUrl");

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
  throw new ProviderError("Fal.ai", "img2img: no images returned");
}

export async function generateViaFalaiIPAdapter(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const avatarUrl = params.avatarImageUrl;
  if (!avatarUrl)
    throw new ValidationError("avatar image URL required", "avatarUrl");

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
  throw new ProviderError("Fal.ai", "IP-Adapter: no images returned");
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
  throw new ProviderError("Gemini", "no image in response");
}

export async function generateViaGeminiImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
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
    throw new ValidationError("reference image required", "referenceImageUrl");
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
  throw new ProviderError("Gemini", "img2img: no image in response");
}

export async function generateViaLaoZhangKontext(
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
  throw new AllProvidersFailedError("LaoZhang text2img");
}

export async function generateViaEvoLinkImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl) throw new Error("EvoLink img2img: no reference image URL");

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

export async function generateViaPiAPI(
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

  for (let i = 0; i < 60; i++) {
    const poll = await axios.get(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { "x-api-key": getConfig().PIAPI_API_KEY || "" },
      timeout: 10000,
    });
    const pollData = poll.data?.data;
    const status = pollData?.status;

    if (poll.status === 429) {
      logger.warn("PiAPI: rate limited, backing off");
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    if (status === "completed") {
      const output = pollData?.output;
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
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("PiAPI: poll timeout");
}

export async function generateViaPiAPIImg2Img(
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

    if (poll.status === 429) {
      logger.warn("PiAPI img2img: rate limited, backing off");
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    if (status === "completed") {
      const output = pollData?.output;
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
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("PiAPI img2img: poll timeout");
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

export async function generateViaSegmindIPAdapter(
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
      seed: secureRandomInt(2147483647),
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

export async function generateViaSegmindImg2Img(
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
      seed: secureRandomInt(2147483647),
      width: getDims(params).width,
      height: getDims(params).height,
    },
    {
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

export async function generateViaRunwareImg(
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

export async function generateViaWaveSpeedImg(
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

export async function generateViaZAIImg(
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

export async function generateViaOmniRoute(
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
      model: "dall-e-3",
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

export function getProviders(): ImageProvider[] {
  return [
    {
      key: "omniroute",
      name: "OmniRoute (Smart Routing)",
      enabled: !!getConfig().OMNIROUTE_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaOmniRoute,
    },
    {
      key: "together",
      name: "Together.ai (FLUX Schnell)",
      enabled: !!getConfig().TOGETHER_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaTogether,
    },
    {
      key: "laozhang",
      name: "LaoZhang (Kontext + GPT-Image)",
      enabled: !!getConfig().LAOZHANG_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaLaoZhangGptImage,
      generateImg2Img: generateViaLaoZhangKontext,
    },
    {
      key: "piapi",
      name: "PiAPI (Flux Dev)",
      enabled: !!getConfig().PIAPI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaPiAPI,
      generateImg2Img: generateViaPiAPIImg2Img,
    },
    {
      key: "gemini",
      name: "Google Gemini",
      enabled: !!getConfig().GEMINI_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaGemini,
      generateImg2Img: generateViaGeminiImg2Img,
    },
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
    {
      key: "siliconflow",
      name: "SiliconFlow Flux",
      enabled: !!getConfig().SILICONFLOW_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaSiliconFlow,
    },
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
    {
      key: "evolink",
      name: "EvoLink (Wan2.5 + Qwen)",
      enabled: !!getConfig().EVOLINK_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaEvoLinkImg2Img,
      generateImg2Img: generateViaEvoLinkImg2Img,
    },
    {
      key: "nvidia",
      name: "NVIDIA SDXL",
      enabled: !!getConfig().NVIDIA_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaNvidia,
    },
    {
      key: "geminigen",
      name: "GeminiGen",
      enabled: !!getConfig().GEMINIGEN_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaGeminiGen,
    },
    {
      key: "runware",
      name: "Runware",
      enabled: !!getConfig().RUNWARE_API_KEY,
      supportsImg2Img: true,
      supportsIPAdapter: false,
      generate: generateViaRunwareImg,
      generateImg2Img: generateViaRunwareImg,
    },
    {
      key: "wavespeed",
      name: "WaveSpeed",
      enabled: !!getConfig().WAVESPEED_API_KEY,
      supportsImg2Img: false,
      supportsIPAdapter: false,
      generate: generateViaWaveSpeedImg,
    },
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
