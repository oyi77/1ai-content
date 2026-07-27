/**
 * Web Routes — Shared Middleware
 *
 * getUser helper used by all API route modules.
 * Supports both JWT Bearer tokens and API key auth.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { UserService } from "@/services/user.service";
import { getConfig } from "@/config/env";

function getJwtSecret(): string {
  return getConfig().JWT_SECRET!;
}

export async function getUser(request: FastifyRequest, reply: FastifyReply) {
  // If a valid API key was already resolved by tryApiKeyAuth, look up the full user
  const apiUser = (request as unknown as Record<string, unknown>).apiUser as { telegramId: bigint } | undefined;
  if (apiUser) {
    const user = await UserService.findByTelegramId(apiUser.telegramId);
    if (!user) {
      reply.status(404).send({ error: "User not found" });
      return null;
    }
    if (user.isBanned) {
      reply.status(403).send({ error: "Account suspended" });
      return null;
    }
    return user;
  }
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  try {
    const decoded = jwt.verify(
      authHeader.substring(7),
      getJwtSecret(),
    ) as { userId: string };
    const user = await UserService.findByUuid(decoded.userId);
    if (!user) {
      reply.status(404).send({ error: "User not found" });
      return null;
    }
    if (user.isBanned) {
      reply.status(403).send({ error: "Account suspended" });
      return null;
    }
    return user;
  } catch {
    reply.status(401).send({ error: "Invalid token" });
    return null;
  }
}
