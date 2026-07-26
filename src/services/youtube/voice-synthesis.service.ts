/**
 * Voice Synthesis Service (FASE 2B)
 *
 * TTS with fallback chain: ElevenLabs → Azure → Google.
 * Circuit breaker per provider. All config from env.
 */

import { logger } from "@/utils/logger";
import { ConfigError, AllProvidersFailedError } from "@/utils/app-errors";
import { getConfig } from "@/config/env";
import { getCircuitBreakerThreshold, getCircuitBreakerResetMs } from "@/config/youtube.config";

interface SynthesisResult {
  audioPath: string;
  duration: number;
  provider: string;
}

interface VoiceProvider {
  name: string;
  synthesize: (text: string, outputPath: string, tone: string) => Promise<SynthesisResult>;
}

const providerFailures = new Map<string, { count: number; lastFailure: number }>();

function isProviderAvailable(name: string): boolean {
  const state = providerFailures.get(name);
  if (!state) return true;
  const threshold = getCircuitBreakerThreshold("voice");
  const resetMs = getCircuitBreakerResetMs("voice");
  if (state.count >= threshold && Date.now() - state.lastFailure < resetMs) return false;
  if (Date.now() - state.lastFailure >= resetMs) {
    providerFailures.delete(name);
    return true;
  }
  return true;
}

function recordFailure(name: string): void {
  const state = providerFailures.get(name) || { count: 0, lastFailure: 0 };
  providerFailures.set(name, { count: state.count + 1, lastFailure: Date.now() });
}

const elevenLabsProvider: VoiceProvider = {
  name: "elevenlabs",
  async synthesize(text, outputPath, tone) {
    const apiKey = getConfig().ELEVENLABS_API_KEY;
    if (!apiKey) throw new ConfigError("ELEVENLABS_API_KEY");
    const axios = (await import("axios")).default;
    const voiceId = getConfig().ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { "xi-api-key": apiKey }, responseType: "arraybuffer" },
    );
    require("fs").writeFileSync(outputPath, res.data);
    return { audioPath: outputPath, duration: 0, provider: "elevenlabs" };
  },
};

const azureProvider: VoiceProvider = {
  name: "azure",
  async synthesize(text, outputPath) {
    const apiKey = getConfig().AZURE_SPEECH_KEY;
    if (!apiKey) throw new ConfigError("AZURE_SPEECH_KEY");
    const axios = (await import("axios")).default;
    const region = getConfig().AZURE_SPEECH_REGION || "eastus";
    const res = await axios.post(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      `<speak version='1.0'><voice name='en-US-JennyNeural'>${text}</voice></speak>`,
      { headers: { "Ocp-Apim-Subscription-Key": apiKey, "Content-Type": "application/ssml+xml" }, responseType: "arraybuffer" },
    );
    require("fs").writeFileSync(outputPath, res.data);
    return { audioPath: outputPath, duration: 0, provider: "azure" };
  },
};

const providers: VoiceProvider[] = [elevenLabsProvider, azureProvider];

export async function synthesizeNarration(
  script: string,
  toneVariant: string,
  outputPath: string,
): Promise<SynthesisResult> {
  for (const provider of providers) {
    if (!isProviderAvailable(provider.name)) {
      logger.warn(`[voice-synthesis] ${provider.name} circuit breaker open, skipping`);
      continue;
    }
    try {
      const result = await provider.synthesize(script, outputPath, toneVariant);
      logger.info(`[voice-synthesis] Generated via ${provider.name}`);
      return result;
    } catch (err) {
      recordFailure(provider.name);
      logger.error(`[voice-synthesis] ${provider.name} failed: ${err}`);
    }
  }
  throw new AllProvidersFailedError("All TTS providers failed");
}
