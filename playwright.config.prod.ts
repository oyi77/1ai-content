import { defineConfig } from '@playwright/test';

// Production config for testing against content.aitradepulse.com
// No webServer — tests target the live production deployment.
// Uses the same specs as the local config.
// Auth is handled by individual test specs (beforeEach setExtraHTTPHeaders, request headers).
// ADMIN_PASSWORD is read from the environment (see tests/e2e/playwright/rbac-security.spec.ts
// resolveAdminPassword) — no default credential is assumed.
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
