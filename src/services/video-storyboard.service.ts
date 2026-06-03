/**
 * Video Storyboard Service
 *
 * Handles storyboard and prompt generation for video creation
 */

import { getVideoCreditCost } from '@/config/pricing';
import { getAILabel } from '@/config/languages';
import { logger } from '@/utils/logger';
import { AITaskSettingsService, AITaskProvider } from '@/services/ai-task-settings.service';
import axios from 'axios';
import { getConfig } from '@/config/env';
import { ConfigError, ProviderError } from '@/utils/app-errors';
import { trackTokens } from '@/services/token-tracker.service';
import { pipelineGenerate } from '@/services/shared-ai-pipeline.service';

// Platform specs
export const PLATFORM_SPECS = {
  tiktok: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 60 },
  instagram: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 90 },
  youtube: { aspectRatio: '9:16', resolution: '1080x1920', maxDuration: 60 },
  facebook: { aspectRatio: '4:5', resolution: '1080x1350', maxDuration: 240 },
  twitter: { aspectRatio: '1:1', resolution: '1080x1080', maxDuration: 140 },
};

// Niche templates - Updated for Berkah Karya workflows
export const NICHE_TEMPLATES = {
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
// Module-level helpers for storyboard generation
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
    const omniUrl = config.OMNIROUTE_URL || 'http://localhost:20128/v1';
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
    return parsed.map((s: any, idx: number) => ({
      scene: s.scene ?? idx + 1,
      duration: s.duration ?? 5,
      type: s.type ?? 'scene',
      description: s.description ?? '',
      prompt: s.prompt ?? '',
    }));
  } catch (err: any) {
    logger.warn(`[VideoStoryboardService] generateStoryboardWithLLM parse failed: ${err.message}`);
    return null;
  }
}

export class VideoStoryboardService {
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
      logger.warn(`[VideoStoryboardService] Storyboard LLM failed, using template: ${err.message}`);
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
   * Generate caption for video
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
        'Rumah impian ada di sini! 🏡 Link di bio',
        'Lokasi strategis, suasana nyaman. Lihat sekarang!',
        'Investasi terbaik untuk keluarga Anda. Hubungi kami!',
      ],
      product: [
        'Ini solusinya! 🛍️ Stok terbatas, pesan sekarang!',
        'Kualitas terjamin, harga terjangkau. Yuk buruan!',
        'Perubahan hidup dimulai dari sini. Dapatkan sekarang!',
      ],
      car: [
        'Mobil impian Anda di sini! 🚗 Cicilan ringan tersedia',
        'Kenyamanan berkendara terbaik. Kunjungi showroom kami!',
        'Performa maksimal dengan desain elegan. Test drive sekarang!',
      ],
      beauty: [
        'Transformasi dimulai hari ini! ✨ Hemat 30% minggu ini',
        'Kulit sehat alami? Bisa! Coba sekarang juga',
        'Rahasia kecantikan terbukti. Pesan sebelum habis!',
      ],
      services: [
        'Solusi cepat untuk masalah Anda! Hubungi tim kami',
        'Terpercaya sejak tahun 2010. Percayakan kebutuhan Anda',
        'Hasil nyata, kepuasan terjamin. Konsultasi gratis!',
      ],
    };

    const captionsEn: Record<string, string[]> = {
      fnb: [
        'Your taste buds will thank you! 🍽️ Order now',
        'Fresh, delicious, and made fresh daily. Try it!',
        'The flavor you\'ve been craving. Get yours today!',
      ],
      realestate: [
        'Your dream home awaits! 🏡 View now',
        'Perfect location, perfect home. Schedule a tour!',
        'Investment opportunity of a lifetime. Contact us!',
      ],
      product: [
        'This is what you need! 🎯 Limited stock, order now!',
        'Quality you can trust, prices you love. Get it today!',
        'Life-changing product. Available now!',
      ],
      car: [
        'Your dream car is here! 🚗 Easy financing available',
        'Comfort and performance combined. Test drive today!',
        'Innovation meets elegance. Discover more!',
      ],
      beauty: [
        'See the transformation! ✨ 30% off this week',
        'Beautiful skin is possible. Try now!',
        'Proven results, guaranteed satisfaction. Order today!',
      ],
      services: [
        'We solve your problems! Fast, reliable service',
        'Trusted by thousands since 2010. Choose us!',
        'Real results, real satisfaction. Get a free quote!',
      ],
    };

    // For Indonesian language, use predefined captions
    if (lang === 'id') {
      const nicheCaptions = captionsId[params.niche] || captionsId.services;
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
        throw new ConfigError('GEMINI_API_KEY');
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
              maxOutputTokens: 100,
              temperature: 0.7,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new ProviderError('Gemini', `API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const generatedCaption = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!generatedCaption) {
        throw new ProviderError('Gemini', 'Empty response');
      }

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
}
