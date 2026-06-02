/**
 * Admin Niche Management Routes
 *
 * Extracted from routes/admin.ts as part of the Phase 3.2 refactor
 * (REFACTORING_AUDIT.md §3.2). Handles GET/POST/DELETE for niche configs.
 */
import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";

type AdminVerifier = (request: any, reply: any) => Promise<boolean>;

export async function registerNicheRoutes(server: FastifyInstance, verifyAdmin: AdminVerifier) {
  // List all niches
  server.get("/api/niches", async () => {
    const { getNichesAsync } = await import("../../config/niches.js");
    return getNichesAsync();
  });

  // Create or update a niche
  server.post("/api/niches", async (request, reply) => {
    const body = request.body as {
      id: string;
      name: string;
      emoji: string;
      keywords?: string[];
      colorPalettes?: string[];
    };
    if (!body.id || !body.name) {
      return reply.status(400).send({ error: "id and name required" });
    }
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "niche", key: body.id } },
      create: {
        category: "niche",
        key: body.id,
        value: JSON.parse(JSON.stringify(body)),
        updatedBy: BigInt(0),
      },
      update: { value: JSON.parse(JSON.stringify(body)), updatedBy: BigInt(0) },
    });
    return { success: true };
  });

  // Delete a niche
  server.delete("/api/niches/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.pricingConfig.deleteMany({
      where: { category: "niche", key: id },
    });
    return { success: true };
  });
}
