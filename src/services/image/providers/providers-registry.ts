/**
 * Image Providers Registry
 *
 * Assembles the ordered provider chain from per-provider implementations.
 * Split from image/providers.ts to reduce file size.
 */

import { getConfig } from "@/config/env";
import type { ProviderFn } from "./image-text2img";

export type { ProviderFn };
export {
  getDims,
  getImageDimensions,
  mapAspectRatio,
  GEMINIGEN_API_BASE,
} from "./image-text2img";

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

// Text2img providers
import {
  generateViaOmniRoute,
  generateViaTogether,
  generateViaLaoZhangGptImage,
  generateViaSiliconFlow,
  generateViaNvidia,
  generateViaGemini,
  generateViaGeminiGen,
  generateViaRunwareImg,
  generateViaWaveSpeedImg,
  generateViaZAIImg,
} from "./image-text2img";

import {
  generateViaFalai,
  generateViaFalaiImg2Img,
  generateViaFalaiIPAdapter,
  generateViaGeminiImg2Img,
  generateViaLaoZhangKontext,
  generateViaEvoLinkImg2Img,
  generateViaPiAPI,
  generateViaPiAPIImg2Img,
  generateViaSegmindImg2Img,
  generateViaSegmindIPAdapter,
} from "./image-img2img";

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
