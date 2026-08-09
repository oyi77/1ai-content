/**
 * MCP Server for 1ai-content
 *
 * Model Context Protocol server exposing 1ai-content capabilities
 * for AI agents (Claude, OpenCode, etc.)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { ImageGenerationService } from "@/services/image.service";
import { ebookService } from "@/services/ebook.service";
import { getOmniRouteService } from "@/services/omniroute.service";
import { enqueueVideoGeneration } from "@/config/queue";
import {
  generateStoryboard,
  NICHES,
} from "@/services/video-generation.service";
import {
  getVideoCreditCostAsync,
  getImageCreditCostAsync,
} from "@/config/pricing";
import { logger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

const TOOLS = [
  {
    name: "1ai-content_health",
    description: "Check health status of 1ai-content services (video, image, ebook, social)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "1ai-content_list_videos",
    description: "List user's generated videos",
    inputSchema: {
      type: "object",
      properties: {
        telegramId: { type: "string", description: "User's Telegram ID" },
        limit: { type: "number", description: "Max videos to return (default 20)" },
      },
      required: ["telegramId"],
    },
  },
  {
    name: "1ai-content_create_video",
    description: "Generate an AI video. Available niches: fnb, fashion, tech, health, travel, education, finance, entertainment",
    inputSchema: {
      type: "object",
      properties: {
        telegramId: { type: "string", description: "User's Telegram ID" },
        niche: { type: "string", description: "Video niche/category" },
        duration: { type: "number", description: "Video duration in seconds (5-60)" },
        customPrompt: { type: "string", description: "Custom prompt for video content" },
        platform: { type: "string", description: "Target platform: tiktok, instagram, youtube, square" },
      },
      required: ["telegramId", "niche", "duration"],
    },
  },
  {
    name: "1ai-content_get_video_status",
    description: "Check status of a video generation job. When a telegramId is supplied, the job is scoped to that user (their job ID only).",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Video job ID to check" },
        telegramId: { type: "string", description: "User's Telegram ID (optional, scopes lookup to that user)" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "1ai-content_generate_image",
    description: "Generate an AI image from text prompt",
    inputSchema: {
      type: "object",
      properties: {
        telegramId: { type: "string", description: "User's Telegram ID" },
        prompt: { type: "string", description: "Image description/prompt" },
        category: { type: "string", description: "Image category: product, fnb, realestate, car, general" },
        aspectRatio: { type: "string", description: "Aspect ratio: 9:16, 1:1, 16:9, 4:5" },
      },
      required: ["telegramId", "prompt"],
    },
  },
  {
    name: "1ai-content_create_ebook",
    description: "Create an AI-generated ebook",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "Ebook idea or topic (10-5000 chars)" },
        title: { type: "string", description: "Ebook title (optional, auto-generated if empty)" },
        chapterCount: { type: "number", description: "Number of chapters (3-50)" },
        targetLanguage: { type: "string", description: "Language code: id, en, ms, th, vi, tl" },
        productMode: { type: "string", description: "Product mode: lead_magnet, paid_ebook, bonus, authority" },
        telegramId: { type: "string", description: "Owner's Telegram ID — scopes the project to this user. Omit to create an unscoped project." },
      },
      required: ["idea"],
    },
  },
  {
    name: "1ai-content_get_ebook_status",
    description: "Check ebook generation status",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "number", description: "Ebook project ID" },
        telegramId: { type: "string", description: "Owner's Telegram ID — required to read another user's scoped project; without it only unscoped (legacy) projects resolve" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "1ai-content_list_ebooks",
    description: "List user's ebook projects",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max ebooks to return (default 10)" },
        telegramId: { type: "string", description: "Owner's Telegram ID — returns only this user's scoped projects; omit for legacy (unscoped) projects" },
      },
      required: [],
    },
  },
  {
    name: "1ai-content_ai_chat",
    description: "Chat with AI assistant for content creation help",
    inputSchema: {
      type: "object",
      properties: {
        telegramId: { type: "string", description: "User's Telegram ID" },
        message: { type: "string", description: "Message to AI" },
      },
      required: ["telegramId", "message"],
    },
  },
  {
    name: "1ai-content_get_niches",
    description: "List available video niches with styles",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "1ai-content_get_user_info",
    description: "Get user profile, credits, and tier info",
    inputSchema: {
      type: "object",
      properties: {
        telegramId: { type: "string", description: "User's Telegram ID" },
      },
      required: ["telegramId"],
    },
  },
];

export function createMcpServer(): Server {
  const server = new Server(
    { name: "1ai-content", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "1ai-content_health": {
          const ebookHealthy = await ebookService.healthCheck();
          return {
            content: [{ type: "text", text: JSON.stringify({ status: "ok", version: "3.0.0", services: { video: true, image: true, ebook: ebookHealthy, social: true } }, null, 2) }],
          };
        }

        case "1ai-content_list_videos": {
          const { telegramId, limit = 20 } = args as { telegramId: string; limit?: number };
          const videos = await prisma.video.findMany({
            where: { userId: BigInt(telegramId) },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { jobId: true, niche: true, duration: true, status: true, videoUrl: true, title: true, createdAt: true },
          });
          return { content: [{ type: "text", text: JSON.stringify({ videos }, null, 2) }] };
        }

        case "1ai-content_create_video": {
          const { telegramId, niche, duration, customPrompt, platform = "tiktok" } = args as {
            telegramId: string; niche: string; duration: number; customPrompt?: string; platform?: string;
          };

          const user = await UserService.findByTelegramId(BigInt(telegramId));
          if (!user) {
            return { content: [{ type: "text", text: "User not found" }], isError: true };
          }

          const creditCost = await getVideoCreditCostAsync(duration);
          const balance = Number(user.creditBalance || 0);

          if (balance < creditCost) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Insufficient credits", required: creditCost, balance }) }], isError: true };
          }

          const nicheConfig = (NICHES as Record<string, { styles?: string[] }>)[niche];
          if (!nicheConfig) {
            return { content: [{ type: "text", text: `Invalid niche. Available: ${Object.keys(NICHES).join(", ")}` }], isError: true };
          }

          const jobId = uuidv4();
          const scenes = Math.max(3, Math.min(Math.floor(duration / 5), 8));
          const storyboard = generateStoryboard(niche, nicheConfig.styles?.slice(0, 2) || ["viral"], duration, scenes);

          await enqueueVideoGeneration({
            userId: user.telegramId.toString(),
            jobId,
            niche,
            platform,
            duration,
            scenes,
            storyboard: storyboard.map((s, i) => ({ scene: i + 1, duration: s.duration || Math.floor(duration / scenes), description: s.description })),
            customPrompt: customPrompt || "",
            enableVO: true,
            enableSubtitles: true,
            language: "id",
            chatId: Number(telegramId),
            creditCost,
          });

          await UserService.deductCredits(user.telegramId, creditCost);

          return { content: [{ type: "text", text: JSON.stringify({ jobId, status: "queued", creditCost, message: "Video generation started" }, null, 2) }] };
        }

        case "1ai-content_get_video_status": {
          const { jobId, telegramId } = args as { jobId: string; telegramId?: string };
          const video = await prisma.video.findFirst({
            where: telegramId ? { jobId, userId: BigInt(telegramId) } : { jobId },
            select: { jobId: true, status: true, videoUrl: true, thumbnailUrl: true, title: true, createdAt: true },
          });

          if (!video) {
            return { content: [{ type: "text", text: "Video not found" }], isError: true };
          }

          return { content: [{ type: "text", text: JSON.stringify(video, null, 2) }] };
        }

        case "1ai-content_generate_image": {
          const { telegramId, prompt, category = "general", aspectRatio = "1:1" } = args as {
            telegramId: string; prompt: string; category?: string; aspectRatio?: string;
          };

          const user = await UserService.findByTelegramId(BigInt(telegramId));
          if (!user) {
            return { content: [{ type: "text", text: "User not found" }], isError: true };
          }

          const creditCost = await getImageCreditCostAsync();
          const balance = Number(user.creditBalance || 0);

          if (balance < creditCost) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Insufficient credits", required: creditCost, balance }) }], isError: true };
          }

          const result = await ImageGenerationService.generateImage({ prompt, category, aspectRatio });

          if (result.success) {
            await UserService.deductCredits(user.telegramId, creditCost);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, url: result.imageUrl, thumbnailUrl: result.thumbnailUrl, creditCost }, null, 2) }] };
          } else {
            return { content: [{ type: "text", text: result.error || "Image generation failed" }], isError: true };
          }
        }

        case "1ai-content_create_ebook": {
          const { telegramId, idea, title, chapterCount = 10, targetLanguage = "id", productMode = "paid_ebook" } = args as {
            telegramId?: string; idea: string; title?: string; chapterCount?: number; targetLanguage?: string; productMode?: string;
          };

          const project = await ebookService.createProject({ idea, title, chapter_count: chapterCount, target_language: targetLanguage, product_mode: productMode }, telegramId);
          await ebookService.generate(project.id, telegramId);

          return { content: [{ type: "text", text: JSON.stringify({ projectId: project.id, status: "generating", message: "Ebook generation started. Use 1ai-content_get_ebook_status to check progress." }, null, 2) }] };
        }

        case "1ai-content_get_ebook_status": {
          const { telegramId, projectId } = args as { telegramId?: string; projectId: number };
          const status = await ebookService.getStatus(projectId, telegramId);
          return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
        }

        case "1ai-content_list_ebooks": {
          const { telegramId, limit = 10 } = args as { telegramId?: string; limit?: number };
          const projects = await ebookService.listProjects(limit, telegramId);
          return { content: [{ type: "text", text: JSON.stringify({ ebooks: projects }, null, 2) }] };
        }

        case "1ai-content_ai_chat": {
          const { telegramId, message } = args as { telegramId: string; message: string };

          const user = await UserService.findByTelegramId(BigInt(telegramId));
          if (!user) {
            return { content: [{ type: "text", text: "User not found" }], isError: true };
          }

          const cost = 0.2; // matches prompt-command chat cost (prompts.ts)
          const balance = Number(user.creditBalance || 0);
          if (balance < cost) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Insufficient credits", required: cost, balance }) }], isError: true };
          }

          const ai = getOmniRouteService();
          const response = await ai.chat(telegramId, message);

          if (response.success) {
            await UserService.deductCredits(user.telegramId, cost);
            return { content: [{ type: "text", text: JSON.stringify({ response: response.content, model: response.model }, null, 2) }] };
          }
          return { content: [{ type: "text", text: response.error || "Chat generation failed" }], isError: true };
        }

        case "1ai-content_get_niches": {
          const niches = Object.entries(NICHES as Record<string, { label?: string; styles?: string[] }>).map(([key, config]) => ({
            key,
            label: config.label || key,
            styles: config.styles || [],
          }));
          return { content: [{ type: "text", text: JSON.stringify({ niches }, null, 2) }] };
        }

        case "1ai-content_get_user_info": {
          const { telegramId } = args as { telegramId: string };
          const user = await UserService.findByTelegramId(BigInt(telegramId));
          if (!user) {
            return { content: [{ type: "text", text: "User not found" }], isError: true };
          }
          return { content: [{ type: "text", text: JSON.stringify({ telegramId: user.telegramId.toString(), tier: user.tier, creditBalance: user.creditBalance, language: user.language, createdAt: user.createdAt }, null, 2) }] };
        }

        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`MCP tool error (${name}):`, error);
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  });

  return server;
}
