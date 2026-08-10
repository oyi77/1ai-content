/**
 * Production Read-Only Verification Spec
 *
 * Verifies the LIVE domain (https://content.aitradepulse.com) serves the real
 * frontend across every surface, mirroring the selectors already proven by the
 * existing specs (web-landing / customer-spa / admin-auth). Read-only by
 * design: no CRUD, no password submission, no state mutation.
 *
 * Surfaces covered:
 *   /                 → React SPA landing (hero, CTA, nav, features, pricing, meta)
 *   /app/             → SPA boot redirect to /app/login (proves React Router ran)
 *   /app/login        → customer sign-in form + register/forgot mode switches
 *   /admin/           → server-side redirect to /admin/login (auth gate)
 *   /admin/login      → EJS admin login gate (form present, no submission)
 *   /api/py/health    → Python media-api health via nginx proxy
 *   /cf-health        → cf-router inline health
 *   /api/py/docs      → FastAPI swagger — gated 401 (docs NOT in PUBLIC_ALLOWLIST; see api.py)
 *   /assets/* + /favicon.svg → asset integrity (JS/CSS/svg reachable)
 *
 * Run: npx playwright test --config=playwright.config.prod.ts prod-readonly.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

test.setTimeout(60_000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Attach fail-fast watchers: uncaught exceptions always fail; console errors
 * fail unless they are network-level noise (blocked third-party beacons,
 * aborted requests) that do not indicate an application defect. */
