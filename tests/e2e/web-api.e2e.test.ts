/**
 * Web API integration tests
 *
 * Verifies the public-facing REST API: packages, subscriptions, auth endpoint,
 * API v1 redirect aliases, and the storyboard preview endpoint.
 *
 * Authenticated endpoints (Bearer JWT) are tested for both the unauthorized
 * path (401) and the shape of a successful response.
 */

import request from 'supertest';
import fastify from 'fastify';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-jwt-secret-for-e2e';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.BOT_TOKEN = 'test-token:AAtest';
process.env.NODE_ENV = 'test';

// ── Mocks ──────────────────────────────────────────────────────────────────

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
    setex: jest.fn(),
    del: jest.fn(),
    publish: jest.fn(),
  },
}));

const mockUser = {
  uuid: 'user-uuid-1',
  telegramId: BigInt(123456789),
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  creditBalance: 100,
  tier: 'free',
  referralCode: 'TESTREF',
  welcomeBonusUsed: false,
  dailyFreeUsed: false,
  dailyFreeResetAt: null,
  createdAt: new Date('2024-01-01'),
};

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockUser),
      update: jest.fn().mockResolvedValue(mockUser),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    video: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    commission: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/config/queue', () => ({
  videoQueue: { add: jest.fn() },
  paymentQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
  billingQueue: { add: jest.fn() },
  cleanupQueue: { add: jest.fn() },
  enqueueVideoGeneration: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/workers/retention.worker', () => ({
  retentionQueue: { add: jest.fn() },
  RetentionWorker: jest.fn(),
}));

