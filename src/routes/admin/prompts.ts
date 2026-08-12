import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { trackingVars } from "./shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const adminPromptQuerySchema = zodToJsonSchema(
  z.object({
    niche: z.string().optional(),
  }),
  "adminPromptQuery",
);

const createPromptBodySchema = zodToJsonSchema(
  z.object({
    niche: z.string().min(1).max(64),
    title: z.string().min(1).max(100),
    prompt: z.string().min(1).max(5000),
  }),
  "createPromptBody",
);

const updatePromptBodySchema = zodToJsonSchema(
  z.object({
    title: z.string().min(1).max(100).optional(),
    prompt: z.string().min(1).max(5000).optional(),
    niche: z.string().min(1).max(64).optional(),
  }),
  "updatePromptBody",
);

const promptIdParamSchema = zodToJsonSchema(
  z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  "promptIdParam",
);

export async function registerPromptsRoutes(server: FastifyInstance) {
  // API: Get all admin prompts (global, visible to all users)
  server.get(
    "/api/admin-prompts",
    {
      schema: { querystring: adminPromptQuerySchema },
    },
    async (request) => {
      const { niche } = request.query as { niche?: string };
      const prompts = await prisma.savedPrompt.findMany({
        where: {
          userId: BigInt(0), // userId=0 means admin/global prompt
          ...(niche ? { niche } : {}),
        },
        orderBy: [
          { niche: "asc" },
          { usageCount: "desc" },
          { createdAt: "desc" },
        ],
      });
      return prompts.map((p) => ({
        id: p.id,
        niche: p.niche,
        title: p.title,
        prompt: p.prompt,
        successRate: p.usageCount,
        createdAt: p.createdAt,
      }));
    },
  );

  // API: Create admin prompt
  server.post(
    "/api/admin-prompts",
    {
      schema: { body: createPromptBodySchema },
    },
    async (request, reply) => {
      const { niche, title, prompt } = (request.body ?? {}) as {
        niche: string;
        title: string;
        prompt: string;
      };
      const created = await prisma.savedPrompt.create({
        data: {
          userId: BigInt(0),
          niche: niche.toLowerCase(),
          title: title.slice(0, 100),
          prompt,
          source: "admin",
        },
      });
      return { ok: true, id: Number(created.id) };
    },
  );

  // API: Update admin prompt
  server.put(
    "/api/admin-prompts/:id",
    {
      schema: {
        params: promptIdParamSchema,
        body: updatePromptBodySchema,
      },
    },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const { title, prompt, niche } = (request.body ?? {}) as {
        title?: string;
        prompt?: string;
        niche?: string;
      };
      try {
        await prisma.savedPrompt.update({
          where: { id },
          data: {
            ...(title ? { title } : {}),
            ...(prompt ? { prompt } : {}),
            ...(niche ? { niche } : {}),
          },
        });
        return { ok: true };
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );

  // API: Delete admin prompt
  server.delete(
    "/api/admin-prompts/:id",
    {
      schema: { params: promptIdParamSchema },
    },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      try {
        await prisma.savedPrompt.delete({ where: { id } });
        return { ok: true };
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );
}
