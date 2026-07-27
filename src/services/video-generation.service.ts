/**
 * Video Generation Service - Multi-Provider with Niche/Style Selection
 *
 * Handles AI video generation with fallback chain:
 * 1. GeminiGen.ai (primary)
 * 2. BytePlus Seedance (fallback)
 * 3. Demo mode (fallback for testing)
 */

import type { Video } from "@prisma/client";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import axios from "axios";
import FormData from "form-data";
import { CircuitBreaker } from "@/services/circuit-breaker.service";
import { PromptOptimizer } from "@/services/prompt-optimizer.service";
import { ProviderRouter } from "@/services/provider-router.service";
import { QualityCheckService } from "@/services/quality-check.service";
import { getVideoCreditCost } from "@/config/pricing";
import { AITaskSettingsService, AITaskProvider } from "@/services/ai-task-settings.service";
import { trackTokens } from "@/services/token-tracker.service";
import { pipelineGenerate } from "@/services/shared-ai-pipeline.service";
import { NICHE_CONFIG, getNicheConfig, resolveNicheKey } from "@/config/niches";
export { getNicheConfig, resolveNicheKey };

const GEMINIGEN_API_BASE = "https://api.geminigen.ai/uapi/v1";

// Demo mode - returns sample video URLs for testing
function isDemoMode(): boolean {
  const config = getConfig();
  return config.DEMO_MODE || !config.GEMINIGEN_API_KEY;
}

// ============================================================================
// NICHES & STYLES
// ============================================================================

// Backward-compatible re-export for consumers that import NICHES from this module
export const NICHES: Record<string, { name: string; emoji: string; styles: string[] }> =
  Object.fromEntries(
    Object.keys(NICHE_CONFIG).map(k => {
      const v = NICHE_CONFIG[k as keyof typeof NICHE_CONFIG];
      return [k, { name: v.name, emoji: v.emoji, styles: (v.keywords as string[]).slice(0, 3) }];
    })
  );

