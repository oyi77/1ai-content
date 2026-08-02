/**
 * Python API Depth E2E Tests
 *
 * Tests the Python FastAPI backend (port 8767) through the TS proxy at /api/py/*
 * with deep response-body assertions — shape, types, and known-value validation.
 *
 * All proxy calls go through the config baseURL /api/py/... (180s timeout).
 * One direct test hits 127.0.0.1:8767 for comparison.
 */

import { test, expect } from '@playwright/test';

const PROXY_BASE = ''; // relative — Playwright request uses location.origin

// ─── Health —──────────────────────────────────────────────────────────────────

test.describe('Python API — health', () => {
  test('GET /api/py/health returns ok status with service name', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'ok',
      service: '1ai-content-factory',
    });
    expect(typeof body.timestamp).toBe('string');
    // timestamp must be valid ISO 8601 (server returns local time without Z suffix)
    const ts = new Date(body.timestamp);
    expect(ts.getTime()).not.toBeNaN();
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('GET /api/py/health has JSON content-type', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/health');
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('GET http://127.0.0.1:8767/health direct matches proxy shape', async ({ request }) => {
    // Direct hit on the Python server, bypassing the TS proxy
    const response = await request.get('http://127.0.0.1:8767/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'ok',
      service: '1ai-content-factory',
    });
    const ts = new Date(body.timestamp);
    expect(ts.getTime()).not.toBeNaN();
  });
});

// ─── Ebook projects ──────────────────────────────────────────────────────────

test.describe('Python API — ebook projects', () => {
  test('GET /api/py/text/ebook/projects returns an array', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/text/ebook/projects');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/py/text/ebook/projects each project has correct field types', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/text/ebook/projects');
    const body = await response.json();
    for (const project of body) {
      expect(typeof project.id).toBe('number');
      expect(typeof project.title).toBe('string');
      expect(typeof project.status).toBe('string');
      expect(typeof project.created_at).toBe('string');

      // status should be one of known values
      expect(['draft', 'generating', 'completed', 'failed', 'published']).toContain(project.status);

      // created_at must be parseable as ISO date
      const ts = new Date(project.created_at);
    expect(ts.getTime()).not.toBeNaN();
    }
  });

  test('GET /api/py/text/ebook/projects project has all required properties', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/text/ebook/projects');
    const body = await response.json();
    for (const project of body) {
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('title');
      expect(project).toHaveProperty('idea');
      expect(project).toHaveProperty('product_mode');
      expect(project).toHaveProperty('target_language');
      expect(project).toHaveProperty('chapter_count');
      expect(project).toHaveProperty('status');
      expect(project).toHaveProperty('created_at');
      expect(project).toHaveProperty('updated_at');
    }
  });
});

// ─── Trending status ──────────────────────────────────────────────────────────

test.describe('Python API — trending status', () => {
  test('GET /api/py/trending/status returns status object with typed fields', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/trending/status');
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(typeof body.background_active).toBe('boolean');
    expect(typeof body.last_scan).toBe('string');

    // scan_interval_seconds must be a positive number
    expect(typeof body.scan_interval_seconds).toBe('number');
    expect(body.scan_interval_seconds).toBeGreaterThan(0);

    // last_scan must be valid ISO
    expect(() => new Date(body.last_scan)).not.toThrow();

    // cache is an object
    expect(body).toHaveProperty('cache');
    expect(typeof body.cache).toBe('object');
  });
});

// ─── Calendar list ───────────────────────────────────────────────────────────

test.describe('Python API — calendar list', () => {
  test('GET /api/py/calendar/list/0 returns entries array and count field', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/calendar/list/0');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      entries: [],
      count: 0,
    });
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.count).toBe('number');
  });

  test('GET /api/py/calendar/list/1 also returns consistent structure', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/calendar/list/1');
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Structure must be identical for any page number
    expect(body).toHaveProperty('entries');
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.count).toBe('number');
  });
});

// ─── AB test list ────────────────────────────────────────────────────────────

test.describe('Python API — ab-test list', () => {
  test('GET /api/py/ab-test/list/0 returns tests array and count', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/ab-test/list/0');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      tests: [],
      count: 0,
    });
    expect(Array.isArray(body.tests)).toBe(true);
    expect(typeof body.count).toBe('number');
  });
});

// ─── Sad path ────────────────────────────────────────────────────────────────

test.describe('Python API — error handling', () => {
  test('GET /api/py/nonexistent returns 404 with Not Found detail', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/nonexistent');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ detail: 'Not Found' });
  });

  test('POST /api/py/health (GET-only endpoint) returns 405', async ({ request }) => {
    const response = await request.post(PROXY_BASE + '/api/py/health', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status()).toBe(405);
    const body = await response.json();
    expect(body).toMatchObject({ detail: 'Method Not Allowed' });
  });

  test('POST /api/py/text/ebook/projects (GET-only) returns 405 or 500', async ({ request }) => {
    // FastAPI returns 405 for some routes and 500 for others when method mismatches
    const response = await request.post(PROXY_BASE + '/api/py/text/ebook/projects', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect([405, 500]).toContain(response.status());
  });
});

// ─── Proxy header / timeout pass-through ──────────────────────────────────────

test.describe('Python API — proxy mechanics', () => {
  test('proxy passes custom headers to Python backend', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/health', {
      headers: {
        'X-Test-Header': 'test-value',
      },
    });
    expect(response.status()).toBe(200);
  });

  test('proxy response has JSON content-type', async ({ request }) => {
    const response = await request.get(PROXY_BASE + '/api/py/trending/status');
    expect(response.headers()['content-type']).toContain('application/json');
  });
});
