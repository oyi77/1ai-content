/**
 * Video Service
 * 
 * Handles AI video generation via GeminiGen.ai
 */

import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { Video } from '@prisma/client';
import { processVideoJob } from './video-generation.service';
import crypto from 'crypto';
import { getVideoCreditCost } from '@/config/pricing';
import { getAILabel } from '@/config/languages';
import axios from 'axios';
import { AITaskSettingsService, AITaskProvider } from '@/services/ai-task-settings.service';
import { trackTokens } from '@/services/token-tracker.service';
import { pipelineGenerate } from '@/services/shared-ai-pipeline.service';

// GeminiGen configuration (for future use)
// const GEMINIGEN_EMAIL = process.env.GEMINIGEN_EMAIL || 'grahainsanmandiri@gmail.com';
// const GEMINIGEN_PASSWORD = process.env.GEMINIGEN_PASSWORD || '';

// Platform specs
const PLATFORM_SPECS = {
  tiktok: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 60 },
  instagram: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 90 },
  youtube: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 60 },
  facebook: { aspectRatio: '4:5', resolution: '1080x1350', maxDuration: 240 },
  twitter: { aspectRatio: '1:1', resolution: '1080x1080', maxDuration: 140 },
};

// Niche templates - Updated for Berkah Karya workflows
const NICHE_TEMPLATES = {
  fnb: {
    name: '🍔 F&B / Food & Beverage',
    promptStyle: 'appetizing, warm lighting, steam, fresh ingredients, close-up shots, sizzling, pouring, plating',
    storyboardTemplate: [
      { scene: 1, duration: 3, type: 'hook', description: 'Close-up of signature dish/drink' },
      { scene: 2, duration: 5, type: 'process', description: 'Cooking/preparation action' },
      { scene: 3, duration: 4, type: 'result', description: 'Final presentation with steam/garnish' },
      { scene: 4, duration: 3, type: 'cta', description: 'Restaurant logo + promo' },
    ],
  },
  realestate: {
    name: '🏠 Real Estate',
    promptStyle: 'wide angle, bright natural lighting, spacious feel, luxury amenities, drone shots, walkthrough',
    storyboardTemplate: [
      { scene: 1, duration: 3, type: 'hook', description: 'Exterior curb appeal' },
      { scene: 2, duration: 5, type: 'tour', description: 'Living room walkthrough' },
      { scene: 3, duration: 4, type: 'features', description: 'Kitchen & amenities highlight' },
      { scene: 4, duration: 4, type: 'bedroom', description: 'Master bedroom/bathroom' },
      { scene: 5, duration: 3, type: 'cta', description: 'Agent info + contact' },
    ],
  },
  product: {
    name: '🛍️ Product / E-commerce',
    promptStyle: 'studio lighting, product showcase, unboxing style, lifestyle context, detail shots, 360 rotation',
    storyboardTemplate: [
      { scene: 1, duration: 2, type: 'hook', description: 'Product hero shot' },
      { scene: 2, duration: 4, type: 'features', description: 'Key features demonstration' },
      { scene: 3, duration: 4, type: 'benefits', description: 'Usage in daily life' },
      { scene: 4, duration: 3, type: 'cta', description: 'Price + buy now' },
    ],
  },
  car: {
    name: '🚗 Car Showroom / Dealership',
    promptStyle: 'cinematic automotive, showroom lighting, exterior angles, interior luxury, engine detail, driving shots',
    storyboardTemplate: [
      { scene: 1, duration: 3, type: 'hook', description: 'Exterior front 3/4 angle' },
      { scene: 2, duration: 4, type: 'exterior', description: 'Walkaround exterior' },
      { scene: 3, duration: 4, type: 'interior', description: 'Interior luxury features' },
      { scene: 4, duration: 3, type: 'engine', description: 'Engine/performance specs' },
      { scene: 5, duration: 3, type: 'cta', description: 'Dealership info + price' },
    ],
  },
  beauty: {
    name: '💄 Beauty & Wellness',
    promptStyle: 'soft lighting, before-after transformation, professional results, skincare routine, makeup application',
    storyboardTemplate: [
      { scene: 1, duration: 2, type: 'hook', description: 'Before state / problem' },
      { scene: 2, duration: 5, type: 'process', description: 'Product application' },
      { scene: 3, duration: 4, type: 'result', description: 'After transformation' },
      { scene: 4, duration: 3, type: 'cta', description: 'Product + buy link' },
    ],
  },
  services: {
    name: '💼 Professional Services',
    promptStyle: 'professional, trust-building, process showcase, testimonial style, expert showcase',
    storyboardTemplate: [
      { scene: 1, duration: 3, type: 'hook', description: 'Problem statement' },
      { scene: 2, duration: 5, type: 'solution', description: 'Service explanation' },
      { scene: 3, duration: 4, type: 'proof', description: 'Results/testimonials' },
      { scene: 4, duration: 3, type: 'cta', description: 'Book consultation' },
    ],
  },
};

