/**
 * Admin Dashboard E2E Tests
 *
 * Tests the analytics dashboard page (analytics.ejs served at /admin/dashboard).
 * The dashboard is a single-page app — navigation is JS-driven via data-section
 * attributes, not href links to separate pages.
 */

import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

// ─── Dashboard page structure ────────────────────────────────────────────────

test('dashboard page returns HTML with 200', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain('<!DOCTYPE html');
});

test('dashboard page contains BerkahKarya branding', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  expect(text.toLowerCase()).toContain('berkahkarya');
});

test('dashboard page contains sidebar navigation items', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  // Layout sidebar uses .nav-item class with data-label attributes
  expect(text).toContain('nav-item');
  expect(text).toContain('data-label="Pricing"');
});

test('dashboard page has kpi-card elements in HTML', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  // analytics.ejs uses .kpi-card class for stat cards
  expect(text).toContain('kpi-card');
});

// ─── Navigation section items ─────────────────────────────────────────────────

test('dashboard page has Users section in page content', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  // Users section rendered in page content (id="section-users")
  expect(text).toContain('id="section-users"');
});

test('dashboard page has Pricing nav section item', async ({ request }) => {
  const response = await request.get('/admin/dashboard', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  // Layout sidebar uses data-label attribute for Pricing
  expect(text).toContain('data-label="Pricing"');
});

// ─── Navigation actually works (pages reachable) ─────────────────────────────

test('GET /admin/pricing returns 200', async ({ request }) => {
  const response = await request.get('/admin/pricing', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
});

test('GET /admin/prompts returns 200', async ({ request }) => {
  const response = await request.get('/admin/prompts', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
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
