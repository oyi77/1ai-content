import { z } from 'zod';
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or sends 400 error response.
 */
export async function validateBody<T extends z.ZodType>(
  request: FastifyRequest,
  reply: FastifyReply,
  schema: T
): Promise<z.infer<T> | null> {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    reply.status(400).send({ error: 'Validation failed', details: errors });
    return null;
  }
  return result.data;
}

// Admin API Schemas
export const PricingConfigSchema = z.object({
  category: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

export const PricingDeleteSchema = z.object({
  category: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
});

export const CustomProviderSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

export const CustomProviderUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
});

export const PromptSchema = z.object({
  prompt: z.string().min(1).max(5000),
  model: z.string().optional(),
});

export const NichePromptSchema = z.object({
  niche: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(5000),
});
