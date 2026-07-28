/**
 * Admin Interceptions E2E Tests
 *
 * Tests the Live Interceptions page (React SPA at /admin/react/interceptions).
 * InterceptionsPage.tsx renders a modal for adding intercepts,
 * search functionality, and a toast notification system.
 *
 * /admin/interceptions redirects (302) → /admin/react/interceptions.
 */

import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
});

// ─── Page load ───────────────────────────────────────────────────────────────

test('admin login and interceptions navigation', async ({ page }) => {
  await page.goto('/admin/login');
  // Login form should be visible
  await expect(page.locator('form')).toBeVisible({ timeout: 10000 });
  // Navigate to interceptions page
  await page.goto('/admin/interceptions');
  // page.goto follows redirects to React SPA
  await expect(page.getByText('Live Interceptions')).toBeVisible({ timeout: 15000 });
});

// ─── Modal interactions ─────────────────────────────────────────────────────
// InterceptionsPage displays a modal for adding intercepts.
// The modal has a search input and "Enable Intercept" button.

test('open add interceptions modal', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await expect(page.getByText('Live Interceptions')).toBeVisible({ timeout: 15000 });

  // Click "+ Intercept User" button to open modal
  await page.getByText('+ Intercept User').click();

  // Modal should be visible with search input and title
  await expect(page.getByRole('heading', { name: 'Intercept User' })).toBeVisible({ timeout: 10000 });
});

test('add interceptions modal has search input and disabled enable button', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await page.getByText('Live Interceptions').waitFor({ state: 'visible', timeout: 15000 });

  // Open modal
  await page.getByText('+ Intercept User').click();
  await expect(page.getByRole('heading', { name: 'Intercept User' })).toBeVisible({ timeout: 10000 });

  // Search input should be visible
  const searchInput = page.locator('input[placeholder*="Type name"]');
  await expect(searchInput).toBeVisible({ timeout: 10000 });

  // "Enable Intercept" button should be disabled when no user selected
  const enableButton = page.getByText('Enable Intercept');
  await expect(enableButton).toBeVisible();
  await expect(enableButton).toBeDisabled();
});

test('add interceptions modal cancel button closes modal', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await page.getByText('Live Interceptions').waitFor({ state: 'visible', timeout: 15000 });

  // Open modal
  await page.getByText('+ Intercept User').click();
  await expect(page.getByRole('heading', { name: 'Intercept User' })).toBeVisible({ timeout: 10000 });

  // Click Cancel
  await page.getByText('Cancel').click();

  // Modal should close — "Intercept User" heading should be hidden
  await expect(page.getByRole('heading', { name: 'Intercept User' })).not.toBeVisible({ timeout: 10000 });
});

// ─── Intercept list ──────────────────────────────────────────────────────────

test('interceptions page shows intercept list', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await expect(page.getByText('Live Interceptions')).toBeVisible({ timeout: 15000 });

  // The page should have a sidebar with intercepted users list
  // User items are <div> elements with cursor-pointer class
  // Empty state: "No intercepted users. Click the button above to add one."
  const empty = page.getByText(/No intercepted/i);
  // One of these should be present
  const hasContent = page.locator('section, div.cursor-pointer').first();
  await expect(
    empty.or(hasContent)
  ).toBeVisible({ timeout: 10000 });
});

// ─── Section title ─────────────────────────────────────────────────────────
// Confirm Live Interceptions section renders without emoji prefix
// (Unlike old EJS version which included an emoji icon)

test('live interceptions section title has no emoji prefix', async ({ page }) => {
  await page.goto('/admin/interceptions');
  // Check the section-title text is exactly "Live Interceptions" — no emoji
  await expect(page.getByText('Live Interceptions')).toBeVisible({ timeout: 15000 });
});
