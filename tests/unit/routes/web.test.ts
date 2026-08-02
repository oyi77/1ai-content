import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import crypto from "crypto";

const mockPrismaVideoCreate = jest.fn();
const mockPrismaVideoFindMany = jest.fn();
const mockPrismaTransactionFindMany = jest.fn();

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/services/omniroute.service", () => ({
  getOmniRouteService: jest.fn(() => ({
    chat: (jest.fn() as any).mockResolvedValue({ success: true, content: "test reply" }),
  })),
}));

jest.mock("@/config/database", () => ({
  prisma: {
    video: { create: mockPrismaVideoCreate, findMany: mockPrismaVideoFindMany },
    transaction: { findMany: mockPrismaTransactionFindMany },
  },
}));

const mockFindByTelegramId = jest.fn();
const mockFindByUuid = jest.fn();
const mockUserCreate = jest.fn();
const mockDeductCredits = jest.fn();

jest.mock("@/services/user.service", () => ({
  UserService: {
    findByTelegramId: mockFindByTelegramId,
    findByUuid: mockFindByUuid,
    create: mockUserCreate,
    deductCredits: mockDeductCredits,
  },
}));

const mockGetByJobId = jest.fn();

jest.mock("@/services/video.service", () => ({
  VideoService: { getByJobId: mockGetByJobId },
}));

const mockGetPackages = jest.fn();
const mockPaymentCreateTransaction = jest.fn();

jest.mock("@/services/payment.service", () => ({
  PaymentService: {
    getPackages: mockGetPackages,
    createTransaction: mockPaymentCreateTransaction,
  },
}));


const mockPaymentSettingsGet = jest.fn();

jest.mock("@/services/payment-settings.service", () => ({
  PaymentSettingsService: {
    get: mockPaymentSettingsGet,
    getEnabledGateways: (() => {
      const fn = jest.fn();
      (fn as any).mockResolvedValue([{ id: "duitku", gateway: "duitku" }]);
      return fn;
    })(),
    getPricingConfig: (jest.fn() as any).mockResolvedValue(null),
  },
}));

const mockRedisGet = (jest.fn() as any).mockResolvedValue(null as any);
const mockRedisSet = (jest.fn() as any).mockResolvedValue("OK" as any);

jest.mock("@/config/redis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

const mockGenerateImage = jest.fn();

jest.mock("@/services/image.service", () => ({
  ImageGenerationService: {
    generateImage: mockGenerateImage,
  },
}));

const mockCheckTelegramHash = jest.fn();

jest.mock("@/utils/telegram", () => ({
  checkTelegramHash: mockCheckTelegramHash,
}));

const mockEnqueueVideoGeneration = jest.fn();

jest.mock("@/config/queue", () => ({
  enqueueVideoGeneration: mockEnqueueVideoGeneration,
}));

const mockGenerateStoryboard = jest.fn();

jest.mock("@/services/video-generation.service", () => ({
  generateStoryboard: mockGenerateStoryboard,
  NICHES: {
    fashion: { styles: ["trendy", "minimal"] },
    food: { styles: ["appetizing", "cozy"] },
  },
}));

const mockGetVideoCreditCost = jest.fn();
const mockGetVideoCreditCostAsync = jest.fn();
const mockGetImageCreditCostAsync = jest.fn();
const mockGetPackagesAsync = jest.fn();
const mockGetSubscriptionPlansAsync = jest.fn();

jest.mock("@/config/pricing", () => ({
  getVideoCreditCost: mockGetVideoCreditCost,
  getVideoCreditCostAsync: mockGetVideoCreditCostAsync,
  getImageCreditCostAsync: mockGetImageCreditCostAsync,
  getPackagesAsync: mockGetPackagesAsync,
  getSubscriptionPlansAsync: mockGetSubscriptionPlansAsync,
  getUnitCostAsync: (jest.fn() as any).mockResolvedValue(10),
  SUBSCRIPTION_PLANS: {
    lite: {
      name: "Lite",
      tier: "basic",
      monthlyCredits: 30,
      monthlyPriceIdr: 49000,
      annualPriceIdr: 490000,
    },
    pro: {
      name: "Pro",
      tier: "pro",
      monthlyCredits: 100,
      monthlyPriceIdr: 99000,
      annualPriceIdr: 990000,
    },
  },
  getPlanPrice: jest.fn().mockReturnValue(49000),
}));

const mockExistsSync = jest.fn();
const mockCreateReadStream = jest.fn();
const mockStatSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: mockExistsSync,
  createReadStream: mockCreateReadStream,
  statSync: mockStatSync,
  readFileSync: jest.fn(),
}));

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.BOT_TOKEN = "test-bot-token";
process.env.NODE_ENV = "test";

