# 05 — Testing

## Test Architecture

Two test systems:

1. **Jest** — Unit tests, service tests, command tests (primary test runner)
2. **Playwright** — End-to-end browser tests for admin and web UI

## Jest Tests

### Configuration
```typescript
// jest.config.ts
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/**/*.test.ts'],
  // Exclude Playwright tests
  testPathIgnorePatterns: ['tests/e2e/playwright'],
}
```

### Running

```bash
npm run test          # All Jest tests
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode
```

### Test Directory Structure

```
tests/
├── unit/
│   ├── commands/          — Telegram bot command tests
│   │   ├── start.test.ts
│   │   ├── topup.test.ts
│   │   ├── videos.test.ts
│   │   ├── subscription.test.ts
│   │   └── ... (15+ command tests)
│   ├── routes/            — Route handler tests
│   │   ├── web.test.ts
│   │   ├── webhook.test.ts
│   │   ├── admin-intercept-routes.test.ts
│   │   ├── admin-ban-intercept-cache.test.ts
│   │   └── admin-circuit-breaker-reset.test.ts
│   ├── services/          — Service layer tests
│   │   ├── payment.service.test.ts
│   │   ├── video-generation.service.test.ts
│   │   ├── user.service.test.ts
│   │   └── ... (25+ service tests)
│   ├── repositories/
│   │   └── repositories.test.ts
│   ├── config/
│   │   └── pricing.test.ts
│   ├── workers/
│   │   └── video-generation.worker.intercept.test.ts
│   └── utils/
│       └── prisma-helpers.test.ts
├── e2e/                   — Integration/E2E tests
│   ├── admin-auth.e2e.test.ts    — Auth via supertest
│   ├── admin-api.e2e.test.ts     — Admin API integration
│   ├── web-api.e2e.test.ts       — Web API integration
│   ├── webhook.e2e.test.ts       — Telegram webhook
│   ├── youtube-api.e2e.test.ts   — YouTube API integration
│   └── health.e2e.test.ts        — Health check
├── integration/
│   ├── sync-verification.test.ts
│   └── video-pipeline.test.ts
├── admin/
│   └── dashboard.test.ts
├── p2p-integration.test.ts
├── p2p.test.ts
└── image-reference.test.ts
```

### Mocking Pattern

Services mock Prisma, Redis, and external APIs using Jest mocks:

```typescript
// Typical test pattern
jest.mock('../../src/config/database', () => ({
  prisma: { user: { findMany: jest.fn(), ... } },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), ... },
}));
```

E2E tests use `supertest` against a real Fastify instance:

```typescript
// tests/e2e/admin-auth.e2e.test.ts
import request from 'supertest';
import fastify from 'fastify';

// Mock database for isolated testing
const app = fastify();
await app.register(adminRoutes);
const response = await request(app.server)
  .get('/admin/dashboard')
  .set('Authorization', `Basic ${token}`);
expect(response.status).toBe(200);
```

## Playwright E2E Tests

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
  },
  webServer: {
    command: `ADMIN_PASSWORD=${password} FORCE_POLLING=true npx tsx src/index.ts`,
    port: 3002,
    timeout: 120000,
    reuseExistingServer: true,  // Fast — doesn't restart on rerun
  },
});
```

### Running

```bash
npx playwright test                       # All Playwright tests
npx playwright test --headed              # Visible browser
npx playwright test --grep "auth"         # Filter by test name
npx playwright test tests/e2e/playwright/admin-auth.spec.ts
npx playwright test --config playwright.config.prod.ts  # Production
```

### Test Files

```
tests/e2e/playwright/
├── admin-auth.spec.ts                — Login/logout flow, protected paths
├── admin-dashboard.spec.ts           — Dashboard rendering, stats
├── admin-api.spec.ts                 — Admin API CRUD operations
├── admin-config.spec.ts             — Config management
├── admin-intercept.spec.ts          — Interception management
├── admin-intercept-edge-cases.spec.ts — Edge cases for intercept
├── web-api.spec.ts                   — Public API flows
└── web-landing.spec.ts              — Landing page and public routes
```

### Auth Test Pattern

```typescript
// admin-auth.spec.ts
test("unauthenticated request to /admin/dashboard returns 401", async ({ page }) => {
  const response = await page.goto("/admin/dashboard");
  expect(response.status()).toBe(401);
});

test("login flow works", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill("#password", "admin123");
  await page.click("button[type='submit']");
  await page.waitForURL("/admin/dashboard");
  expect(await page.textContent("h1")).toContain("Dashboard");
});
```

### Dashboard Test Pattern

```typescript
// admin-dashboard.spec.ts
test("dashboard shows stats after login", async ({ page, context }) => {
  // Login first
  await page.goto("/admin/login");
  await page.fill("#password", "admin123");
  await page.click("button[type='submit']");
  await page.waitForURL("/admin/dashboard");

  // Verify dashboard content
  await expect(page.locator(".stat-card")).toBeVisible();
  await expect(page.locator("h1")).toContainText("Dashboard");
});
```

### Headless Browser Isolation

**Important:** Playwright contexts share cookie state within a browser instance. To test both authenticated and unauthenticated behavior in the same file:

```typescript
// Create a fresh context for unauthenticated tests
test("unauthorized access", async ({ browser }) => {
  const context = await browser.newContext();  // no cookies
  const page = await context.newPage();
  const response = await page.goto("/admin/dashboard");
  expect(response.status()).toBe(401);
  await context.close();
});
```

### Production Test Config

```typescript
// playwright.config.prod.ts
export default defineConfig({
  use: {
    baseURL: 'https://content.aitradepulse.com',
    // No webServer (uses live server)
  },
});
```

Run with: `npx playwright test --config playwright.config.prod.ts`

## Test Coverage

```
File                  | % Stmts | % Branch | % Funcs | % Lines
----------------------|---------|----------|---------|-------
src/config/           |   85.3  |    72.1  |   90.0  |   85.3
src/services/         |   78.2  |    65.4  |   82.1  |   78.2
src/routes/           |   65.1  |    58.3  |   70.4  |   65.1
src/workers/          |   72.8  |    60.0  |   75.0  |   72.8
```

## Adding Tests: Quick Reference

### Jest Unit Test
```typescript
import { myFunction } from "../../src/services/my-service";

jest.mock("../../src/config/database");

describe("myFunction", () => {
  it("returns expected result", async () => {
    const result = await myFunction(input);
    expect(result).toEqual(expected);
  });
});
```

### Playwright E2E Test
```typescript
import { test, expect } from "@playwright/test";

test("my feature works", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill("#password", process.env.ADMIN_PASSWORD || "admin123");
  await page.click("button[type='submit']");
  await page.waitForURL("/admin/dashboard");
  await expect(page.locator("h1")).toBeVisible();
});
```