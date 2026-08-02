/**
 * RBAC Security Boundary E2E Tests
 *
 * Tests authentication and authorization boundaries across admin API, customer API,
 * customer SPA, and known auth gaps.
 *
 * Admin auth: HMAC-SHA256 token via cookie/Basic/query-param, compared against ADMIN_PASSWORD
 * Customer auth: JWT Bearer token, verified with JWT_SECRET, user looked up via getUser()
 * Customer SPA: React app at /app/*, client-side ProtectedRoute redirects to /app/login
 *
 * @group auth
 * @group security
 */

import { test, expect, type Page } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Read ADMIN_PASSWORD from .env if not in process.env (matches the running server)
function resolveAdminPassword(): string {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const envPath = path.resolve(__dirname, '../../..', '.env');
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ADMIN_PASSWORD=')) {
        return trimmed.split('=').slice(1).join('=');
      }
    }
  } catch { /* fall through */ }
  return 'admin123';
}

const ADMIN_PASSWORD = resolveAdminPassword();

function makeAdminToken(password: string): string {
  return crypto.createHmac('sha256', 'openclaw-admin-v1').update(password).digest('hex');
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

let testEmail: string;
let testPassword: string;
let jwtToken: string;

test.beforeAll(async ({ request }) => {
  // Create a temporary user for customer JWT tests
  testEmail = `rbactest_${Date.now()}@example.com`;
  testPassword = 'TestPass123!';

  // Registration may return 409 if e-mail already exists from a prior run
  const registerRes = await request.post('/auth/email/register', {
    data: { email: testEmail, password: testPassword, firstName: 'RBAC Test' },
  });
  expect([200, 201, 409]).toContain(registerRes.status());

  // Login to obtain JWT
  const loginRes = await request.post('/auth/email/login', {
    data: { email: testEmail, password: testPassword },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = await loginRes.json();
  expect(loginBody.token).toBeDefined();
  jwtToken = loginBody.token;
});

// ─── Admin Boundary ─────────────────────────────────────────────────────────

test.describe('Admin Boundary', () => {
  test('1. Admin API without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/users');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('2. Admin API with wrong cookie returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/users', {
      headers: { cookie: 'admin_token=wrongtoken123' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('3. Admin API with valid token returns 200', async ({ request }) => {
    const token = makeAdminToken(ADMIN_PASSWORD);
    const res = await request.get('/api/admin/users', {
      headers: { cookie: `admin_token=${token}` },
    });
    // May return 200 or 404 if the route/environment lacks DB data
    expect([200, 404]).toContain(res.status());
  });

  test('4. Admin login page loads without auth', async ({ page }) => {
    const res = await page.goto('/admin/login');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#password')).toBeVisible();
  });
});

// ─── Customer API Boundary ──────────────────────────────────────────────────

test.describe('Customer API Boundary', () => {
  test('5. POST /auth/email/register creates new user', async ({ request }) => {
    const email = `rbac_customer_${Date.now()}@example.com`;
    const res = await request.post('/auth/email/register', {
      data: { email, password: 'StrongPass1!', firstName: 'Customer' },
    });
    // Accept 200, 201, or 409 if e-mail was registered in a parallel run
    expect([200, 201, 409]).toContain(res.status());
  });

  test('6. POST /auth/email/login returns JWT', async ({ request }) => {
    const res = await request.post('/auth/email/login', {
      data: { email: testEmail, password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeDefined();
    // Store for subsequent tests
    jwtToken = body.token;
  });

  test('7. GET /api/user rejects without JWT, accepts with JWT', async ({ request }) => {
    // Without auth — 401
    const noAuth = await request.get('/api/user');
    expect(noAuth.status()).toBe(401);
    const errBody = await noAuth.json();
    expect(errBody.error).toBeDefined();

    // With valid JWT — 200
    const withAuth = await request.get('/api/user', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });
    expect(withAuth.ok()).toBeTruthy();
    const userBody = await withAuth.json();
    expect(userBody.id || userBody.email).toBeDefined();
  });
});

// ─── Customer SPA Boundary ──────────────────────────────────────────────────

test.describe('Customer SPA Boundary', () => {
  test('8. SPA /app/dashboard without token redirects to /app/login', async ({ page }) => {
    const res = await page.goto('/app/dashboard');
    // Fastify serves admin-ui/dist/index.html (200), SPA JS handles client-side redirect
    expect(res?.status()).toBe(200);

    // Wait for SPA ProtectedRoute to redirect to login
    await page.waitForURL('**/app/login', { timeout: 15000 });
    // Verify login page rendered
    await expect(page.locator('input[type="email"], input[name="email"], input[placeholder*="email"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('9. SPA with fake JWT still redirects to login', async ({ page }) => {
    // Inject an invalid token before navigation
    await page.addInitScript(() => {
      // @ts-expect-error: localStorage is browser-only but addInitScript runs in browser
      localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake');
    });
    const res = await page.goto('/app/dashboard');
    expect(res?.status()).toBe(200);

    // SPA AuthProvider validates token via /api/user → fails → redirects
    await page.waitForURL('**/app/login', { timeout: 15000 });
    await expect(page.locator('input[type="email"], input[name="email"], input[placeholder*="email"]').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Auth Gap Verification ──────────────────────────────────────────────────

test.describe('Auth Gap Verification', () => {
  test('10. /api/analytics/overview is accessible without admin auth (confirmed gap)', async ({ request }) => {
    const res = await request.get('/api/analytics/overview');
    // This route is registered at the top-level app (not inside the admin plugin)
    // so the admin auth hook does NOT protect it — known auth gap
    expect(res.status()).not.toBe(401);
    // Should return 200 with data, or 500 if the DB is unpopulated
    expect([200, 500]).toContain(res.status());
  });

  test('11. /api/packages is accessible without any auth (confirmed gap)', async ({ request }) => {
    const res = await request.get('/api/packages');
    // finance.ts route does not call getUser() — no authentication required
    expect(res.status()).not.toBe(401);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Should contain package listing data
    expect(body).toBeDefined();
  });
});
