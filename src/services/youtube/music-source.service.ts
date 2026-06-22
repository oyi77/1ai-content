/**
 * Music Source Service (Pipeline B)
 *
 * Generates or sources music tracks.
 * Chain: Suno API → royalty-free fallback. Circuit breaker per provider.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { getCircuitBreakerThreshold, getCircuitBreakerResetMs } from "@/config/youtube.config";

interface MusicResult {
  audioPath: string;
  duration: number;
  provider: string;
  metadata: Record<string, unknown>;
}

const providerFailures = new Map<string, { count: number; lastFailure: number }>();

function isProviderAvailable(name: string): boolean {
  const state = providerFailures.get(name);
  if (!state) return true;
  const threshold = getCircuitBreakerThreshold("music");
  const resetMs = getCircuitBreakerResetMs("music");
  if (state.count >= threshold && Date.now() - state.lastFailure < resetMs) return false;
  if (Date.now() - state.lastFailure >= resetMs) { providerFailures.delete(name); return true; }
  return true;
}

function recordFailure(name: string): void {
  const state = providerFailures.get(name) || { count: 0, lastFailure: 0 };
  providerFailures.set(name, { count: state.count + 1, lastFailure: Date.now() });
}

export async function generateMusic(genre: string, mood: string, durationMinutes: number, outputPath: string): Promise<MusicResult> {
  const providers = [
    { name: "suno", fn: () => generateViaSuno(genre, mood, durationMinutes, outputPath) },
    { name: "royalty_free", fn: () => fallbackRoyaltyFree(genre, mood, outputPath) },
  ];

  for (const provider of providers) {
    if (!isProviderAvailable(provider.name)) {
      logger.warn(`[music-source] ${provider.name} circuit breaker open`);
      continue;
    }
    try {
      const result = await provider.fn();
      logger.info(`[music-source] Generated via ${provider.name}`);
      return result;
    } catch (err) {
      recordFailure(provider.name);
      logger.error(`[music-source] ${provider.name} failed: ${err}`);
    }
  }

  throw new Error("All music providers failed");
}

async function generateViaSuno(genre: string, mood: string, durationMinutes: number, outputPath: string): Promise<MusicResult> {
  const apiKey = getConfig().SUNO_API_KEY;
  if (!apiKey) throw new Error("SUNO_API_KEY not configured");

  const axios = (await import("axios")).default;
  const prompt = `${genre} music, ${mood} mood, ${durationMinutes} minutes, seamless loop`;

  const res = await axios.post(
    "https://api.suno.ai/v1/generate",
    { prompt, duration: durationMinutes * 60 },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000 },
  );

  const audioUrl = res.data.audio_url || res.data.data?.[0]?.audio_url;
  if (!audioUrl) throw new Error("No audio URL from Suno");

  const audioRes = await axios.get(audioUrl, { responseType: "arraybuffer" });
  require("fs").writeFileSync(outputPath, audioRes.data);

  return { audioPath: outputPath, duration: durationMinutes * 60, provider: "suno", metadata: res.data };
}

async function fallbackRoyaltyFree(genre: string, mood: string, outputPath: string): Promise<MusicResult> {
  logger.info("[music-source] Using royalty-free fallback (placeholder)");
  require("fs").writeFileSync(outputPath, Buffer.alloc(0));
  return { audioPath: outputPath, duration: 0, provider: "royalty_free", metadata: { genre, mood, note: "placeholder" } };
}
