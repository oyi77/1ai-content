/**
 * Health endpoint integration tests
 *
 * Verifies /health and related sub-routes return correct shapes.
 * All external dependencies (Redis, DB, queue) are mocked so that the
 * healthy-path tests are deterministic and the degraded-path tests can
 * simulate failures without real infrastructure.
 */

import request from 'supertest';
import fastify from 'fastify';
import crypto from 'crypto';

const ADMIN_TOKEN = crypto
  .createHmac('sha256', 'openclaw-admin-v1')
  .update('test-admin-password')
  .digest('hex');

process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/env', () => ({
  getConfig: jest.fn().mockReturnValue({
    NODE_ENV: 'test',
    ADMIN_PASSWORD: 'test-admin-password',
    BOT_TOKEN: 'test-token:AAtest',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-jwt-secret-for-e2e',
    WEBHOOK_SECRET: 'test-webhook-secret',
    BOT_USERNAME: 'testbot',
    WEBHOOK_URL: 'https://example.com',
    WEB_APP_URL: 'https://example.com',
    FACEBOOK_PIXEL_ID: '',
    GA4_TRACKING_ID: '',
    TIKTOK_PIXEL_ID: '',
  }),
  getConfigForAdmin: jest.fn().mockReturnValue({}),
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    publish: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: { count: jest.fn().mockResolvedValue(0) },
    transaction: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../../src/config/queue', () => ({
  videoQueue: { add: jest.fn() },
  paymentQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
  billingQueue: { add: jest.fn() },
  cleanupQueue: { add: jest.fn() },
  getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
}));

jest.mock('../../src/workers/retention.worker', () => ({
  retentionQueue: { add: jest.fn() },
  RetentionWorker: jest.fn(),
}));

jest.mock('../../src/services/metrics.service', () => ({
  MetricsService: {
    getAll: jest.fn().mockResolvedValue({ metrics: {}, timestamp: new Date().toISOString() }),
  },
}));

let healthCheckRoutes: (server: any) => Promise<void>;
let isolatedRedis: any;
let isolatedPrisma: any;
let isolatedGetQueueStats: jest.Mock;

describe('Health Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      jest.isolateModules(async () => {
        ({ healthCheckRoutes } = require('../../src/routes/health'));
        ({ redis: isolatedRedis } = require('../../src/config/redis'));
        ({ prisma: isolatedPrisma } = require('../../src/config/database'));
        ({ getQueueStats: isolatedGetQueueStats } = require('../../src/config/queue'));
        resolve();
      });
    });

    app = fastify({ logger: false });
    await app.register(healthCheckRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status healthy', async () => {
      const res = await request(app.server).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('returns a timestamp in ISO format', async () => {
      const res = await request(app.server).get('/health');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns version field', async () => {
      const res = await request(app.server).get('/health');
      expect(typeof res.body.version).toBe('string');
    });
  });

  describe('GET /health/db', () => {
    it('returns status healthy when DB query succeeds', async () => {
      isolatedPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app.server).get(`/health/db?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('database');
    });

    it('returns status unhealthy when DB query throws', async () => {
      isolatedPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app.server).get(`/health/db?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200); // route catches and returns 200 with unhealthy body
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /health/redis', () => {
    it('returns status healthy when redis ping succeeds', async () => {
      isolatedRedis.ping.mockResolvedValueOnce('PONG');
      const res = await request(app.server).get(`/health/redis?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('redis');
    });

    it('returns status unhealthy when redis ping throws', async () => {
      isolatedRedis.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app.server).get(`/health/redis?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /health/queue', () => {
    it('returns status healthy with stats when queue check succeeds', async () => {
      isolatedGetQueueStats.mockResolvedValueOnce({ waiting: 1, active: 0, completed: 5, failed: 0 });
      const res = await request(app.server).get(`/health/queue?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.stats).toBeDefined();
    });

    it('returns status unhealthy when queue check throws', async () => {
      isolatedGetQueueStats.mockRejectedValueOnce(new Error('queue unavailable'));
      const res = await request(app.server).get(`/health/queue?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unhealthy');
    });
  });

  describe('GET /health/all', () => {
    it('returns overall status healthy when all dependencies are up', async () => {
      isolatedPrisma.$queryRaw.mockResolvedValueOnce([]);
      isolatedRedis.ping.mockResolvedValueOnce('PONG');
      isolatedGetQueueStats.mockResolvedValueOnce({ waiting: 0, active: 0, completed: 0, failed: 0 });

      const res = await request(app.server).get(`/health/all?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.checks.database.status).toBe('healthy');
      expect(res.body.checks.redis.status).toBe('healthy');
      expect(res.body.checks.queue.status).toBe('healthy');
    });

    it('returns overall status degraded when one dependency is down', async () => {
      isolatedPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
      isolatedRedis.ping.mockResolvedValueOnce('PONG');
      isolatedGetQueueStats.mockResolvedValueOnce({ waiting: 0, active: 0, completed: 0, failed: 0 });

      const res = await request(app.server).get(`/health/all?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.database.status).toBe('unhealthy');
      expect(res.body.checks.redis.status).toBe('healthy');
    });
  });

  describe('GET /health/providers', () => {
    it('returns video and image provider objects', async () => {
      isolatedRedis.get.mockResolvedValue(null);
      const res = await request(app.server).get(`/health/providers?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.video).toBeDefined();
      expect(res.body.image).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /metrics', () => {
    it('returns metrics with timestamp', async () => {
      const res = await request(app.server).get(`/metrics?token=${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
