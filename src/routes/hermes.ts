/**
 * HERMES Content API Routes — 1ai-content
 * 
 * Provides caption generation, hashtag generation, and content validation.
 */

import { FastifyInstance } from "fastify";
// @ts-ignore — JS module without type declarations
import {
  generateCaption,
  generateCaptionBatch,
  generateHashtags,
  normalizeCategory,
  getCategories,
} from "../services/hermes/captionGenerator";

interface CaptionRequest {
  category: string;
  affiliate_link: string;
}

interface BatchCaptionRequest extends CaptionRequest {
  count?: number;
}

export async function hermesContentRoutes(fastify: FastifyInstance) {
  // GET /api/hermes/content/categories
  fastify.get("/categories", async (req: FastifyRequest, reply: FastifyReply) => {
    const categories = getCategories();
    return { data: categories.map((c: string) => ({ id: c, label: c })) };
  });

  // POST /api/hermes/content/caption
  fastify.post<{ Body: CaptionRequest }>("/caption", async (req, reply) => {
    const { category, affiliate_link } = req.body;
    if (!category || !affiliate_link) {
      return reply.status(400).send({ error: "category and affiliate_link required" });
    }
    const caption = generateCaption(category, affiliate_link);
    const hashtags = generateHashtags(normalizeCategory(category), 10);
    return { data: { caption, hashtags, category: normalizeCategory(category) } };
  });

  // POST /api/hermes/content/caption/batch
  fastify.post<{ Body: BatchCaptionRequest }>("/caption/batch", async (req, reply) => {
    const { category, affiliate_link, count = 5 } = req.body;
    if (!category || !affiliate_link) {
      return reply.status(400).send({ error: "category and affiliate_link required" });
    }
    const captions = generateCaptionBatch(category, affiliate_link, count);
    return { data: { captions, count: captions.length, category: normalizeCategory(category) } };
  });

  // POST /api/hermes/content/hashtags
  fastify.post<{ Body: { category: string; count?: number } }>("/hashtags", async (req, reply) => {
    const { category, count = 10 } = req.body;
    if (!category) {
      return reply.status(400).send({ error: "category required" });
    }
    const hashtags = generateHashtags(normalizeCategory(category), count);
    return { data: { hashtags, category: normalizeCategory(category) } };
  });
}
