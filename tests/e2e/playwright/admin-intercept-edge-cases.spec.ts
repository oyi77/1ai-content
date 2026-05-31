import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const INVALID_USER_ID = '000000000';

test.describe.configure({ mode: 'serial' });

test.describe('Admin Intercept Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  const NON_NUMERIC_USER_ID = 'abcde';

  test('should show error when trying to add empty user ID (no selection made)', async ({ page }) => {
    await page.goto('/admin/interceptions');
    await expect(page.locator('.section-title')).toHaveText('🎯 Live Interceptions');
  
    await page.click('button:has-text("+ Intercept User")');
    await page.fill('#add-user-search', INVALID_USER_ID);
    // Wait for debounce
    await page.waitForTimeout(500);
    // Nothing selected, click add (using evaluate to bypass UI overlap)
    // @ts-expect-error - document is available in browser context
    await page.evaluate(() => { document.getElementById('add-btn').click(); });
    
    const errorMessage = page.locator('#add-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Telegram ID is required');
  });

  test('should bypass UI search and test backend non-numeric handling', async ({ page }) => {
    await page.goto('/admin/interceptions');
    await expect(page.locator('.section-title')).toHaveText('🎯 Live Interceptions');

    await page.click('button:has-text("+ Intercept User")');
    // Force hidden input value to bypass UI validation
    // @ts-expect-error - document is available in browser context
    await page.evaluate((id) => { document.getElementById('add-telegram-id').value = id }, NON_NUMERIC_USER_ID);
    await page.click('#add-btn');

    const errorMessage = page.locator('#add-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Invalid Telegram ID format');
  });

  test('should bypass UI search and test backend invalid user ID handling', async ({ page }) => {
    await page.goto('/admin/interceptions');
    await expect(page.locator('.section-title')).toHaveText('🎯 Live Interceptions');

    await page.click('button:has-text("+ Intercept User")');
    // Force hidden input value
    // @ts-expect-error - document is available in browser context
    await page.evaluate((id) => { document.getElementById('add-telegram-id').value = id }, INVALID_USER_ID);
    await page.click('#add-btn');

    const errorMessage = page.locator('#add-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('User not found');
  });
});
