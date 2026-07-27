import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/config/database";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { validate } from "@/utils/validation";
import { welcomeMessageSchema } from "@/utils/validation";
import { trackingVars } from "./shared";

export async function registerPersonaRoutes(
  server: FastifyInstance,
  verifyAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>,
) {
  server.get('/api/personas', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { getPersonasAsync } = await import('../../config/personas.js');
    return getPersonasAsync();
  });

  server.post('/api/personas', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const body = request.body as {
      id: string;
      allowedNiches?: string[] | string;
      allowedPresets?: string[];
      priceMultiplier?: number;
    };
    if (!body.id) return reply.status(400).send({ error: 'id required' });
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'persona', key: body.id } },
      create: { category: 'persona', key: body.id, value: JSON.parse(JSON.stringify(body)), updatedBy: BigInt(0) },
      update: { value: JSON.parse(JSON.stringify(body)), updatedBy: BigInt(0) },
    });
    return { success: true };
  });

  server.get('/admin/personas', async (_request, reply) => {
    return reply.redirect('/admin/react/personas');
  });

  server.post("/api/admin/welcome-message", { preHandler: validate({ body: welcomeMessageSchema }) }, async (request, reply) => {
    await verifyAdmin(request, reply);
    const { message } = request.body as { message?: string };
    if (!message) return reply.status(400).send({ error: "Message required" });
    await PaymentSettingsService.setPricingConfig(
      "system",
      "welcome_message",
      message,
    );
    return { success: true };
  });
}
