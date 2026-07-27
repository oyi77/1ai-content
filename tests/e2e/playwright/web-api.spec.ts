/**
 * Web API Endpoint E2E Tests
 *
 * Tests public and authenticated web API endpoints:
 * - GET /api/packages — credit package listing
 * - GET /api/subscriptions — subscription plan listing
 * - POST /auth/telegram — Telegram auth (rejects invalid data)
 * - /api/user — requires JWT auth
 */

import { test, expect } from '@playwright/test';

// ─── /api/packages ────────────────────────────────────────────────────────────

test('GET /api/packages returns 200', async ({ request }) => {
  const response = await request.get('/api/packages');
  expect(response.status()).toBe(200);
});

test('GET /api/packages returns an object with packages array', async ({ request }) => {
  const response = await request.get('/api/packages');
  const body = await response.json();
  expect(typeof body).toBe('object');
  expect(Array.isArray(body.packages)).toBe(true);
});

test('GET /api/packages returns at least one package', async ({ request }) => {
  const response = await request.get('/api/packages');
  const body = await response.json();
  expect(body.packages.length).toBeGreaterThan(0);
});

test('GET /api/packages each package has id, name, and price fields', async ({ request }) => {
  const response = await request.get('/api/packages');
  const body = await response.json();
  for (const pkg of body.packages) {
    expect(pkg).toHaveProperty('id');
    expect(pkg).toHaveProperty('name');
    // price or priceIdr
    const hasPrice = 'price' in pkg || 'priceIdr' in pkg || 'price_idr' in pkg;
    expect(hasPrice).toBe(true);
  }
});

// ─── /api/subscriptions ───────────────────────────────────────────────────────

test('GET /api/subscriptions returns 200', async ({ request }) => {
  const response = await request.get('/api/subscriptions');
  expect(response.status()).toBe(200);
});

test('GET /api/subscriptions returns an array or object', async ({ request }) => {
  const response = await request.get('/api/subscriptions');
  const body = await response.json();
  // Could be array or object keyed by plan name
  expect(typeof body === 'object' && body !== null).toBe(true);
});

// ─── /auth/telegram ───────────────────────────────────────────────────────────

test('POST /auth/telegram with missing data returns 400 or 401', async ({ request }) => {
  const response = await request.post('/auth/telegram', {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  });
  expect([400, 401, 403, 422]).toContain(response.status());
});

test('POST /auth/telegram with invalid hash returns 400 or 401', async ({ request }) => {
  const response = await request.post('/auth/telegram', {
    data: {
      id: 123456789,
      first_name: 'Test',
      hash: 'invalid_hash_value',
      auth_date: Math.floor(Date.now() / 1000),
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect([400, 401, 403]).toContain(response.status());
});

test('POST /auth/telegram with tampered data rejects the request', async ({ request }) => {
  // Forged Telegram auth — hash won't match since we don't have the bot secret
  const response = await request.post('/auth/telegram', {
    data: {
      id: 999,
      first_name: 'Hacker',
      username: 'hacker',
      auth_date: Math.floor(Date.now() / 1000).toString(),
      hash: 'aabbccdd1122334455667788aabbccdd1122334455667788aabbccdd11223344',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect([400, 401, 403]).toContain(response.status());
});

// ─── /api/user — requires JWT ─────────────────────────────────────────────────

test('GET /api/user without Authorization header returns 401', async ({ request }) => {
  const response = await request.get('/api/user');
  expect([401, 403]).toContain(response.status());
});

test('GET /api/user with invalid Bearer token returns 401', async ({ request }) => {
  const response = await request.get('/api/user', {
    headers: { Authorization: 'Bearer invalid.jwt.token' },
  });
  expect([401, 403]).toContain(response.status());
});

// ─── /health — smoke test ─────────────────────────────────────────────────────

test('GET /health is publicly accessible and returns healthy', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('healthy');
});

// ─── Content type checks ──────────────────────────────────────────────────────

test('GET /api/packages response has JSON content type', async ({ request }) => {
  const response = await request.get('/api/packages');
  expect(response.headers()['content-type']).toContain('application/json');
});

test('GET /api/subscriptions response has JSON content type', async ({ request }) => {
  const response = await request.get('/api/subscriptions');
  expect(response.headers()['content-type']).toContain('application/json');
});
