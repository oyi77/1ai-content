// Niche prompt + storyboard builders (split from video-generation.service.ts).
import axios from "axios";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { trackTokens } from "@/services/token-tracker.service";
import { pipelineGenerate } from "@/services/shared-ai-pipeline.service";
import { getNicheConfig } from "@/config/niches";
import { AITaskSettingsService } from "@/services/ai-task-settings.service";
import type { AITaskProvider } from "@/services/ai-task-settings.service";

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
    return `Create a ${styles.join(", ") || "professional"} video for ${niche}, ${duration}s, high quality`;
  }
  const styleStr =
    styles.length > 0
      ? styles.join(", ")
      : config.keywords.slice(0, 2).join(", ");
  const palette = config.colorPalettes[0] || "natural";
  const introTemplate = config.sceneTemplates.intro[0].replace(
    /\{[^}]+\}/g,
    config.keywords[0] || niche,
  );
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
    if (cfg.provider === "builtin") return templateResult;

    const styleStr = styles.join(", ");
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
      logger.info(
        `[VideoGeneration] LLM prompt generation succeeded for niche=${niche}`,
      );
      return result.trim();
    }
  } catch (err) {
    logger.warn(
      `[VideoGeneration] LLM prompt generation failed, using template: ${(err as Error).message}`,
    );
  }

  return templateResult;
}

async function callLLMForPromptGen(
  prompt: string,
  cfg: AITaskProvider,
): Promise<string | null> {
  // Try shared AI pipeline first
  const pipelineResult = await pipelineGenerate(prompt, {
    model: cfg.provider === "omniroute" ? cfg.model : undefined,
    temperature: 0.8,
    maxTokens: 256,
  });
  if (pipelineResult && pipelineResult.content.trim()) {
    trackTokens({
      provider: "pipeline",
      model: pipelineResult.model,
      service: "prompt_generation",
      promptTokens: pipelineResult.usage.promptTokens,
      completionTokens: pipelineResult.usage.completionTokens,
    }).catch(() => {});
    return pipelineResult.content.trim();
  }

  const config = getConfig();

  if (cfg.provider === "groq") {
    const apiKey = config.GROQ_API_KEY || "";
    if (!apiKey) return null;
    const model = cfg.model || "llama-3.3-70b-versatile";
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 256,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 8_000,
      },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    trackTokens({
      provider: "groq",
      model,
      service: "prompt_generation",
      promptTokens: response.data?.usage?.prompt_tokens || 0,
      completionTokens: response.data?.usage?.completion_tokens || 0,
    }).catch(() => {});
    return content || null;
  }

  if (cfg.provider === "gemini") {
    const apiKey = config.GEMINI_API_KEY || "";
    if (!apiKey) return null;
    const model = cfg.model || "gemini-2.5-flash";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.8 },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 8_000 },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = response.data?.usageMetadata;
    if (usage)
      trackTokens({
        provider: "gemini-direct",
        model,
        service: "prompt_generation",
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
      }).catch(() => {});
    return text || null;
  }

  if (cfg.provider === "omniroute") {
    const omniUrl = config.OMNIROUTE_URL;
    const apiKey = config.OMNIROUTE_API_KEY || "";
    const model = cfg.model || "antigravity/gemini-2.5-flash";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const response = await axios.post(
      `${omniUrl}/chat/completions`,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 256,
      },
      { headers, timeout: 8_000 },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    const usage = response.data?.usage;
    if (usage)
      trackTokens({
        provider: "omniroute",
        model: response.data?.model || model,
        service: "prompt_generation",
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
      }).catch(() => {});
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
