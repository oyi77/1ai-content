/**
 * Image-to-Image & IP-Adapter Providers
 *
 * All providers that require a reference image (img2img, IP-Adapter, style transfer).
 * Split from image/providers.ts to reduce file size and enable per-provider testing.
 */

import { logger } from "@/utils/logger";
import { AdminConfigService } from "@/services/admin-config.service";
import { getConfig } from "@/config/env";
import { secureRandomInt } from "@/utils/crypto";
import {
  ProviderError,
  ProviderTimeoutError,
  AllProvidersFailedError,
  ValidationError,
} from "@/utils/app-errors";
import axios from "axios";
import FormData from "form-data";
import * as fs from "fs";
import type {
  ImageGenerationParams,
  ImageGenerationResult,
} from "../../image.service";

// Re-use getDims from text2img (circular import-safe since they're siblings)
import { getDims, mapAspectRatio } from "./image-text2img";

// ── Fal.ai ─────────────────────────────────────────────────────────────────

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
    throw new ValidationError(
      "reference image URL required",
      "referenceImageUrl",
    );

  const negativePrompt = (params as unknown as Record<string, unknown>)
    ._negativePrompt as string | undefined;
  const response = await axios.post(
    "https://fal.run/fal-ai/flux/dev/image-to-image",
    {
      prompt,
      image_url: imageUrl,
      strength:
        ((params as unknown as Record<string, unknown>)
          ._elementStrengthOverride as number) ??
        (await AdminConfigService.getAiParam("falai_img2img_strength", 0.75)),
      ...(negativePrompt
        ? { negative_prompt: negativePrompt.replace(/^,\s*/, "") }
        : {}),
      image_size:
        params.aspectRatio === "16:9"
          ? "landscape_16_9"
          : params.aspectRatio === "9:16"
            ? "portrait_16_9"
            : "square_hd",
      num_images: 1,
      num_inference_steps: await AdminConfigService.getAiParam(
        "falai_inference_steps",
        28,
      ),
      guidance_scale: await AdminConfigService.getAiParam(
        "falai_guidance_scale",
        3.5,
      ),
    },
    {
      headers: {
        Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: await AdminConfigService.getTimeout("falai_img2img_ms", 90000),
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
      ip_adapter_scale: await AdminConfigService.getAiParam(
        "falai_ip_adapter_scale",
        0.7,
      ),
      image_size:
        params.aspectRatio === "16:9"
          ? "landscape_16_9"
          : params.aspectRatio === "9:16"
            ? "portrait_16_9"
            : "square_hd",
      num_images: 1,
      num_inference_steps: await AdminConfigService.getAiParam(
        "falai_inference_steps",
        28,
      ),
      guidance_scale: await AdminConfigService.getAiParam(
        "falai_guidance_scale",
        3.5,
      ),
    },
    {
      headers: {
        Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      timeout: await AdminConfigService.getTimeout(
        "falai_ip_adapter_ms",
        90000,
      ),
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

// ── Gemini img2img ───────────────────────────────────────────────────────────

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
            { inlineData: { mimeType, data: imageBase64 } },
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

// ── LaoZhang Kontext ───────────────────────────────────────────────────────

export async function generateViaLaoZhangKontext(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new ValidationError(
      "reference image URL required",
      "referenceImageUrl",
    );

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
  throw new ProviderError("LaoZhang", "Kontext: no image returned");
}

// ── EvoLink ────────────────────────────────────────────────────────────────

export async function generateViaEvoLinkImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new ValidationError(
      "reference image URL required",
      "referenceImageUrl",
    );

  const models = ["qwen-image-edit-plus", "wan2.5-image-to-image"];
  for (const model of models) {
    try {
      return await evolinkImageGenerate(model, prompt, imageUrl);
    } catch (err) {
      logger.warn(`EvoLink ${model} failed: ${(err as Error).message}`);
    }
  }
  throw new AllProvidersFailedError("EvoLink img2img");
}

async function evolinkImageGenerate(
  model: string,
  prompt: string,
  imageUrl?: string,
): Promise<ImageGenerationResult> {
  const body: Record<string, unknown> = { model, prompt };
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
  if (!taskId) throw new ProviderError("EvoLink", "img2img: no task ID");

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
      if (url) {
        return {
          success: true,
          imageUrl: url,
          provider: `evolink_${model.replace(/[.-]/g, "_")}`,
          mode: imageUrl ? "img2img" : "text2img",
        };
      }
      throw new ProviderError("EvoLink", "img2img: completed but no URL");
    }
    if (status === "failed" || status === "error") {
      throw new ProviderError(
        "EvoLink",
        `img2img: ${poll.data?.error || "generation failed"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new ProviderTimeoutError("EvoLink", 0);
}

// ── PiAPI ──────────────────────────────────────────────────────────────────

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
    throw new ProviderError(
      "PiAPI",
      `no task_id in response: ${JSON.stringify(response.data).slice(0, 200)}`,
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
      throw new ProviderError("PiAPI", "completed but no image URL");
    }
    if (status === "failed") {
      throw new ProviderError(
        "PiAPI",
        `task failed: ${pollData?.error || "Unknown error"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new ProviderTimeoutError("PiAPI", 0);
}

export async function generateViaPiAPIImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new ValidationError(
      "reference image URL required",
      "referenceImageUrl",
    );

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
  if (!taskId) throw new ProviderError("PiAPI", "img2img: no task_id");

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
      throw new ProviderError("PiAPI", "img2img: completed but no image URL");
    }
    if (status === "failed")
      throw new ProviderError(
        "PiAPI",
        `img2img: ${pollData?.error || "failed"}`,
      );
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new ProviderTimeoutError("PiAPI", 0);
}

// ── SegMind ────────────────────────────────────────────────────────────────

export async function generateViaSegmindIPAdapter(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const avatarUrl = params.avatarImageUrl;
  if (!avatarUrl)
    throw new ValidationError("avatar image URL required", "avatarUrl");

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

  if (
    response.data &&
    String(response.headers["content-type"] || "").includes("image")
  ) {
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = String(response.headers["content-type"] || "image/png");
    return {
      success: true,
      imageUrl: `data:${mimeType};base64,${base64}`,
      provider: "segmind_ip_adapter",
      mode: "ip_adapter",
    };
  }
  throw new ProviderError("SegMind", "IP-Adapter: no image returned");
}

export async function generateViaSegmindImg2Img(
  prompt: string,
  params: ImageGenerationParams,
): Promise<ImageGenerationResult> {
  const imageUrl = params.referenceImageUrl;
  if (!imageUrl)
    throw new ValidationError(
      "reference image URL required",
      "referenceImageUrl",
    );

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
      headers: {
        "x-api-key": getConfig().SEGMIND_API_KEY || "",
        "Content-Type": "application/json",
      },
      timeout: 90000,
      responseType: "arraybuffer",
    },
  );

  if (
    response.data &&
    String(response.headers["content-type"] || "").includes("image")
  ) {
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = String(response.headers["content-type"] || "image/png");
    return {
      success: true,
      imageUrl: `data:${mimeType};base64,${base64}`,
      provider: "segmind_img2img",
      mode: "img2img",
    };
  }
  throw new ProviderError("SegMind", "img2img: no image returned");
}
