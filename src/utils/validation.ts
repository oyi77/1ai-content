/**
 * Request validation helpers using Zod schemas.
 * - validateBody: imperative helper for inline use (returns parsed data or sends 400)
 * - validate: preHandler factory for declarative route-level validation
 */
import { z } from 'zod';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

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

export interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  querystring?: ZodSchema;
}

/**
 * Build a Fastify preHandler that validates request parts against the given Zod schemas.
 * On failure, replies 400 with a structured error message and does NOT call the handler.
 */
export function validate(schemas: ValidationSchemas) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    for (const part of ['body', 'params', 'querystring'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const data = (request as any)[part];
      const result = schema.safeParse(data);
      if (!result.success) {
        const zodError = result.error as ZodError;
        reply.code(400).send({
          error: 'ValidationError',
          message: `Invalid ${part}`,
          issues: zodError.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
        return reply;
      }
      (request as any)[part] = result.data;
    }
  };
}

// ----- Common reusable schemas -----

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
});

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1).max(128),
});

export const providerKeyParamSchema = z.object({
  key: z.string().min(1).max(64),
});

export const creditsBodySchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(500),
});

export const tierBodySchema = z.object({
  tier: z.enum(['free', 'pro', 'premium', 'enterprise']),
});

export const banBodySchema = z.object({
  reason: z.string().min(1).max(500),
  durationDays: z.number().int().min(0).max(3650).optional(),
});

export const broadcastBodySchema = z.object({
  message: z.string().min(1).max(4096),
  targetTier: z.enum(['all', 'free', 'pro', 'premium']).optional(),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const extendSubscriptionSchema = z.object({
  days: z.number().int().min(1).max(3650),
});

export const landingConfigSchema = z.object({
  heroTitle: z.string().max(200).optional(),
  heroSubtitle: z.string().max(500).optional(),
  ctaText: z.string().max(100).optional(),
});

export const pixelConfigSchema = z.object({
  facebookPixelId: z.string().max(64).optional(),
  googleAnalyticsId: z.string().max(64).optional(),
  tiktokPixelId: z.string().max(64).optional(),
});

export const referralSettingsSchema = z.object({
  tier1Commission: z.number().min(0).max(100).optional(),
  tier2Commission: z.number().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
});

export const apiKeySchema = z.object({
  name: z.string().min(1).max(64),
  value: z.string().min(1).max(2048),
});

export const interceptToggleSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const interceptUploadSchema = z.object({
  jobId: z.string().min(1).max(128),
  fileUrl: z.string().url(),
});

export const interceptDeliverSchema = z.object({
  jobId: z.string().min(1).max(128),
  mediaUrl: z.string().url(),
});

export const welcomeMessageSchema = z.object({
  message: z.string().min(1).max(4096),
});

// ----- Existing pricing/admin schemas preserved -----

export const PricingConfigSchema = z.object({
  category: z.string().min(1).max(64),
  key: z.string().min(1).max(128),
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

export const PricingDeleteSchema = z.object({
  category: z.string().min(1).max(64),
  key: z.string().min(1).max(128),
});

export const CustomProviderSchema = z.object({
  name: z.string().min(1).max(64),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).max(2048),
  models: z.array(z.string().min(1).max(128)).default([]),
});

export const PromptSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string().min(1).max(8192),
  description: z.string().max(500).optional(),
});
