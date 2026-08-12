/**
 * API Gateway Routes
 *
 * Machine-facing API surface: the agency tier (/api/agency/*) plus the content
 * REST API (/api/content/*). Both route groups are token-authenticated but were
 * registered unlimited — this plugin attaches a shared sliding-window IP rate
 * limiter (120 req/min) before mounting either group, so src/index.ts stays
 * clean and the whole machine API is throttled at the boundary.
 */

import { FastifyInstance } from "fastify";
import { apiLimiter } from "@/middleware/rateLimit";
import { agencyRoutes } from "@/routes/agency";
import { contentApiRoutes } from "@/routes/content-api";

export async function apiGatewayRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", apiLimiter);
  await server.register(agencyRoutes, { prefix: "/api" });
  await server.register(contentApiRoutes);
}