import jwt from "jsonwebtoken";
import { webRoutes } from "@/routes/web";

function createMockRequest(
  body: any = {},
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  return { body, headers, params, query };
}

function createMockReply() {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    view: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };
}

function createMockServer() {
  const routes: Record<string, Record<string, Function>> = {
    get: {},
    post: {},
    delete: {},
    patch: {},
    put: {},
  };
  const server = {
    get: jest.fn((path: string, optsOrHandler: any, handler?: Function) => {
      const h = handler || optsOrHandler;
      routes.get[path] = h;
    }),
    post: jest.fn((path: string, optsOrHandler: any, handler?: Function) => {
      const h = handler || optsOrHandler;
      routes.post[path] = h;
    }),
    delete: jest.fn((path: string, optsOrHandler: any, handler?: Function) => {
      const h = handler || optsOrHandler;
      routes.delete[path] = h;
    }),
    patch: jest.fn((path: string, handler: Function) => {
      routes.patch[path] = handler;
    }),
    put: jest.fn((path: string, handler: Function) => {
      routes.put[path] = handler;
    }),
    register: (jest.fn() as any).mockResolvedValue(undefined),
    log: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  };
  return { server, routes };
}

function createValidToken(userId: string = "user-uuid-123") {
  return jwt.sign(
    { userId, telegramId: "123456789", tier: "free" },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
  );
}