jest.mock('../../src/services/user.service', () => ({
  UserService: {
    findByTelegramId: jest.fn().mockResolvedValue(null),
    findByUuid: jest.fn().mockResolvedValue(mockUser),
    create: jest.fn().mockResolvedValue(mockUser),
    getStats: jest.fn().mockResolvedValue({ referralCount: 0, commissionEarned: 0 }),
    deductCredits: jest.fn().mockResolvedValue({}),
    refundCredits: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../src/services/subscription.service', () => ({
  SubscriptionService: {
    getActiveSubscription: jest.fn().mockResolvedValue(null),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/config/pricing', () => ({
  getPackagesAsync: jest.fn().mockResolvedValue([
    { id: 'starter', credits: 50, priceIdr: 25000, bonus: 0 },
    { id: 'pro', credits: 150, priceIdr: 65000, bonus: 10 },
  ]),
  getSubscriptionPlansAsync: jest.fn().mockResolvedValue({
    basic: { name: 'Basic', monthlyCredits: 100, tier: 'basic' },
  }),
  getVideoCreditCostAsync: jest.fn().mockResolvedValue(5),
  getImageCreditCostAsync: jest.fn().mockResolvedValue(2),
  getUnitCostAsync: jest.fn().mockResolvedValue(10),
  SUBSCRIPTION_PLANS: { basic: { monthlyCredits: 100 } },
  getPlanPrice: jest.fn().mockReturnValue(99000),
}));

jest.mock('../../src/services/payment-settings.service', () => ({
  PaymentSettingsService: {
    get: jest.fn().mockResolvedValue(null),
    getAllSettings: jest.fn().mockResolvedValue({}),
    getEnabledGateways: jest.fn().mockResolvedValue([{ id: 'duitku', gateway: 'duitku' }]),
  },
}));

jest.mock('../../src/services/omniroute.service', () => ({
  getOmniRouteService: jest.fn().mockReturnValue({
    chat: jest.fn().mockResolvedValue({ success: true, content: 'Hello!' }),
  }),
}));

// Telegram hash utils — make checkTelegramHash always return false (invalid data)
// so we can test the rejection path cleanly, and override per-test when needed.
jest.mock('../../src/utils/telegram', () => ({
  checkTelegramHash: jest.fn().mockReturnValue(false),
  checkTWAHash: jest.fn().mockReturnValue(false),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUserToken(overrides: Partial<{ userId: string; telegramId: string; tier: string }> = {}): string {
  return jwt.sign(
    {
      userId: overrides.userId ?? mockUser.uuid,
      telegramId: overrides.telegramId ?? mockUser.telegramId.toString(),
      tier: overrides.tier ?? mockUser.tier,
    },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

let webRoutes: (server: any) => Promise<void>;
let isolatedUserService: any;
let isolatedPrisma: any;

describe('Web API Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      jest.isolateModules(async () => {
        ({ webRoutes } = require('../../src/routes/web'));
        ({ UserService: isolatedUserService } = require('../../src/services/user.service'));
        ({ prisma: isolatedPrisma } = require('../../src/config/database'));
        resolve();
      });
    });

    app = fastify({ logger: false });
    // Minimal view decorator so the landing page GET / doesn't crash
    app.decorateReply('view', function (this: any, _template: string, _data: any) {
      return this.send('<html>landing</html>');
    });
    await app.register(webRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── GET /api/packages ──

  describe('GET /api/packages', () => {
    it('returns packages with gateways and unit costs', async () => {
      const res = await request(app.server).get('/api/packages');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('packages');
      expect(Array.isArray(res.body.packages)).toBe(true);
    });

    it('each package has id, credits, and priceIdr fields', async () => {
      const res = await request(app.server).get('/api/packages');
      const pkg = res.body.packages[0];
      expect(pkg).toHaveProperty('id');
      expect(pkg).toHaveProperty('credits');
      expect(pkg).toHaveProperty('priceIdr');
    });
  });

  // ── GET /api/subscriptions ──

  describe('GET /api/subscriptions', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app.server).get('/api/subscriptions');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const res = await request(app.server)
        .get('/api/subscriptions')
        .set('Authorization', 'Bearer not.a.valid.token');
      expect(res.status).toBe(401);
    });

    it('returns plans and current when a valid JWT is supplied', async () => {
      isolatedUserService.findByUuid.mockResolvedValueOnce(mockUser);
      const token = makeUserToken();
      const res = await request(app.server)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.plans).toBeDefined();
      expect(res.body.current).toBeNull();
    });
  });

  // ── POST /auth/telegram ──

  describe('POST /auth/telegram', () => {
    it('returns 400 when body has no id field', async () => {
      const res = await request(app.server)
        .post('/auth/telegram')
        .send({ username: 'noId' });
      expect(res.status).toBe(400);
    });

    it('returns 401 when Telegram hash verification fails', async () => {
      const res = await request(app.server)
        .post('/auth/telegram')
        .send({ id: 123456789, username: 'test', hash: 'invalid-hash' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid TWA initData', async () => {
      const res = await request(app.server)
        .post('/auth/telegram')
        .send({ initData: 'invalid_twa_data' });
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/user (Bearer-auth required) ──

  describe('GET /api/user', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app.server).get('/api/user');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const res = await request(app.server)
        .get('/api/user')
        .set('Authorization', 'Bearer not.a.valid.token');
      expect(res.status).toBe(401);
    });

    it('returns user profile when a valid JWT is supplied', async () => {
      isolatedUserService.findByUuid.mockResolvedValueOnce(mockUser);
      const token = makeUserToken();
      const res = await request(app.server)
        .get('/api/user')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(mockUser.uuid);
      expect(res.body).toHaveProperty('credits');
    });
  });

  // ── POST /api/storyboard ──

  describe('POST /api/storyboard', () => {
    it('returns 400 when niche is missing', async () => {
      const res = await request(app.server)
        .post('/api/storyboard')
        .send({ duration: 30 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when duration is missing', async () => {
      const res = await request(app.server)
        .post('/api/storyboard')
        .send({ niche: 'fitness' });
      expect(res.status).toBe(400);
    });

    it('returns scenes array when niche and duration are provided', async () => {
      const res = await request(app.server)
        .post('/api/storyboard')
        .send({ niche: 'fitness', duration: 30 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.scenes)).toBe(true);
    });
  });

  // ── GET /api/v1/* redirect aliases ──

  describe('GET /api/v1/* redirect aliases', () => {
    it('GET /api/v1/packages redirects 301 to /api/packages', async () => {
      const res = await request(app.server).get('/api/v1/packages');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/api/packages');
    });

    it('GET /api/v1/subscriptions redirects 301 to /api/subscriptions', async () => {
      const res = await request(app.server).get('/api/v1/subscriptions');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/api/subscriptions');
    });
  });

  // ── POST /api/v1/* redirect aliases ──

  describe('POST /api/v1/* redirect aliases', () => {
    it('POST /api/v1/storyboard redirects 307 preserving method', async () => {
      const res = await request(app.server)
        .post('/api/v1/storyboard')
        .send({ niche: 'food', duration: 15 });
      // 307 means redirect with same method
      expect(res.status).toBe(307);
      expect(res.headers.location).toBe('/api/storyboard');
    });
  });

  // ── POST /api/chat/landing ──

  describe('POST /api/chat/landing', () => {
    it('returns 400 when message is empty', async () => {
      const res = await request(app.server)
        .post('/api/chat/landing')
        .send({ message: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds 1000 chars', async () => {
      const res = await request(app.server)
        .post('/api/chat/landing')
        .send({ message: 'x'.repeat(1001) });
      expect(res.status).toBe(400);
    });

    it('returns reply and sessionId for a valid message', async () => {
      const res = await request(app.server)
        .post('/api/chat/landing')
        .send({ message: 'Hello, what can you do?' });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
    });
  });

  // ── GET /public/:filename — path traversal guard ──

  describe('GET /public/:filename', () => {
    it('returns 404 for path traversal attempts', async () => {
      const res = await request(app.server).get('/public/..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(404);
    });
  });
});
