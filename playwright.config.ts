import 'dotenv/config';
import { defineConfig } from '@playwright/test';

// E2E berjalan di server test SENDIRI di :3111 — BUKAN :3002 (PM2 prod 1ai-content).
// Ini mencegah e2e mencemari DB prod dan menembak webhook prod.
// webServer.env DIPAKAI penuh: tidak ada proses yang listen di :3111, jadi
// Playwright selalu me-start server test sendiri (reuseExistingServer:true
// hanya fallback kalau ada yang listen).
// Command server test men-sync schema ke DB test (prisma db push) lalu start
// bot dengan NODE_ENV=test → seeder idempotent berjalan di DB test.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  // prod-readonly.spec.ts targets the LIVE domain (content.aitradepulse.com)
  // via playwright.config.prod.ts — it must never run against the :3111 test
  // server (it asserts prod-only surface incl. the 401-gated /api/py/docs).
  testIgnore: /prod-readonly\.spec\.ts/,
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3111',
    headless: true,
  },
  webServer: {
    command: `npx prisma db push --skip-generate && npx tsx src/index.ts`,
    port: 3111,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      ADMIN_PASSWORD,
      BOT_TOKEN: 'placeholder', // WAJIB: mencegah e2e memuat BOT_TOKEN asli dari .env (import 'dotenv/config' line 1)
      //          → isPlaceholderToken (src/index.ts:82) true → skip setWebhook & deleteWebhook.
      //          Tanpa ini, server test membuka instance bot ke-2 pada token PROD + FORCE_POLLING
      //          → deleteWebhook({drop_pending_updates}) menghapus webhook prod (bot jadi tuli ~1 hari).
      NODE_ENV: 'test',
      RATE_LIMIT_DISABLED: '1', // e2e: skip IP-keyed per-minute limiters (register+login cycles trip 10/min)
      FORCE_POLLING: 'true',
      PORT: '3111', // default app :3000 (src/config/env.ts:27) — override wajib
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/1ai_content_test',
    },
  },
});
