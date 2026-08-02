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
      NODE_ENV: 'test',
      FORCE_POLLING: 'true',
      PORT: '3111', // default app :3000 (src/config/env.ts:27) — override wajib
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/1ai_content_test',
    },
  },
});
