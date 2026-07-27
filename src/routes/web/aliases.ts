/**
 * Web Routes — API v1 Aliases
 *
 * Forward /api/v1/* to /api/* for backward compatibility.
 */

import { FastifyInstance } from "fastify";

export async function aliasRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(301).redirect(`/api/${sub}`);
  });

  server.post("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(307).redirect(`/api/${sub}`);
  });

  server.delete("/api/v1/*", async (request, reply) => {
    const sub = (request.params as Record<string, string>)["*"];
    return reply.status(307).redirect(`/api/${sub}`);
  });
}
