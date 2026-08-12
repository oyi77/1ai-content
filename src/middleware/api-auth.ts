import crypto from "crypto";
import { prisma } from "@/config/database";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Strict API key auth — used on agency-only endpoints.
 * Rejects with 401 if no X-API-Key header is present.
 */
export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.headers["x-api-key"] as string | undefined;
  if (!raw)
    return reply.status(401).send({ error: "Missing X-API-Key header" });
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { user: { select: { telegramId: true, tier: true } } },
  });
  if (!apiKey || apiKey.revokedAt)
    return reply.status(401).send({ error: "Invalid or revoked key" });
  if (apiKey.user.tier !== "agency")
    return reply.status(403).send({ error: "Agency tier required" });
  // Batch lastUsedAt: only update if > 1 min since last update (avoid write-per-request)
  const oneMinAgo = new Date(Date.now() - 60_000);
  if (!apiKey.lastUsedAt || apiKey.lastUsedAt < oneMinAgo) {
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  (request as unknown as Record<string, unknown>).apiUser = apiKey.user;
}

/**
 * Soft API key auth — used on routes that also accept JWT session auth.
 * Only validates the key if X-API-Key header is present.
 * On success: sets (request as unknown as Record<string, unknown>).apiUser and returns true.
 * On invalid key: sends 401/403 and returns false.
 * When header is absent: returns false without sending a reply (caller falls through to JWT).
 */
export async function tryApiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const raw = request.headers["x-api-key"] as string | undefined;
  if (!raw) return false; // no header — let caller use JWT
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: {
      user: { select: { telegramId: true, tier: true, isBanned: true } },
    },
  });
  if (!apiKey || apiKey.revokedAt) {
    reply.status(401).send({ error: "Invalid or revoked key" });
    return false;
  }
  if (apiKey.user.tier !== "agency") {
    reply.status(403).send({ error: "Agency tier required" });
    return false;
  }
  if (apiKey.user.isBanned) {
    reply.status(403).send({ error: "Account suspended" });
    return false;
  }
  const oneMinAgo = new Date(Date.now() - 60_000);
  if (!apiKey.lastUsedAt || apiKey.lastUsedAt < oneMinAgo) {
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  (request as unknown as Record<string, unknown>).apiUser = apiKey.user;
  return true;
}
