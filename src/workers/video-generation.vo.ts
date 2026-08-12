/**
 * Video Generation Worker — Voice Over Pipeline
 *
 * VO script generation (AI + template) and full pipeline application.
 * Extracted from video-generation.worker.ts.
 */

import * as path from "path";
import type { Telegram } from "telegraf";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { AIConfigService } from "@/services/ai-config.service";
import { AudioVOService } from "@/services/audio-vo.service";
import {
  CATEGORY_TO_VOICE,
  AI_VOICE_PROFILES,
  MARKETING_HOOKS,
  MARKETING_CTAS,
} from "@/config/audio-subtitle-engine";
import { getAILabel, getLangConfig } from "@/config/languages";
import { t } from "@/i18n/translations";
import { ConfigError, ProviderError } from "@/utils/app-errors";
import { notifyProgress } from "./video-generation.helpers";

// ── Voice Over Script Generation ──

export async function generateVOScript(
  niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  _platform: string,
  totalDuration: number,
  language: string = "id",
): Promise<string> {
  try {
    const script = await generateVOScriptWithAI(
      niche,
      storyboard,
      language,
      totalDuration,
    );
    if (script && script.length > 20) return script;
  } catch (err) {
    logger.warn(
      "AI VO script generation failed, using template fallback:",
      (err as Error).message,
    );
  }
  return generateVOScriptTemplate(niche, storyboard, language);
}

export async function generateVOScriptWithAI(
  niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  language: string,
  totalDuration: number,
): Promise<string> {
  const GEMINI_API_KEY = getConfig().GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) throw new ConfigError("GEMINI_API_KEY");

  const [promptsCfg, taskCfg] = await Promise.all([
    AIConfigService.getPromptsConfig().catch(() => null),
    AIConfigService.getTaskConfig("voNarration").catch(() => null),
  ]);

  const model = taskCfg?.model || "llama-3.3-70b-versatile";
  const sceneDescriptions = storyboard
    .map((s, i) => `Scene ${i + 1} (${s.duration}s): ${s.description}`)
    .join("\n");
  const langLabel = getAILabel(language);
  const wpm = getLangConfig(language).readingSpeedWpm;
  const wordBudget = Math.round((totalDuration * wpm) / 60);

  let prompt: string;
  if (promptsCfg?.voNarration) {
    prompt = promptsCfg.voNarration
      .replace(/{niche}/g, niche)
      .replace(/{duration}/g, String(totalDuration))
      .replace(/{language}/g, langLabel)
      .replace(/{sceneDescriptions}/g, sceneDescriptions)
      .replace(/{wordBudget}/g, String(wordBudget));
  } else {
    prompt = `Generate a ${langLabel} voiceover narration script for a ${niche} marketing video.\n\nScenes:\n${sceneDescriptions}\n\nTotal duration: ${totalDuration} seconds.\n\nRequirements:\n- Write the narration in ${langLabel}, natural and conversational tone\n- Keep it concise — the spoken words must fit within ${totalDuration} seconds (roughly ${wordBudget} words)\n- Flow naturally from scene to scene\n- Start with an attention hook\n- End with a soft call-to-action\n- Do NOT include scene labels, timestamps, or stage directions\n- Output ONLY the narration text, nothing else`;
  }

  const provider = taskCfg?.provider || "groq";
  if (provider === "groq") {
    const GROQ_API_KEY = getConfig().GROQ_API_KEY || "";
    if (GROQ_API_KEY) {
      const { default: axios } = await import("axios");
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 512,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          timeout: 30000,
        },
      );
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError("groq", "Empty response");
      return text.trim();
    }
  }

  const geminiModel =
    provider === "gemini"
      ? taskCfg?.model || "gemini-2.5-flash"
      : "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;
  const { default: axios } = await import("axios");
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    },
    { timeout: 30000 },
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ProviderError("gemini", "Empty response");

  const usageMeta = response.data?.usageMetadata;
  if (usageMeta) {
    const { trackTokens } =
      await import("../services/token-tracker.service.js");
    trackTokens({
      provider: "gemini-direct",
      model: geminiModel,
      service: "vo_script_generation",
      promptTokens: usageMeta.promptTokenCount || 0,
      completionTokens: usageMeta.candidatesTokenCount || 0,
    }).catch((err) =>
      logger.warn("Token tracking failed", { error: (err as Error).message }),
    );
  }
  return text.trim();
}

