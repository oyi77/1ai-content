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
    return reply.redirect("/admin/tools/fanpage");
  });

  // ── API: List all pages ────────────────────────────────────
  server.get("/api/fanpages", async () => {
    const rows = await prisma.fanpage.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(formatFanpage);
  });

  // ── API: Get single page ───────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/fanpages/:id",
    async (request, reply) => {
      const id = BigInt(request.params.id);
      const row = await prisma.fanpage.findUnique({ where: { id } });
      if (!row) return reply.status(404).send({ error: "Not found" });
      return formatFanpage(row);
    },
  );

  // ── API: Create page ───────────────────────────────────────
  server.post("/api/fanpages", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    // Validate required fields
    const userId = String(body.userId ?? "");
    const pageId = String(body.pageId ?? "");
    const pageName = String(body.pageName ?? "");
    const accessToken = String(body.accessToken ?? "");
    const errors: string[] = [];
    if (!userId) errors.push("userId");
    if (!pageId) errors.push("pageId");
    if (!pageName) errors.push("pageName");
    if (!accessToken) errors.push("accessToken");
    if (errors.length) {
      return reply
        .status(400)
        .send({ error: `Missing required fields: ${errors.join(", ")}` });
    }

    // Prevent duplicate (userId, pageId)
    const existing = await prisma.fanpage.findFirst({
      where: { userId, pageId },
    });
    if (existing) {
      return reply
        .status(409)
        .send({ error: "Page already registered for this user" });
    }
    try {
      const row = await prisma.fanpage.create({
        data: {
          userId,
          pageId,
          pageName,
          accessToken,
          category: body.category ? String(body.category) : null,
          fanCount: typeof body.fanCount === "number" ? body.fanCount : 0,
        },
      });
      return formatFanpage(row);
    } catch (err) {
      return reply.status(500).send({ error: "Failed to create fanpage" });
    }
  });

  // ── API: Update page ───────────────────────────────────────
  server.put<{ Params: { id: string } }>(
    "/api/fanpages/:id",
    async (request, reply) => {
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
      if (body.lastUsedAt !== undefined)
        data.lastUsedAt = new Date(body.lastUsedAt);

      const row = await prisma.fanpage.update({ where: { id }, data });
      return formatFanpage(row);
    },
  );

  // ── API: Delete page ───────────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    "/api/fanpages/:id",
    async (request, reply) => {
      const id = BigInt(request.params.id);
      const existing = await prisma.fanpage.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await prisma.fanpage.delete({ where: { id } });
      return { success: true };
    },
  );
}
