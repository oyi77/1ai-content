import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { trackingVars } from "./shared";

export async function registerPromptsRoutes(server: FastifyInstance) {
  server.get("/admin/prompts", async (_request, reply) => {
    return reply.view("admin/prompts.ejs", { ...trackingVars(), activePage: 'prompts', title: 'Prompt Management' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/settings", async (_request, reply) => {
    return reply.view("admin/settings.ejs", { ...trackingVars(), activePage: 'settings', title: 'Settings' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/interceptions", async (_request, reply) => {
    return reply.view("admin/interceptions.ejs", { ...trackingVars(), activePage: 'interceptions', title: 'Live Interceptions' }, { layout: 'admin/layout.ejs' });
  });

  server.get("/admin/users", async (_request, reply) => {
    return reply.redirect("/admin/dashboard#users");
  });

  // API: Get all admin prompts (global, visible to all users)
  server.get("/api/admin-prompts", async (request: FastifyRequest) => {
    const niche = (request.query as Record<string, string>).niche;
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
    return prompts.map((p: any) => ({
      id: p.id,
      niche: p.niche,
      title: p.title,
      prompt: p.prompt,
      successRate: p.usageCount,
      createdAt: p.createdAt,
    }));
  });

  // API: Create admin prompt
  server.post("/api/admin-prompts", async (request: FastifyRequest, reply: FastifyReply) => {
    const { niche, title, prompt } = request.body as Record<string, string>;
    if (!niche || !title || !prompt) {
      return reply.status(400).send({ error: "niche, title, prompt required" });
    }
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
  });

  // API: Update admin prompt
  server.put("/api/admin-prompts/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = parseInt((request.params as Record<string, string>).id);
    if (!Number.isInteger(id) || id <= 0)
      return reply.status(400).send({ error: "Invalid id" });
    const { title, prompt, niche } = request.body as Record<string, string>;
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
  });

  // API: Delete admin prompt
  server.delete("/api/admin-prompts/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const id = parseInt((request.params as Record<string, string>).id);
    if (!Number.isInteger(id) || id <= 0)
      return reply.status(400).send({ error: "Invalid id" });
    try {
      await prisma.savedPrompt.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
  });
}