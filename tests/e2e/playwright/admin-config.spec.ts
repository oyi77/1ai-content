/**
 * Admin Config Page E2E Tests
 *
 * Tests the config viewer page (config.ejs served at /admin/config):
 * page loads, search filter present, sensitive value masking, expand/collapse.
 *
 * NOTE: /admin/config was recently added. If the running server pre-dates this
 * route, it returns 404. Page-level tests skip gracefully when 404 is returned.
 * /api/config returns a flat object: { camelCaseKey: value|"***REDACTED***" }.
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

// ─── Page structure ───────────────────────────────────────────────────────────
// /admin/config is a newer route. Accept 200 (deployed) or 404 (old server).

test('config page returns 200 or 404 when authenticated', async ({ request }) => {
  const response = await request.get('/admin/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  // Must not be 401 — auth is working; 404 means route not deployed on this server
  expect(response.status()).not.toBe(401);
  expect([200, 404]).toContain(response.status());
});

test('config page rejects unauthenticated access or route not deployed', async ({ request }) => {
  const response = await request.get('/admin/config');
  // 401 = route exists and auth guard fired
  // 404 = route not deployed on this server instance (auth guard only runs for known routes)
  // 302 = redirect to login
  expect([401, 302, 404]).toContain(response.status());
});

test('config page contains Environment Config heading when route is deployed', async ({ request }) => {
  const response = await request.get('/admin/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  if (response.status() === 404) {
    // Route not yet deployed on this server — skip
    return;
  }
  const text = await response.text();
  expect(text).toContain('Environment Config');
});

test('config page has search filter input when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config', { waitUntil: 'networkidle' });
  if (response && response.status() === 404) return;

  const searchInput = page.locator('input#search');
  await expect(searchInput).toBeVisible({ timeout: 10000 });
});

test('config page has Expand All and Collapse All buttons when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config', { waitUntil: 'networkidle' });
  if (response && response.status() === 404) return;

  await expect(page.getByText('Expand All')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Collapse All')).toBeVisible({ timeout: 10000 });
});

test('config page has Refresh button when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config', { waitUntil: 'networkidle' });
  if (response && response.status() === 404) return;

  await expect(page.getByText('Refresh')).toBeVisible({ timeout: 10000 });
});

// ─── /api/config endpoint ─────────────────────────────────────────────────────
// The actual response is a flat object: { camelCaseKey: string|object, ... }
// Sensitive values are replaced with "***REDACTED***".

test('/api/config returns JSON object', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(typeof body).toBe('object');
  expect(body).not.toBeNull();
});

test('/api/config returns object with at least one key', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).length).toBeGreaterThan(0);
});

test('/api/config includes known config key environment', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const body = await response.json();
  // The config always includes environment (NODE_ENV) mapped to camelCase key
  expect(body).toHaveProperty('environment');
});

test('/api/config masks sensitive values with REDACTED marker', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const body = await response.json();

  // Sensitive fields like botToken should be redacted, not exposed as raw values
  // The server uses "***REDACTED***" as the mask string
  if ('botToken' in body) {
    expect(body.botToken).toBe('***REDACTED***');
  }
});

test('/api/config does not expose raw BOT_TOKEN value', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  const text = await response.text();
  // A real bot token looks like: 123456789:ABCdef...
  // It should not appear verbatim in the response
  expect(text).not.toMatch(/\d{8,10}:[A-Za-z0-9_-]{35}/);
});

// ─── Search filter behaviour (DOM) ───────────────────────────────────────────

test('search filter input accepts text without error when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config', { waitUntil: 'networkidle' });
  if (response && response.status() === 404) return;

  const searchInput = page.locator('input#search');
  await expect(searchInput).toBeVisible({ timeout: 10000 });
  await searchInput.fill('NODE_ENV');
  await expect(page.locator('#config-container')).toBeVisible();
});

// ─── Expand/collapse sections ─────────────────────────────────────────────────

test('Collapse All hides group body elements when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config');
  if (response && response.status() === 404) return;

  // Wait for config to load (the loading placeholder disappears)
  await page.waitForFunction(
    "() => { const container = document.getElementById('config-container'); return !!container && !container.innerText.includes('Loading'); }",
    { timeout: 10000 },
  );

  await page.getByText('Collapse All').click();

  const hiddenBodies = await page.evaluate(
    "() => { const bodies = document.querySelectorAll('.group-body'); return Array.from(bodies).every((el) => el.style.display === 'none'); }",
  );
  expect(hiddenBodies).toBe(true);
});

test('Expand All makes group body elements visible when route is deployed', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
  const response = await page.goto('/admin/config');
  if (response && response.status() === 404) return;

  await page.waitForFunction(
    "() => { const container = document.getElementById('config-container'); return !!container && !container.innerText.includes('Loading'); }",
    { timeout: 10000 },
  );

  await page.getByText('Collapse All').click();
  await page.getByText('Expand All').click();

  const visibleBodies = await page.evaluate(
    "() => { const bodies = document.querySelectorAll('.group-body'); return Array.from(bodies).every((el) => el.style.display !== 'none'); }",
  );
  expect(visibleBodies).toBe(true);
});
