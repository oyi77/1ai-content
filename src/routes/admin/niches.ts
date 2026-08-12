/**
 * Admin Niche Management Routes
 *
 * Extracted from routes/admin.ts as part of the Phase 3.2 refactor
 * (REFACTORING_AUDIT.md §3.2). Handles GET/POST/DELETE for niche configs.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const nicheBodySchema = zodToJsonSchema(
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    tag: z.string(),
    prompt: z.string(),
    enabled: z.boolean().default(true),
  }),
  "nicheBody",
);

const nicheParamSchema = zodToJsonSchema(
  z.object({
    id: z.string().min(1).max(64),
  }),
  "nicheParam",
);

type AdminVerifier = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<boolean>;

export async function registerNicheRoutes(
  server: FastifyInstance,
  verifyAdmin: AdminVerifier,
) {
  // List all niches
  server.get("/api/niches", async () => {
    const { getNichesAsync } = await import("../../config/niches.js");
    return getNichesAsync();
  });

  // Create or update a niche
  server.post(
    "/api/niches",
    {
      schema: { body: nicheBodySchema },
    },
    async (request, reply) => {
      const body = (request.body ?? {}) as {
        id: string;
        name: string;
        description: string;
        icon: string;
        tag: string;
        prompt: string;
        enabled?: boolean;
      };
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "niche", key: body.id } },
        create: {
          category: "niche",
          key: body.id,
          value: JSON.parse(JSON.stringify(body)),
          updatedBy: BigInt(0),
        },
        update: {
          value: JSON.parse(JSON.stringify(body)),
          updatedBy: BigInt(0),
        },
      });
      return { success: true };
    },
  );

  // Delete a niche
  server.delete(
    "/api/niches/:id",
    {
      schema: { params: nicheParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await prisma.pricingConfig.deleteMany({
        where: { category: "niche", key: id },
      });
      return { success: true };
    },
  );
}
