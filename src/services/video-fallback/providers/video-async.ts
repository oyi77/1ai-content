/**
 * Video Async Providers — all polling-based provider implementations.
 * Split from video-fallback/providers.ts to reduce file size.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { ProviderError, ProviderTimeoutError, ConfigError } from "@/utils/app-errors";
import axios from "axios";
import FormData from "form-data";
import * as fs from "fs";
import * as path from "path";

export const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";
const POLL_INTERVAL = 5000;
const POLL_MAX_ATTEMPTS = 60;


function getVideoDir(): string {
  return getConfig().VIDEO_DIR || '/tmp/videos';
}

export interface VideoFallbackParams {
  prompt: string;
  duration: number;
  aspectRatio: string;
  style?: string;
  niche?: string;
  referenceImage?: string | null;
  _forceProvider?: string;
}

export interface VideoFallbackResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  jobId?: string;
  error?: string;
  provider?: string;
}

export interface VideoProvider {
  key: string;
  name: string;
  enabled: boolean;
  supportsRefImage: boolean;
  maxDuration: number;
  generate: (params: VideoFallbackParams) => Promise<VideoFallbackResult>;
}

export function mapAspectRatio(ratio: string): string {
  const map: Record<string, string> = {
    "9:16": "portrait",
    "16:9": "landscape",
    "1:1": "square",
  };
  return map[ratio] || "portrait";
}

export function mapAspectRatioSimple(ratio: string): string {
  if (ratio === "9:16") return "9:16";
  if (ratio === "1:1") return "1:1";
  return "16:9";
}

export function readRefImageBase64(refPath: string): string | null {
  if (refPath && fs.existsSync(refPath) && fs.statSync(refPath).size > 0) {
    return `data:image/jpeg;base64,${fs.readFileSync(refPath).toString("base64")}`;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollUntilComplete(
  providerName: string,
  taskId: string,
  pollFn: (id: string) => Promise<{ status: "pending" | "completed" | "failed"; videoUrl?: string }>,
  config: { maxAttempts: number; intervalMs: number } = { maxAttempts: POLL_MAX_ATTEMPTS, intervalMs: POLL_INTERVAL },
): Promise<string> {
  for (let i = 0; i < config.maxAttempts; i++) {
    await sleep(config.intervalMs);
    const result = await pollFn(taskId);
    if (result.status === "completed") {
      if (!result.videoUrl) throw new ProviderError(providerName, "completed but no video URL");
      return result.videoUrl;
    }
    if (result.status === "failed") throw new ProviderError(providerName, "generation failed");
  }
  throw new ProviderTimeoutError(providerName, config.maxAttempts * config.intervalMs);
}

// ── Providers ─────────────────────────────────────────────────────────────────

async function generateViaGeminiGen(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const formData = new FormData();
  formData.append("prompt", params.prompt);
  formData.append("model", "grok-3");
  formData.append("duration", String(Math.min(5, params.duration)));
  formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio));

  if (params.referenceImage && fs.existsSync(params.referenceImage) && fs.statSync(params.referenceImage).size > 0) {
    formData.append("ref_image", fs.readFileSync(params.referenceImage), {
      filename: path.basename(params.referenceImage),
      contentType: "image/jpeg",
    });
  }

  const response = await axios.post(`${GEMINIGEN_API_BASE}/video-gen/grok`, formData, {
    headers: { "x-api-key": getConfig().GEMINIGEN_API_KEY || "", ...formData.getHeaders() },
    timeout: 30000,
  });

  const { uuid } = response.data;
  logger.info(`GeminiGen video started: ${uuid}`);

  const videoUrl = await pollUntilComplete("GeminiGen", uuid, async (id) => {
    const poll = await axios.get(`${GEMINIGEN_API_BASE}/history/${id}`, {
      headers: { "x-api-key": getConfig().GEMINIGEN_API_KEY || "" },
      timeout: 10000,
    });
    const { status: s, generated_video, error_message } = poll.data;
    if (s === 3) throw new ProviderError("GeminiGen", error_message || "generation failed");
    if (s === 2 && generated_video?.length > 0) {
      return { status: "completed", videoUrl: generated_video[0].video_url || generated_video[0].video_uri };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId: uuid, provider: "geminigen" };
}

async function generateViaFalai(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const hasRefImage = !!(params.referenceImage && fs.existsSync(params.referenceImage));
  const model = hasRefImage ? "fal-ai/kling-video/v1.6/standard/image-to-video" : "fal-ai/kling-video/v1.6/standard/text-to-video";

  const payload: any = {
    prompt: params.prompt,
    duration: "5",
    aspect_ratio: mapAspectRatioSimple(params.aspectRatio),
  };

  if (hasRefImage) {
    const imgBase64 = readRefImageBase64(params.referenceImage!);
    if (imgBase64) payload.image_url = imgBase64;
  }

  const submitRes = await axios.post(`https://queue.fal.run/${model}`, payload, {
    headers: { Authorization: `Key ${getConfig().FALAI_API_KEY || ""}`, "Content-Type": "application/json" },
    timeout: 30000,
  });

  const requestId = submitRes.data?.request_id;
  const statusUrl: string = submitRes.data?.status_url;
  const responseUrl: string = submitRes.data?.response_url;
  if (!requestId || !statusUrl || !responseUrl) {
    throw new ProviderError("Fal.ai", `incomplete queue response: ${JSON.stringify(submitRes.data)}`);
  }
  logger.info(`Fal.ai video queued: ${requestId} (model: ${model})`);

  let pollCount = 0;
  const videoUrl = await pollUntilComplete("Fal.ai", requestId, async () => {
    const statusRes = await axios.get(statusUrl, {
      headers: { Authorization: `Key ${getConfig().FALAI_API_KEY || ""}` },
      timeout: 15000,
    });
    const status = statusRes.data?.status;
    if (pollCount % 6 === 0) logger.info(`Fal.ai poll ${pollCount + 1}/${POLL_MAX_ATTEMPTS}: ${status}`);
    pollCount++;
    if (status === "FAILED") throw new ProviderError("Fal.ai", statusRes.data?.error || "generation failed");
    if (status === "COMPLETED") {
      const resultRes = await axios.get(responseUrl, {
        headers: { Authorization: `Key ${getConfig().FALAI_API_KEY || ""}` },
        timeout: 15000,
      });
      const url = resultRes.data?.video?.url || resultRes.data?.video_url || resultRes.data?.output?.video?.url || resultRes.data?.output?.video_url;
      if (!url) throw new ProviderError("Fal.ai", "COMPLETED but no video URL in result");
      return { status: "completed", videoUrl: url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "falai", jobId: requestId };
}

async function generateViaSiliconFlow(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const payload: any = {
    model: "Wan-AI/Wan2.1-T2V-14B",
    prompt: params.prompt,
    image_size: params.aspectRatio === "9:16" ? "480x832" : params.aspectRatio === "1:1" ? "640x640" : "832x480",
    num_frames: Math.round(params.duration * 16),
  };

  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    payload.model = "Wan-AI/Wan2.1-I2V-14B-720P";
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) payload.image = imgBase64;
  }

  const response = await axios.post("https://api.siliconflow.cn/v1/video/submit", payload, {
    headers: { Authorization: `Bearer ${getConfig().SILICONFLOW_API_KEY || ""}`, "Content-Type": "application/json" },
    timeout: 30000,
  });

  const requestId = response.data?.requestId;
  if (!requestId) throw new ProviderError("SiliconFlow", "no requestId");

  const videoUrl = await pollUntilComplete("SiliconFlow", requestId, async (id) => {
    const poll = await axios.post("https://api.siliconflow.cn/v1/video/status", { requestId: id }, {
      headers: { Authorization: `Bearer ${getConfig().SILICONFLOW_API_KEY || ""}`, "Content-Type": "application/json" },
      timeout: 10000,
    });
    const status = poll.data?.status;
    if (status === "Failed") throw new ProviderError("SiliconFlow", poll.data?.reason || "generation failed");
    if (status === "Succeed" && poll.data?.results?.videos?.[0]?.url) {
      return { status: "completed", videoUrl: poll.data.results.videos[0].url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "siliconflow" };
}

async function generateViaXAI(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const formData = new FormData();
  formData.append("prompt", params.prompt);
  formData.append("model", "grok-2-1212");
  formData.append("duration", String(Math.min(5, params.duration)));
  formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio));

  if (params.referenceImage && fs.existsSync(params.referenceImage) && fs.statSync(params.referenceImage).size > 0) {
    formData.append("ref_image", fs.readFileSync(params.referenceImage), {
      filename: path.basename(params.referenceImage),
      contentType: "image/jpeg",
    });
  }

  const apiKey = getConfig().GEMINIGEN_API_KEY || getConfig().XAI_API_KEY || "";
  if (!apiKey) throw new ConfigError("XAI_API_KEY");

  const response = await axios.post(`${GEMINIGEN_API_BASE}/video-gen/grok`, formData, {
    headers: { "x-api-key": apiKey, ...formData.getHeaders() },
    timeout: 30000,
  });

  const { uuid } = response.data;
  logger.info(`XAI video started via proxy: ${uuid}`);

  const videoUrl = await pollUntilComplete("XAI", uuid, async (id) => {
    const poll = await axios.get(`${GEMINIGEN_API_BASE}/history/${id}`, {
      headers: { "x-api-key": apiKey },
      timeout: 10000,
    });
    const { status: s, generated_video, error_message } = poll.data;
    if (s === 3) throw new ProviderError("XAI", error_message || "generation failed");
    if (s === 2 && generated_video?.length > 0) {
      return { status: "completed", videoUrl: generated_video[0].video_url || generated_video[0].video_uri };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId: uuid, provider: "xai" };
}

async function generateViaEvoLink(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const body: any = {
    model: "wan2.5-text-to-video",
    prompt: params.prompt,
    duration: params.duration,
  };

  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) body.image_url = imgBase64;
  }

  if (params.aspectRatio) body.aspect_ratio = mapAspectRatioSimple(params.aspectRatio);

  const response = await axios.post("https://api.evolink.ai/v1/videos/generations", body, {
    headers: { Authorization: `Bearer ${getConfig().EVOLINK_API_KEY || ""}`, "Content-Type": "application/json" },
    timeout: 30000,
  });

  const taskId = response.data?.id;
  if (!taskId) {
    const errMsg = response.data?.error?.message || JSON.stringify(response.data);
    throw new ProviderError("EvoLink", `no task ID: ${errMsg}`);
  }

  const errorMsg = response.data?.error?.message || "";
  if (errorMsg.toLowerCase().includes("insufficient") || errorMsg.toLowerCase().includes("permanently rejected")) {
    throw new ProviderError("EvoLink", `credits/access denied: ${errorMsg}`, 403);
  }

  const videoUrl = await pollUntilComplete("EvoLink", taskId, async (id) => {
    const poll = await axios.get(`https://api.evolink.ai/v1/tasks/${id}`, {
      headers: { Authorization: `Bearer ${getConfig().EVOLINK_API_KEY || ""}` },
      timeout: 10000,
    });
    const status = poll.data?.status;
    if (status === "failed" || status === "error") {
      throw new ProviderError("EvoLink", `task failed: ${poll.data?.error || "Unknown error"}`);
    }
    if (status === "completed") {
      let url = "";
      const results = poll.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const first = results[0];
        url = typeof first === "object" ? first.url || "" : String(first);
      }
      if (!url) url = poll.data?.output?.url || poll.data?.video_url || "";
      if (!url) throw new ProviderError("EvoLink", "completed but no video URL");
      return { status: "completed", videoUrl: url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId: taskId, provider: "evolink" };
}

async function generateViaHypereal(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const model = params.referenceImage ? "kling-3-0-std-i2v" : "kling-3-0-std-t2v";
  const input: any = { prompt: params.prompt };

  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) input.image = imgBase64;
  }

  input.duration = Math.min(5, params.duration);

  const response = await axios.post(
    "https://api.hypereal.tech/v1/videos/generate",
    { model, input },
    {
      headers: { Authorization: `Bearer ${getConfig().HYPEREAL_API_KEY || ""}`, "Content-Type": "application/json" },
      timeout: 30000,
    },
  );

  const jobId = response.data?.jobId;
  if (!jobId) throw new ProviderError("Hypereal", `no jobId in response: ${JSON.stringify(response.data)}`);

  logger.info(`Hypereal video started: ${jobId}`);

  const videoUrl = await pollUntilComplete("Hypereal", jobId, async (id) => {
    const poll = await axios.get(
      `https://api.hypereal.tech/v1/jobs/${id}?model=${encodeURIComponent(model)}&type=video`,
      { headers: { Authorization: `Bearer ${getConfig().HYPEREAL_API_KEY || ""}` }, timeout: 10000 },
    );
    const status = poll.data?.status;
    if (status === "failed") throw new ProviderError("Hypereal", `job failed: ${poll.data?.error || "Unknown error"}`);
    if (status === "completed") {
      const url = poll.data?.outputUrl || poll.data?.output_url || "";
      if (!url) throw new ProviderError("Hypereal", "completed but no video URL");
      return { status: "completed", videoUrl: url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId, provider: "hypereal" };
}

async function generateViaByteplus(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const payload = {
    model: "bytedance/seedance-1-0-lite-t2v",
    prompt: params.prompt,
    resolution: "480p",
    duration: Math.min(5, params.duration),
    aspect_ratio: mapAspectRatio(params.aspectRatio),
    watermark: false,
  };

  const response = await axios.post("https://api.aimlapi.com/v2/video/generations", payload, {
    headers: { Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || ""}`, "Content-Type": "application/json" },
    timeout: 30000,
  });

  const id = response.data?.id;
  if (!id) throw new ProviderError("BytePlus", "no job id");

  const videoUrl = await pollUntilComplete("BytePlus", id, async (jobId) => {
    const poll = await axios.get(`https://api.aimlapi.com/v2/video/generations/${jobId}`, {
      headers: { Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || ""}` },
      timeout: 10000,
    });
    if (poll.data?.status === "failed") throw new ProviderError("BytePlus", poll.data?.error || "failed");
    if (poll.data?.status === "completed" && poll.data?.output?.video_url) {
      return { status: "completed", videoUrl: poll.data.output.video_url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "byteplus" };
}

async function generateViaKie(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const kieDuration = params.duration >= 8 ? (params.duration >= 10 ? 10 : 8) : 5;
  const body: any = { prompt: params.prompt, duration: kieDuration, quality: "720p", waterMark: "kie.ai" };

  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) body.imageUrl = imgBase64;
  }

  if (!params.referenceImage) body.aspectRatio = mapAspectRatioSimple(params.aspectRatio);

  const response = await axios.post("https://api.kie.ai/api/v1/runway/generate", body, {
    headers: { Authorization: `Bearer ${getConfig().KIE_API_KEY || ""}`, "Content-Type": "application/json" },
    timeout: 30000,
  });

  if (response.data?.code !== 200) {
    throw new ProviderError("Kie.ai", response.data?.msg || "Unknown error");
  }

  const msg = response.data?.msg || "";
  if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("balance")) {
    throw new ProviderError("Kie.ai", `credits insufficient: ${msg}`, 402);
  }

  const taskId = response.data?.data?.taskId;
  if (!taskId) throw new ProviderError("Kie.ai", `no taskId in response: ${JSON.stringify(response.data)}`);

  logger.info(`Kie.ai video started: ${taskId}`);

  const videoUrl = await pollUntilComplete("Kie.ai", taskId, async (id) => {
    const poll = await axios.get(`https://api.kie.ai/api/v1/runway/record-detail?taskId=${id}`, {
      headers: { Authorization: `Bearer ${getConfig().KIE_API_KEY || ""}` },
      timeout: 10000,
    });
    if (poll.data?.code !== 200) return { status: "pending" };
    const data = poll.data?.data || {};
    const status = data.state || data.status;
    if (status === "failed" || status === "error" || status === "fail") {
      throw new ProviderError("Kie.ai", `task failed: ${data.msg || "Unknown error"}`);
    }
    if (status === "success" || status === "completed") {
      const url = data.videoInfo?.videoUrl || data.videoUrl || "";
      if (!url) throw new ProviderError("Kie.ai", "completed but no video URL");
      return { status: "completed", videoUrl: url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId: taskId, provider: "kie" };
}

async function generateViaPiAPI(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const input: any = {
    prompt: params.prompt,
    duration: Math.min(5, params.duration),
    aspect_ratio: mapAspectRatioSimple(params.aspectRatio),
  };

  let taskType = "txt2video";
  if (params.referenceImage && fs.existsSync(params.referenceImage)) {
    const imgBase64 = readRefImageBase64(params.referenceImage);
    if (imgBase64) { input.image_url = imgBase64; taskType = "img2video"; }
  }

  const response = await axios.post(
    "https://api.piapi.ai/api/v1/task",
    { model: "Qubico/kling1.6-standard", task_type: taskType, input },
    {
      headers: { "x-api-key": getConfig().PIAPI_API_KEY || "", "Content-Type": "application/json" },
      timeout: 30000,
    },
  );

  const taskId = response.data?.data?.task_id;
  if (!taskId) throw new ProviderError("PiAPI", `video: no task_id: ${JSON.stringify(response.data).slice(0, 200)}`);

  logger.info(`PiAPI video started: ${taskId}`);

  const videoUrl = await pollUntilComplete("PiAPI", taskId, async (id) => {
    const poll = await axios.get(`https://api.piapi.ai/api/v1/task/${id}`, {
      headers: { "x-api-key": getConfig().PIAPI_API_KEY || "" },
      timeout: 10000,
    });
    if (poll.status === 429) { logger.warn("PiAPI video: rate limited, backing off"); await sleep(10000); return { status: "pending" }; }
    const pollData = poll.data?.data;
    const status = pollData?.status;
    if (status === "failed") throw new ProviderError("PiAPI", `video: ${pollData?.error || "task failed"}`);
    if (status === "completed") {
      const output = pollData?.output;
      logger.info("PiAPI video response: " + JSON.stringify(pollData).slice(0, 500));
      const url =
        output?.video_url || (Array.isArray(output?.videos) ? output.videos[0] : null) ||
        (Array.isArray(output?.video_urls) ? output.video_urls[0] : null) ||
        output?.result?.video_url || output?.url || output?.works?.[0]?.video?.url;
      if (!url) throw new ProviderError("PiAPI", "video: completed but no video URL");
      return { status: "completed", videoUrl: url };
    }
    return { status: "pending" };
  });
  return { success: true, videoUrl, jobId: taskId, provider: "piapi" };
}

async function generateViaLingyaAI(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().LINGYAAI_API_KEY || "";
  if (!API_KEY) return { success: false, error: "LINGYAAI_API_KEY not configured", provider: "lingyaai" };

  const resp = await axios.post(
    "https://api.lingyaai.cn/v1/video/generations",
    { model: "sora-2", prompt: params.prompt, duration: params.duration, aspect_ratio: mapAspectRatioSimple(params.aspectRatio) },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 },
  );

  const taskId = resp.data?.id || resp.data?.taskId;
  if (!taskId) throw new ProviderError("LingyaAI", "no task id");

  const videoUrl = await pollUntilComplete("LingyaAI", taskId, async (id) => {
    const poll = await axios.get(`https://api.lingyaai.cn/v1/video/generations/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    if (poll.data?.status === "completed" || poll.data?.status === "succeeded")
      return { status: "completed", videoUrl: poll.data.video_url || poll.data.url || poll.data.output?.url };
    if (poll.data?.status === "failed") throw new ProviderError("LingyaAI", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "lingyaai" };
}

async function generateViaGetGoAPI(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().GETGOAPI_API_KEY || "";
  if (!API_KEY) return { success: false, error: "GETGOAPI_API_KEY not configured", provider: "getgoapi" };

  const resp = await axios.post(
    "https://api.getgoapi.com/v1/video/generations",
    { model: "video-gen", prompt: params.prompt, duration: params.duration, aspect_ratio: mapAspectRatioSimple(params.aspectRatio) },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 },
  );

  const taskId = resp.data?.id || resp.data?.taskId;
  if (!taskId) throw new ProviderError("GetGoAPI", "no task id");

  const videoUrl = await pollUntilComplete("GetGoAPI", taskId, async (id) => {
    const poll = await axios.get(`https://api.getgoapi.com/v1/video/generations/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    if (poll.data?.status === "completed" || poll.data?.status === "succeeded")
      return { status: "completed", videoUrl: poll.data.video_url || poll.data.url || poll.data.output?.url };
    if (poll.data?.status === "failed") throw new ProviderError("GetGoAPI", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "getgoapi" };
}

async function generateViaApiYi(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().APIYI_API_KEY || "";
  if (!API_KEY) return { success: false, error: "APIYI_API_KEY not configured", provider: "apiyi" };

  const resp = await axios.post(
    "https://api.apiyi.com/v1/videos/generations",
    { model: "sora-2", prompt: params.prompt, duration: params.duration },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 120000 },
  );

  const taskId = resp.data?.id || resp.data?.taskId;
  if (!taskId) throw new ProviderError("ApiYi", "no task id");

  const videoUrl = await pollUntilComplete("ApiYi", taskId, async (id) => {
    const poll = await axios.get(`https://api.apiyi.com/v1/videos/generations/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    if (poll.data?.status === "completed" || poll.data?.status === "succeeded")
      return { status: "completed", videoUrl: poll.data.video_url || poll.data.url };
    if (poll.data?.status === "failed") throw new ProviderError("ApiYi", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "apiyi" };
}

async function generateViaRunware(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().RUNWARE_API_KEY || "";
  if (!API_KEY) return { success: false, error: "RUNWARE_API_KEY not configured", provider: "runware" };

  const resp = await axios.post(
    "https://api.runware.ai/v1/video",
    { prompt: params.prompt, duration: Math.min(5, params.duration), aspectRatio: mapAspectRatioSimple(params.aspectRatio) },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 },
  );

  const taskId = resp.data?.data?.[0]?.uuid || resp.data?.uuid;
  if (!taskId) throw new ProviderError("Runware", "no task id");

  const videoUrl = await pollUntilComplete("Runware", taskId, async (id) => {
    const poll = await axios.get(`https://api.runware.ai/v1/video/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    const status = poll.data?.data?.[0]?.status || poll.data?.status;
    if (status === "completed" || status === "complete")
      return { status: "completed", videoUrl: poll.data?.data?.[0]?.videoUrl || poll.data?.videoUrl };
    if (status === "failed") throw new ProviderError("Runware", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "runware" };
}

async function generateViaWaveSpeed(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().WAVESPEED_API_KEY || "";
  if (!API_KEY) return { success: false, error: "WAVESPEED_API_KEY not configured", provider: "wavespeed" };

  const resp = await axios.post(
    "https://api.wavespeed.ai/v1/video/generations",
    { model: "wavespeed-video", prompt: params.prompt, duration: Math.min(5, params.duration) },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 },
  );

  const taskId = resp.data?.id || resp.data?.taskId;
  if (!taskId) throw new ProviderError("WaveSpeed", "no task id");

  const videoUrl = await pollUntilComplete("WaveSpeed", taskId, async (id) => {
    const poll = await axios.get(`https://api.wavespeed.ai/v1/video/generations/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    if (poll.data?.status === "completed" || poll.data?.status === "succeeded")
      return { status: "completed", videoUrl: poll.data.video_url || poll.data.url || poll.data.output?.url };
    if (poll.data?.status === "failed") throw new ProviderError("WaveSpeed", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "wavespeed" };
}

async function generateViaZAI(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const API_KEY = getConfig().ZAI_API_KEY || "";
  if (!API_KEY) return { success: false, error: "ZAI_API_KEY not configured", provider: "zai_video" };

  const resp = await axios.post(
    "https://api.z.ai/v1/video/generate",
    { prompt: params.prompt, duration: Math.min(5, params.duration), aspect_ratio: mapAspectRatioSimple(params.aspectRatio) },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 },
  );

  const taskId = resp.data?.id || resp.data?.taskId;
  if (!taskId) throw new ProviderError("Z.ai", "no task id");

  const videoUrl = await pollUntilComplete("ZAI", taskId, async (id) => {
    const poll = await axios.get(`https://api.z.ai/v1/video/generate/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 10000,
    });
    if (poll.data?.status === "completed" || poll.data?.status === "succeeded")
      return { status: "completed", videoUrl: poll.data.video_url || poll.data.url || poll.data.output?.url };
    if (poll.data?.status === "failed") throw new ProviderError("Z.ai", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "zai_video" };
}

async function generateViaOmniRouteVideo(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const config = getConfig();
  const OMNIROUTE_URL = config.OMNIROUTE_URL || "http://localhost:20128";
  const OMNIROUTE_API_KEY = config.OMNIROUTE_API_KEY || "";
  if (!OMNIROUTE_API_KEY) return { success: false, error: "OMNIROUTE_API_KEY not configured", provider: "omniroute" };

  const resp = await axios.post(
    `${OMNIROUTE_URL}/v1/videos/generations`,
    { model: "wan-video", prompt: params.prompt, duration: Math.min(10, params.duration), aspect_ratio: mapAspectRatioSimple(params.aspectRatio) },
    { headers: { Authorization: `Bearer ${OMNIROUTE_API_KEY}`, "Content-Type": "application/json" }, timeout: 120000 },
  );

  const taskId = resp.data?.id || resp.data?.task_id;
  if (!taskId) throw new ProviderError("OmniRoute", "no task id");

  const videoUrl = await pollUntilComplete("OmniRoute", taskId, async (id) => {
    const poll = await axios.get(`${OMNIROUTE_URL}/v1/videos/generations/${id}`, {
      headers: { Authorization: `Bearer ${OMNIROUTE_API_KEY}` }, timeout: 10000,
    });
    const status = poll.data?.status;
    if (status === "completed" || status === "succeeded")
      return { status: "completed", videoUrl: poll.data?.video_url || poll.data?.url || poll.data?.output?.url };
    if (status === "failed") throw new ProviderError("OmniRoute", "generation failed");
    return { status: "pending" };
  });
  return { success: true, videoUrl, provider: "omniroute" };
}

async function generateViaMPT(params: VideoFallbackParams): Promise<VideoFallbackResult> {
  const config = getConfig();
  const PEXELS_API_KEY = config.PEXELS_API_KEYS?.split(",")?.[0] || config.PEXELS_API_KEY || "";
  
  if (!PEXELS_API_KEY) {
    return { success: false, error: "PEXELS_API_KEY not configured", provider: "mpt" };
  }

  try {
    const { MoneyPrinterService } = require("@/services/money-printer.service");
    const mpt = new MoneyPrinterService();
    
    const mptParams = {
      audio_file: "",
      voice_text: params.prompt,
      output_dir: path.join(getVideoDir(), `mpt-${Date.now()}`),
      materials_source: "pexels",
      materials_api_key: PEXELS_API_KEY,
      materials_query: params.prompt,
      video_aspect: params.aspectRatio === "9:16" ? "9:16" : params.aspectRatio === "1:1" ? "1:1" : "16:9",
      video_concat_mode: "sequential",
      max_clip_duration: Math.min(10, params.duration),
      subtitle_enabled: false,
      voice_name: "en-US-ChristopherNeural",
      n_threads: 2,
    };

    const result = await mpt.generateVideo(mptParams);
    
    if (!result.success || !result.video_paths?.length) {
      return {
        success: false,
        error: result.error || "MPT generation failed",
        provider: "mpt",
      };
    }

    return {
      success: true,
      videoUrl: `file://${result.video_paths[0]}`,
      provider: "mpt",
    };
  } catch (err) {
    const error = err as Error;
    logger.error("MPT generation error:", { message: error.message });
    return {
      success: false,
      error: `MPT error: ${error.message}`,
      provider: "mpt",
    };
  }
}

export {
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
  generateViaOmniRouteVideo,
  generateViaMPT,
};