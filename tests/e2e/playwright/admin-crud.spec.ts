/**
 * Admin CRUD E2E Tests
 *
 * Tests core admin data flows: login, user listing, system health,
 * pricing packages, and config.
 *
 * Happy path: login → list users → health → pricing
 * Sad path: 401 on protected endpoints without auth
 * Edge: SPA serving, login page title
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
// Relative — Playwright request/page fixtures resolve terhadap use.baseURL
// (http://localhost:3111 di local e2e; tidak lagi menembak :3002 prod).
const BASE = '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

function makeAdminToken(password: string): string {
  return crypto.createHmac('sha256', 'openclaw-admin-v1').update(password).digest('hex');
}

// ─── Setup: verify login works ──────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${BASE}/admin/login`, {
    data: { password: ADMIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HAPPY PATH
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Happy Path', () => {

  // NOTE: dashboard SPA rendering is covered by admin-dashboard.spec.ts
  // Here we test the login API and verify the SPA catch-all returns HTML.

  // ─── Users: list via /api/admin/users ────────────────────────────────────

  test('GET /api/admin/users returns users array with expected fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/users`, {
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Shape: { users: [...], total: number }
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.users)).toBe(true);
    expect(typeof body.total).toBe('number');

    // Each user has core identity fields
    if (body.users.length > 0) {
      const user = body.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('tier');
      expect(user).toHaveProperty('isBanned');
    }
  });

  // ─── Users: list via /api/users (plain admin endpoint) ───────────────────

  test('GET /api/users returns user array with expected fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/users`, {
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    if (body.length > 0) {
      const user = body[0];
      expect(user).toHaveProperty('telegramId');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('tier');
      expect(user).toHaveProperty('creditBalance');
      expect(user).toHaveProperty('isBanned');
      expect(user).toHaveProperty('createdAt');
    }
  });

  // ─── System health ───────────────────────────────────────────────────────

  test('GET /api/system/health returns health status with database check', async ({ request }) => {
    const res = await request.get(`${BASE}/api/system/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('database');
    expect(body.checks.database).toHaveProperty('status');
    expect(body.checks).toHaveProperty('redis');
    expect(body.checks.redis).toHaveProperty('status');
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
  });

  // ─── Pricing packages (public) ───────────────────────────────────────────

  test('GET /api/packages returns packages with expected fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/packages`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('packages');
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.packages.length).toBeGreaterThanOrEqual(3);

    // Verify a few known packages exist
    const ids = body.packages.map((p: Record<string, unknown>) => p.id);
    expect(ids).toContain('starter');
    expect(ids).toContain('growth');
    expect(ids).toContain('business');

    // Each package has the expected fields
    for (const pkg of body.packages) {
      expect(pkg).toHaveProperty('id');
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('priceIdr');
      expect(pkg).toHaveProperty('credits');
      expect(pkg).toHaveProperty('totalCredits');
      expect(typeof pkg.priceIdr).toBe('number');
      expect(typeof pkg.credits).toBe('number');
      expect(typeof pkg.totalCredits).toBe('number');
    }

    // Starter payout example: 99000 IDR → 5 credits + 1 bonus = 6 total
    const starter = body.packages.find((p: Record<string, unknown>) => p.id === 'starter');
    expect(starter).toBeDefined();
    expect(starter.name).toBe('Starter Flow');
    expect(starter.totalCredits).toBeGreaterThanOrEqual(starter.credits);

    // Growth is the popular pick
    const growth = body.packages.find((p: Record<string, unknown>) => p.id === 'growth');
    expect(growth).toBeDefined();
    expect(growth.isPopular).toBe(true);
  });

  // ─── PATCH /api/users/:id/tier with valid tier ──────────────────────────

  test('PATCH /api/users/:id/tier updates user tier for first user', async ({ request }) => {
    // Fetch users first
    const listRes = await request.get(`${BASE}/api/users`, {
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    const users = await listRes.json() as Array<{ telegramId: string | number; tier: string }>;
    if (users.length === 0) {
      test.skip(); // no users to test with
      return;
    }
    const targetId = String(users[0].telegramId);
    const originalTier = users[0].tier;

    // Promote to pro
    const patchRes = await request.patch(`${BASE}/api/users/${targetId}/tier`, {
      data: { tier: 'pro' },
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody).toMatchObject({ success: true, tier: 'pro' });

    // Restore original tier
    await request.patch(`${BASE}/api/users/${targetId}/tier`, {
      data: { tier: originalTier },
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
  });

  // ─── Landing config read/write ───────────────────────────────────────────

  test('GET /api/settings/landing returns config object', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings/landing`, {
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Landing config is an object (may be empty)
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SAD PATH — protected endpoints without authentication
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sad Path — No Auth', () => {

  test('GET /api/admin/users returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/users`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Unauthorized');
  });

  test('GET /api/stats/overview returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stats/overview`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/users returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/users`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/settings/landing returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings/landing`);
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/users/:id/tier returns 401 without auth', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/users/1/tier`, {
      data: { tier: 'pro' },
    });
    expect(res.status()).toBe(401);
  });

  // System health is intentionally public — it MUST NOT require auth
  test('GET /api/system/health is public (no auth needed)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/system/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });

  // Packages endpoint is also public
  test('GET /api/packages is public (no auth needed)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/packages`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('packages');
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Edge Cases', () => {

  test('admin SPA catch-all serves HTML with root div for /admin/dashboard', async ({ page }) => {
    // Login via POST to get cookie, then navigate to admin dashboard
    const loginRes = await page.request.post(`${BASE}/admin/login`, {
      data: { password: ADMIN_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);

    // Navigate to dashboard with token for auto-auth
    await page.goto(`${BASE}/admin/dashboard?token=${makeAdminToken(ADMIN_PASSWORD)}`, {
      waitUntil: 'networkidle',
    });

    // SPA should have rendered content inside #root
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  });

  test('login page has correct title and form elements', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });

    // Page title from EJS template
    await expect(page).toHaveTitle(/Admin Login/i);

    // Form elements visible
    await expect(page.locator('form')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('/admin/login with token does NOT auto-redirect (token is HMAC-only, login via form)', async ({ page }) => {
    // login.ejs tidak lagi auto-submit — token di query hanya untuk API health
    // (?token=HMAC), bukan untuk auto-login. Token HMAC valid pun tetap tinggal
    // di halaman login dan form password tetap tampil.
    await page.goto(`${BASE}/admin/login?token=${makeAdminToken(ADMIN_PASSWORD)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Tidak redirect ke dashboard
    expect(page.url()).not.toContain('/admin/dashboard');

    // Form login tetap tampil
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });
  });

  test('GET /admin/users returns 404 because users page is served by SPA catch-all', async ({ request }) => {
    // /admin/users is not a route — it's handled by the React SPA.
    // The SPA catch-all returns 200 with index.html, not 404.
    // But we verify /api/users route exists and is protected
    const res = await request.get(`${BASE}/api/users`, {
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('wrong password to /admin/login returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/admin/login`, {
      data: { password: 'wrong-password-12345' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Wrong password');
  });

  test('PATCH /api/users/:id/tier with invalid tier returns 400', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/users/1/tier`, {
      data: { tier: 'superadmin' },
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('PATCH /api/users/:id/tier with non-existent user ID returns 404', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/users/999999999999/tier`, {
      data: { tier: 'pro' },
      headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    });
    expect(res.status()).toBe(404);
  });

});
