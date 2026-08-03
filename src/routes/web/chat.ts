/**
 * Web Routes — Landing Chat Widget
 *
 * POST /api/chat/landing — AI chat for landing page visitors
 * with per-IP rate limiting (10 msg/min).
 */

import { FastifyInstance } from "fastify";
import { getOmniRouteService } from "@/services/omniroute.service";

export async function chatRoutes(server: FastifyInstance): Promise<void> {
  const chatRateMap = new Map<string, { count: number; resetAt: number }>();

  server.post("/api/chat/landing", async (request, reply) => {
    const ip = request.ip;
    const now = Date.now();
    const limit = chatRateMap.get(ip);
    if (limit && limit.resetAt > now) {
      if (limit.count >= 10) {
        return reply.status(429).send({ error: "Too many messages. Please wait a moment." });
      }
      limit.count++;
    } else {
      chatRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    }

    const { message, sessionId } = (request.body ?? {}) as { message?: string; sessionId?: string };
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return reply.status(400).send({ error: "Message is required" });
    }
    if (message.length > 1000) {
      return reply.status(400).send({ error: "Message too long (max 1000 chars)" });
    }

    const chatSessionId = sessionId || `landing_${ip}_${Date.now()}`;
    const omni = getOmniRouteService();

    const result = await omni.chat(chatSessionId, message.trim());
    if (!result.success) {
      return reply.status(500).send({ error: "AI is temporarily unavailable. Please try again." });
    }

    return { reply: result.content, sessionId: chatSessionId };
  });

  // Clean up stale rate limit entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of chatRateMap) {
      if (val.resetAt <= now) chatRateMap.delete(key);
    }
  }, 300_000);
}
