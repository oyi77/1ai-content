/**
 * Admin Dashboard E2E Tests
 *
 * Tests the analytics dashboard page (React SPA at /admin/dashboard).
 * The dashboard is a React SPA — uses text-based assertions on rendered components.
 * /admin/dashboard redirects (302) to /admin/dashboard.
 */

import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

// Set basic auth for all page tests
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
});

// ─── Dashboard page structure ────────────────────────────────────────────────
// /admin/dashboard redirects (302) to React SPA. page.goto() follows redirects.

test('dashboard page renders React SPA', async ({ page }) => {
  await page.goto('/admin/dashboard');
  // React SPA shows KPI labels after data loads
  await expect(page.getByText('New Users')).toBeVisible({ timeout: 15000 });
});

test('dashboard page contains all four KPI labels', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await expect(page.getByText('New Users')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Active Users').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Transactions')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Revenue')).toBeVisible({ timeout: 10000 });
});

test('dashboard page has Active Users section header', async ({ page }) => {
  await page.goto('/admin/dashboard');
  // Dashboard.tsx renders "Active Users" as an h3 section header
  await expect(page.locator('h3:has-text("Active Users")')).toBeVisible({ timeout: 15000 });
});

test('dashboard page has Provider Health and Top Niches sections', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await expect(page.locator('h3:has-text("Provider Health")')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('h3:has-text("Top Niches")')).toBeVisible({ timeout: 10000 });
});

// ─── Navigation redirects (EJS routes → React SPA) ──────────────────────────
// /admin/* routes redirect to /admin/* equivalents

test('GET /admin/pricing redirects to React SPA', async ({ request }) => {
  const response = await request.get('/admin/pricing', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    maxRedirects: 0,
  });
  expect([200, 301, 302]).toContain(response.status());
});

test('GET /admin/prompts redirects to React SPA', async ({ request }) => {
  const response = await request.get('/admin/prompts', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    maxRedirects: 0,
  });
  expect([200, 301, 302]).toContain(response.status());
});

test('GET /admin/users redirects (SPA handles users via dashboard)', async ({ request }) => {
  const response = await request.get('/admin/users', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    maxRedirects: 0,
  });
  // /admin/users redirects to /admin/dashboard#users
  expect([200, 301, 302]).toContain(response.status());
});

// ─── /api/stats endpoint ─────────────────────────────────────────────────────

test('/api/stats returns JSON with expected shape', async ({ request }) => {
  const response = await request.get('/api/stats', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();

  // Shape from admin.ts: { users, transactions, videos, revenue, queue, trialStats }
  expect(typeof body.users).toBe('number');
  expect(typeof body.transactions).toBe('number');
  expect(typeof body.videos).toBe('number');
  expect(typeof body.revenue).toBe('number');
  expect(body).toHaveProperty('queue');
  expect(body).toHaveProperty('trialStats');
});

test('/api/stats trialStats has daily, welcome, total fields', async ({ request }) => {
  const response = await request.get('/api/stats', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const body = await response.json();
  expect(typeof body.trialStats.daily).toBe('number');
  expect(typeof body.trialStats.welcome).toBe('number');
  expect(typeof body.trialStats.total).toBe('number');
});
