import { defineConfig } from '@playwright/test';

// When reuseExistingServer is true, Playwright won't restart the server, so
// the webServer.env block is ignored. We read ADMIN_PASSWORD from the outer
// process env so the test fixtures match whatever the running server has.
// Default matches the application default (ADMIN_PASSWORD unset → "admin").
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
    // Expose ADMIN_PASSWORD to all test files via playwright test env
  },
  // Pass ADMIN_PASSWORD into every test file's process.env
  // Playwright propagates these via the workers' process environment.
  // We achieve this by having tests read process.env.ADMIN_PASSWORD directly.
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
