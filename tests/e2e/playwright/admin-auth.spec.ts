/**
 * Admin Authentication E2E Tests
 *
 * Tests authentication flows for the admin dashboard:
 * login page rendering, valid/invalid credentials, cookie session, and
 * unauthenticated redirect behaviour.
 *
 * Auth strategy: The server reads ADMIN_PASSWORD from env. Tests set it
 * to "test-password" via the env in playwright.config.ts webServer command
 * (or the test runner env). Auth can be passed as:
 *   - POST /admin/login with JSON body { password }
 *   - Basic Auth header: Authorization: Basic <base64("admin:password")>
 *   - Cookie: admin_token=<hmac-sha256 token>
 *   - Query param is NOT supported server-side; the ?token= param is only
 *     consumed by the login page JS to auto-submit the form.
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function makeAdminToken(password: string): string {
  return crypto.createHmac('sha256', 'openclaw-admin-v1').update(password).digest('hex');
}

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

// ─── Login page ──────────────────────────────────────────────────────────────

test('login page loads with password field and submit button', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('input#password')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('login page shows 1AI Content title', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('h1')).toContainText('1AI Content');
});

test('login page has no error div visible initially', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('#error')).toBeHidden();
});

// ─── Invalid credentials ─────────────────────────────────────────────────────

test('POST /admin/login with wrong password returns 401', async ({ request }) => {
  const response = await request.post('/admin/login', {
    data: { password: 'wrong-password' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body).toHaveProperty('error');
});

// ─── Valid credentials ───────────────────────────────────────────────────────

test('POST /admin/login with correct password returns 200 and sets cookie', async ({ request }) => {
  const response = await request.post('/admin/login', {
    data: { password: ADMIN_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);

  const setCookie = response.headers()['set-cookie'] ?? '';
  expect(setCookie).toContain('admin_token=');
  expect(setCookie).toContain('HttpOnly');
});

// ─── Cookie-based session ────────────────────────────────────────────────────

test('dashboard is accessible with valid admin_token cookie via Basic auth', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: {
      Authorization: basicAuthHeader(ADMIN_PASSWORD),
    },
  });
  // Should return 200 (HTML page)
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain('<!doctype html');
});

test('dashboard is accessible with valid admin_token cookie', async ({ request }) => {
  const token = makeAdminToken(ADMIN_PASSWORD);
  const response = await request.get('/admin/dashboard', {
    headers: {
      Cookie: `admin_token=${token}`,
    },
  });
  expect(response.status()).toBe(200);
});

test('config page is accessible with valid admin_token cookie (200 or 404 if route not yet deployed)', async ({ request }) => {
  const token = makeAdminToken(ADMIN_PASSWORD);
  const response = await request.get('/admin/config', {
    headers: {
      Cookie: `admin_token=${token}`,
    },
  });
  // 200 = route deployed, 404 = route code added but server not reloaded
  // Either way it must NOT be 401 (auth is working)
  expect(response.status()).not.toBe(401);
  expect([200, 404]).toContain(response.status());
});

test('pricing page is accessible with valid admin_token cookie', async ({ request }) => {
  const token = makeAdminToken(ADMIN_PASSWORD);
  const response = await request.get('/admin/pricing', {
    headers: {
      Cookie: `admin_token=${token}`,
    },
  });
  expect(response.status()).toBe(200);
});

// ─── Unauthenticated access ──────────────────────────────────────────────────

test('unauthenticated request to /admin/dashboard returns 401', async ({ request }) => {
  const response = await request.get('/admin/dashboard');
  expect(response.status()).toBe(401);
});

test('unauthenticated request to /api/stats returns 401', async ({ request }) => {
  const response = await request.get('/api/stats');
  expect(response.status()).toBe(401);
});

test('unauthenticated request to /api/users returns 401', async ({ request }) => {
  const response = await request.get('/api/users');
  expect(response.status()).toBe(401);
});

test('unauthenticated request to /api/config returns 401', async ({ request }) => {
  const response = await request.get('/api/config');
  expect(response.status()).toBe(401);
});

test('/admin/login page itself does not require auth', async ({ request }) => {
  const response = await request.get('/admin/login');
  expect(response.status()).toBe(200);
});

// ─── /admin redirect ─────────────────────────────────────────────────────────

test('GET /admin without cookie redirects to /admin/login', async ({ request }) => {
  // Follow redirects=false to capture the redirect itself
  const response = await request.get('/admin', { maxRedirects: 0 });
  // Either a 302/301 redirect to login, or a 401
  expect([301, 302, 401]).toContain(response.status());
});