// ---------------------------------------------------------------------------
// LLM helper for storyboard generation
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
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = response.data?.usageMetadata;
    if (usage) trackTokens({ provider: 'gemini-direct', model, service: 'storyboard', promptTokens: usage.promptTokenCount || 0, completionTokens: usage.candidatesTokenCount || 0 }).catch(() => {});
    return text || null;
  }

  if (providerConfig.provider === 'omniroute') {
    const omniUrl = config.OMNIROUTE_URL || 'http://localhost:20128/v1';
    const apiKey = config.OMNIROUTE_API_KEY || '';
    const model = providerConfig.model || 'antigravity/gemini-2.5-flash';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

    return parsed.map((s: any, idx: number) => ({
      scene: s.scene ?? idx + 1,
      duration: s.duration ?? 5,
      type: s.type ?? 'scene',
      description: s.description ?? '',
      prompt: s.prompt ?? '',
    }));
  } catch (err: any) {
    logger.warn(`[VideoService] generateStoryboardWithLLM parse failed: ${err.message}`);
    return null;
  }
}

export class VideoService {
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
   * Upsert a Video record for an admin-intercepted job.
   * Creates the record if missing (worker sometimes skips createJob for intercepted flows),
   * then marks it completed with the admin-supplied mediaUrl.
   */
  static async upsertForInterception(jobId: string, userId: bigint, mediaUrl: string): Promise<Video> {
    return prisma.video.upsert({
      where: { jobId },
      create: {
        userId,
        jobId,
        niche: 'marketing',
        platform: 'tiktok',
        duration: 15,
        scenes: 1,
        title: 'Marketing Override',
        status: 'completed',
        progress: 100,
        videoUrl: mediaUrl,
        creditsUsed: 0,
        completedAt: new Date(),
      },
      update: {
        status: 'completed',
        progress: 100,
        videoUrl: mediaUrl,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Soft delete video by job ID (sets status to 'deleted')
   */
  static async deleteVideo(jobId: string): Promise<void> {
    await prisma.video.update({
      where: { jobId },
      data: { status: 'deleted' },
    });
    logger.info(`Soft-deleted video: ${jobId}`);
  }

  /**
   * Restore a soft-deleted video
   */
  static async restoreVideo(jobId: string): Promise<void> {
    await prisma.video.update({
      where: { jobId },
      data: { status: 'completed' },
    });
    logger.info(`Restored video: ${jobId}`);
  }

  /**
   * Toggle favorite status on a video
   */
  static async toggleFavorite(jobId: string): Promise<boolean> {
    const video = await prisma.video.findUnique({ where: { jobId }, select: { favorited: true } });
    if (!video) return false;
    const newState = !video.favorited;
    await prisma.video.update({ where: { jobId }, data: { favorited: newState } });
    return newState;
  }

  /**
   * Get user's favorited videos
   */
  static async getUserFavorites(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, favorited: true, status: { not: 'deleted' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get user's trashed (soft-deleted) videos
   */
  static async getUserTrash(userId: bigint, limit = 20): Promise<Video[]> {
    return prisma.video.findMany({
      where: { userId, status: 'deleted' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Permanently delete a video from trash
   */
  static async permanentlyDelete(jobId: string): Promise<void> {
    await prisma.video.delete({ where: { jobId } });
    logger.info(`Permanently deleted video: ${jobId}`);
  }

  /**
   * Get user's videos
   */
  static async getUserVideos(userId: bigint, limit = 10, offset = 0): Promise<Video[]> {
    return prisma.video.findMany({
      where: {
        userId,
        status: { not: 'deleted' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Generate video prompt
   */
  static generatePrompt(params: {
    niche: string;
    platform: string;
    duration: number;
    productDescription?: string;
  }): string {
    const nicheTemplate = NICHE_TEMPLATES[params.niche as keyof typeof NICHE_TEMPLATES];
    const platformSpec = PLATFORM_SPECS[params.platform as keyof typeof PLATFORM_SPECS];

    const prompt = `
Create a ${params.duration}-second marketing video for ${nicheTemplate?.name || 'general'} niche.
Style: ${nicheTemplate?.promptStyle || 'professional'}
Platform: ${params.platform} (${platformSpec?.aspectRatio || '9:16'})
${params.productDescription ? `Product: ${params.productDescription}` : ''}

Structure:
- Hook (0-3s): Attention-grabbing opening
- Problem (3-10s): Pain point
- Solution (10-25s): Product showcase
- CTA (25-30s): Call to action

Visual style: Cinematic, high quality, engaging transitions.
    `.trim();

    return prompt;
  }

  /**
   * Get credit cost for video
   */
  static getCreditCost(duration: number): number {
    return getVideoCreditCost(duration);
  }

  /**
   * Get available niches
   */
  static getNiches() {
    return Object.entries(NICHE_TEMPLATES).map(([id, template]) => ({
      id,
      name: template.name,
    }));
  }

  /**
   * Get available platforms
   */
  static getPlatforms() {
    return Object.entries(PLATFORM_SPECS).map(([id, spec]) => ({
      id,
      ...spec,
    }));
  }

  /**
   * Generate storyboard for niche
   */
  static async generateStoryboard(params: {
    niche: string;
    duration: number;
    productDescription?: string;
    customScenes?: Array<{ scene: number; duration: number; type: string; description: string }>;
  }): Promise<{
    scenes: Array<{ scene: number; duration: number; type: string; description: string; prompt: string }>;
    totalDuration: number;
    caption: string;
  }> {
    const nicheTemplate = NICHE_TEMPLATES[params.niche as keyof typeof NICHE_TEMPLATES];
    const baseScenes = params.customScenes || nicheTemplate?.storyboardTemplate || [];

    // Standard 5s per scene
    const scenesNeeded = Math.ceil(params.duration / 5);
    const adjustedScenes = baseScenes.slice(0, scenesNeeded);

    // Generate scene prompts from templates (always computed as fallback)
    const templateScenes = adjustedScenes.map((scene, idx) => ({
      ...scene,
      scene: idx + 1,
      prompt: this.generateScenePrompt({
        niche: params.niche,
        sceneType: scene.type,
        description: scene.description,
        productDescription: params.productDescription,
      }),
    }));

    // Check if LLM provider is configured for storyboard
    let scenes = templateScenes;
    try {
      const taskSettings = await AITaskSettingsService.getSettings();
      const storyboardConfig = taskSettings.storyboard;
      if (storyboardConfig.provider !== 'builtin') {
        const llmScenes = await generateStoryboardWithLLM(params, storyboardConfig);
        if (llmScenes) {
          scenes = llmScenes;
        }
      }
    } catch (err: any) {
      logger.warn(`[VideoService] Storyboard LLM failed, using template: ${err.message}`);
    }

    // Generate caption
    const caption = await this.generateCaption({
      niche: params.niche,
      productDescription: params.productDescription,
      sceneCount: scenes.length,
    });

    return {
      scenes,
      totalDuration: scenes.reduce((acc, s) => acc + s.duration, 0),
      caption,
    };
  }

  /**
   * Generate scene prompt for AI video generation
   */
  static generateScenePrompt(params: {
    niche: string;
    sceneType: string;
    description: string;
    productDescription?: string;
  }): string {
    const nicheTemplate = NICHE_TEMPLATES[params.niche as keyof typeof NICHE_TEMPLATES];
    const style = nicheTemplate?.promptStyle || 'professional';
    
    return `${params.description}, ${style}, cinematic, 4K, high quality${params.productDescription ? `, ${params.productDescription}` : ''}`;
  }

  /**
   * Generate caption for video.
   *
   * For 'id' and 'en' languages, uses fast hardcoded captions.
   * For any other language, calls Gemini API to generate a localized caption.
   */
  static async generateCaption(params: {
    niche: string;
    productDescription?: string;
    sceneCount: number;
    language?: string;
  }): Promise<string> {
    const lang = params.language || 'id';

    const captionsId: Record<string, string[]> = {
      fnb: [
        'Bikin ngiler! Siapa mau coba? 👇',
        'Fresh dari dapur langsung ke layar kamu!',
        'Rasakan bedanya. Pesan sekarang!',
      ],
      realestate: [
        'Rumah impian kamu ada di sini! DM untuk jadwal tour',
        'Hunian mewah terbaik untuk keluarga.',
        'Siap huni! Hubungi kami sekarang!',
      ],
      product: [
        'Stok terbatas! Dapatkan sekarang!',
        'Wajib punya! Link di bio',
        'Kualitas terjamin. Beli sekarang!',
      ],
      car: [
        'Mobil impian kamu ada di sini!',
        'Performa dan kemewahan dalam satu paket. Book test drive!',
        'Bikin semua noleh. Ready stock!',
      ],
      beauty: [
        'Glow up dalam sekejap! Coba sendiri',
        'Self-care wajib. Link di bio!',
        'Transform rutinitas kamu hari ini!',
      ],
      services: [
        'Solusi profesional untuk kebutuhan kamu. DM kami!',
        'Layanan profesional, hasil terjamin.',
        'Yuk konsultasi sekarang. Book now!',
      ],
    };

    const captionsEn: Record<string, string[]> = {
      fnb: [
        'Craving satisfied! Who wants a bite? 👇',
        'Fresh from the kitchen to your screen!',
        'Taste the difference. Order now!',
      ],
      realestate: [
        'Your dream home awaits! DM for tour',
        'Luxury living at its finest.',
        'Ready to move in? Contact us today!',
      ],
      product: [
        'Limited stock! Get yours now!',
        'Game-changer alert! Link in bio',
        'Quality you can trust. Shop now!',
      ],
      car: [
        'Your dream ride is here!',
        'Luxury meets performance. Book test drive!',
        'Turn heads everywhere. Available now!',
      ],
      beauty: [
        'Glow up in seconds! Try it yourself',
        'Self-care essentials. Link in bio!',
        'Transform your routine today!',
      ],
      services: [
        'Expert solutions for your needs. DM us!',
        'Professional service, guaranteed results.',
        'Let us help you succeed. Book now!',
      ],
    };

    // For id and en, use fast hardcoded captions
    if (lang === 'id' || lang === 'en') {
      const captions = lang === 'en' ? captionsEn : captionsId;
      const nicheCaptions = captions[params.niche] || captions.services;
      const baseCaption = nicheCaptions[Math.floor(Math.random() * nicheCaptions.length)];

      if (params.productDescription) {
        return `${params.productDescription}\n\n${baseCaption}`;
      }
      return baseCaption;
    }

    // For other languages, generate via Gemini API
    try {
      const languageLabel = getAILabel(lang);
      const apiKey = getConfig().GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
      }

      const prompt = `Generate a short, engaging social media caption for a ${params.niche} marketing video in ${languageLabel}. Keep it under 100 characters. Include 1-2 relevant emojis. Output ONLY the caption text.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 128,
              temperature: 0.9,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API returned ${response.status}: ${response.statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- External API response
      const data = await response.json() as any;
      const generatedCaption = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!generatedCaption) {
        throw new Error('Empty response from Gemini API');
      }

      logger.info(`Generated ${languageLabel} caption via Gemini: ${generatedCaption}`);

      if (params.productDescription) {
        return `${params.productDescription}\n\n${generatedCaption}`;
      }
      return generatedCaption;
    } catch (err: any) {
      logger.warn(`Gemini caption generation failed for lang=${lang}: ${err.message}, falling back to English`);
      // Fall back to English captions
      const nicheCaptions = captionsEn[params.niche] || captionsEn.services;
      const baseCaption = nicheCaptions[Math.floor(Math.random() * nicheCaptions.length)];

      if (params.productDescription) {
        return `${params.productDescription}\n\n${baseCaption}`;
      }
      return baseCaption;
    }
  }

  /**
   * Get storyboard template for niche
   */
  static getStoryboardTemplate(niche: string) {
    const nicheTemplate = NICHE_TEMPLATES[niche as keyof typeof NICHE_TEMPLATES];
    return nicheTemplate?.storyboardTemplate || [];
  }

  /**
   * Update storyboard (admin function)
   */
  static updateStoryboardTemplate(niche: string, scenes: Array<{ scene: number; duration: number; type: string; description: string }>) {
    if (NICHE_TEMPLATES[niche as keyof typeof NICHE_TEMPLATES]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic template property assignment
      (NICHE_TEMPLATES[niche as keyof typeof NICHE_TEMPLATES] as any).storyboardTemplate = scenes;
    }
    return true;
  }

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
    } catch (error: any) {
      logger.error(`Video job error: ${jobId}`, error);
      await prisma.video.update({
        where: { jobId },
        data: { status: 'failed', errorMessage: error.message },
      });
    }
  }
}
