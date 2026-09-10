/**
 * Content Project Routes
 *
 * Cross-service content tracking for the 1ai-hub content_tracked workflow:
 *   POST /api/content/projects       — record a project (download/compose tracking)
 *   GET  /api/content/projects/:id   — verify a project exists (workflow verification step)
 *
 * Auth: service-to-service. Requires X-API-Key matching EBOOK_API_KEY when that
 * key is configured; otherwise loopback-only (127.0.0.1/::1) requests accepted.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function contentProjectRoutes(server: FastifyInstance): Promise<void> {
  const serviceAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const expected = getConfig().EBOOK_API_KEY;
    if (expected) {
      const provided = (request.headers["x-api-key"] as string) || "";
      if (!provided || !timingSafeEqual(provided, expected)) {
        reply.status(401).send({ error: "Unauthorized: missing or invalid X-API-Key" });
        return;
      }
      return;
    }
    // No shared key configured: restrict to loopback callers only.
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
    if (!loopback.includes(request.ip)) {
      reply.status(401).send({ error: "Unauthorized" });
    }
  };

  server.post(
    "/api/content/projects",
    { preHandler: [serviceAuth] },
    async (request, reply) => {
      const body = (request.body ?? {}) as {
        source_url?: string;
        category?: string;
        workflow?: string;
        file_path?: string;
        status?: string;
      };
      if (!body.source_url) {
        return reply.status(400).send({ error: "source_url required" });
      }
      const project = await prisma.contentProject.create({
        data: {
          sourceUrl: body.source_url,
          category: body.category || "general",
          workflow: body.workflow || "",
          filePath: body.file_path || null,
          status: body.status || "created",
        },
      });
      return reply.send({ data: { id: project.id.toString() } });
    }
  );

  server.get(
    "/api/content/projects/:id",
    { preHandler: [serviceAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const numeric = Number(id);
      if (!Number.isFinite(numeric)) {
        return reply.status(404).send({ error: "Not found" });
      }
      const project = await prisma.contentProject.findUnique({
        where: { id: BigInt(numeric) },
      });
      if (!project) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.send({
        data: {
          id: project.id.toString(),
          source_url: project.sourceUrl,
          category: project.category,
          workflow: project.workflow,
          file_path: project.filePath,
          status: project.status,
          created_at: project.createdAt.toISOString(),
        },
      });
    }
  );
}
