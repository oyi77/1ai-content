/**
 * Fanpage Manager — CRUD for Facebook Page tokens
 *
 * Bridges the orphaned facebook_pages infrastructure with the admin dashboard.
 * Use Prisma as the single source of truth (Python API is for media processing only).
 */
import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
import { trackingVars } from "./shared";

/**
 * Format Fanpage row for API response (clean up BigInt serialization).
 */
function formatFanpage(row: Record<string, unknown>) {
  return {
    ...row,
    id: Number(row.id),
    fanCount: row.fanCount ?? 0,
  };
}

export async function registerFanpageRoutes(server: FastifyInstance) {
  // ── Admin view ──────────────────────────────────────────────
  server.get("/admin/fanpage", async (_request, reply) => {
    return reply.view(
      "admin/fanpage.ejs",
      { ...trackingVars(), activePage: "fanpage", title: "Fanpage Manager" },
      { layout: "admin/layout.ejs" },
    );
  });

  // ── API: List all pages ────────────────────────────────────
  server.get("/api/fanpages", async () => {
    const rows = await prisma.fanpage.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(formatFanpage);
  });

  // ── API: Get single page ───────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/fanpages/:id", async (request, reply) => {
    const id = BigInt(request.params.id);
    const row = await prisma.fanpage.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "Not found" });
    return formatFanpage(row);
  });

  // ── API: Create page ───────────────────────────────────────
  server.post("/api/fanpages", async (request, reply) => {
    const body = request.body as {
      userId: string;
      pageId: string;
      pageName: string;
      accessToken: string;
      category?: string;
      fanCount?: number;
    };
    // Prevent duplicate (userId, pageId)
    const existing = await prisma.fanpage.findFirst({
      where: { userId: body.userId, pageId: body.pageId },
    });
    if (existing) {
      return reply.status(409).send({ error: "Page already registered for this user" });
    }
    const row = await prisma.fanpage.create({
      data: {
        userId: body.userId,
        pageId: body.pageId,
        pageName: body.pageName,
        accessToken: body.accessToken,
        category: body.category ?? null,
        fanCount: body.fanCount ?? 0,
      },
    });
    return formatFanpage(row);
  });

  // ── API: Update page ───────────────────────────────────────
  server.put<{ Params: { id: string } }>("/api/fanpages/:id", async (request, reply) => {
    const id = BigInt(request.params.id);
    const body = request.body as Partial<{
      pageName: string;
      accessToken: string;
      category: string;
      fanCount: number;
      isActive: boolean;
      lastUsedAt: string;
    }>;
    const existing = await prisma.fanpage.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    type FanpageUpdateData = Partial<{
      pageName: string;
      accessToken: string;
      category: string | null;
      fanCount: number;
      isActive: boolean;
      lastUsedAt: Date;
    }>;
    const data: FanpageUpdateData = {};
    if (body.pageName !== undefined) data.pageName = body.pageName;
    if (body.accessToken !== undefined) data.accessToken = body.accessToken;
    if (body.category !== undefined) data.category = body.category;
    if (body.fanCount !== undefined) data.fanCount = body.fanCount;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.lastUsedAt !== undefined) data.lastUsedAt = new Date(body.lastUsedAt);

    const row = await prisma.fanpage.update({ where: { id }, data });
    return formatFanpage(row);
  });

  // ── API: Delete page ───────────────────────────────────────
  server.delete<{ Params: { id: string } }>("/api/fanpages/:id", async (request, reply) => {
    const id = BigInt(request.params.id);
    const existing = await prisma.fanpage.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await prisma.fanpage.delete({ where: { id } });
    return { success: true };
  });
}
