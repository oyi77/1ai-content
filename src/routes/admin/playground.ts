import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getOmniRouteService } from "@/services/omniroute.service";
import { ImageGenerationService } from "@/services/image.service";
import { generateVideoWithFallback } from "@/services/video-fallback.service";
import { ProviderError } from "@/utils/app-errors";

export async function registerPlaygroundRoutes(server: FastifyInstance) {
  // API: Playground — Text/Chat
  server.post("/api/admin/playground/text", async (request: FastifyRequest, reply: FastifyReply) => {
    const { prompt, model } = request.body as {
      prompt: string;
      model?: string;
    };
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });
    const omni = getOmniRouteService();
    const result = await omni.chat("admin_playground", prompt, model);
    return result;
  });

  // API: Playground — Image Generation
  server.post("/api/admin/playground/image", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const prompt = body.prompt as string;
    const provider = body.provider as string | undefined;
    const aspectRatio = (body.aspectRatio as string) || "1:1";
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });

    const result = await ImageGenerationService.generateImage({
      prompt,
      category: "product",
      aspectRatio,
      _forceProvider: provider,
    } as any);

    return result;
  });

  // API: Playground — Video Generation
  server.post("/api/admin/playground/video", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const prompt = body.prompt as string;
    const provider = body.provider as string | undefined;
    const duration = (body.duration as number) || 5;
    const niche = (body.niche as string) || "fnb";
    if (!prompt) return reply.status(400).send({ error: "Prompt required" });

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
