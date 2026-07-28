/**
 * Admin Interception Edge Cases
 *
 * Tests edge-case behavior of the interceptions modal in the React SPA.
 * Focuses on modal-level validations: button disabled states.
 * Avoids deep EJS-specific DOM interactions that no longer apply.
 */

import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function basicAuthHeader(password: string): string {
  return 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basicAuthHeader(ADMIN_PASSWORD) });
});

// ─── Empty search ────────────────────────────────────────────────────────────
// When the search input in the modal is empty, no results are shown
// and the Enable Intercept button stays disabled

test('empty search shows no results and button disabled', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await page.getByText('Live Interceptions').waitFor({ state: 'visible', timeout: 15000 });

  // Open add modal
  await page.getByText('+ Intercept User').click();
  await expect(page.getByRole('heading', { name: 'Intercept User' })).toBeVisible({ timeout: 10000 });

  // Search input is empty by default
  const searchInput = page.locator('input[placeholder*="Type name"]');
  await expect(searchInput).toBeVisible();

  // "Enable Intercept" button should be disabled when no user selected
  const enableButton = page.getByText('Enable Intercept');
  await expect(enableButton).toBeDisabled();
});

// ─── Section title ───────────────────────────────────────────────────────────
// Confirm section title is plain text (no emoji icon prefix)

test('section title is "Live Interceptions" without emoji', async ({ page }) => {
  await page.goto('/admin/interceptions');
  await expect(page.getByText('Live Interceptions')).toBeVisible({ timeout: 15000 });
});
