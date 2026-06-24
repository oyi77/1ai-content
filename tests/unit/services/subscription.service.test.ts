/**
 * Comprehensive Unit Tests — SubscriptionService
 *
 * Tests for:
 * - setBotInstance: stores and overwrites the static bot reference
 * - createSubscription: monthly/annual billing, cancel existing, credit grant, tier mapping, plan-not-found
 * - cancelSubscription: sets cancelAtPeriodEnd on active subs
 * - renewSubscription: period extension, credit grant, rollover, transaction audit, edge cases
 * - getActiveSubscription: lookup by telegramId, null when none active
 * - isSubscribed: active+within-period, expired-period, null sub
 * - checkExpiredSubscriptions: cancelled expiry, auto-renewal notify, manual expiry, errors, empty
 * - getDailyGenerationCount: counts today's videos
 * - canGenerate: user not found, no sub, no credits, daily limit, with sub allowed, plan fallback
 */
import { SubscriptionService } from "@/services/subscription.service";
import { getSubscriptionPlansAsync } from "@/config/pricing";

// ── Mocks ──

const mockTransactionUser = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const mockTransactionSubscription = {
  update: jest.fn(),
};
const mockTransactionTransaction = {
  create: jest.fn(),
};
const mockTransactionContext = {
  user: mockTransactionUser,
  subscription: mockTransactionSubscription,
  transaction: mockTransactionTransaction,
};

const mockPrisma = {
  subscription: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  video: {
    count: jest.fn(),
  },
  transaction: {
    create: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(
    (callback: (tx: typeof mockTransactionContext) => unknown) =>
      callback(mockTransactionContext),
  ),
  $executeRaw: jest.fn().mockResolvedValue(0),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockSendMessage = jest.fn().mockResolvedValue(undefined);

jest.mock("@/config/database", () => ({
  get prisma() {
    return mockPrisma;
  },
}));

jest.mock("@/utils/logger", () => ({
  get logger() {
    return mockLogger;
  },
}));

jest.mock("@/config/pricing", () => ({
  ...(jest.requireActual("@/config/pricing") as unknown as Record<string, unknown>),
  getSubscriptionPlansAsync: jest.fn(),
}));
const mockGetSubscriptionPlansAsync =
  getSubscriptionPlansAsync as jest.MockedFunction<typeof getSubscriptionPlansAsync>;

jest.mock("@/i18n/translations", () => ({
  t: jest.fn((key: string) => key),
}));

jest.mock("telegraf", () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    telegram: { sendMessage: mockSendMessage },
  })),
}));

// ── Helpers ──

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(1),
    userId: BigInt(12345),
    plan: "lite",
    billingCycle: "monthly",
    status: "active",
    currentPeriodStart: new Date("2025-01-01"),
    currentPeriodEnd: new Date("2099-12-31"),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    telegramId: BigInt(12345),
    tier: "free",
    creditBalance: 5,
    creditExpiresAt: null,
    subscriptionCredits: 0,
    ...overrides,
  };
}

// ── Tests ──

