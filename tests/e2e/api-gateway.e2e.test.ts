/**
 * API Gateway rate-limit integration tests
 *
 * The agency (/api/agency/*) and content REST (/api/content/*) surfaces share a
 * 120 req/min sliding-window IP limiter attached in src/routes/api-gateway.ts.
 * This spec proves the limiter lets requests through under the budget, 429s
 * past it, and that both route groups mount behind the same hook.
 *
 * No live Redis/Postgres: env, redis, prisma and the queue are module-level
 * mocks mirroring tests/e2e/admin-auth.e2e.test.ts, with the zset pipeline
 * methods the sliding-window limiter uses (zremrangebyscore/zcard/zadd/pexpire/exec)
 * plus redis.zrange for the 429 branch. RATE_LIMIT_DISABLED is deliberately NOT
 * set — that flag is a Playwright webServer-only escape hatch.
 */

import request from "supertest";
import fastify from "fastify";

process.env.NODE_ENV = "test";

jest.mock("../../src/config/env", () => ({
  getConfig: jest.fn().mockReturnValue({
    NODE_ENV: "test",
    ADMIN_PASSWORD: "test-admin-password",
    BOT_TOKEN: "test-token:AAtest",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "test-jwt-secret-for-e2e",
    WEBHOOK_SECRET: "test-webhook-secret",
    BOT_USERNAME: "testbot",
    WEBHOOK_URL: "https://example.com",
    WEB_APP_URL: "https://example.com",
  }),
  getConfigForAdmin: jest.fn().mockReturnValue({}),
}));

jest.mock("../../src/config/redis", () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn(),
    zrange: jest.fn().mockResolvedValue([]),
    pipeline: jest.fn().mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([null, [null, 0]]),
    }),
  },
}));

jest.mock("../../src/config/database", () => ({
  prisma: {
    user: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    apiKey: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transaction: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountIdr: 0 } }),
    },
    video: { count: jest.fn().mockResolvedValue(0) },
    paymentSettings: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pricingConfig: { findMany: jest.fn().mockResolvedValue([]) },
    providerHealth: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../src/config/queue", () => ({
  videoQueue: { add: jest.fn() },
  paymentQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
  billingQueue: { add: jest.fn() },
  cleanupQueue: { add: jest.fn() },
  addNotificationJob: jest.fn(),
  getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
}));

jest.mock("../../src/services/ebook.service", () => ({
  ebookService: { healthCheck: jest.fn().mockResolvedValue(true) },
}));

describe("API Gateway Rate Limit", () => {
  let app: ReturnType<typeof fastify>;
  let isolatedRedis: any;

  beforeAll(async () => {
    let apiGatewayRoutes: any;
    await new Promise<void>((resolve) => {
      // Both must come from the SAME isolated module registry: the gateway
      // plugin's closure captures the redis mock it was built against, so the
      // per-test pipeline swaps on isolatedRedis only take effect when the
      // plugin is required here too (mirrors admin-auth.e2e.test.ts:97-103).
      jest.isolateModules(() => {
        ({ redis: isolatedRedis } = require("../../src/config/redis"));
        ({ apiGatewayRoutes } = require("../../src/routes/api-gateway"));
        resolve();
      });
    });

    app = fastify({ logger: false });
    await app.register(apiGatewayRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lets requests through under the 120/min budget", async () => {
    isolatedRedis.pipeline.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([null, [null, 3]]),
    });

    const res = await request(app.server).get("/api/content/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.services.ebook).toBe(true);
    expect(res.headers["x-ratelimit-limit"]).toBe("120");
  });

  it("returns 429 past the 120 req/min IP budget", async () => {
    isolatedRedis.pipeline.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([null, [null, 120]]),
    });
    isolatedRedis.zrange.mockResolvedValue(["1710000000000-abc", "1710000000000"]);

    const res = await request(app.server).get("/api/content/health");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Too many requests/i);
  });

  it("mounts the agency tier behind the same limiter (401 without API key)", async () => {
    isolatedRedis.pipeline.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([null, [null, 0]]),
    });

    const res = await request(app.server).get("/api/agency/keys");
    expect(res.status).toBe(401);
  });
});