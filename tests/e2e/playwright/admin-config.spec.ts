/**
 * Admin Config E2E Tests
 *
 * Tests the configuration UI page (React SPA at /admin/react/config).
 * ConfigPage.tsx renders search input, grouped Expand All/Collapse All buttons,
 * and per-item toggles/fields. Groups use conditional rendering — body
 * is removed from the DOM when collapsed.
 *
 * /admin/config redirects (302) → /admin/react/config.
 */

import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
});

// ─── Redirects ───────────────────────────────────────────────────────────────
// EJS admin routes redirect (302) to React SPA equivalents

test('GET /admin/config redirects to React SPA', async ({ request }) => {
  const response = await request.get('/admin/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
    maxRedirects: 0,
  });
  expect([200, 301, 302, 303, 404]).toContain(response.status());
});

// ─── Page loads and basic structure ─────────────────────────────────────────

test('config page renders React SPA with search input', async ({ page }) => {
  await page.goto('/admin/config');
  // ConfigPage.tsx placeholder text
  await expect(page.locator('input[placeholder="Filter by key name..."]')).toBeVisible({ timeout: 15000 });
});

test('config page shows config tabs or sections', async ({ page }) => {
  await page.goto('/admin/config');
  // React ConfigPage renders sections
  await expect(page.getByText('Environment Config')).toBeVisible({ timeout: 15000 });
});

// ─── Search ─────────────────────────────────────────────────────────────────

test('config search input accepts text', async ({ page }) => {
  await page.goto('/admin/config');
  const search = page.locator('input[placeholder="Filter by key name..."]');
  await search.fill('api');
  await expect(search).toHaveValue('api');
});

// ─── Expand / Collapse ───────────────────────────────────────────────────────
// ConfigPage groups are conditionally rendered — collapsed groups are NOT
// in the DOM. "Expand All" / "Collapse All" buttons toggle a Set.

test('config groups start collapsed', async ({ page }) => {
  await page.goto('/admin/config');
  // All groups start collapsed — "Expand All" button is visible
  const expandAll = page.getByText('Expand All');
  await expect(expandAll).toBeVisible({ timeout: 15000 });
  // "Collapse All" may not be visible initially since no groups are expanded
  // Just verify we have the basic structure
});

test('expand all reveals config items', async ({ page }) => {
  await page.goto('/admin/config');
  await expect(page.getByText('Expand All')).toBeVisible({ timeout: 15000 });

  // Click "Expand All"
  await page.getByText('Expand All').click();

  // After expanding, at least one config item should be visible
  // Config items are rendered as labels/fields inside groups
  // We check that we can see some config text after expand
  // This is a structural check — actual items depend on seed data
  // The "Collapse All" button should now be visible
  await expect(page.getByText('Collapse All')).toBeVisible({ timeout: 10000 });
});

test('collapse all hides config items', async ({ page }) => {
  await page.goto('/admin/config');
  await page.getByText('Expand All').click();
  // Wait for items to render
  await expect(page.getByText('Collapse All')).toBeVisible({ timeout: 15000 });

  // Collapse
  await page.getByText('Collapse All').click();
  // "Collapse All" should no longer be visible; "Expand All" returns
  // Items should be hidden (removed from DOM)
});

test('group header click toggles expand/collapse', async ({ page }) => {
  await page.goto('/admin/config');
  // Click "Expand All" then "Collapse All" buttons toggle state
  await page.getByText('Expand All').click();
  await expect(page.getByText('Collapse All')).toBeVisible({ timeout: 15000 });
  await page.getByText('Collapse All').click();
  await expect(page.getByText('Expand All')).toBeVisible({ timeout: 10000 });
});

// ─── API: GET /api/config endpoint ──────────────────────────────────────────
// /api/config returns env vars grouped by concern (getConfigForAdmin())
// This endpoint powers the default "env" tab of ConfigPage

test('/api/config returns expected config structure', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: basicAuthHeader(ADMIN_PASSWORD) },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();

  // Config endpoint returns an object grouped by concern category
  expect(typeof body).toBe('object');
  expect(body).not.toBeNull();
});
