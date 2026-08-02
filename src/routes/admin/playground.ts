import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getOmniRouteService } from "@/services/omniroute.service";
import { ImageGenerationService } from "@/services/image.service";
import { generateVideoWithFallback } from "@/services/video-fallback.service";
import { VIDEO_PROVIDERS_SORTED, IMAGE_PROVIDERS_SORTED } from "@/config/providers";
import { ProviderError } from "@/utils/app-errors";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const playgroundTextSchema = zodToJsonSchema(z.object({
  prompt: z.string().min(1).max(10000),
  model: z.string().optional(),
}), "playgroundText");

const playgroundImageSchema = zodToJsonSchema(z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.string().optional(),
  aspectRatio: z.enum(["1:1", "9:16", "16:9", "4:5"]).optional().default("1:1"),
}), "playgroundImage");

const playgroundVideoSchema = zodToJsonSchema(z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.string().optional(),
  duration: z.number().int().min(5).max(120).optional().default(5),
  niche: z.string().optional().default("fnb"),
}), "playgroundVideo");

export async function registerPlaygroundRoutes(server: FastifyInstance) {
  // API: Playground — Models/Providers list
  server.get("/api/admin/playground/models", async () => {
    const omni = getOmniRouteService();
    const models = await omni.listModels();
    return {
      models,
      videoProviders: VIDEO_PROVIDERS_SORTED.map((p) => p.key),
      imageProviders: IMAGE_PROVIDERS_SORTED.map((p) => p.key),
    };
  });

  // API: Playground — Text/Chat
  server.post("/api/admin/playground/text", {
    schema: { body: playgroundTextSchema },
  }, async (request, reply) => {
    const { prompt, model } = request.body as { prompt: string; model?: string };
    const omni = getOmniRouteService();
    const result = await omni.chat("admin_playground", prompt, model);
    return result;
  });

  // API: Playground — Image Generation
  server.post("/api/admin/playground/image", {
    schema: { body: playgroundImageSchema },
  }, async (request, reply) => {
    const { prompt, provider, aspectRatio } = request.body as { prompt: string; provider?: string; aspectRatio?: string };
    const result = await ImageGenerationService.generateImage({
      prompt,
      category: "product",
      aspectRatio,
      _forceProvider: provider,
    } as any);
    return result;
  });

  // API: Playground — Video Generation
  server.post("/api/admin/playground/video", {
    schema: { body: playgroundVideoSchema },
  }, async (request, reply) => {
    const { prompt, provider, duration, niche } = request.body as { prompt: string; provider?: string; duration?: number; niche?: string };
    const result = await generateVideoWithFallback({
      prompt,
      duration,
      niche,
      aspectRatio: "9:16",
      _forceProvider: provider,
    } as any);
    if (!result.success) {
      throw new ProviderError("playground", result.error || "Generation failed");
    }
    return result;
  });
}
