import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "@/config/redis";
import { validate, landingConfigSchema } from "@/utils/validation";
import { logger } from "@/utils/logger";

export async function registerLandingConfigRoutes(server: FastifyInstance) {
  // API: Get Landing Page Config
  server.get(
    "/api/landing-config",
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      try {
        const data = await redis.get("admin:landing_config");
        return data ? JSON.parse(data) : {};
      } catch {
        return {};
      }
    },
  );

  // API: Update Landing Page Config
  server.post(
    "/api/landing-config",
    { preHandler: validate({ body: landingConfigSchema }) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, unknown>;
        await redis.set("admin:landing_config", JSON.stringify(body));
        return { success: true };
      } catch (error) {
        logger.error(
          `Failed to update landing config: ${(error as Error)?.message || error}`,
        );
        return reply.status(500).send({ error: "Failed to update config" });
      }
    },
  );
}
