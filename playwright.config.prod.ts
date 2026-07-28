import { defineConfig } from '@playwright/test';

// Production config for testing against content.aitradepulse.com
// No webServer — tests target the live production deployment.
// Uses the same specs as the local config.
// Auth is handled by individual test specs (beforeEach setExtraHTTPHeaders, request headers).
// Ensure ADMIN_PASSWORD env var is set (default matches .env: admin123).
export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'https://content.aitradepulse.com',
    headless: true,
  },
  // No webServer — production is always running
});