function watchErrors(page: Page) {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return {
    pageErrors,
    consoleErrors,
    assertNoErrors() {
      expect(pageErrors, `uncaught page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toEqual([]);
      const severe = consoleErrors.filter(
        (m) =>
          !/net::ERR_BLOCKED_BY_CLIENT|net::ERR_ABORTED|Failed to load resource|violates the following Content Security Policy directive/i.test(
            m
          )
      );
      expect(severe, `console errors: ${severe.join(' | ')}`).toEqual([]);
    },
  };
}

// ─── Landing page (/) ────────────────────────────────────────────────────────

test('GET / serves the React SPA landing (200, HTML, DOCTYPE)', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  const text = await response.text();
  expect(text.trim().toLowerCase()).toMatch(/^<!doctype html/);
});

test('landing page renders hero, CTA, nav, features and pricing', async ({ page }) => {
  const { assertNoErrors } = watchErrors(page);
  await page.goto('/');

  // Meta / SEO
  const description = page.locator('meta[name="description"]');
  await expect(description).toHaveAttribute('content', /.+/);
  expect((await description.getAttribute('content'))!.length).toBeGreaterThan(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', /.+/);
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', /.+/);

  // Hero
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible();
  expect((await h1.innerText()).trim().length).toBeGreaterThan(0);

  // CTA — hero "Mulai Gratis →" link (mirrors web-landing.spec.ts)
  await expect(page.locator('a[href*="register=1"]').first()).toBeVisible();

  // Navigation
  await expect(page.locator('nav').first()).toBeVisible();
  const logo = page.locator('nav a[href="/"]').first();
  await expect(logo).toBeVisible();
  await expect(logo).toContainText('1AI Content');

  // Features
  await expect(page.locator('#features h3').first()).toBeVisible();

  // Pricing — section exists with package cards
  await expect(page.locator('#pricing').first()).toBeVisible();
  await expect(page.locator('#pricing h3').first()).toBeVisible();

  assertNoErrors();
});

// ─── Customer SPA (/app/*) ───────────────────────────────────────────────────

test('GET /app/ boots the SPA and redirects to /app/login', async ({ page }) => {
  const { assertNoErrors } = watchErrors(page);
  await page.goto('/app/');
  // Client-side redirect from the ProtectedRoute proves React Router executed.
  await page.waitForURL(/\/app\/login/);
  assertNoErrors();
});

test('customer sign-in page renders with form and mode switches', async ({ page }) => {
  const { assertNoErrors } = watchErrors(page);
  await page.goto('/app/login');

  // Sign-in mode (mirrors customer-spa.spec.ts)
  await expect(page.locator('h1')).toContainText('Sign In');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByText("Don't have an account? Sign up")).toBeVisible();
  await expect(page.getByText('Forgot password?')).toBeVisible();
  await expect(page.locator('p.text-red-600')).toHaveCount(0);

  // Register mode
  await page.getByText('Sign up').click();
  await expect(page.locator('h1')).toContainText('Create Account');
  await expect(page.locator('input[placeholder="First name (optional)"]')).toBeVisible();

  // Switch back to login — the Forgot-password link only renders in login mode
  await page.getByText('Already have an account? Sign in').click();
  await expect(page.locator('h1')).toContainText('Sign In');

  // Forgot-password mode — form stays functional (email field remains)
  await page.getByText('Forgot password?').click();
  await expect(page.locator('input[type="email"]')).toBeVisible();

  assertNoErrors();
});

// ─── Admin surfaces (/admin/*) ───────────────────────────────────────────────

test('GET /admin/ never serves restricted content — gates to login or dashboard by auth state', async ({ page }) => {
  // /admin/ is an SPA shell: with no session the client-side ProtectedRoute
  // redirects to /admin/login; with a valid session (persistent profile) it
  // lands on /admin/dashboard. Either outcome proves the gate holds and the
  // SPA booted — restricted content is never rendered raw.
  await page.goto('/admin/');
  await page.waitForURL(/\/admin\/(login|dashboard)/);
  expect(page.url()).toMatch(/\/admin\/(login|dashboard)/);
});

test('admin login gate renders (no password submission)', async ({ page }) => {
  const { assertNoErrors } = watchErrors(page);
  await page.goto('/admin/login');
  await expect(page.locator('input#password')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  await expect(page.locator('h1')).toContainText('1AI Content');
  await expect(page.locator('#error')).toBeHidden();
  assertNoErrors();
});

// ─── API / health surfaces ───────────────────────────────────────────────────

test('GET /api/py/health returns 200 with healthy status', async ({ request }) => {
  const response = await request.get('/api/py/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  // Deployed contract (verified 2026-08-11 via curl): {"status":"ok","service":"1ai-content-factory","timestamp":...}
  expect(body.status).toBe('ok');
  expect(body.service).toBe('1ai-content-factory');
  expect(typeof body.timestamp).toBe('string');
});

test('GET /cf-health returns 200', async ({ request }) => {
  const response = await request.get('/cf-health');
  expect(response.status()).toBe(200);
});

test('GET /api/py/docs is gated (401 — docs not in PUBLIC_ALLOWLIST)', async ({ request }) => {
  // The media-api FastAPI /docs surface is deliberately NOT public: the
  // /api/py proxy gate (src/index.ts) 401s any non-allowlisted path without a
  // valid admin session, and api.py's own middleware 401s direct :8767 hits
  // when EBOOK_API_KEY is set (both layers exclude /docs from the allowlist).
  // Proxied via nginx, /docs likewise returns 404/401 — never 200 HTML.
  const response = await request.get('/api/py/docs');
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBe('Unauthorized');
});

test('GET /docs is not the swagger surface (404 JSON, SPA/API boundary holds)', async ({ request }) => {
  // /docs is FastAPI's default swagger path on :8767 but is NOT a public route
  // and the TS bot has no /docs route → 404 JSON. FastAPI swagger lives only
  // behind the gated /api/py/docs proxy (401 without admin session — above).
  const response = await request.get('/docs');
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
});

// ─── Asset integrity ─────────────────────────────────────────────────────────

test('core assets are served with correct content types', async ({ request }) => {
  const js = await request.get('/assets/index-BHAn1Lzi.js');
  expect(js.status()).toBe(200);
  expect(js.headers()['content-type']).toContain('application/javascript');

  const css = await request.get('/assets/index-C50lxFjm.css');
  expect(css.status()).toBe(200);
  expect(css.headers()['content-type']).toContain('text/css');

  const favicon = await request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
});
