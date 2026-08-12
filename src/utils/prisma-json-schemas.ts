/**
 * Zod schemas for Prisma Json fields.
 * These provide runtime validation for the `Json?` columns in prisma/schema.prisma.
 *
 * Why: Prisma stores Json as raw JSON. Without explicit Zod schemas, the application
 * can write/read malformed payloads and crash at runtime. Per REFACTORING_AUDIT.md §2.4,
 * we add Zod validation at the boundary (read & write).
 */
import { z } from "zod";

// ----- User.statusHistory -----
// Array of {status, changedAt, reason} entries
export const userStatusHistoryEntrySchema = z.object({
  status: z.string().min(1).max(64),
  changedAt: z.string().datetime().or(z.date()),
  reason: z.string().max(500).optional(),
});
export const userStatusHistorySchema = z.array(userStatusHistoryEntrySchema);

// ----- Video.storyboard -----
// Array of scenes: {scene, duration, type, description, prompt}
export const storyboardSceneSchema = z.object({
  scene: z.number().int().min(1).max(100),
  duration: z.number().min(0.1).max(300),
  type: z.string().min(1).max(64),
  description: z.string().max(2000).optional().default(""),
  prompt: z.string().max(8000).optional().default(""),
});
export const storyboardSchema = z.array(storyboardSceneSchema);

// ----- Video.generationMetadata -----
// Provider chain + timing + fallback info
export const generationMetadataSchema = z
  .object({
    provider: z.string().max(64).optional(),
    providerChain: z.array(z.string().max(64)).optional(),
    totalDurationMs: z.number().int().min(0).optional(),
    attempts: z.number().int().min(0).optional(),
    circuitBreakerTriggered: z.boolean().optional(),
    fallbackUsed: z.boolean().optional(),
    cost: z.number().min(0).optional(),
    model: z.string().max(128).optional(),
    startedAt: z.string().datetime().or(z.date()).optional(),
    completedAt: z.string().datetime().or(z.date()).optional(),
    error: z.string().max(2000).optional(),
  })
  .passthrough(); // Allow extra fields for forward-compat

// ----- VideoClip.metadata -----
// FFprobe output + edit settings
export const videoClipMetadataSchema = z
  .object({
    width: z.number().int().min(0).optional(),
    height: z.number().int().min(0).optional(),
    duration: z.number().min(0).optional(),
    fps: z.number().min(0).optional(),
    bitRate: z.number().int().min(0).optional(),
    codec: z.string().max(64).optional(),
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    editType: z.string().max(64).optional(),
    appliedEffects: z.array(z.string().max(64)).optional(),
  })
  .passthrough();

// ----- Video.productAnalysis -----
// AI analysis of the product image: {category, features, suggestedNiche, ...}
export const productAnalysisSchema = z
  .object({
    category: z.string().max(64).optional(),
    subcategory: z.string().max(128).optional(),
    features: z.array(z.string().max(200)).optional(),
    suggestedNiche: z.string().max(64).optional(),
    suggestedPlatforms: z.array(z.string().max(32)).optional(),
    colorPalette: z.array(z.string().max(32)).optional(),
    mood: z.string().max(64).optional(),
    targetAudience: z.string().max(256).optional(),
    confidence: z.number().min(0).max(1).optional(),
    model: z.string().max(128).optional(),
    analyzedAt: z.string().datetime().or(z.date()).optional(),
  })
  .passthrough();

// ----- Schema registry for lookup -----

export const PRISMA_JSON_SCHEMAS = {
  "User.statusHistory": userStatusHistorySchema,
  "Video.storyboard": storyboardSchema,
  "Video.generationMetadata": generationMetadataSchema,
  "Video.productAnalysis": productAnalysisSchema,
  "VideoClip.metadata": videoClipMetadataSchema,
} as const;

export type PrismaJsonField = keyof typeof PRISMA_JSON_SCHEMAS;

/**
 * Validate a Json field value. Returns the parsed value or null on failure.
 * Logs a warning (doesn't throw) so existing bad data doesn't crash reads.
 */
export function validateJsonField<K extends PrismaJsonField>(
  field: K,
  value: unknown,
): z.infer<(typeof PRISMA_JSON_SCHEMAS)[K]> | null {
  const schema = PRISMA_JSON_SCHEMAS[field];
  const result = schema.safeParse(value);
  if (!result.success) {
    // Don't throw on read — just return null so the app keeps working
    // (corrupt data should be fixed by a separate migration)
    return null;
  }
  return result.data;
}