describe("SubscriptionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubscriptionPlansAsync.mockResolvedValue({
      lite: { name: "Lite", monthlyCredits: 10, tier: "basic", dailyGenerationLimit: 5 },
      pro: { name: "Pro", monthlyCredits: 30, tier: "pro", dailyGenerationLimit: 10 },
      agency: { name: "Agency", monthlyCredits: 100, tier: "agency", dailyGenerationLimit: 30 },
    });
  });

  // ────────────────────────────────────────────────────────────
  // setBotInstance
  // ────────────────────────────────────────────────────────────

  describe("setBotInstance()", () => {
    it("should store the bot instance", () => {
      const bot = {} as InstanceType<
        typeof import("telegraf").Telegraf
      >;
      expect(() => SubscriptionService.setBotInstance(bot)).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────
  // createSubscription
  // ────────────────────────────────────────────────────────────

  describe("createSubscription()", () => {
    it("should create a monthly subscription with correct credits and tier", async () => {
      const telegramId = BigInt(12345);
      const mockSub = makeSubscription({ plan: "lite", billingCycle: "monthly" });

      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.subscription.create.mockResolvedValue(mockSub);
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await SubscriptionService.createSubscription(
        telegramId, "lite", "monthly", "tx_123",
      );

      expect(mockGetSubscriptionPlansAsync).toHaveBeenCalled();
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: telegramId, status: "active" },
        data: { status: "cancelled", cancelledAt: expect.any(Date) },
      });
      expect(mockPrisma.subscription.create).toHaveBeenCalledWith({
        data: {
          userId: telegramId,
          plan: "lite",
          billingCycle: "monthly",
          status: "active",
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
          cancelAtPeriodEnd: false,
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId },
        data: expect.objectContaining({
          tier: "basic",
          creditBalance: { increment: 10 },
        }),
      });
      expect(result).toEqual(mockSub);
    });

    it("should grant 12x credits and annual period end for annual billing", async () => {
      const telegramId = BigInt(12345);
      const mockSub = makeSubscription({ plan: "pro", billingCycle: "annual" });

      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.subscription.create.mockResolvedValue(mockSub);
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await SubscriptionService.createSubscription(
        telegramId, "pro", "annual", "tx_annual",
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId },
        data: expect.objectContaining({
          tier: "pro",
          creditBalance: { increment: 360 },
        }),
      });
    });

    it("should cancel existing active subscriptions before creating new one", async () => {
      const telegramId = BigInt(12345);
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.subscription.create.mockResolvedValue(makeSubscription());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await SubscriptionService.createSubscription(
        telegramId, "lite", "monthly", "tx_456",
      );

      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: telegramId, status: "active" },
          data: { status: "cancelled", cancelledAt: expect.any(Date) },
        }),
      );
    });

    it("should update subscription credits via raw SQL", async () => {
      const telegramId = BigInt(12345);
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.subscription.create.mockResolvedValue(makeSubscription());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await SubscriptionService.createSubscription(
        telegramId, "lite", "monthly", "tx_raw",
      );

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it("should throw NotFoundError for unknown plan", async () => {
      mockGetSubscriptionPlansAsync.mockResolvedValue({
        lite: { name: "Lite", monthlyCredits: 10, tier: "basic" },
      });

      await expect(
        SubscriptionService.createSubscription(BigInt(1), "pro", "monthly", "tx"),
      ).rejects.toThrow();
    });

    it("should fall back tier to 'basic' for unknown plan keys when tier not in config", async () => {
      mockGetSubscriptionPlansAsync.mockResolvedValue({
        lite: { name: "Lite", monthlyCredits: 10 }, // no tier field
      });
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.subscription.create.mockResolvedValue(makeSubscription());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await SubscriptionService.createSubscription(
        BigInt(12345), "lite", "monthly", "tx_fallback",
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId: BigInt(12345) },
        data: expect.objectContaining({ tier: "basic" }),
      });
    });

    it("should return the created subscription object", async () => {
      const mockSub = makeSubscription({ id: BigInt(42), plan: "agency" });
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.subscription.create.mockResolvedValue(mockSub);
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await SubscriptionService.createSubscription(
        BigInt(12345), "agency", "annual", "tx_return",
      );

      expect(result).toBe(mockSub);
      expect(result.id).toBe(BigInt(42));
    });
  });

  // ────────────────────────────────────────────────────────────
  // cancelSubscription
  // ────────────────────────────────────────────────────────────

  describe("cancelSubscription()", () => {
    it("should set cancelAtPeriodEnd on active subscriptions", async () => {
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

      await SubscriptionService.cancelSubscription(BigInt(12345));

      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: BigInt(12345), status: "active" },
        data: { cancelAtPeriodEnd: true },
      });
    });

    it("should log the cancellation", async () => {
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

      await SubscriptionService.cancelSubscription(BigInt(999));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("cancellation scheduled"),
      );
    });

    it("should propagate prisma errors", async () => {
      mockPrisma.subscription.updateMany.mockRejectedValue(new Error("DB error"));

      await expect(
        SubscriptionService.cancelSubscription(BigInt(1)),
      ).rejects.toThrow("DB error");
    });
  });

  // ────────────────────────────────────────────────────────────
  // renewSubscription
  // ────────────────────────────────────────────────────────────

  describe("renewSubscription()", () => {
    it("should renew a monthly subscription with correct period and credits", async () => {
      const sub = makeSubscription({
        id: BigInt(10),
        userId: BigInt(100),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodStart: new Date("2025-01-01"),
        currentPeriodEnd: new Date("2025-01-31"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 5,
        subscriptionCredits: 0,
      });

      await SubscriptionService.renewSubscription(BigInt(10));

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockTransactionSubscription.update).toHaveBeenCalledWith({
        where: { id: sub.id },
        data: expect.objectContaining({
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodStart: new Date("2025-01-31"),
        }),
      });
      expect(mockTransactionUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionCredits: 10,
          }),
        }),
      );
    });

    it("should extend by 1 year for annual subscriptions", async () => {
      const sub = makeSubscription({
        id: BigInt(11),
        userId: BigInt(101),
        plan: "pro",
        billingCycle: "annual",
        currentPeriodStart: new Date("2024-06-01"),
        currentPeriodEnd: new Date("2025-06-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 10,
        subscriptionCredits: 5,
      });

      await SubscriptionService.renewSubscription(BigInt(11));

      const updateCall = mockTransactionSubscription.update.mock.calls[0]?.[0];
      const newEnd = updateCall?.data?.currentPeriodEnd as Date;
      expect(newEnd.getFullYear()).toBe(2026);
      expect(newEnd.getMonth()).toBe(5); // June
    });

    it("should grant annual credits (monthlyCredits * 12)", async () => {
      const sub = makeSubscription({
        id: BigInt(12),
        userId: BigInt(102),
        plan: "pro",
        billingCycle: "annual",
        currentPeriodEnd: new Date("2025-06-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 10,
        subscriptionCredits: 5,
      });

      await SubscriptionService.renewSubscription(BigInt(12));

      expect(mockTransactionUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditBalance: { increment: expect.any(Object) },
            subscriptionCredits: 360,
          }),
        }),
      );
    });

    it("should not renew if subscription not found", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await SubscriptionService.renewSubscription(BigInt(999));

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should not renew if subscription is not active", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(
        makeSubscription({ status: "expired" }),
      );

      await SubscriptionService.renewSubscription(BigInt(1));

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should not renew if plan config not found", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(
        makeSubscription({ plan: "unknown_plan" }),
      );
      mockGetSubscriptionPlansAsync.mockResolvedValue({});

      await SubscriptionService.renewSubscription(BigInt(1));

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should handle zero rollover (no transaction audit)", async () => {
      const sub = makeSubscription({
        id: BigInt(20),
        userId: BigInt(200),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 5,
        subscriptionCredits: 0,
      });

      await SubscriptionService.renewSubscription(BigInt(20));

      expect(mockTransactionTransaction.create).not.toHaveBeenCalled();
      expect(mockTransactionUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionCredits: 10,
          }),
        }),
      );
    });

    it("should calculate rollover as 20% of unused sub credits capped at monthlyCredits", async () => {
      const sub = makeSubscription({
        id: BigInt(21),
        userId: BigInt(201),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      // 8 subscription credits, 10 balance → unusedSub = min(8,10) = 8
      // rollover = floor(min(8, 10) * 0.2) = floor(1.6) = 1
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 10,
        subscriptionCredits: 8,
      });

      await SubscriptionService.renewSubscription(BigInt(21));

      // 10 + 1 = 11
      expect(mockTransactionUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditBalance: { increment: expect.any(Object) },
            subscriptionCredits: 10,
          }),
        }),
      );
      expect(mockTransactionTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "credit_rollover",
            creditsAmount: 1,
            userId: BigInt(201),
            gateway: "system",
            status: "success",
          }),
        }),
      );
      const createArg = mockTransactionTransaction.create.mock.calls[0]?.[0] as Record<string, Record<string, unknown>> | undefined;
      expect(String(createArg?.data?.orderId)).toMatch(/^ROLLOVER-201-\d+$/);
    });

    it("should cap rollover at monthlyCredits even if unusedSub exceeds it", async () => {
      const sub = makeSubscription({
        id: BigInt(22),
        userId: BigInt(202),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      // 100 sub credits, 100 balance → unusedSub = 100
      // rollover = floor(min(100, 10) * 0.2) = floor(2) = 2
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 100,
        subscriptionCredits: 100,
      });

      await SubscriptionService.renewSubscription(BigInt(22));

      expect(mockTransactionTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditsAmount: 2,
          }),
        }),
      );
    });

    it("should handle null subscriptionCredits as 0", async () => {
      const sub = makeSubscription({
        id: BigInt(23),
        userId: BigInt(203),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 5,
        subscriptionCredits: null,
      });

      await SubscriptionService.renewSubscription(BigInt(23));

      // rollover = 0, grant = 10
      expect(mockTransactionTransaction.create).not.toHaveBeenCalled();
    });

    it("should handle missing user in transaction (fallback to 0)", async () => {
      const sub = makeSubscription({
        id: BigInt(24),
        userId: BigInt(204),
        plan: "lite",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue(null);

      await SubscriptionService.renewSubscription(BigInt(24));

      expect(mockTransactionTransaction.create).not.toHaveBeenCalled();
      expect(mockTransactionUser.update).toHaveBeenCalled();
    });

    it("should log the renewal", async () => {
      const sub = makeSubscription({
        id: BigInt(25),
        userId: BigInt(205),
        plan: "pro",
        billingCycle: "monthly",
        currentPeriodEnd: new Date("2025-02-01"),
      });
      mockPrisma.subscription.findUnique.mockResolvedValue(sub);
      mockTransactionUser.findUnique.mockResolvedValue({
        creditBalance: 5,
        subscriptionCredits: 0,
      });

      await SubscriptionService.renewSubscription(BigInt(25));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Subscription renewed"),
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // getActiveSubscription
  // ────────────────────────────────────────────────────────────

  describe("getActiveSubscription()", () => {
    it("should return the active subscription for a user", async () => {
      const mockSub = makeSubscription({ plan: "pro" });
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSub);

      const result = await SubscriptionService.getActiveSubscription(BigInt(12345));

      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { userId: BigInt(12345), status: "active" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual(mockSub);
    });

    it("should return null when no active subscription exists", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await SubscriptionService.getActiveSubscription(BigInt(999));

      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────
  // isSubscribed
  // ────────────────────────────────────────────────────────────

  describe("isSubscribed()", () => {
    it("should return true for active subscription within period", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(
        makeSubscription({ currentPeriodEnd: new Date("2099-12-31") }),
      );

      const result = await SubscriptionService.isSubscribed(BigInt(12345));

      expect(result).toBe(true);
    });

    it("should return false when no active subscription exists", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await SubscriptionService.isSubscribed(BigInt(999));

      expect(result).toBe(false);
    });

    it("should return false when period has expired", async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(
        makeSubscription({ currentPeriodEnd: new Date("2020-01-01") }),
      );

      const result = await SubscriptionService.isSubscribed(BigInt(12345));

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // checkExpiredSubscriptions
  // ────────────────────────────────────────────────────────────

  describe("checkExpiredSubscriptions()", () => {
    it("should expire cancelled subscriptions and remove sub credits", async () => {
      const sub = makeSubscription({
        id: BigInt(50),
        userId: BigInt(500),
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([sub]) // expiredCancelled
        .mockResolvedValueOnce([]);   // dueForRenewal
      mockPrisma.subscription.update.mockResolvedValue(sub);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: BigInt(1),
        creditBalance: 15,
        subscriptionCredits: 10,
      });
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const count = await SubscriptionService.checkExpiredSubscriptions();

      expect(count).toBe(1);
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: sub.id },
        data: { status: "expired" },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId: BigInt(500) },
        data: {
          creditBalance: { decrement: 10 },
          tier: "free",
          creditExpiresAt: null,
        },
      });
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it("should cap sub credit removal at user's creditBalance", async () => {
      const sub = makeSubscription({
        id: BigInt(51),
        userId: BigInt(501),
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([sub])
        .mockResolvedValueOnce([]);
      mockPrisma.subscription.update.mockResolvedValue(sub);
      // 5 sub credits, 3 balance → decrement 3
      mockPrisma.user.findUnique.mockResolvedValue({
        id: BigInt(1),
        creditBalance: 3,
        subscriptionCredits: 5,
      });
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await SubscriptionService.checkExpiredSubscriptions();

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId: BigInt(501) },
        data: {
          creditBalance: { decrement: 3 },
          tier: "free",
          creditExpiresAt: null,
        },
      });
    });

    it("should send renewal prompt for auto-renewal users", async () => {
      const sub = makeSubscription({
        id: BigInt(52),
        userId: BigInt(502),
        plan: "pro",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub]);
      mockPrisma.user.findUnique.mockResolvedValue({
        telegramId: BigInt(502),
        autoRenewal: true,
        creditBalance: 5,
        language: "en",
      });

      const count = await SubscriptionService.checkExpiredSubscriptions();

      expect(count).toBe(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("subscription.renewal_prompt"),
        expect.objectContaining({
          parse_mode: "Markdown",
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        }),
      );
    });

    it("should expire non-auto-renewal subscriptions", async () => {
      const sub = makeSubscription({
        id: BigInt(53),
        userId: BigInt(503),
        plan: "lite",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub]);
      mockPrisma.user.findUnique.mockResolvedValue({
        telegramId: BigInt(503),
        autoRenewal: false,
        creditBalance: 5,
        language: "en",
      });
      mockPrisma.subscription.update.mockResolvedValue(sub);
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const count = await SubscriptionService.checkExpiredSubscriptions();

      expect(count).toBe(1);
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: sub.id },
        data: { status: "expired" },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { telegramId: BigInt(503) },
        data: { tier: "free", creditExpiresAt: null },
      });
    });

    it("should not expire subscription when autoRenewal is enabled (sends prompt instead)", async () => {
      const sub = makeSubscription({
        id: BigInt(54),
        userId: BigInt(504),
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub]);
      mockPrisma.user.findUnique.mockResolvedValue({
        telegramId: BigInt(504),
        autoRenewal: true,
        creditBalance: 5,
        language: "id",
      });

      await SubscriptionService.checkExpiredSubscriptions();

      // Should NOT call subscription.update to expire
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it("should handle errors in renewal processing gracefully", async () => {
      const sub = makeSubscription({
        id: BigInt(55),
        userId: BigInt(505),
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub]);
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB down"));

      const count = await SubscriptionService.checkExpiredSubscriptions();

      // Still counted even though it errored
      expect(count).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to process renewal"),
        expect.any(Error),
      );
    });

    it("should return 0 when no subscriptions need processing", async () => {
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const count = await SubscriptionService.checkExpiredSubscriptions();

      expect(count).toBe(0);
    });

    it("should process multiple cancelled and renewal subs in one pass", async () => {
      const cancelledSub = makeSubscription({
        id: BigInt(60),
        userId: BigInt(600),
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      const renewalSub = makeSubscription({
        id: BigInt(61),
        userId: BigInt(601),
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([cancelledSub])
        .mockResolvedValueOnce([renewalSub]);
      mockPrisma.subscription.update.mockResolvedValue(cancelledSub);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: BigInt(1),
          creditBalance: 10,
          subscriptionCredits: 5,
        })
        .mockResolvedValueOnce({
          telegramId: BigInt(601),
          autoRenewal: false,
          creditBalance: 5,
          language: "en",
        });
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const count = await SubscriptionService.checkExpiredSubscriptions();

      expect(count).toBe(2);
    });

    it("should default language to 'id' when user has no language set", async () => {
      const sub = makeSubscription({
        id: BigInt(62),
        userId: BigInt(602),
        plan: "pro",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2020-01-01"),
      });
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub]);
      mockPrisma.user.findUnique.mockResolvedValue({
        telegramId: BigInt(602),
        autoRenewal: true,
        creditBalance: 5,
        language: null,
      });

      await SubscriptionService.checkExpiredSubscriptions();

      const { t } = require("@/i18n/translations");
      expect(t).toHaveBeenCalledWith(
        "subscription.renewal_prompt",
        "id",
        expect.any(Object),
      );
    });

    it("should log processing counts", async () => {
      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await SubscriptionService.checkExpiredSubscriptions();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processed"),
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // getDailyGenerationCount
  // ────────────────────────────────────────────────────────────

  describe("getDailyGenerationCount()", () => {
    it("should count videos created today", async () => {
      mockPrisma.video.count.mockResolvedValue(3);

      const result = await SubscriptionService.getDailyGenerationCount(BigInt(12345));

      expect(mockPrisma.video.count).toHaveBeenCalledWith({
        where: {
          userId: BigInt(12345),
          createdAt: { gte: expect.any(Date) },
        },
      });
      expect(result).toBe(3);
    });

    it("should return 0 when no videos today", async () => {
      mockPrisma.video.count.mockResolvedValue(0);

      const result = await SubscriptionService.getDailyGenerationCount(BigInt(12345));

      expect(result).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // canGenerate
  // ────────────────────────────────────────────────────────────

  describe("canGenerate()", () => {
    it("should return not allowed when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await SubscriptionService.canGenerate(BigInt(999));

      expect(result).toEqual({ allowed: false, reason: "User not found" });
    });

    describe("non-subscribed user", () => {
      it("should deny when no credits and no subscription", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 0 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(null);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("No credits");
      });

      it("allow when credits available and no subscription", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 10 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(null);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result).toEqual({ allowed: true });
      });
    });

    describe("subscribed user", () => {
      it("allow when under daily limit and has credits", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 10 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(makeSubscription({ plan: "pro" }));
        mockPrisma.video.count.mockResolvedValue(5);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result).toEqual({ allowed: true });
      });

      it("deny when daily limit reached", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 10 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(makeSubscription({ plan: "pro" }));
        mockPrisma.video.count.mockResolvedValue(10);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Daily limit reached (10/Pro plan)");
      });

      it("deny when under daily limit but no credits", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 0 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(makeSubscription({ plan: "pro" }));
        mockPrisma.video.count.mockResolvedValue(0);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("No credits remaining");
      });

      it("allow when plan config not found (unmapped plan)", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 10 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(
          makeSubscription({ plan: "unknown_plan" }),
        );
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result).toEqual({ allowed: true });
      });

      it("allow when under daily limit and has credits (agency plan)", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 50 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(
          makeSubscription({ plan: "agency" }),
        );
        mockPrisma.video.count.mockResolvedValue(15);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result).toEqual({ allowed: true });
      });

      it("should use default daily limit of 10 when config has none", async () => {
        mockGetSubscriptionPlansAsync.mockResolvedValue({
          lite: { name: "Lite", monthlyCredits: 10, tier: "basic" },
        });
        mockPrisma.user.findUnique.mockResolvedValue(makeUser({ creditBalance: 10 }));
        mockPrisma.subscription.findFirst.mockResolvedValue(makeSubscription({ plan: "lite" }));
        mockPrisma.video.count.mockResolvedValue(10);

        const result = await SubscriptionService.canGenerate(BigInt(12345));

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("10/Lite plan");
      });
    });
  });
});
