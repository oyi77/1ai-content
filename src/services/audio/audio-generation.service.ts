/**
 * Audio Generation Service
 *
 * Generates audio for video content using ElevenLabs TTS.
 * Features:
 * - Text-to-speech generation
 * - Multiple voice options
 * - Audio-video synchronization
 * - Music background support
 *
 * API: ElevenLabs API
 * Docs: https://docs.elevenlabs.io
 */

import axios, { type AxiosResponse } from "axios";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { ConfigError, ExternalServiceError } from "@/utils/app-errors";

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

export interface AudioGenerationRequest {
  text: string;
  voiceId?: string;
  stability?: number; // 0-1
  similarityBoost?: number; // 0-1
  style?: number; // 0-1
  speed?: number; // 0.5-2.0
}

export interface AudioGenerationResponse {
  audioUrl: string;
  duration: number; // seconds
  voiceId: string;
  metadata: {
    characters: number;
    model: string;
  };
}

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: Record<string, string>;
}

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const PROVIDER_NAME = "elevenlabs";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice
const DEFAULT_MODEL = "eleven_multilingual_v2";

// ══════════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════════

export class AudioGenerationService {
  private apiKey: string;
  private apiUrl: string;
  private defaultVoiceId: string;

  constructor() {
    const config = getConfig();
    this.apiKey = config.ELEVENLABS_API_KEY || "";
    this.apiUrl = config.ELEVENLABS_API_URL;
    this.defaultVoiceId = config.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  }

  /**
   * Check if audio generation is available
   */
  isAvailable(): boolean {
    const config = getConfig();
    return Boolean(this.apiKey) && config.AUDIO_GENERATION_ENABLED;
  }

  /**
   * Generate audio from text
   */
  async generateAudio(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResponse> {
    if (!this.isAvailable()) {
      throw new ConfigError("ELEVENLABS_API_KEY");
    }

    const voiceId = request.voiceId || this.defaultVoiceId;

    logger.info({
      msg: "Audio generation: Starting TTS",
      voiceId,
      characters: request.text.length,
    });

    try {
      const response: AxiosResponse<ArrayBuffer> = await axios.post(
        `${this.apiUrl}/text-to-speech/${voiceId}`,
        {
          text: request.text,
          model_id: DEFAULT_MODEL,
          voice_settings: {
            stability: request.stability || 0.5,
            similarity_boost: request.similarityBoost || 0.75,
            style: request.style || 0,
            speed: request.speed || 1.0,
          },
        },
        {
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          responseType: "arraybuffer",
          timeout: 60000,
        },
      );

      // Convert to base64 for storage/transport
      const audioBase64 = Buffer.from(response.data).toString("base64");
      const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

      // Estimate duration (rough: 150 words per minute)
      const wordCount = request.text.split(/\s+/).length;
      const estimatedDuration = (wordCount / 150) * 60;

      logger.info({
        msg: "Audio generation: Completed",
        duration: estimatedDuration,
        voiceId,
      });

      return {
        audioUrl,
        duration: estimatedDuration,
        voiceId,
        metadata: {
          characters: request.text.length,
          model: DEFAULT_MODEL,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      logger.error({ msg: "Audio generation: Failed", error });
      throw new ExternalServiceError(
        "ElevenLabs",
        `Audio generation failed: ${error}`,
      );
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const response: AxiosResponse<{ voices: Voice[] }> = await axios.get(
        `${this.apiUrl}/voices`,
        {
          headers: {
            "xi-api-key": this.apiKey,
          },
          timeout: 10000,
        },
      );

      return response.data.voices;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      logger.error({ msg: "Audio generation: Failed to get voices", error });
      return [];
    }
  }

  /**
   * Get provider info for admin dashboard
   */
  getInfo(): {
    name: string;
    available: boolean;
    capabilities: string[];
    defaultVoice: string;
  } {
    return {
      name: PROVIDER_NAME,
      available: this.isAvailable(),
      capabilities: ["tts", "multilingual", "voice-cloning"],
      defaultVoice: this.defaultVoiceId,
    };
  }
}

// Singleton instance
export const audioGenerationService = new AudioGenerationService();
