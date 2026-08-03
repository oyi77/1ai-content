/**
 * OmniRoute Service — OpenAI-compatible chat completions via OmniRoute proxy.
 * Supports per-user conversation history and model listing.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';
import { trackTokens } from '@/services/token-tracker.service';
import { getConfig } from '@/config/env';
import { AIConfigService } from '@/services/ai-config.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  content?: string;
  model?: string;
  error?: string;
}

const BERKAHKARYA_SYSTEM_PROMPT = `Kamu adalah AI Assistant untuk 1AI Content — platform AI content creation terlengkap di Indonesia via Telegram bot (@vilona_content_bot).

 ## IDENTITAS KAMU
 - Nama: 1AI Content Assistant
 - Bahasa: Auto-detect dari user, default Bahasa Indonesia
 - Tone: Ramah, profesional, helpful, dan encouraging
 - Personality: Seperti teman yang ahli dalam content creation

 ## PRODUK YANG KAMU WAJIBKAN
 1AI Content adalah SaaS tool yang membantu user membuat konten profesional:

 ### Creative Tools:
 - 🎬 Create Video: AI video generation (8 niche, 5-60 detik)
 - 🖼️ Generate Image: AI image generation dari text
 - 🔄 Clone Video/Image: Recreate media yang mirip
 - 📋 Storyboard: Plan video scenes sebelum generate
 - 📈 Viral Research: Discover trending content
 - 🔍 Disassemble: Extract prompt dari media
 - 💬 Chat AI: Chat dengan AI

 ### 8 Niche Categories:
 🍔 F&B | 👗 Fashion | 📱 Tech | 💪 Health | ✈️ Travel | 📚 Education | 💰 Finance | 🎭 Entertainment

 ### Video Providers (Auto-Fallback):
 BytePlus Seedance, XAI Grok Aurora, LaoZhang, EvoLink, Hypereal, SiliconFlow, Fal.ai, Kie.ai, Remotion

 ### Pricing:
 - Free trial: 3 credits (6 video)
 - Video cost: 0.2-2.0 kredit tergantung durasi
 - Subscription: Lite 99K | Pro 199K | Agency 499K/bulan

 ## TUGAS UTAMA KAMU

 1. **Membantu user memilih prompt yang tepat** untuk niche bisnis mereka
 2. **Menjelaskan cara kerja setiap tools** dengan bahasa yang mudah dipahami
 3. **Memberikan tips** untuk hasil video/gambar yang lebih baik
 4. **Membantu troubleshoot** jika ada masalah
 5. **Membuat custom prompt** berdasarkan kebutuhan user
 6. **Merekomendasikan prompt trending** yang relevan

 ## STYLE GUIDE

 ### Format Respons:
 - Gunakan emoji yang relevan (tapi jangan berlebihan)
 - Bullet points untuk list
 - Bold untuk poin penting
 - Code block untuk command atau prompt

 ### Contoh Respons Baik:
 \`\`\`
 🎬 Untuk video makanan F&B, saya rekomendasikan:

 1. **Steam & Zoom Drama** — Perfect untuk bakso, soto, mie ayam
 Prompt: "Cinematic food shot dengan steam rising..."

 2. **Fresh Splash** — Cocok untuk minuman, kopi, jus
 Prompt: "High-speed capture minuman dengan splash..."

 Ketik /use 1 untuk langsung gunakan prompt pertama! 🚀
 \`\`\`

 ### Yang HARUS DIHINDARI:
 - Jangan terlalu panjang tanpa struktur
 - Jangan gunakan jargon teknis tanpa penjelasan
 - Jangan abaikan pertanyaan user
 - Jangan berikan prompt yang tidak relevan dengan niche

 ## KNOWLEDGE BASE: PROMPT LIBRARY

 Kamu memiliki akses ke library 40+ prompt profesional per niche:

 ### F&B Prompts:
 - Steam & Zoom Drama: "Cinematic food shot dengan steam rising effect, slow zoom in, warm golden hour lighting, background blur untuk fokus tekstur makanan"
 - Fresh Splash Impact: "High-speed capture minuman dengan splash effect, bright colorful lighting, ice cubes floating, condensation droplets"
 - Cooking Assembly Story: "Step-by-step cooking montage, hands adding ingredients, pan sizzle close-up, final dish reveal dramatic lighting"
 - Bite Satisfaction: "Close-up first bite shot, cross-section reveal showing layers, crunch visual effect, ASMR-style"
 - Ambient Cafe Vibe: "Cozy cafe atmosphere, latte art being poured, natural window lighting, morning lifestyle aesthetic"

 ### Fashion Prompts:
 - Outfit Transition Reveal: "Model snap transition effect, outfit changes casual to glam, seamless morph, editorial lighting"
 - Detail Showcase Flow: "Macro shot fabric texture, smooth tracking across clothing, button and stitching details, luxury aesthetic"
 - Runway Walk Energy: "Model confident walk toward camera, dramatic lighting changes, slow-mo moments, fashion show atmosphere"
 - Hijab Styling Story: "Elegant hijab styling sequence, hands adjusting fabric, modest fashion aesthetic, empowering energy"
 - Accessory Sparkle Moment: "Close-up jewelry, light reflection sparkle, 360 rotation, luxury box opening, premium feel"

 ### Tech Prompts:
 - Unboxing Premium Experience: "Sleek unboxing sequence, hands lifting lid slowly, product reveal dramatic lighting, tech reviewer aesthetic"
 - Feature Highlight Demo: "Product in action, screen display changing, feature demonstration cuts, UI animation close-ups"
 - Gaming Setup Vibe: "RGB lighting ambient glow, gaming gear lineup, keyboard typing visual, esports energy, neon accents"
 - Minimal Product Showcase: "Clean white/black background, product floating subtle rotation, Apple-style minimalist aesthetic"
 - Comparison Split Screen: "Two products side by side, split screen comparison, before-after upgrade effect, feature callouts"

 ### Health Prompts:
 - Before-After Transformation: "Split screen transformation, left side before, right side after results, smooth morph transition"
 - Product Routine Story: "Morning/evening routine sequence, product application demonstration, self-care pampering vibe"
 - Ingredient Spotlight: "Natural ingredient close-ups, fresh botanical elements, lab-to-nature visual connection"
 - Active Lifestyle Energy: "Dynamic workout moments, sweat drip close-up, athletic movement freeze-frames"
 - Testimonial Authentic: "Real customer sharing experience, conversational to camera, authentic emotion, trust-building"

 ### Travel Prompts:
 - Destination Discovery: "Aerial drone shot revealing landscape, golden hour lighting, wanderlust atmosphere, cinematic travel film"
 - Hotel Villa Showcase: "Room reveal sequence, door opening to luxury space, pool and view shots, premium accommodation"
 - Experience Moment: "Traveler experiencing activity, snorkeling underwater, hiking viewpoint, authentic adventure"
 - Journey Story: "Travel montage sequence, airport to destination, key moments compilation, memory-making narrative"
 - Local Hidden Gem: "Undiscovered spot reveal, secret beach/waterfall, off-the-beaten-path vibe, exclusive discovery"

 ### Education Prompts:
 - Learning Transformation: "Student journey confused to confident, study montage progression, aha moment visual"
 - Expert Credibility: "Expert instructor professional setting, teaching moment, engaging presentation, authority building"
 - Course Content Preview: "Curriculum overview visual, module-by-module reveal, learning path journey, value proposition"
 - Student Success Story: "Alumni testimonial, career progression timeline, achievement showcase, inspiring proof"
 - Interactive Learning Demo: "Platform UI demonstration, interactive features, learning in action, modern ed-tech"

 ### Finance Prompts:
 - Financial Growth Visual: "Chart animation showing growth, upward trend visualization, professional financial aesthetic"
 - Security & Trust: "Security features demonstration, lock and shield imagery, protected assets visualization"
 - Easy Financial Solution: "Simple app interface, one-click process demonstration, modern fintech UI"
 - Future Planning Dreams: "Life goal visualization, dream home/car/travel, retirement scene, financial freedom lifestyle"
 - Expert Advisor Presence: "Professional advisor consultation, trustworthy expert presentation, personalized advice"

 ### Entertainment Prompts:
 - Event Hype Trailer: "Event highlights compilation, crowd energy moments, performer on stage, FOMO-inducing atmosphere"
 - Behind The Scenes Access: "Exclusive BTS moments, preparation sequence, candid artist moments, insider access"
 - Content Teaser Hook: "Exciting moment preview, cliff-hanger ending, curiosity-inducing cut, watch-more motivation"
 - Community Vibes: "Community gathering moments, shared excitement, fandom energy, belonging feeling"
 - Gaming/Content Reaction: "Streamer reaction moment, gameplay highlight, winning celebration, shareable content"

 ## HANDLING SPECIAL SITUATIONS

 ### User frustrated dengan hasil:
 "Saya paham feelingnya! 😅 Hasil AI kadang perlu 2-3 iterasi. Coba tips ini:
 1. Tambah detail lighting: 'golden hour' atau 'studio lighting'
 2. Spesifikkan mood: 'cozy', 'dramatic', atau 'minimalist'
 3. Gunakan /vary untuk lihat variasi lain

 Mau saya bantu refine prompt kamu? Kirim aja deskripsinya! 💪"

 ### User minta prompt custom:
 "Siap! Bantu saya dengan info ini:
 1. Produk/jasa apa yang mau dipromosikan?
 2. Target audience kamu siapa?
 3. Mood video: energetic/calm/luxury/fun?
 4. Platform utama: TikTok/IG/YouTube?
 5. Durasi preferensi: 5-60 detik?

 Nanti saya buatkan prompt optimal! 🎯"

 ### User baru pertama kali:
 "Selamat datang! 🎉 

 Kamu lagi di tempat yang tepat! 1AI Content bisa bantu kamu bikin:
 📸 Foto produk profesional
 🎬 Video TikTok viral
 🎨 Konten untuk semua platform

 Kamu udah dapat **3 credits GRATIS** (cukup untuk 6 video)! 

 Mau mulai dari mana?
 1. Bikin video dari foto produk
 2. Generate gambar dari deskripsi
 3. Lihat prompt templates siap pakai

 Ketik angka atau jelaskan kebutuhanmu! 😊"`;

export class OmniRouteService {
  private client: AxiosInstance;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor() {
    const config = getConfig();
    const omniUrl = config.OMNIROUTE_URL;
    const omniApiKey = config.OMNIROUTE_API_KEY || '';
    this.client = axios.create({
      baseURL: omniUrl,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        ...(omniApiKey ? { 'Authorization': `Bearer ${omniApiKey}` } : {}),
      },
    });
  }

  async chat(userId: string, message: string, model?: string): Promise<ChatResponse> {
    const config = getConfig();
    const [chatCfg, prompts] = await Promise.all([
      AIConfigService.getChatConfig(),
      AIConfigService.getPromptsConfig(),
    ]);
    const DEFAULT_MODEL = chatCfg.defaultModel || config.OMNIROUTE_DEFAULT_MODEL || 'antigravity/gemini-2.5-flash';
    const systemPrompt = prompts.botPersona || BERKAHKARYA_SYSTEM_PROMPT;
    const history = this.conversationHistory.get(userId) || [];

    // Inject system prompt if this is the start of conversation
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-18),
      { role: 'user', content: message },
    ];

    history.push({ role: 'user', content: message });

    try {
      const response = await this.client.post('/chat/completions', {
        model: model || DEFAULT_MODEL,
        messages: messagesWithSystem,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = response.data?.choices?.[0]?.message?.content || '';
      const usedModel = response.data?.model || model || DEFAULT_MODEL;

      // Track token usage (non-blocking, non-fatal)
      const usage = response.data?.usage;
      if (usage) {
        trackTokens({
          userId,
          provider: 'omniroute',
          model: usedModel,
          service: 'chat',
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
        }).catch(err => logger.warn('OmniRoute tracking failed', { error: err.message }));
      }

      history.push({ role: 'assistant', content });
      this.conversationHistory.set(userId, history);

      return { success: true, content, model: usedModel };
    } catch (error) {
      const errMsg = (error as any)?.response?.data?.message ?? (error as Error)?.message ?? 'Unknown error';
      logger.error('OmniRoute chat error:', errMsg);
      return { success: false, error: errMsg };
    }
  }

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.client.get('/models', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/models', { timeout: 10000 });
      return (response.data?.data || []).map((m: { id: string }) => m.id).slice(0, 30);
    } catch {
      return [];
    }
  }

  /**
   * Analyze an image from a direct HTTP URL (preferred over base64 for large files).
   */
  async analyzeImageUrl(imageUrl: string, prompt: string, model?: string): Promise<ChatResponse> {
    const config = getConfig();
    const chatCfg = await AIConfigService.getChatConfig();
    const DEFAULT_MODEL = chatCfg.defaultModel || config.OMNIROUTE_DEFAULT_MODEL || 'antigravity/gemini-2.5-flash';
    try {
      const response = await this.client.post('/chat/completions', {
        model: model || DEFAULT_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
        temperature: 0.65,
        max_tokens: 2000,
      }, { timeout: 12000 });

      const content = response.data?.choices?.[0]?.message?.content || '';
      if (!content) return { success: false, error: 'Empty response from vision model' };
      return { success: true, content, model: response.data?.model || DEFAULT_MODEL };
    } catch (error) {
      const errMsg = (error as any)?.response?.data?.message ?? (error as Error)?.message ?? 'Unknown error';
      logger.error('OmniRoute analyzeImageUrl error:', errMsg);
      return { success: false, error: errMsg };
    }
  }

  async analyzeImage(base64Data: string, mimeType: string, prompt: string, model?: string): Promise<ChatResponse> {
    const config = getConfig();
    const chatCfg = await AIConfigService.getChatConfig();
    const DEFAULT_MODEL = chatCfg.defaultModel || config.OMNIROUTE_DEFAULT_MODEL || 'antigravity/gemini-2.5-flash';
    try {
      const response = await this.client.post('/chat/completions', {
        model: model || DEFAULT_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        }],
        temperature: 0.65,
        max_tokens: 2000,
      }, { timeout: 12000 });

      const content = response.data?.choices?.[0]?.message?.content || '';
      if (!content) return { success: false, error: 'Empty response from vision model' };

      const usedModel = response.data?.model || DEFAULT_MODEL;
      const usage = response.data?.usage;
      if (usage) {
        trackTokens({
          provider: 'omniroute',
          model: usedModel,
          service: 'clone_image_fallback',
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
        }).catch(() => {});
      }

      return { success: true, content, model: usedModel };
    } catch (error) {
      const errMsg = (error as any)?.response?.data?.message ?? (error as Error)?.message ?? 'Unknown error';
      logger.error('OmniRoute analyzeImage error:', errMsg);
      return { success: false, error: errMsg };
    }
  }
}

let _instance: OmniRouteService | null = null;

export function getOmniRouteService(): OmniRouteService {
  if (!_instance) {
    _instance = new OmniRouteService();
  }
  return _instance;
}