export const PROVIDERS = {
  geminigen: {
    name: "GeminiGen",
    apiKey: getConfig().GEMINIGEN_API_KEY || "",
    priority: 1,
    maxDuration: 5,
  },
  byteplus: {
    name: "BytePlus Seedance",
    apiKey: getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || "",
    priority: 2,
    maxDuration: 5,
  },
  demo: {
    name: "Demo",
    apiKey: "demo",
    priority: 99,
    maxDuration: 300,
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface VideoGenerationResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  provider?: string;
  jobId?: string;
}

export interface VideoGenerationParams {
  prompt?: string;
  niche?: string;
  styles?: string[];
  duration: number;
  aspectRatio?: string;
  style?: string;
  referenceImageUrl?: string;
  scenes?: number;
  userId?: bigint;
  jobId?: string;
  _forceProvider?: string;
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Main video generation function with multi-provider fallback
 */
export async function generateVideo(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const niche = params.niche || "fnb";
  const styles = params.styles || ["appetizing"];
  logger.info(
    `🎬 Starting video generation: niche=${niche}, styles=${styles.join(",")}, duration=${params.duration}s`,
  );

  const duration = Math.max(4, Math.min(15, params.duration));

  let prompt = params.prompt;
  if (!prompt) {
    prompt = await generatePromptFromNicheAsync(niche, styles, duration);
  }

  // Handle playground/debug force provider
  if (params._forceProvider) {
    const providerKey = params._forceProvider;
    logger.info(`🛠️ [Playground] Forcing provider: ${providerKey}`);
    const optimizedPrompt = await PromptOptimizer.optimizeForProvider(
      prompt,
      providerKey,
      niche,
      styles,
    );
    const result = await dispatchToProvider(providerKey, {
      ...params,
      prompt: optimizedPrompt,
      duration,
    });
    return { ...result, provider: providerKey };
  }

  if (getConfig().GEMINIGEN_API_KEY) {
    try {
      logger.info("🤖 Trying GeminiGen (priority 0)...");
      const result = await generateWithGeminiGen({
        ...params,
        prompt,
        duration,
      });

      if (result.success) {
        return { ...result, provider: "geminigen" };
      }

      logger.warn(`❌ GeminiGen failed: ${result.error}`);
    } catch (error) {
      logger.warn(`❌ GeminiGen error: ${(error as Error).message}`);
    }
  }

  // Try providers in priority order (dynamic scoring via ProviderRouter)
  const scoredProviders = await ProviderRouter.getOrderedProviders(
    niche,
    styles,
  );
  for (const { key: providerKey, config: provider } of scoredProviders) {
    const canExecute = await CircuitBreaker.canExecute(providerKey);
    if (!canExecute) {
      logger.info(`⏭️ Skipping ${provider.name}: circuit breaker open`);
      continue;
    }

    const optimizedPrompt = await PromptOptimizer.optimizeForProvider(
      prompt,
      providerKey,
      niche,
      styles,
    );

    try {
      logger.info(
        `🤖 Trying ${provider.name} (priority ${provider.priority})...`,
      );
      const result = await dispatchToProvider(providerKey, {
        ...params,
        prompt: optimizedPrompt,
        duration: Math.min(provider.maxDuration, duration),
      });

      if (result.success) {
        await CircuitBreaker.recordSuccess(providerKey);

        // Quality check - if video quality is low, try next provider
        if (result.videoUrl) {
          try {
            const qualityResult = await QualityCheckService.scoreVideo(
              result.videoUrl,
              niche,
              duration,
              !!params.referenceImageUrl,
            );
            if (!qualityResult.passable) {
              logger.warn(
                `⚠️ ${provider.name} quality check failed (score: ${qualityResult.score}), trying next provider`,
              );
              await CircuitBreaker.recordFailure(providerKey);
              continue;
            }
            logger.info(
              `✅ ${provider.name} quality check passed (score: ${qualityResult.score})`,
            );
          } catch (qcError) {
            logger.warn(`Quality check error, proceeding: ${(qcError as Error).message}`);
          }
        }

        return { ...result, provider: providerKey };
      }

      await CircuitBreaker.recordFailure(providerKey);
      logger.warn(`❌ ${provider.name} failed: ${result.error}`);
    } catch (error) {
      await CircuitBreaker.recordFailure(providerKey);
      logger.warn(`❌ ${provider.name} error: ${(error as Error).message}`);
    }
  }

  if (isDemoMode()) {
    logger.info("📺 Using demo mode - returning sample video");
    return generateDemoVideo(params, duration, niche, styles);
  }

  return {
    success: false,
    error: "All video generation providers failed",
  };
}

// ============================================================================
// PROVIDER DISPATCH
// ============================================================================

async function dispatchToProvider(
  providerKey: string,
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  switch (providerKey) {
    case "geminigen":
      return generateWithGeminiGen(params);
    case "byteplus":
      return generateWithByteplus(params);
    default:
      logger.warn(`No implementation for provider: ${providerKey}`);
      return {
        success: false,
        error: `Provider ${providerKey} not yet implemented`,
      };
  }
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Generate video using GeminiGen.ai
 */
async function generateWithGeminiGen(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const formData = new FormData();
  formData.append("prompt", params.prompt || "");
  formData.append("model", "grok-3");
  formData.append("aspect_ratio", mapAspectRatio(params.aspectRatio || "9:16"));
  formData.append("duration", Math.min(5, params.duration).toString());

  try {
    const response = await axios.post(
      `${GEMINIGEN_API_BASE}/video-gen/grok`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
        },
        timeout: 30000,
      },
    );

    const { uuid, status } = response.data;
    logger.info(`📋 GeminiGen job started: ${uuid}, status: ${status}`);

    // Poll for completion
    const result = await pollGeminiGen(uuid, 60);
    return result;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Generate video using BytePlus Seedance via AIML API
 */
async function generateWithByteplus(
  params: VideoGenerationParams,
): Promise<VideoGenerationResult> {
  const payload = {
    model: "bytedance/seedance-1-0-lite-t2v",
    prompt: params.prompt || "",
    resolution: "480p",
    duration: 5,
    aspect_ratio: mapAspectRatio(params.aspectRatio || "9:16"),
    watermark: false,
  };

  try {
    const response = await axios.post(
      "https://api.aimlapi.com/v2/video/generations",
      payload,
      {
        headers: {
          Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || ""}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const { id, status } = response.data;
    logger.info(`📋 BytePlus job started: ${id}, status: ${status}`);

    // Poll for completion
    const result = await pollByteplus(id, 60);
    return result;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Poll GeminiGen for video completion
 */
async function pollGeminiGen(
  jobId: string,
  maxAttempts: number,
): Promise<VideoGenerationResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `${GEMINIGEN_API_BASE}/history/${jobId}`,
        {
          headers: {
            "x-api-key": getConfig().GEMINIGEN_API_KEY || "",
          },
          timeout: 10000,
        },
      );

      const { status, data } = response.data;

      if (status === "completed" && data?.video_url) {
        logger.info(`✅ GeminiGen video completed: ${data.video_url}`);
        return {
          success: true,
          videoUrl: data.video_url,
          thumbnailUrl: data.thumbnail_url,
          jobId,
        };
      }

      if (status === "failed") {
        return {
          success: false,
          error: `GeminiGen job failed: ${data?.error || "Unknown error"}`,
        };
      }

      logger.info(
        `⏳ GeminiGen still processing... (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await new Promise((r) => setTimeout(r, 2000)); // Wait 2s before retry
    } catch (error) {
      logger.error(`Error polling GeminiGen: ${(error as Error).message}`);
      if (attempt === maxAttempts - 1) {
        return {
          success: false,
          error: `Polling failed: ${(error as Error).message}`,
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    success: false,
    error: "GeminiGen polling timeout",
  };
}

/**
 * Poll BytePlus for video completion
 */
async function pollByteplus(
  jobId: string,
  maxAttempts: number,
): Promise<VideoGenerationResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `https://queue.fal.run/fal-ai/bytedance-seedance/requests/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${getConfig().BYTEPLUS_API_KEY || getConfig().AIML_API_KEY || ""}`,
          },
          timeout: 10000,
        },
      );

      const { status, output } = response.data;

      if (status === "completed" && output?.video_url) {
        logger.info(`✅ BytePlus video completed: ${output.video_url}`);
        return {
          success: true,
          videoUrl: output.video_url,
          thumbnailUrl: output.thumbnail_url,
          jobId,
        };
      }

      if (status === "failed") {
        return {
          success: false,
          error: `BytePlus job failed: ${output?.error || "Unknown error"}`,
        };
      }

      logger.info(
        `⏳ BytePlus still processing... (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      logger.error(`Error polling BytePlus: ${(error as Error).message}`);
      if (attempt === maxAttempts - 1) {
        return {
          success: false,
          error: `Polling failed: ${(error as Error).message}`,
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    success: false,
    error: "BytePlus polling timeout",
  };
}

// ============================================================================
// DEMO MODE
// ============================================================================

/**
 * Generate demo video for testing
 */
function generateDemoVideo(
  _params: VideoGenerationParams,
  _duration: number,
  _niche: string,
  _styles: string[],
): VideoGenerationResult {
  const sampleVideos = [
    "https://media.giphy.com/media/RJ8SJ3dIKdCf2/giphy.mp4",
    "https://media.giphy.com/media/3o7TKQfp3x8G5hLJiE/giphy.mp4",
    "https://media.giphy.com/media/26uf1EKv0ZN5sKtJS/giphy.mp4",
    "https://media.giphy.com/media/jW38p3xgeF23rW6KG8/giphy.mp4",
    "https://media.giphy.com/media/12NlCFUvTokWXe/giphy.mp4",
  ];

  const randomVideo =
    sampleVideos[Math.floor(Math.random() * sampleVideos.length)];

  return {
    success: true,
    videoUrl: randomVideo,
    thumbnailUrl:
      "https://via.placeholder.com/1080x1920/000000/ffffff?text=Demo+Video",
    jobId: `demo-${Date.now()}`,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Map aspect ratio string to provider format
 */
function mapAspectRatio(aspectRatio: string): string {
  const map: Record<string, string> = {
    "9:16": "portrait",
    "16:9": "landscape",
    "1:1": "square",
    "4:5": "portrait",
  };
  return map[aspectRatio] || "portrait";
}

/**
 * Generate prompt based on niche and styles
 */
export function generatePromptFromNiche(
  niche: string,
  styles: string[],
  duration: number,
): string {
  const config = getNicheConfig(niche);
  if (!config) {
    return `Create a ${styles.join(', ') || 'professional'} video for ${niche}, ${duration}s, high quality`;
  }
  const styleStr = styles.length > 0 ? styles.join(', ') : config.keywords.slice(0, 2).join(', ');
  const palette = config.colorPalettes[0] || 'natural';
  const introTemplate = config.sceneTemplates.intro[0]
    .replace(/\{[^}]+\}/g, config.keywords[0] || niche);
  return `Create a ${styleStr} ${config.name.toLowerCase()} video, ${duration}s. Opening: ${introTemplate}. Color palette: ${palette}. Professional quality, trending on social media.`;
}

/**
 * Async version of generatePromptFromNiche — uses configured LLM if provider != builtin.
 * Falls back to template result on failure or when builtin is configured.
 */
export async function generatePromptFromNicheAsync(
  niche: string,
  styles: string[],
  duration: number,
): Promise<string> {
  const templateResult = generatePromptFromNiche(niche, styles, duration);

  try {
    const taskSettings = await AITaskSettingsService.getSettings();
    const cfg = taskSettings.promptGeneration;
    if (cfg.provider === 'builtin') return templateResult;

    const styleStr = styles.join(', ');
    const llmPrompt =
      `Generate a creative, detailed AI video generation prompt for a ${niche} video.\n` +
      `Styles: ${styleStr}\n` +
      `Duration: ${duration}s\n\n` +
      `Requirements:\n` +
      `- Be specific about visuals, camera work, lighting, and mood\n` +
      `- Keep under 150 words\n` +
      `- Output ONLY the prompt, nothing else`;

    const result = await callLLMForPromptGen(llmPrompt, cfg);
    if (result && result.trim().length > 10) {
      logger.info(`[VideoGeneration] LLM prompt generation succeeded for niche=${niche}`);
      return result.trim();
    }
  } catch (err) {
    logger.warn(`[VideoGeneration] LLM prompt generation failed, using template: ${(err as Error).message}`);
  }

  return templateResult;
}

async function callLLMForPromptGen(prompt: string, cfg: AITaskProvider): Promise<string | null> {
  // Try shared AI pipeline first
  const pipelineResult = await pipelineGenerate(prompt, {
    model: cfg.provider === 'omniroute' ? cfg.model : undefined,
    temperature: 0.8,
    maxTokens: 256,
  });
  if (pipelineResult && pipelineResult.content.trim()) {
    trackTokens({ provider: 'pipeline', model: pipelineResult.model, service: 'prompt_generation', promptTokens: pipelineResult.usage.promptTokens, completionTokens: pipelineResult.usage.completionTokens }).catch(() => {});
    return pipelineResult.content.trim();
  }

  const config = getConfig();

  if (cfg.provider === 'groq') {
    const apiKey = config.GROQ_API_KEY || '';
    if (!apiKey) return null;
    const model = cfg.model || 'llama-3.3-70b-versatile';
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model, messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 256 },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, timeout: 8_000 },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    trackTokens({ provider: 'groq', model, service: 'prompt_generation', promptTokens: response.data?.usage?.prompt_tokens || 0, completionTokens: response.data?.usage?.completion_tokens || 0 }).catch(() => {});
    return content || null;
  }

  if (cfg.provider === 'gemini') {
    const apiKey = config.GEMINI_API_KEY || '';
    if (!apiKey) return null;
    const model = cfg.model || 'gemini-2.5-flash';
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 256, temperature: 0.8 } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8_000 },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = response.data?.usageMetadata;
    if (usage) trackTokens({ provider: 'gemini-direct', model, service: 'prompt_generation', promptTokens: usage.promptTokenCount || 0, completionTokens: usage.candidatesTokenCount || 0 }).catch(() => {});
    return text || null;
  }

  if (cfg.provider === 'omniroute') {
    const omniUrl = config.OMNIROUTE_URL;
    const apiKey = config.OMNIROUTE_API_KEY || '';
    const model = cfg.model || 'antigravity/gemini-2.5-flash';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await axios.post(
      `${omniUrl}/chat/completions`,
      { model, messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 256 },
      { headers, timeout: 8_000 },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    const usage = response.data?.usage;
    if (usage) trackTokens({ provider: 'omniroute', model: response.data?.model || model, service: 'prompt_generation', promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 }).catch(() => {});
    return content || null;
  }

  return null;
}

/**
 * Generate storyboard for multi-scene videos
 */
export function generateStoryboard(
  niche: string,
  styles: string[],
  _duration: number,
  scenes: number,
): Array<{
  scene: number;
  duration: number;
  description: string;
  prompt: string;
}> {
  const durationPerScene = 5; // Standard 5s per scene

  const templates: Record<string, string[]> = {
    fnb: [
      "Wide shot of ingredients laid out beautifully",
      "Close-up of preparation process",
      "Cooking/mixing action shot",
      "Final plating and garnish",
      "Enjoying the finished product",
      "Reaction shot to taste",
      "Aesthetic flat lay of the dish",
      "Call-to-action with recipe mention",
    ],
    fashion: [
      "Full outfit showcase with spinning",
      "Close-up of accessories and details",
      "Styling tips or matching combinations",
      "Walking or runway moment",
      "Makeup or grooming detail",
      "Transformation before/after",
      "Confidence boost final look",
      "Share your style tag",
    ],
    tech: [
      "Product unboxing or intro",
      "Key features showcase",
      "Close-up of innovative details",
      "In-action demonstration",
      "Comparison with alternatives",
      "Performance testing",
      "Use case scenario",
      "Call-to-action",
    ],
    health: [
      "Warm-up and preparation",
      "Exercise demonstration",
      "Proper form coaching",
      "Challenge moment",
      "Recovery and stretching",
      "Transformation showcase",
      "Motivational message",
      "Share your fitness journey",
    ],
    travel: [
      "Scenic landscape reveal",
      "Destination intro and vibe",
      "Local attractions and activities",
      "Cultural or authentic moments",
      "Food and dining experience",
      "Adventure moment",
      "Sunset or golden hour shot",
      "Save to travel bucket list",
    ],
    education: [
      "Hook and topic intro",
      "Problem statement",
      "Key concept explanation",
      "Example or case study",
      "Step-by-step walkthrough",
      "Common mistakes to avoid",
      "Key takeaways summary",
      "Call-to-action to learn more",
    ],
    finance: [
      "Business or money concept intro",
      "Problem identification",
      "Solution explanation",
      "Real-world example",
      "Numbers and statistics",
      "Action steps",
      "Success story or result",
      "Join for more financial tips",
    ],
    entertainment: [
      "Eye-catching hook",
      "Setup and premise",
      "Comedy or surprise moment",
      "Build tension or excitement",
      "Climax or payoff",
      "Reaction moment",
      "Witty conclusion",
      "Tag for engagement",
    ],
  };

  const sceneTemplates =
    templates[niche as keyof typeof templates] || templates.fnb;

  return Array.from({ length: scenes }).map((_, i) => ({
    scene: i + 1,
    duration: durationPerScene,
    description:
      sceneTemplates[Math.min(i, sceneTemplates.length - 1)] ||
      `Scene ${i + 1}`,
    prompt: `[Scene ${i + 1}/${scenes}] ${sceneTemplates[Math.min(i, sceneTemplates.length - 1)] || `Scene ${i + 1}`}, ${styles.join(", ")} style, ${durationPerScene}s`,
  }));
}

/**
 * Get credit cost for video
 */
export function getCreditCost(duration: number): number {
  return getVideoCreditCost(duration);
}

/**
 * Process video job — called by video.service.ts for queued jobs
 */
export async function processVideoJob(video: Video,
): Promise<VideoGenerationResult> {
  logger.info(`Processing video job: ${video.jobId}`);
  return generateVideo({
    prompt: video.title ?? '',
    duration: video.duration,
    niche: video.niche,
    styles: video.styles,
    aspectRatio: '9:16',
  });
}
