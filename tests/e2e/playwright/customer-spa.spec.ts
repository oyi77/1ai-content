/**
 * Customer SPA E2E Tests
 *
 * Tests for the React SPA served at /app/*. Covers:
 * - Registration, login, and password reset UI flow
 * - JWT-based authentication (localStorage token)
 * - Protected route redirects when unauthenticated
 * - Error states for invalid credentials
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Register a temporary user via the API and return an auth token.
 * Uses a unique timestamp-based email to avoid DB conflicts.
 */
async function registerAndLogin(
  request: APIRequestContext,
): Promise<{ token: string; email: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `e2e_${ts}_${rand}@test.local`;
  const password = 'TestPass123!';

  const regRes = await request.post('/auth/email/register', {
    data: { email, password, firstName: 'E2E Tester' },
  });
  expect(regRes.status()).toBe(200);

  const loginRes = await request.post('/auth/email/login', {
    data: { email, password },
  });
  expect(loginRes.status()).toBe(200);
  const body = await loginRes.json();
  expect(body).toHaveProperty('token');
  return { token: body.token, email };
}

/**
 * Set the JWT token in localStorage before navigating to a protected page.
 * The AuthContext reads the token from localStorage on mount.
 */
async function authenticatePage(page: Page, token: string): Promise<void> {
  await page.addInitScript((t: string) => {
    // @ts-expect-error: localStorage is browser-only but addInitScript runs in browser
    localStorage.setItem('token', t);
  }, token);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Customer SPA', () => {
  // ── Login page renders ──────────────────────────────────────────────────

  test('login page renders with form elements and mode switching links', async ({ page }) => {
    await page.goto('/app/login');

    // Page should show the Sign In heading
    await expect(page.locator('h1')).toHaveText('Sign In');

    // Email and password inputs should be present
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Submit button should say "Sign In"
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    // Mode switching links should be visible
    await expect(page.getByText("Don't have an account? Sign up")).toBeVisible();
    await expect(page.getByText('Forgot password?')).toBeVisible();

    // No error or success message initially
    await expect(page.locator('text=Sign In >> xpath=..').locator('p.text-red-600')).toHaveCount(0);
  });

  // ── Register a new user via browser UI ──────────────────────────────────

  test('register a new user via the registration form', async ({ page }) => {
    await page.goto('/app/login');

    // Switch to register mode
    await page.getByText("Don't have an account? Sign up").click();
    await expect(page.locator('h1')).toHaveText('Create Account');

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const email = `e2e_reg_${ts}_${rand}@test.local`;
    const password = 'TestPass123!';

    await page.locator('input[placeholder="First name (optional)"]').fill('E2E Tester');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[placeholder="Password (min 6 chars)"]').fill(password);
    await page.locator('input[placeholder="Confirm password"]').fill(password);

    // Submit the registration form
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Wait for the API call to complete
    await page.waitForResponse(
      (res) => res.url().includes('/auth/email/register') && res.status() === 200,
    );

    // Should switch back to login mode with success message
    await expect(page.locator('h1')).toHaveText('Sign In');
    await expect(page.getByText('Registration successful')).toBeVisible();
  });

  // ── Login with valid credentials via browser UI ─────────────────────────

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    // Create a user via API first
    const { email } = await registerAndLogin(page.request);

    await page.goto('/app/login');

    // Fill login form
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('TestPass123!');

    // Submit
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for the login API response
    await page.waitForResponse(
      (res) => res.url().includes('/auth/email/login') && res.status() === 200,
    );

    // Should navigate to dashboard after login
    await expect(page).toHaveURL(/\/app\/dashboard/);

    // Dashboard should render content
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page.getByText('Available balance')).toBeVisible();
  });

  // ── Authenticated user can access dashboard directly ────────────────────

  test('authenticated user can access dashboard directly', async ({ page }) => {
    const { token } = await registerAndLogin(page.request);
    await authenticatePage(page, token);

    await page.goto('/app/dashboard');

    // Should see the dashboard (not redirected)
    await expect(page.getByText('Welcome')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Create amazing content')).toBeVisible();
  });

  // ── Sad path: redirect when unauthenticated ─────────────────────────────

  test('redirects to login when accessing dashboard without token', async ({ page }) => {
    await page.goto('/app/dashboard');

    // The SPA redirects to /login
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.locator('h1')).toHaveText('Sign In');
  });

  test('shows error on login with wrong password', async ({ page }) => {
    // Register a real user
    const { email } = await registerAndLogin(page.request);

    await page.goto('/app/login');

    // Fill login form with wrong password
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('WrongPassword999!');

    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for API response
    await page.waitForResponse(
      (res) => res.url().includes('/auth/email/login') && res.status() === 401,
    );

    // Should see error message
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('shows error on password mismatch during registration', async ({ page }) => {
    await page.goto('/app/login');

    // Switch to register
    await page.getByText("Don't have an account? Sign up").click();

    const ts = Date.now();
    const email = `e2e_mismatch_${ts}@test.local`;

    await page.locator('input[placeholder="First name (optional)"]').fill('E2E Tester');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[placeholder="Password (min 6 chars)"]').fill('PasswordOne!');
    await page.locator('input[placeholder="Confirm password"]').fill('PasswordTwo!');

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Client-side validation error — no API call needed
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('shows error on registration with empty required fields', async ({ page }) => {
    await page.goto('/app/login');

    // Switch to register
    await page.getByText("Don't have an account? Sign up").click();

    // Submit with empty email (fill password only to test server-side validation)
    await page.locator('input[placeholder="Password (min 6 chars)"]').fill('TestPass123!');
    await page.locator('input[placeholder="Confirm password"]').fill('TestPass123!');

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Browser HTML5 validation should prevent submission
    // OR the server returns 400 — both are acceptable.
    // Check that we didn't navigate away or see a success message
    await expect(page.locator('h1')).toHaveText('Create Account');
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  test('shows error on login with non-existent email', async ({ page }) => {
    await page.goto('/app/login');

    await page.locator('input[type="email"]').fill('nonexistent_' + Date.now() + '@nowhere.test');
    await page.locator('input[type="password"]').fill('SomePassword123!');

    // Register waitForResponse BEFORE clicking — otherwise a fast local response
    // can arrive before the wait starts (classic race) and the test times out.
    const errorResponse = page.waitForResponse(
      (res) => res.url().includes('/auth/email/login') && res.status() === 401,
    );
    await page.getByRole('button', { name: 'Sign In' }).click();
    await errorResponse;

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('redirects to login when accessing billing without token', async ({ page }) => {
    await page.goto('/app/billing');

    // Should redirect to login
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.locator('h1')).toHaveText('Sign In');
  });

  test('redirects to login when accessing create-video without token', async ({ page }) => {
    await page.goto('/app/create');

    // Should redirect to login
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.locator('h1')).toHaveText('Sign In');
  });

  test('authenticated user can access billing page', async ({ page }) => {
    const { token } = await registerAndLogin(page.request);
    await authenticatePage(page, token);

    await page.goto('/app/billing');

    // Should not redirect — billing page renders (may show empty state)
    await expect(page).not.toHaveURL(/\/app\/login/);
    // Billing page should have some content (even if "no history")
    await expect(page.locator('h1, h2').first()).toBeAttached({ timeout: 15000 });
  });

  test('register form switches between login and register modes', async ({ page }) => {
    await page.goto('/app/login');

    // Start in login mode
    await expect(page.locator('h1')).toHaveText('Sign In');

    // Switch to register
    await page.getByText("Don't have an account? Sign up").click();
    await expect(page.locator('h1')).toHaveText('Create Account');

    // First name field should be visible in register mode
    await expect(page.locator('input[placeholder="First name (optional)"]')).toBeVisible();

    // Switch back to login
    await page.getByText('Already have an account? Sign in').click();
    await expect(page.locator('h1')).toHaveText('Sign In');

    // Switch to forgot password mode
    await page.getByText('Forgot password?').click();
    await expect(page.locator('h1')).toHaveText('Reset Password');

    // Forgot mode has just email and submit
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();

    // Back to login
    await page.getByText('Back to sign in').click();
    await expect(page.locator('h1')).toHaveText('Sign In');
  });
});
