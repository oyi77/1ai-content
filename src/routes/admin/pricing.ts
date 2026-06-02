import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PaymentSettingsService } from '@/services/payment-settings.service';
import { validateBody, PricingConfigSchema, PricingDeleteSchema } from '@/utils/validation';

export async function registerPricingRoutes(server: FastifyInstance) {
  server.post("/api/pricing", async (request, reply) => {
    const data = await validateBody(request, reply, PricingConfigSchema);
    if (!data) return;
    await PaymentSettingsService.setPricingConfig(data.category, data.key, data.value);
    PaymentSettingsService.clearPricingCache();
    return { success: true };
  });

  server.delete("/api/pricing", async (request, reply) => {
    const data = await validateBody(request, reply, PricingDeleteSchema);
    if (!data) return;
    await PaymentSettingsService.deletePricingConfig(data.category, data.key);
    PaymentSettingsService.clearPricingCache();
    return { success: true };
  });

  server.get("/api/pricing-overview", async () => {
    const [
      packages,
      subscriptions,
      videoCosts,
      imageCosts,
      providerCosts,
      global,
      unitCosts,
    ] = await Promise.all([
      PaymentSettingsService.getAllPricingByCategory("package"),
      PaymentSettingsService.getAllPricingByCategory("subscription"),
      PaymentSettingsService.getAllPricingByCategory("video_credit"),
      PaymentSettingsService.getAllPricingByCategory("image_credit"),
      PaymentSettingsService.getAllPricingByCategory("provider_cost"),
      PaymentSettingsService.getAllPricingByCategory("global"),
      PaymentSettingsService.getAllPricingByCategory("unit_cost"),
    ]);
    return {
      packages,
      subscriptions,
      videoCosts,
      imageCosts,
      providerCosts,
      global,
      unitCosts,
    };
  });
}
