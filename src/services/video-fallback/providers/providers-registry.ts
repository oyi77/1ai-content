/**
 * Video Fallback Providers Registry
 * Assembles the ordered provider chain from per-provider implementations.
 */

import { getConfig } from "@/config/env";
export type { VideoFallbackParams, VideoFallbackResult, VideoProvider } from "./video-async";
export { mapAspectRatio, mapAspectRatioSimple, readRefImageBase64 } from "./video-async";

import { generateViaLaoZhang } from "./video-sync";
import {
  generateViaOmniRouteVideo,
  generateViaGeminiGen,
  generateViaFalai,
  generateViaSiliconFlow,
  generateViaXAI,
  generateViaEvoLink,
  generateViaHypereal,
  generateViaByteplus,
  generateViaKie,
  generateViaPiAPI,
  generateViaLingyaAI,
  generateViaGetGoAPI,
  generateViaApiYi,
  generateViaRunware,
  generateViaWaveSpeed,
  generateViaZAI,
} from "./video-async";

export function getProviders() {
  return [
    { key: "omniroute", name: "OmniRoute (Smart Routing)", enabled: !!getConfig().OMNIROUTE_API_KEY, supportsRefImage: false, maxDuration: 10, generate: generateViaOmniRouteVideo },
    { key: "geminigen", name: "GeminiGen", enabled: !!getConfig().GEMINIGEN_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaGeminiGen },
    { key: "falai", name: "Fal.ai Video", enabled: !!getConfig().FALAI_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaFalai },
    { key: "siliconflow", name: "SiliconFlow Video", enabled: !!getConfig().SILICONFLOW_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaSiliconFlow },
    { key: "xai", name: "XAI Grok", enabled: !!(getConfig().GEMINIGEN_API_KEY || getConfig().XAI_API_KEY), supportsRefImage: true, maxDuration: 5, generate: generateViaXAI },
    { key: "laozhang", name: "LaoZhang Sora", enabled: !!getConfig().LAOZHANG_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaLaoZhang },
    { key: "evolink", name: "EvoLink Video", enabled: !!getConfig().EVOLINK_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaEvoLink },
    { key: "hypereal", name: "Hypereal AI", enabled: !!getConfig().HYPEREAL_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaHypereal },
    { key: "byteplus", name: "BytePlus Seedance", enabled: !!getConfig().BYTEPLUS_API_KEY, supportsRefImage: false, maxDuration: 5, generate: generateViaByteplus },
    { key: "kie", name: "Kie.ai", enabled: !!getConfig().KIE_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaKie },
    { key: "piapi", name: "PiAPI (Kling)", enabled: !!getConfig().PIAPI_API_KEY, supportsRefImage: true, maxDuration: 5, generate: generateViaPiAPI },
    { key: "lingyaai", name: "LingyaAI", enabled: !!getConfig().LINGYAAI_API_KEY, supportsRefImage: false, maxDuration: 10, generate: generateViaLingyaAI },
    { key: "getgoapi", name: "GetGoAPI", enabled: !!getConfig().GETGOAPI_API_KEY, supportsRefImage: false, maxDuration: 10, generate: generateViaGetGoAPI },
    { key: "apiyi", name: "ApiYi (Sora 2)", enabled: !!getConfig().APIYI_API_KEY, supportsRefImage: false, maxDuration: 10, generate: generateViaApiYi },
    { key: "runware", name: "Runware", enabled: !!getConfig().RUNWARE_API_KEY, supportsRefImage: false, maxDuration: 5, generate: generateViaRunware },
    { key: "wavespeed", name: "WaveSpeed", enabled: !!getConfig().WAVESPEED_API_KEY, supportsRefImage: false, maxDuration: 5, generate: generateViaWaveSpeed },
    { key: "zai_video", name: "Z.ai Video", enabled: !!getConfig().ZAI_API_KEY, supportsRefImage: false, maxDuration: 5, generate: generateViaZAI },
  ];
}