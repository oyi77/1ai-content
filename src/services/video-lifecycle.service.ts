/**
 * Video Lifecycle Service
 *
 * Handles video CRUD operations and job lifecycle (create, update, delete, restore, process)
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { Video } from '@prisma/client';
import { processVideoJob } from './video-generation.service';
import crypto from 'crypto';
import { getVideoCreditCost } from '@/config/pricing';
import { AITaskProvider } from '@/services/ai-task-settings.service';
import { pipelineGenerate } from '@/services/shared-ai-pipeline.service';
import axios from 'axios';
import { getConfig } from '@/config/env';
import { ConfigError, ProviderError } from '@/utils/app-errors';
import { trackTokens } from '@/services/token-tracker.service';

// ---------------------------------------------------------------------------
// Module-level helpers for lifecycle operations
// ---------------------------------------------------------------------------

async function callLLMForText(
  prompt: string,
  providerConfig: AITaskProvider,
): Promise<string | null> {
  // Try shared AI pipeline first
  const pipelineResult = await pipelineGenerate(prompt, {
    model: providerConfig.provider === 'omniroute' ? providerConfig.model : undefined,
    temperature: 0.7,
    maxTokens: 1024,
  });
  if (pipelineResult && pipelineResult.content.trim()) {
    trackTokens({ provider: 'pipeline', model: pipelineResult.model, service: 'storyboard', promptTokens: pipelineResult.usage.promptTokens, completionTokens: pipelineResult.usage.completionTokens }).catch(() => {});
    return pipelineResult.content.trim();
  }
  const config = getConfig();
  if (providerConfig.provider === 'groq') {
    const apiKey = config.GROQ_API_KEY || '';
    if (!apiKey) return null;
    const model = providerConfig.model || 'llama-3.3-70b-versatile';
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1024 },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, timeout: 10_000 },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    trackTokens({ provider: 'groq', model, service: 'storyboard', promptTokens: response.data?.usage?.prompt_tokens || 0, completionTokens: response.data?.usage?.completion_tokens || 0 }).catch(() => {});
    return content || null;
  }
  if (providerConfig.provider === 'gemini') {
    const apiKey = config.GEMINI_API_KEY || '';
    if (!apiKey) return null;
    const model = providerConfig.model || 'gemini-2.5-flash';
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.7 } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    trackTokens({ provider: 'gemini', model, service: 'storyboard', promptTokens: response.data?.usageMetadata?.promptTokenCount || 0, completionTokens: response.data?.usageMetadata?.candidatesTokenCount || 0 }).catch(() => {});
    return content || null;
  }
  if (providerConfig.provider === 'omniroute') {
    const omniUrl = config.OMNIROUTE_URL;
    const model = providerConfig.model || 'gpt-4';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = config.OMNIROUTE_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await axios.post(
      `${omniUrl}/chat/completions`,
      { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1024 },
      { headers, timeout: 10_000 },
    );
    const content = response.data?.choices?.[0]?.message?.content;
    const usage = response.data?.usage;
    if (usage) trackTokens({ provider: 'omniroute', model: response.data?.model || model, service: 'storyboard', promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 }).catch(() => {});
    return content || null;
  }
  return null;
}

async function generateStoryboardWithLLM(
  params: { niche: string; duration: number; productDescription?: string },
  providerConfig: AITaskProvider,
): Promise<Array<{ scene: number; duration: number; type: string; description: string; prompt: string }> | null> {
  const scenesNeeded = Math.ceil(params.duration / 5);
  const userPrompt =
    `Generate a JSON storyboard for a ${params.niche} video (${params.duration}s total, ~${scenesNeeded} scenes of 5s each)` +
    (params.productDescription ? `, product: ${params.productDescription}` : '') +
    `.\n\nReturn ONLY a JSON array (no markdown):\n` +
    `[{"scene":1,"duration":5,"type":"intro","description":"...","prompt":"cinematic AI video generation prompt..."},...]\n\n` +
    `Each prompt should be detailed enough to independently generate that scene.`;
  try {
    const raw = await callLLMForText(userPrompt, providerConfig);
    if (!raw) return null;
    // Strip markdown fences if present
    const jsonStr = raw.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim();
    const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!arrMatch) return null;
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((s, idx: number) => ({
      scene: s.scene ?? idx + 1,
      duration: s.duration ?? 5,
      type: s.type ?? 'scene',
      description: s.description ?? '',
      prompt: s.prompt ?? '',
    }));
  } catch (err) {
    logger.warn(`[VideoLifecycleService] generateStoryboardWithLLM parse failed: ${(err as Error).message}`);
    return null;
  }
}

export class VideoLifecycleService {
  /**
   * Create video job
   */
  static async createJob(params: {
    userId: bigint;
    niche: string;
    platform: string;
    duration: number;
    scenes: number;
    title?: string;
  }): Promise<Video> {
    const creditCost = getVideoCreditCost(params.duration);

    // Generate job ID
    const jobId = `VID-${Date.now()}-${params.userId}-${crypto.randomBytes(4).toString("hex")}`;

    // Create video record
    const video = await prisma.video.create({
      data: {
        userId: params.userId,
        jobId,
        title: params.title || `Video ${new Date().toLocaleDateString('id-ID')}`,
        niche: params.niche,
        platform: params.platform,
        duration: params.duration,
        scenes: params.scenes,
        status: 'processing',
        progress: 0,
        creditsUsed: creditCost,
      },
    });

    logger.info(`Created video job: ${jobId}`);
    return video;
  }

  /**
   * Update video progress
   */
  static async updateProgress(jobId: string, progress: number, status?: string): Promise<Video> {
    return prisma.video.update({
      where: { jobId },
      data: {
        progress,
        status: status || undefined,
        completedAt: status === 'completed' ? new Date() : undefined,
      },
    });
  }

  /**
   * Set video output URLs
   */
  static async setOutput(jobId: string, urls: {
    thumbnailUrl?: string;
    videoUrl?: string;
    downloadUrl?: string;
  }): Promise<Video> {
    // Defense-in-depth: don't mark complete if no delivery path exists
    if (!urls.downloadUrl && !urls.videoUrl) {
      logger.warn(`setOutput called for ${jobId} with no downloadUrl or videoUrl — marking failed`);
      return prisma.video.update({
        where: { jobId },
        data: { status: 'failed', errorMessage: 'No delivery path available' },
      });
    }

    return prisma.video.update({
      where: { jobId },
      data: {
        ...urls,
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Update video status
   */
  static async updateStatus(jobId: string, status: string, errorMessage?: string): Promise<Video> {
    return prisma.video.update({
      where: { jobId },
      data: {
        status,
        errorMessage,
        ...(status === 'completed' ? { completedAt: new Date(), progress: 100 } : {}),
      },
    });
  }

  /**
   * Get video by job ID
   */
  static async getByJobId(jobId: string): Promise<Video | null> {
    return prisma.video.findUnique({
      where: { jobId },
    });
  }

  /**
   * Upsert video for media interception
   */
  static async upsertForInterception(jobId: string, userId: bigint, mediaUrl: string): Promise<Video> {
    return prisma.video.upsert({
      where: { jobId },
      create: {
        userId,
        jobId,
        title: `Intercepted ${new Date().toLocaleDateString('id-ID')}`,
        niche: 'general',
        platform: 'unknown',
        duration: 0,
        scenes: 0,
        status: 'processing',
        progress: 0,
        creditsUsed: 0,
        videoUrl: mediaUrl,
      },
      update: {
        videoUrl: mediaUrl,
        status: 'processing',
        progress: 0,
      },
    });
  }

  /**
   * Soft delete video
   */
  static async deleteVideo(jobId: string): Promise<void> {
    await prisma.video.update({
      where: { jobId },
      data: { status: 'deleted' },
    });
    logger.info(`Soft-deleted video: ${jobId}`);
  }

  /**
   * Restore soft-deleted video
   */
  static async restoreVideo(jobId: string): Promise<void> {
    await prisma.video.update({
      where: { jobId },
      data: { status: 'completed' },
    });
    logger.info(`Restored video: ${jobId}`);
  }

  /**
   * Permanently delete video
   */
  static async permanentlyDelete(jobId: string): Promise<void> {
    await prisma.video.delete({ where: { jobId } });
    logger.info(`Permanently deleted video: ${jobId}`);
  }

  /**
   * Process video job - main orchestration
   */
  static async processJob(jobId: string): Promise<void> {
    const video = await prisma.video.findUnique({ where: { jobId } });
    if (!video) {
      logger.error(`Video job not found: ${jobId}`);
      return;
    }

    try {
      await prisma.video.update({ where: { jobId }, data: { status: 'processing', progress: 10 } });
      
      const result = await processVideoJob(video);
      
      if (result.success) {
        await prisma.video.update({
          where: { jobId },
          data: {
            status: 'completed',
            progress: 100,
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            completedAt: new Date(),
          },
        });
        logger.info(`Video job completed: ${jobId} via ${result.provider}`);
      } else {
        await prisma.video.update({
          where: { jobId },
          data: { status: 'failed', errorMessage: result.error },
        });
        logger.error(`Video job failed: ${jobId} - ${result.error}`);
      }
    } catch (error) {
      logger.error(`Video job error: ${jobId}`, error);
      await prisma.video.update({
        where: { jobId },
        data: { status: 'failed', errorMessage: (error as Error).message },
      });
    }
  }
}
