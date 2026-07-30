import 'dotenv/config';
import { defineConfig } from '@playwright/test';

// .env is loaded at config-evaluation time (dotenv/config import above), so
// both tests and this config inherit the right env vars regardless of how
// Playwright is invoked. With reuseExistingServer:true, the webServer.env
// block below is ignored for the server — the running PM2 process already
// has .env loaded at startup.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
    // Expose ADMIN_PASSWORD to all test files via playwright test env
  },
  // Env vars reach test workers via the dotenv/config import above (not
  // webServer.env, which is only applied when Playwright starts the server).
  webServer: {
    command: `ADMIN_PASSWORD=${ADMIN_PASSWORD} FORCE_POLLING=true npx tsx src/index.ts`,
    port: 3002,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      ADMIN_PASSWORD,
      NODE_ENV: 'test',
      FORCE_POLLING: 'true',
    },
  },
});
