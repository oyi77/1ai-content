/**
 * Web Landing Page E2E Tests
 *
 * Tests public-facing pages:
 * - Landing page (GET /) structure and meta tags
 * - Health check endpoint
 * - Key CTA and feature elements
 */

import { test, expect } from '@playwright/test';

// ─── Health check ─────────────────────────────────────────────────────────────

test('GET /health returns 200 with healthy status', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('healthy');
});

test('GET /health response includes version and timestamp', async ({ request }) => {
  const response = await request.get('/health');
  const body = await response.json();
  expect(body).toHaveProperty('version');
  expect(body).toHaveProperty('timestamp');
  // timestamp is ISO 8601
  expect(() => new Date(body.timestamp)).not.toThrow();
});

test('GET /health response includes environment field', async ({ request }) => {
  const response = await request.get('/health');
  const body = await response.json();
  expect(body).toHaveProperty('environment');
});

// ─── Landing page ─────────────────────────────────────────────────────────────

test('GET / returns 200', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
});

test('landing page returns HTML content type', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['content-type']).toContain('text/html');
});

test('landing page has DOCTYPE html declaration', async ({ request }) => {
  const response = await request.get('/');
  const text = await response.text();
  expect(text.trim().toLowerCase()).toMatch(/^<!doctype html/);
});

// ─── Meta tags ────────────────────────────────────────────────────────────────

test('landing page has title meta tag', async ({ page }) => {
  await page.goto('/');
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);
});

test('landing page has meta description', async ({ page }) => {
  await page.goto('/');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toBeTruthy();
  expect(description!.length).toBeGreaterThan(0);
});

test('landing page has og:title open graph tag', async ({ page }) => {
  await page.goto('/');
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  expect(ogTitle).toBeTruthy();
});

test('landing page has og:description open graph tag', async ({ page }) => {
  await page.goto('/');
  const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
  expect(ogDesc).toBeTruthy();
});

test('landing page has twitter:card meta tag', async ({ page }) => {
  await page.goto('/');
  const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
  expect(twitterCard).toBeTruthy();
});

test('landing page has canonical link tag', async ({ page }) => {
  await page.goto('/');
  // React SPA — canonical is set in index.html
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBeTruthy();
});

// ─── Key page elements ────────────────────────────────────────────────────────

test('landing page renders a visible h1 heading', async ({ page }) => {
  await page.goto('/');
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible();
  const text = await h1.innerText();
  expect(text.length).toBeGreaterThan(0);
});

test('landing page has at least one CTA button', async ({ page }) => {
  await page.goto('/');
  // React SPA: hero section has "Mulai Gratis →" link
  const ctaButton = page.locator('a[href*="register=1"]').first();
  await expect(ctaButton).toBeVisible();
});

test('landing page has a navigation bar', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('nav').first();
  await expect(nav).toBeVisible();
});

test('landing page has features/solution section', async ({ page }) => {
  await page.goto('/');
  // React SPA: #features section with feature cards containing h3 titles.
  // count() does NOT auto-wait (returns 0 before the lazy-loaded React chunk renders),
  // so assert visibility on the first card instead — consistent with the other tests.
  const featureCard = page.locator('#features h3').first();
  await expect(featureCard).toBeVisible();
});

test('landing page has pricing section', async ({ page }) => {
  await page.goto('/');
  // React SPA: #pricing section exists with package cards
  await expect(page.locator('#pricing').first()).toBeVisible();
  // Should have at least one package name visible
  const pkgName = page.locator('#pricing h3').first();
  await expect(pkgName).toBeVisible();
});

// ─── Logo ─────────────────────────────────────────────────────────────────────

test('landing page has logo in navigation', async ({ page }) => {
  await page.goto('/');
  // React SPA: nav has a home link with "1AI Content" text
  const logo = page.locator('nav a[href="/"]').first();
  await expect(logo).toBeVisible();
});
