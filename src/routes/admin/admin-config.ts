import { FastifyInstance } from "fastify";
import { AdminConfigService } from "@/services/admin-config.service";
import { prisma } from "@/config/database";
import { initConfig } from "@/config/env";
import { trackingVars } from "./shared";

const API_KEY_REGISTRY: Record<string, string> = {
  BOT_TOKEN: 'Telegram Bot Token', ADMIN_PASSWORD: 'Admin Password',
  DATABASE_URL: 'Database URL', REDIS_URL: 'Redis URL',
  WEBHOOK_URL: 'Webhook URL', WEBHOOK_SECRET: 'Webhook Secret',
  OMNIROUTE_API_KEY: 'OmniRoute', OMNIROUTE_URL: 'OmniRoute URL',
  GEMINI_API_KEY: 'Google Gemini', OPENAI_API_KEY: 'OpenAI',
  XAI_API_KEY: 'xAI (Grok)', GROQ_API_KEY: 'Groq', AGENTROUTER_API_KEY: 'AgentRouter',
  BYTEPLUS_API_KEY: 'BytePlus', LAOZHANG_API_KEY: 'LaoZhang',
  EVOLINK_API_KEY: 'EvoLink', HYPEREAL_API_KEY: 'Hypereal',
  SILICONFLOW_API_KEY: 'SiliconFlow', FALAI_API_KEY: 'Fal.ai',
  KIE_API_KEY: 'Kie.ai', PIAPI_API_KEY: 'PiAPI', GEMINIGEN_API_KEY: 'GeminiGen',
  LINGYAAI_API_KEY: 'LingyaAI', GETGOAPI_API_KEY: 'GetGoAPI', APIYI_API_KEY: 'APIyi',
  ZAI_API_KEY: 'Z.ai', DID_API_KEY: 'D-ID', RUNWARE_API_KEY: 'Runware',
  WAVESPEED_API_KEY: 'WaveSpeed', TOGETHER_API_KEY: 'Together AI',
  SEGMIND_API_KEY: 'Segmind', NVIDIA_API_KEY: 'NVIDIA',
  MIDTRANS_SERVER_KEY: 'Midtrans Server', MIDTRANS_CLIENT_KEY: 'Midtrans Client',
  TRIPAY_API_KEY: 'Tripay', TRIPAY_PRIVATE_KEY: 'Tripay Private',
  DUITKU_MERCHANT_CODE: 'DuitKu Merchant', DUITKU_API_KEY: 'DuitKu',
  NOWPAYMENTS_API_KEY: 'NOWPayments',
  AWS_ACCESS_KEY_ID: 'AWS Access Key', AWS_SECRET_ACCESS_KEY: 'AWS Secret',
  AWS_S3_BUCKET: 'AWS S3 Bucket', R2_ACCESS_KEY_ID: 'R2 Access Key',
  R2_SECRET_ACCESS_KEY: 'R2 Secret', R2_BUCKET_NAME: 'R2 Bucket', R2_ENDPOINT: 'R2 Endpoint',
  USD_TO_IDR_RATE: 'USD→IDR Rate',
};

function maskKey(v: string): string {
  if (!v) return '';
  if (v.length <= 10) return '***';
  return v.slice(0, 6) + '***' + v.slice(-4);
}

export async function registerAdminConfigRoutes(
  server: FastifyInstance,
  verifyAdmin: (request: any, reply: any) => Promise<boolean>,
) {
  // ── Runtime Config (categories: provider, ai_param, timeout, etc.) ──

  server.get("/api/admin-config", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const categories = ['provider', 'ai_param', 'timeout', 'retry', 'queue', 'retention', 'rate_limit', 'hpas'];
    const result: Record<string, Record<string, any>> = {};
    for (const cat of categories) {
      result[cat] = await AdminConfigService.getCategory(cat);
    }
    return result;
  });

  server.put("/api/admin-config/:category/:key", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { category, key } = request.params as { category: string; key: string };
    const { value } = request.body as { value: any };
    const allowedCategories = ['provider', 'ai_param', 'timeout', 'retry', 'queue', 'retention', 'rate_limit', 'hpas'];
    if (!allowedCategories.includes(category)) {
      return reply.status(400).send({ error: 'Invalid category' });
    }
    await AdminConfigService.set(category, key, value);
    return { ok: true };
  });

  server.delete("/api/admin-config/:category/:key", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { category, key } = request.params as { category: string; key: string };
    await AdminConfigService.reset(category, key);
    return { ok: true };
  });

  // ── API Key Management ──

  server.get('/api/admin/api-keys', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const dbRows = await prisma.pricingConfig.findMany({ where: { category: 'api_keys' } });
    const dbMap: Record<string, string> = {};
    for (const row of dbRows) dbMap[row.key] = String(row.value ?? '');
    return Object.entries(API_KEY_REGISTRY).map(([k, label]) => {
      const envVal = process.env[k] || '';
      const dbVal = dbMap[k] || '';
      const effective = dbVal || envVal;
      return { key: k, label, masked: maskKey(effective), hasValue: !!effective, source: dbVal ? 'db' : (envVal ? 'env' : 'none') };
    });
  });

  server.put('/api/admin/api-keys/:name', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { name } = request.params as { name: string };
    const { value } = request.body as { value?: string };
    if (!API_KEY_REGISTRY[name]) return reply.status(400).send({ error: 'Unknown key' });
    if (!value?.trim()) return reply.status(400).send({ error: 'Value required' });
    const trimmed = value.trim();
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: 'api_keys', key: name } },
      create: { category: 'api_keys', key: name, value: trimmed },
      update: { value: trimmed },
    });
    process.env[name] = trimmed;
    initConfig();
    return { ok: true };
  });

  server.delete('/api/admin/api-keys/:name', async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    const { name } = request.params as { name: string };
    if (!API_KEY_REGISTRY[name]) return reply.status(400).send({ error: 'Unknown key' });
    await prisma.pricingConfig.deleteMany({ where: { category: 'api_keys', key: name } });
    return { ok: true };
  });

  // ── System redirect ──

  server.get("/admin/system", async (_request, reply) => {
    return reply.redirect('/admin/settings');
  });

  // ── Dynamic Pricing Page ──

  server.get("/admin/dynamic-pricing", async (request, reply) => {
    if (!await verifyAdmin(request, reply)) return;
    return reply.view("admin/dynamic-pricing", { ...trackingVars(), activePage: "dynamic-pricing", title: 'Dynamic Pricing' }, { layout: 'admin/layout.ejs' });
  });
}
