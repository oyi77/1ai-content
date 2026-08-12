/**
 * Admin Free Trial Settings Routes
 *
 * Extracted from routes/admin.ts as part of the Phase 3.2 refactor
 * (REFACTORING_AUDIT.md §3.2). Handles GET/POST for free trial config.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const freeTrialBodySchema = zodToJsonSchema(
  z.object({
    enabled: z.boolean().optional(),
    durationSeconds: z.number().int().min(0).optional(),
    credits: z.number().int().min(0).optional(),
  }),
  "freeTrialBody",
);

type AdminVerifier = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<boolean>;

export async function registerFreeTrialRoutes(
  server: FastifyInstance,
  verifyAdmin: AdminVerifier,
) {
  // Get free trial config
  server.get("/api/settings/free-trial", async () => {
    const { getFreeTrialConfigAsync } =
      await import("../../config/free-trial.js");
    return getFreeTrialConfigAsync();
  });

  // Update free trial config
  server.post(
    "/api/settings/free-trial",
    {
      schema: { body: freeTrialBodySchema },
    },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      await prisma.pricingConfig.upsert({
        where: { category_key: { category: "free_trial", key: "config" } },
        create: {
          category: "free_trial",
          key: "config",
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
}
