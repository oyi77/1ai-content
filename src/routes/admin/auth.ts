/**
 * Admin — Auth helpers + login routes
 */
import crypto from "crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { timingSafeCompare } from "@/utils/crypto";
import { getConfig } from "@/config/env";
import { redis } from "@/config/redis";

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60;

/** HMAC-SHA256 token derived from ADMIN_PASSWORD */
export function makeAdminToken(password: string): string {
  return crypto
    .createHmac("sha256", "openclaw-admin-v1")
    .update(password)
    .digest("hex");
}

/** Verify admin authentication from request (Basic auth, cookie, or query token) */
export async function verifyAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const ADMIN_PASSWORD = getConfig().ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return reply.status(503).send({ error: "Admin password not configured" });
  }

  // 1) Basic auth header
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6).trim();
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator > -1) {
        const password = decoded.slice(separator + 1);
        if (timingSafeCompare(password, ADMIN_PASSWORD)) return true;
      }
    } catch {
      /* continue */
    }
  }

  // 2) Cookie token
  const cookie = (request.headers.cookie || "")
    .split(";")
    .find((c) => c.trim().startsWith("admin_token="));
  if (cookie) {
    const token = cookie.split("=")[1]?.trim();
    if (token && timingSafeCompare(token, makeAdminToken(ADMIN_PASSWORD)))
      return true;
  }

  // 3) Query token
  const queryToken = (request.query as { token?: string })?.token;
  if (queryToken) {
    if (timingSafeCompare(queryToken, makeAdminToken(ADMIN_PASSWORD))) {
      const token = makeAdminToken(ADMIN_PASSWORD);
      reply.setCookie("admin_token", token, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 86400,
        secure: request.protocol === "https",
      });
      return true;
    }
  }

  const accept = request.headers.accept || "";
  if (accept.includes("text/html")) {
    reply.redirect("/admin/login");
  } else {
    reply.status(401).send({ error: "Unauthorized" });
  }
  return false;
}

/** Register login-related routes */
export function registerLoginRoutes(server: FastifyInstance) {
  // Login page
  server.get("/admin/login", async (_request, reply) => {
    return reply.view("admin/login.ejs");
  });

  // Login POST with rate limiting
  server.post("/admin/login", async (request, reply) => {
    const ip = request.ip || "unknown";
    const rateLimitKey = `admin_login:${ip}`;
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts) >= LOGIN_RATE_LIMIT_MAX) {
      return reply
        .status(429)
        .send({ error: "Too many login attempts. Try again in 15 minutes." });
    }

    const ADMIN_PASSWORD = getConfig().ADMIN_PASSWORD;
    const { password } = (request.body ?? {}) as { password: string };
    if (password && timingSafeCompare(password, ADMIN_PASSWORD)) {
      await redis.del(rateLimitKey);
      const token = makeAdminToken(ADMIN_PASSWORD);
      const secureSuffix =
        getConfig().NODE_ENV === "production" ? "; Secure" : "";
      return reply
        .header(
          "Set-Cookie",
          `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secureSuffix}`,
        )
        .send({ success: true });
    }

    const pipe = redis.pipeline();
    pipe.incr(rateLimitKey);
    pipe.expire(rateLimitKey, LOGIN_RATE_LIMIT_WINDOW);
    await pipe.exec();
    return reply.status(401).send({ error: "Wrong password" });
  });

  // Logout — always succeeds; clears the admin_token cookie.
  // Excluded from the auth hook in admin.ts so an expired/invalid session
  // can still clear its cookie.
  server.post("/api/admin/logout", async (_request, reply) => {
    return reply
      .setCookie("admin_token", "", {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: getConfig().NODE_ENV === "production",
        maxAge: 0,
      })
      .send({ success: true });
  });
}
