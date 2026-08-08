/**
 * Onboarding Wizard E2E Tests
 *
 * Walks the full customer onboarding flow through the real browser UI:
 * register → login → persona → niche → welcome bonus → dashboard,
 * then verifies the selections persisted server-side via the API.
 *
 * Complements customer-spa.spec.ts, which stops at the wizard's first screen.
 */

import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function uniqueCredentials(): Promise<{ email: string; password: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return { email: `e2e_wizard_${ts}_${rand}@test.local`, password: 'TestPass123!' };
}

/**
 * Register a fresh user through the registration form UI, then log them in.
 * Returns the email/password used. The browser is left on the wizard (step 0).
 */
async function registerAndLoginViaUi(page: Page): Promise<{ email: string; password: string }> {
  const { email, password } = await uniqueCredentials();

  await page.goto('/app/login');

  // Switch to register mode
  await page.getByText("Don't have an account? Sign up").click();
  await expect(page.locator('h1')).toHaveText('Create Account');

  await page.locator('input[placeholder="First name (optional)"]').fill('Wizard E2E');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[placeholder="Password (min 6 chars)"]').fill(password);
  await page.locator('input[placeholder="Confirm password"]').fill(password);

  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForResponse(
    (res) => res.url().includes('/auth/email/register') && res.status() === 200,
  );
  await expect(page.locator('h1')).toHaveText('Sign In');

  // Login
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForResponse(
    (res) => res.url().includes('/auth/email/login') && res.status() === 200,
  );

  return { email, password };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Onboarding Wizard', () => {
  test('full wizard walk-through: register, login, persona, niche, bonus, dashboard', async ({
    page,
  }) => {
    await registerAndLoginViaUi(page);

    // ── Step 0: Persona ───────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/app\/onboarding/);
    await expect(page.locator('h1')).toHaveText('Selamat datang di 1AI Content');
    await expect(page.getByText('Pilih profil kamu')).toBeVisible();

    // "Lanjut" is disabled until a persona is selected
    await expect(page.getByRole('button', { name: 'Lanjut' })).toBeDisabled();

    await page.getByRole('button', { name: /Content Creator/ }).click();
    const personaSave = page.waitForResponse(
      (res) => res.url().includes('/api/user/settings') && res.status() === 200,
    );
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await personaSave;

    // ── Step 1: Niche ────────────────────────────────────────────────────
    await expect(page.getByText('Pilih niche konten')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembali' })).toBeVisible();

    await page.getByRole('button', { name: /Tech & Gadgets/ }).click();
    const nicheSave = page.waitForResponse(
      (res) => res.url().includes('/api/user/settings') && res.status() === 200,
    );
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await nicheSave;

    // ── Step 2: Welcome bonus ────────────────────────────────────────────
    await expect(page.getByText('Kamu dapat bonus 1 kredit!')).toBeVisible();

    const bonusRes = page.waitForResponse(
      (res) => res.url().includes('/api/user/bonus/welcome') && res.status() === 200,
    );
    await page.getByRole('button', { name: 'Klaim bonus' }).click();
    await bonusRes;

    await expect(page.getByText(/Berhasil! Saldo kamu:/)).toBeVisible();
    await expect(page.getByText('1 kredit', { exact: true })).toBeVisible();

    // "Ke dashboard" lands on the dashboard
    await page.getByRole('button', { name: 'Ke dashboard' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page.getByText('Available balance')).toBeVisible();
  });

  test('onboarding selections persist server-side and wizard redirects when complete', async ({
    page,
  }) => {
    await registerAndLoginViaUi(page);

    // Complete the wizard through the UI
    await page.getByRole('button', { name: /Content Creator/ }).click();
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.getByText('Pilih niche konten')).toBeVisible();
    await page.getByRole('button', { name: /Tech & Gadgets/ }).click();
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.getByText('Kamu dapat bonus 1 kredit!')).toBeVisible();
    await page.getByRole('button', { name: 'Klaim bonus' }).click();
    await expect(page.getByText(/Berhasil! Saldo kamu:/)).toBeVisible();

    // Read the JWT from localStorage and verify persisted state via API
    const token = await page.evaluate(() => {
      // @ts-expect-error: localStorage is browser-only but evaluate runs in browser
      return localStorage.getItem('token');
    });
    expect(token).toBeTruthy();

    const userRes = await page.request.get('/api/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(userRes.status()).toBe(200);
    const user = await userRes.json();
    expect(user.userMode).toBe('content_creator');
    expect(user.selectedNiche).toBe('tech_gadgets');
    expect(user.welcomeBonusUsed).toBe(true);
    expect(Number(user.credits)).toBeGreaterThanOrEqual(1);

    // Revisiting the wizard redirects to the dashboard (onboarding complete)
    await page.goto('/app/onboarding');
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});