export function generateVOScriptTemplate(
  _niche: string,
  storyboard: Array<{ scene?: number; duration: number; description: string }>,
  language: string,
): string {
  const hook =
    MARKETING_HOOKS[Math.floor(Math.random() * MARKETING_HOOKS.length)];
  const cta = MARKETING_CTAS[Math.floor(Math.random() * MARKETING_CTAS.length)];

  if (language === "en") {
    const sceneNarrations = storyboard
      .map((s) => s.description)
      .filter(Boolean);
    const middle =
      sceneNarrations.length > 0
        ? sceneNarrations.slice(0, 3).join(". ")
        : "Discover something special today.";
    return `Check this out. ${middle}. Don't miss it — see the details now.`;
  }

  const sceneNarrations = storyboard.map((s) => s.description).filter(Boolean);
  const middle =
    sceneNarrations.length > 0
      ? sceneNarrations.slice(0, 3).join(". ")
      : "Temukan sesuatu yang istimewa hari ini.";
  return `${hook.charAt(0).toUpperCase() + hook.slice(1)}. ${middle}. ${cta.charAt(0).toUpperCase() + cta.slice(1)}.`;
}

// ── VO Pipeline ──

export async function applyVOPipeline(
  videoPath: string,
  jobId: string,
  niche: string,
  platform: string,
  storyboard: Array<{ scene: number; duration: number; description: string }>,
  totalDuration: number,
  options: {
    enableVO: boolean;
    enableSubtitles: boolean;
    language?: string;
    voScript?: string;
  },
  telegram: Telegram,
  chatId: number,
): Promise<string> {
  try {
    const language: string =
      options.language ||
      (() => {
        const voiceKey = CATEGORY_TO_VOICE[niche] || "indonesian_female_soft";
        const voiceProfile = AI_VOICE_PROFILES[voiceKey];
        return voiceProfile?.language === "en"
          ? ("en" as const)
          : ("id" as const);
      })();

    await notifyProgress(
      telegram,
      chatId,
      "\ud83c\udfa4 Generating voice over script...",
    );
    const script =
      options.voScript ||
      (await generateVOScript(
        niche,
        storyboard,
        platform,
        totalDuration,
        language,
      ));
    logger.info(`VO script generated for ${jobId}: ${script.slice(0, 80)}...`);

    if (options.enableVO && options.enableSubtitles) {
      await notifyProgress(
        telegram,
        chatId,
        "\ud83c\udf99\ufe0f Recording voice over...",
      );
      const result = await AudioVOService.fullVOPipeline(
        videoPath,
        script,
        niche,
        jobId,
        { language },
      );
      if (result.success && result.outputPath) {
        await notifyProgress(
          telegram,
          chatId,
          "\ud83c\udfb5 Audio mixing complete!",
        );
        return result.outputPath;
      }
      logger.warn(
        `Full VO pipeline failed for ${jobId}: ${result.error}. Delivering raw video.`,
      );
      await telegram
        .sendMessage(chatId, t("worker.vo_failed", options.language || "id"))
        .catch(() => {});
      return videoPath;
    }

    if (options.enableVO && !options.enableSubtitles) {
      await notifyProgress(
        telegram,
        chatId,
        "\ud83c\udf99\ufe0f Recording voice over...",
      );
      const tts = await AudioVOService.generateTTS(
        script,
        niche,
        jobId,
        language,
      );
      if (!tts.success || !tts.audioPath) {
        logger.warn(
          `TTS failed for ${jobId}: ${tts.error}. Delivering raw video.`,
        );
        return videoPath;
      }
      await notifyProgress(telegram, chatId, "\ud83c\udfb5 Mixing audio...");
      const merge = await AudioVOService.mergeAudioVideo(
        videoPath,
        tts.audioPath,
      );
      if (merge.success && merge.outputPath) return merge.outputPath;
      logger.warn(
        `Audio merge failed for ${jobId}: ${merge.error}. Delivering raw video.`,
      );
      return videoPath;
    }

    if (!options.enableVO && options.enableSubtitles) {
      await notifyProgress(
        telegram,
        chatId,
        "\ud83d\udcdd Generating subtitles...",
      );
      const tts = await AudioVOService.generateTTS(
        script,
        niche,
        jobId,
        language,
      );
      if (
        !tts.success ||
        !tts.subtitleBlocks ||
        tts.subtitleBlocks.length === 0
      ) {
        logger.warn(
          `TTS/subtitle generation failed for ${jobId}. Delivering raw video.`,
        );
        return videoPath;
      }
      const srtPath = path.join(
        getConfig().AUDIO_DIR || "/tmp/audio",
        `${jobId}.srt`,
      );
      AudioVOService.generateSRT(tts.subtitleBlocks, srtPath);
      await notifyProgress(
        telegram,
        chatId,
        "\ud83d\udcdd Burning subtitles...",
      );
      const burn = await AudioVOService.burnSubtitles(videoPath, srtPath);
      if (burn.success && burn.outputPath) return burn.outputPath;
      logger.warn(
        `Subtitle burn failed for ${jobId}: ${burn.error}. Delivering raw video.`,
      );
      return videoPath;
    }

    return videoPath;
  } catch (err) {
    logger.error(
      `VO pipeline error for ${jobId}: ${(err as Error).message}. Delivering raw video.`,
    );
    await telegram
      .sendMessage(chatId, t("worker.vo_failed", options.language || "id"))
      .catch(() => {});
    return videoPath;
  }
}