function createMockUser(overrides: any = {}) {
  return {
    uuid: "user-uuid-123",
    telegramId: BigInt(123456789),
    username: "testuser",
    firstName: "Test",
    lastName: "User",
    creditBalance: 10,
    tier: "free",
    referralCode: "REF123",
    email: null,
    emailVerifiedAt: null,
    dailyFreeUsed: null,
    dailyFreeResetAt: null,
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Web Routes", () => {
  let server: any;
  let routes: Record<string, Record<string, Function>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockServer = createMockServer();
    server = mockServer.server;
    routes = mockServer.routes;
    await webRoutes(server);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Route Registration", () => {
    it("should register GET / route", () => {
      expect(server.get).toHaveBeenCalledWith("/", expect.any(Function));
    });

    it("should register GET /app route", () => {
      expect(server.get).toHaveBeenCalledWith("/app", expect.any(Function));
    });

    it("should register POST /auth/telegram route", () => {
      expect(server.post).toHaveBeenCalledWith(
        "/auth/telegram",
        expect.any(Function),
      );
    });

    it("should register GET /api/user route", () => {
      expect(server.get).toHaveBeenCalledWith(
        "/api/user",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("should register POST /api/storyboard route", () => {
      expect(server.post).toHaveBeenCalledWith(
        "/api/storyboard",
        expect.any(Function),
      );
    });

    it("should register POST /api/video/create route", () => {
      expect(server.post).toHaveBeenCalledWith(
        "/api/video/create",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("should register GET /api/packages route", () => {
      expect(server.get).toHaveBeenCalledWith(
        "/api/packages",
        expect.any(Function),
      );
    });

    it("should register POST /api/payment/create route", () => {
      expect(server.post).toHaveBeenCalledWith(
        "/api/payment/create",
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("should register GET /api/my/transactions route", () => {
      expect(server.get).toHaveBeenCalledWith(
        "/api/my/transactions",
        expect.any(Function),
      );
    });

    it("should register GET /api/user/videos route", () => {
      expect(server.get).toHaveBeenCalledWith(
        "/api/user/videos",
        expect.any(Function),
      );
    });

    it("should register GET /video/:jobId/download route", () => {
      expect(server.get).toHaveBeenCalledWith(
        "/video/:jobId/download",
        expect.any(Function),
      );
    });
  });

  describe("GET /", () => {
    it("should render landing page", async () => {
      (mockGetPackagesAsync as any).mockResolvedValue([]);
      (mockGetSubscriptionPlansAsync as any).mockResolvedValue({});
      const handler = routes.get["/"];
      const request = createMockRequest();
      const reply = createMockReply();
      await handler(request, reply);
      expect(reply.view).toHaveBeenCalledWith(
        "web/landing.ejs",
        expect.objectContaining({
          landingConfig: expect.any(Object),
          packages: expect.any(Array),
          botUsername: expect.any(String),
        }),
      );
    });
  });

  describe("GET /app", () => {
    it("should redirect to React SPA", async () => {
      const handler = routes.get["/app"];
      const request = createMockRequest();
      const reply = createMockReply();
      await handler(request, reply);
      expect(reply.redirect).toHaveBeenCalledWith("/app/");
    });
  });

  describe("POST /auth/telegram", () => {
    const handler = () => routes.post["/auth/telegram"];

    it("should return 400 when user data is missing", async () => {
      const request = createMockRequest(null);
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid user data" });
    });

    it("should return 400 when user id is missing", async () => {
      const request = createMockRequest({ username: "test" });
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid user data" });
    });

    it("should return 401 when hash verification fails in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        hash: "invalid-hash",
      };
      (mockCheckTelegramHash as any).mockReturnValue(false);
      const request = createMockRequest(userData);
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Auth hash verification failed",
      });
      process.env.NODE_ENV = originalEnv;
    });

    it("should reject hash='twa' bypass (security fix — use initData instead)", async () => {
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        hash: "twa",
      };
      (mockCheckTelegramHash as any).mockReturnValue(false);
      const request = createMockRequest(userData);
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should create new user when not found", async () => {
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        hash: "valid-hash",
      };
      (mockCheckTelegramHash as any).mockReturnValue(true);
      (mockFindByTelegramId as any).mockResolvedValue(null);
      (mockUserCreate as any).mockResolvedValue(
        createMockUser({ telegramId: BigInt(123456789) }),
      );
      const request = createMockRequest(userData);
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockUserCreate).toHaveBeenCalledWith({
        telegramId: BigInt(123456789),
        username: "testuser",
        firstName: "Test",
        lastName: "User",
      });
      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("user");
    });

    it("should return existing user when found", async () => {
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
        hash: "valid-hash",
      };
      (mockCheckTelegramHash as any).mockReturnValue(true);
      (mockFindByTelegramId as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(userData);
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("user");
      expect(result.user).toEqual({
        id: "user-uuid-123",
        credits: 10,
        tier: "free",
      });
    });

    it("should return valid JWT token", async () => {
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        hash: "valid-hash",
      };
      (mockCheckTelegramHash as any).mockReturnValue(true);
      (mockFindByTelegramId as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(userData);
      const reply = createMockReply();
      const result = await handler()(request, reply);
      const decoded = jwt.verify(result.token, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe("user-uuid-123");
      expect(decoded.telegramId).toBe("123456789");
    });

    it("should return 500 on internal error", async () => {
      const userData = {
        id: "123456789",
        username: "testuser",
        first_name: "Test",
        hash: "valid-hash",
      };
      (mockCheckTelegramHash as any).mockReturnValue(true);
      (mockFindByTelegramId as any).mockRejectedValue(
        new Error("Database error"),
      );
      const request = createMockRequest(userData);
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Authentication failed",
      });
    });
  });

  describe("GET /api/user", () => {
    const handler = () => routes.get["/api/user"];

    it("should return 401 when no authorization header", async () => {
      const request = createMockRequest({}, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("should return 401 when authorization header is malformed", async () => {
      const request = createMockRequest({}, { authorization: "InvalidHeader" });
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("should return 401 when token is invalid", async () => {
      const request = createMockRequest(
        {},
        { authorization: "Bearer invalid-token" },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid token" });
    });

    it("should return 404 when user not found", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(null);
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should return user profile when authenticated", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(result).toEqual({
        id: "user-uuid-123",
        telegramId: "123456789",
        username: "testuser",
        firstName: "Test",
        credits: 10,
        tier: "free",
        referralCode: "REF123",
        email: null,
        emailVerified: false,
        dailyFreeUsed: null,
        dailyFreeResetAt: null,
        createdAt: expect.any(Date),
      });
    });
  });

  describe("POST /api/storyboard", () => {
    const handler = () => routes.post["/api/storyboard"];

    it("should return 400 when niche is missing", async () => {
      const request = createMockRequest({ duration: 30 });
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Niche and duration required",
      });
    });

    it("should return 400 when duration is missing", async () => {
      const request = createMockRequest({ niche: "fashion" });
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Niche and duration required",
      });
    });

    it("should generate storyboard for known niche", async () => {
      const mockStoryboard = [
        { duration: 10, description: "Scene 1" },
        { duration: 10, description: "Scene 2" },
        { duration: 10, description: "Scene 3" },
      ];
      (mockGenerateStoryboard as any).mockReturnValue(mockStoryboard);
      const request = createMockRequest({ niche: "fashion", duration: 30 });
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockGenerateStoryboard).toHaveBeenCalledWith(
        "fashion",
        ["trendy", "minimal"],
        30,
        6,
      );
      expect(result.scenes).toHaveLength(3);
      expect(result.caption).toContain("FASHION");
      expect(result.hashtags).toContain("#fashion");
    });

    it("should generate storyboard for unknown niche", async () => {
      const mockStoryboard = [
        { duration: 15, description: "Scene 1" },
        { duration: 15, description: "Scene 2" },
      ];
      (mockGenerateStoryboard as any).mockReturnValue(mockStoryboard);
      const request = createMockRequest({ niche: "tech", duration: 30 });
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockGenerateStoryboard).toHaveBeenCalledWith(
        "tech",
        ["viral"],
        30,
        4,
      );
      expect(result.scenes).toHaveLength(2);
    });

    it("should include custom prompt in scene descriptions", async () => {
      const mockStoryboard = [
        { duration: 15, description: "Original description" },
      ];
      (mockGenerateStoryboard as any).mockReturnValue(mockStoryboard);
      const request = createMockRequest({
        niche: "fashion",
        duration: 30,
        customPrompt: "Show product close-up",
      });
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(result.scenes[0].description).toBe(
        "Show product close-up — Original description",
      );
    });

    it("should return 500 on generation error", async () => {
      (mockGenerateStoryboard as any).mockImplementation(() => {
        throw new Error("Generation failed");
      });
      const request = createMockRequest({ niche: "fashion", duration: 30 });
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Failed to generate storyboard",
      });
    });
  });

  describe("POST /api/video/create", () => {
    const handler = () => routes.post["/api/video/create"];

    it("should return 401 when not authenticated", async () => {
      const request = createMockRequest({}, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when niche is missing", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(
        { duration: 30 },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: "niche and duration required",
      });
    });

    it("should return 400 when duration is missing", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(
        { niche: "fashion" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it("should return 402 when insufficient credits", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(
        createMockUser({ creditBalance: 0 }),
      );
      (mockGetVideoCreditCostAsync as any).mockResolvedValue(5);
      const request = createMockRequest(
        { niche: "fashion", duration: 30 },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(402);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Insufficient credits. Need 5, have 0",
      });
    });

    it("should create video with storyboard scenes", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockGetVideoCreditCostAsync as any).mockResolvedValue(1);
      (mockDeductCredits as any).mockResolvedValue(undefined);
      (mockPrismaVideoCreate as any).mockResolvedValue({});
      (mockEnqueueVideoGeneration as any).mockResolvedValue(undefined);
      const storyboard = {
        scenes: [
          { scene: 1, duration: 15, description: "Scene 1" },
          { scene: 2, duration: 15, description: "Scene 2" },
        ],
      };
      const request = createMockRequest(
        { niche: "fashion", style: "trendy", duration: 30, storyboard },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockDeductCredits).toHaveBeenCalledWith(BigInt(123456789), 1);
      expect(mockPrismaVideoCreate).toHaveBeenCalled();
      expect(mockEnqueueVideoGeneration).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        jobId: expect.stringMatching(/^WEB-/),
        message: "Video generation started",
      });
    });

    it("should create video with custom prompt when no storyboard", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockGetVideoCreditCostAsync as any).mockResolvedValue(1);
      (mockDeductCredits as any).mockResolvedValue(undefined);
      (mockPrismaVideoCreate as any).mockResolvedValue({});
      (mockEnqueueVideoGeneration as any).mockResolvedValue(undefined);
      const request = createMockRequest(
        { niche: "fashion", duration: 30, customPrompt: "Custom video prompt" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPrismaVideoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storyboard: [
              { scene: 1, duration: 30, description: "Custom video prompt" },
            ],
          }),
        }),
      );
      expect(result.ok).toBe(true);
    });

    it("should use default description when no custom prompt", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockGetVideoCreditCostAsync as any).mockResolvedValue(1);
      (mockDeductCredits as any).mockResolvedValue(undefined);
      (mockPrismaVideoCreate as any).mockResolvedValue({});
      (mockEnqueueVideoGeneration as any).mockResolvedValue(undefined);
      const request = createMockRequest(
        { niche: "fashion", duration: 30 },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(mockPrismaVideoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storyboard: [
              {
                scene: 1,
                duration: 30,
                description: "fashion marketing video",
              },
            ],
          }),
        }),
      );
    });

    it("should return 500 on creation error", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockGetVideoCreditCostAsync as any).mockResolvedValue(1);
      (mockDeductCredits as any).mockRejectedValue(new Error("Deduct failed"));
      const request = createMockRequest(
        { niche: "fashion", duration: 30 },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Failed to create video",
      });
    });
  });

  describe("GET /api/packages", () => {
    const handler = () => routes.get["/api/packages"];

    it("should return credit packages", async () => {
      const mockPackages = [
        { id: "starter", name: "Starter", credits: 5, priceIdr: 49000 },
        { id: "growth", name: "Growth", credits: 18, priceIdr: 149000 },
      ];
      (mockGetPackagesAsync as any).mockResolvedValue(mockPackages);
      const request = createMockRequest();
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockGetPackagesAsync).toHaveBeenCalled();
      // Packages endpoint now returns { packages, gateways, unitCosts }
      expect(result).toHaveProperty("packages");
      expect(result.packages).toEqual(mockPackages);
    });
  });

  describe("POST /api/payment/create", () => {
    const handler = () => routes.post["/api/payment/create"];

    it("should return 401 when not authenticated", async () => {
      const request = createMockRequest({}, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 when packageId is missing", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(
        { gateway: "midtrans" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: "packageId and gateway required",
      });
    });

    it("should return 400 when gateway is missing", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const request = createMockRequest(
        { packageId: "starter" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it("should create payment with duitku gateway", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPaymentCreateTransaction as any).mockResolvedValue({
        redirectUrl: "https://duitku.com/pay",
      });
      const request = createMockRequest(
        { packageId: "starter", gateway: "duitku" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPaymentCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: "duitku",
          userId: BigInt(123456789),
          packageId: "starter",
        }),
      );
      expect(result).toEqual(expect.objectContaining({ paymentUrl: "https://duitku.com/pay" }));
    });
    it("should create payment with tripay gateway", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPaymentCreateTransaction as any).mockResolvedValue({
        redirectUrl: "https://tripay.com/pay",
      });
      const request = createMockRequest(
        { packageId: "starter", gateway: "tripay" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPaymentCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ gateway: "tripay" }),
      );
      expect(result).toEqual(expect.objectContaining({ paymentUrl: "https://tripay.com/pay" }));
    });
    it("should create payment with default gateway", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPaymentCreateTransaction as any).mockResolvedValue({
        redirectUrl: "https://default.com/pay",
      });
      const request = createMockRequest(
        { packageId: "starter", gateway: "midtrans" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPaymentCreateTransaction).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ paymentUrl: "https://default.com/pay" }));
    });

    it("should use firstName when username is not available", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(
        createMockUser({ username: null }),
      );
      (mockPaymentCreateTransaction as any).mockResolvedValue({});
      const request = createMockRequest(
        { packageId: "starter", gateway: "midtrans" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(mockPaymentCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ username: "Test" }),
      );
    });

    it("should return 500 on payment error", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPaymentCreateTransaction as any).mockRejectedValue(
        new Error("Payment failed"),
      );
      const request = createMockRequest(
        { packageId: "starter", gateway: "midtrans" },
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Failed to create payment",
      });
    });
  });

  describe("GET /api/my/transactions", () => {
    const handler = () => routes.get["/api/my/transactions"];

    it("should return 401 when not authenticated", async () => {
      const request = createMockRequest({}, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should return transactions when authenticated", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const mockTransactions = [
        { id: 1, amount: 50000, status: "success" },
        { id: 2, amount: 100000, status: "pending" },
      ];
      (mockPrismaTransactionFindMany as any).mockResolvedValue(
        mockTransactions,
      );
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPrismaTransactionFindMany).toHaveBeenCalledWith({
        where: { userId: BigInt(123456789) },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      expect(result).toEqual(mockTransactions);
    });

    it("should return 500 on database error", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPrismaTransactionFindMany as any).mockRejectedValue(
        new Error("DB error"),
      );
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Failed to fetch transactions",
      });
    });
  });

  describe("GET /api/user/videos", () => {
    const handler = () => routes.get["/api/user/videos"];

    it("should return 401 when not authenticated", async () => {
      const request = createMockRequest({}, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should return videos when authenticated", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      const mockVideos = [
        { id: 1, jobId: "JOB-1", status: "completed" },
        { id: 2, jobId: "JOB-2", status: "processing" },
      ];
      (mockPrismaVideoFindMany as any).mockResolvedValue(mockVideos);
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      const result = await handler()(request, reply);
      expect(mockPrismaVideoFindMany).toHaveBeenCalledWith({
        where: { userId: BigInt(123456789) },
        orderBy: { createdAt: "desc" },
        take: 21,
      });
      expect(result).toEqual({
        videos: mockVideos,
        nextCursor: null,
      });
    });

    it("should return 500 on database error", async () => {
      const token = createValidToken();
      (mockFindByUuid as any).mockResolvedValue(createMockUser());
      (mockPrismaVideoFindMany as any).mockRejectedValue(new Error("DB error"));
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${token}` },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Failed to fetch videos",
      });
    });
  });

  describe("GET /video/:jobId/download", () => {
    const handler = () => routes.get["/video/:jobId/download"];

    it("should return 401 when token is missing", async () => {
      const request = createMockRequest({}, {}, { jobId: "JOB-123" }, {});
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Missing token" });
    });

    it("should return 401 when token is an invalid JWT", async () => {
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token: "not.a.valid.jwt" },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid token" });
    });

    it("should return 403 when token jobId does not match param", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-OTHER" },
        process.env.JWT_SECRET!,
      );
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: "Token mismatch" });
    });

    it("should return 404 when video not found", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      (mockGetByJobId as any).mockResolvedValue(null);
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: "Video not found" });
    });

    it("should return 403 when user does not own video", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      (mockGetByJobId as any).mockResolvedValue({
        userId: BigInt(999999999),
        downloadUrl: "/path/to/video.mp4",
      });
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: "Access denied" });
    });

    it("should return 404 when video file not found on disk", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      (mockGetByJobId as any).mockResolvedValue({
        userId: BigInt(123456789),
        downloadUrl: "/path/to/video.mp4",
      });
      (mockExistsSync as any).mockReturnValue(false);
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        error:
          "Video file is no longer available. Please regenerate the video.",
      });
    });

    it("should return 404 when downloadUrl is missing", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      (mockGetByJobId as any).mockResolvedValue({
        userId: BigInt(123456789),
        downloadUrl: null,
      });
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it("should stream video file when valid", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      const mockStream = { pipe: jest.fn() };
      (mockGetByJobId as any).mockResolvedValue({
        userId: BigInt(123456789),
        downloadUrl: "/path/to/video.mp4",
      });
      (mockExistsSync as any).mockReturnValue(true);
      (mockCreateReadStream as any).mockReturnValue(mockStream);
      (mockStatSync as any).mockReturnValue({ size: 1024000 });
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.header).toHaveBeenCalledWith("Content-Type", "video/mp4");
      expect(reply.header).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="berkahkarya-JOB-123.mp4"',
      );
      expect(reply.header).toHaveBeenCalledWith("Content-Length", 1024000);
      expect(reply.send).toHaveBeenCalledWith(mockStream);
    });

    it("should return 500 on unexpected error", async () => {
      const token = jwt.sign(
        { telegramId: "123456789", jobId: "JOB-123" },
        process.env.JWT_SECRET!,
      );
      (mockGetByJobId as any).mockRejectedValue(new Error("Unexpected error"));
      const request = createMockRequest(
        {},
        {},
        { jobId: "JOB-123" },
        { token },
      );
      const reply = createMockReply();
      await handler()(request, reply);
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: "Download failed" });
    });
  });

  describe("Authentication Middleware", () => {
    it("should reject expired tokens", async () => {
      const expiredToken = jwt.sign(
        { userId: "user-uuid-123", telegramId: "123", tier: "free" },
        process.env.JWT_SECRET!,
        { expiresIn: "-1s" },
      );
      const handler = routes.get["/api/user"];
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${expiredToken}` },
      );
      const reply = createMockReply();
      await handler(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid token" });
    });

    it("should reject tokens signed with wrong secret", async () => {
      const wrongToken = jwt.sign(
        { userId: "user-uuid-123", telegramId: "123", tier: "free" },
        "wrong-secret",
        { expiresIn: "7d" },
      );
      const handler = routes.get["/api/user"];
      const request = createMockRequest(
        {},
        { authorization: `Bearer ${wrongToken}` },
      );
      const reply = createMockReply();
      await handler(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });
});
