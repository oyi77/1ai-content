/**
 * Unit Tests — PaymentService
 *
 * Comprehensive test coverage for 1ai-payment API integration.
 * Tests all exported methods, edge cases, and error scenarios.
 */

import crypto from "crypto";
import type { Telegraf } from "telegraf";

// ── Types for mock functions ──

type MockFn = jest.Mock;

// ── Mocks ──

// Mock Prisma client
const mockPrisma = {
  transaction: {
    create: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn,
  },
  user: {
    update: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
  },
  pricingConfig: {
    findMany: jest.fn().mockResolvedValue([]) as MockFn,
  },
};

jest.mock("@/config/database", () => ({
  prisma: mockPrisma,
}));

// Mock axios
class MockAxiosError extends Error {
  isAxiosError = true;
  response?: unknown;
  constructor(msg?: string, status?: number, data?: unknown) {
    super(msg);
    this.name = "AxiosError";
    this.response = { status, data };
  }
}
const mockAxiosPost = jest.fn() as MockFn;
jest.mock("axios", () => ({
  default: {
    post: mockAxiosPost,
  },
  post: mockAxiosPost,
  AxiosError: MockAxiosError,
}));

// Mock logger
const mockLogger = {
  info: jest.fn() as MockFn,
  error: jest.fn() as MockFn,
  warn: jest.fn() as MockFn,
};
jest.mock("@/utils/logger", () => ({
  logger: mockLogger,
}));

// Mock ReferralService (imported but not called in 1ai-payment version)
jest.mock("@/services/referral.service", () => ({
  ReferralService: {},
}));

// Mock SubscriptionService
const mockCreateSubscription = jest.fn() as MockFn;
jest.mock("@/services/subscription.service", () => ({
  SubscriptionService: {
    createSubscription: mockCreateSubscription,
  },
}));

// Mock AnalyticsService (imported but not called in 1ai-payment version)
jest.mock("@/services/analytics.service", () => ({
  AnalyticsService: {},
}));

// Mock secureRandomString
const mockSecureRandomString = jest.fn() as MockFn;
jest.mock("@/utils/crypto", () => ({
  secureRandomString: mockSecureRandomString,
}));

// Mock i18n translations
const mockT = jest.fn() as MockFn;
jest.mock("@/i18n/translations", () => ({
  t: mockT,
}));

// Mock env config
jest.mock("@/config/env", () => ({
  getConfig: jest.fn(),
}));

const { getConfig } = jest.requireMock("@/config/env") as { getConfig: jest.Mock };

// Set environment variables for tests
process.env["1AI_PAYMENT_URL"] = "http://localhost:3100";
process.env["1AI_PAYMENT_API_KEY"] = "test-api-key";
process.env["1AI_PAYMENT_WEBHOOK_SECRET"] = "test-webhook-secret";
process.env.WEBHOOK_URL = "https://test.example.com";

// Import after mocks are set up
import { PaymentService } from "@/services/payment.service";
import { getPackagesAsync, getSubscriptionPlansAsync } from "@/config/pricing";
import { PaymentError } from "@/utils/app-errors";

// Mock getPackagesAsync and getSubscriptionPlansAsync
jest.mock("@/config/pricing", () => {
  const actual = jest.requireActual("@/config/pricing") as Record<string, unknown>;
  return {
    ...actual,
    getPackagesAsync: jest.fn(),
    getSubscriptionPlansAsync: jest.fn(),
  };
});
const mockGetPackagesAsync = getPackagesAsync as MockFn;
const mockGetSubscriptionPlansAsync = getSubscriptionPlansAsync as MockFn;

// ── Test Data ──

const TEST_USER_ID = BigInt(123456789);
const TEST_ORDER_ID = "OC-1234567890-123456789-ABC123";
const WEBHOOK_SECRET = "test-webhook-secret";

// ── Helpers ──

function generateValidSignature(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeNotification(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const base = {
    event: "payment.success",
    gateway: "midtrans",
    order_id: TEST_ORDER_ID,
    gateway_reference: "TRX-12345",
    status: "success",
    amount: 50000,
    currency: "IDR",
    payment_method: "bank_transfer",
    paid_at: "2024-01-15T10:30:00Z",
    metadata: null,
    timestamp: "2024-01-15T10:30:00Z",
  };
  return { ...base, ...overrides };
}

function makeNotificationWithSignature(
  overrides: Partial<Record<string, unknown>> = {},
): { body: string; signature: string } {
  const body = JSON.stringify(makeNotification(overrides));
  const signature = generateValidSignature(body, WEBHOOK_SECRET);
  return { body, signature };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    orderId: TEST_ORDER_ID,
    userId: TEST_USER_ID,
    type: "topup",
    packageName: "starter",
    amountIdr: BigInt(50000),
    creditsAmount: BigInt(6),
    status: "pending",
    gateway: "unified",
    paidAt: null,
    ...overrides,
  };
}

function makePackages() {
  return [
    { id: "starter", name: "Starter", priceIdr: 50000, credits: 5, bonus: 1, totalCredits: 6 },
    { id: "growth", name: "Growth", priceIdr: 149000, credits: 18, bonus: 4, totalCredits: 22 },
    { id: "business", name: "Business", priceIdr: 499000, credits: 70, bonus: 15, totalCredits: 85 },
  ];
}


// ── Tests ──

describe("PaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default bot instance to null so notification tests don't send messages
    PaymentService.setBotInstance(null as unknown as Telegraf);
    mockSecureRandomString.mockReturnValue("ABC123");
    (getConfig as jest.Mock).mockReturnValue({
      WEBHOOK_URL: "https://test.example.com",
      "1AI_PAYMENT_URL": "http://localhost:3100",
      "1AI_PAYMENT_API_KEY": "test-api-key",
      "1AI_PAYMENT_WEBHOOK_SECRET": "test-webhook-secret",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─────────────────────── setBotInstance / getBotInstance ────────────

  describe("setBotInstance / getBotInstance", () => {
    it("should default to null when no bot is set", () => {
      PaymentService.setBotInstance(null as unknown as Telegraf);
      expect(PaymentService.getBotInstance()).toBeNull();
    });

    it("should store and retrieve the bot instance", () => {
      const mockBot = { telegram: { sendMessage: jest.fn() } } as unknown as Telegraf;
      PaymentService.setBotInstance(mockBot);
      expect(PaymentService.getBotInstance()).toBe(mockBot);
    });

    it("should allow replacing the bot instance", () => {
      const bot1 = { id: 1 } as unknown as Telegraf;
      const bot2 = { id: 2 } as unknown as Telegraf;
      PaymentService.setBotInstance(bot1);
      PaymentService.setBotInstance(bot2);
      expect(PaymentService.getBotInstance()).toBe(bot2);
    });
  });

  // ─────────────────────── getPackages() ─────────────────────────────

  describe("getPackages()", () => {
    it("should return all available packages via async fetch", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      const packages = await PaymentService.getPackages();

      expect(packages).toHaveLength(3);
      expect(packages[0]).toEqual(
        expect.objectContaining({
          id: "starter",
          totalCredits: 6,
        }),
      );
    });

    it("should return empty array when no packages configured", async () => {
      mockGetPackagesAsync.mockResolvedValue([]);
      const packages = await PaymentService.getPackages();
      expect(packages).toHaveLength(0);
    });

    it("should propagate errors from pricing module", async () => {
      mockGetPackagesAsync.mockRejectedValue(new Error("DB down"));
      await expect(PaymentService.getPackages()).rejects.toThrow("DB down");
    });
  });

  // ─────────────────────── createTransaction() ──────────────────────

  describe("createTransaction()", () => {
    it("should create transaction successfully for valid package", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({
        id: "tx-123",
        orderId: TEST_ORDER_ID,
      });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc-123",
            gateway: "midtrans",
            gateway_reference: "GTW-001",
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://payment.example.com/pay/abc123",
            payment_method: null,
            expires_at: "2024-01-16T10:30:00Z",
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      const result = await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
        username: "testuser",
      });

      expect(result).toHaveProperty("orderId");
      expect(result).toHaveProperty("token", "pay-abc-123");
      expect(result).toHaveProperty("redirectUrl", "https://payment.example.com/pay/abc123");
    });

    it("should create transaction record in database", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
        username: "testuser",
      });

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: TEST_USER_ID,
            type: "topup",
            packageName: "starter",
            gateway: "unified",
            status: "pending",
          }),
        }),
      );
    });

    it("should use 'User' as default name when no username given", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          customer: { name: "User" },
        }),
        expect.any(Object),
      );
    });

    it("should calculate credits as package credits + bonus", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 149000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "growth",
        gateway: 'tripay',
        username: "testuser",
      });

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditsAmount: 22, // 18 + 4
            amountIdr: 149000,
          }),
        }),
      );
    });

    it("should call 1ai-payment API with X-API-Key header", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
        username: "testuser",
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("/api/payments"),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "test-api-key",
          }),
        }),
      );
    });

    it("should include Idempotency-Key header with order ID", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockSecureRandomString.mockReturnValue("XYZ789");
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
      });

      // Check that the third arg (headers) has Idempotency-Key
      const callArgs = mockAxiosPost.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
      expect(callArgs[2].headers["Idempotency-Key"]).toBeDefined();
    });

    it("should throw ValidationError for invalid package ID", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "nonexistent",
          gateway: 'tripay',
        }),
      ).rejects.toThrow("Invalid package");
    });

    it("should throw ValidationError when packages list is empty", async () => {
      mockGetPackagesAsync.mockResolvedValue([]);
      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          gateway: 'tripay',
        }),
      ).rejects.toThrow("Invalid package");
    });

    it("should throw PaymentError when 1ai-payment API returns error", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "Invalid amount specified",
          },
        },
      });

      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          gateway: 'tripay',
          username: "testuser",
        }),
      ).rejects.toThrow(PaymentError);
    });

    it("should log error details when 1ai-payment API returns error", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: false,
          error: { code: "BAD", message: "Invalid amount" },
        },
      });

      try {
        await PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          gateway: 'tripay',
        });
      } catch {
        // expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "1ai-payment API error:",
        expect.objectContaining({ error: "Invalid amount" }),
      );
    });

    it("should throw PaymentError when API call fails with network error", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockRejectedValue(new Error("Network timeout"));

      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          gateway: 'tripay',
          username: "testuser",
        }),
      ).rejects.toThrow("Failed to create payment transaction");
    });

    it("should log network error details when API call fails", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockRejectedValue(new Error("Network timeout"));

      try {
        await PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          gateway: 'tripay',
        });
      } catch {
        // expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "1ai-payment API error:",
        expect.objectContaining({ error: "Network timeout" }),
      );
    });

    it("should generate orderId with OC- prefix containing userId", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: "pay-abc",
            gateway: "midtrans",
            gateway_reference: null,
            status: "pending",
            amount: 50000,
            currency: "IDR",
            payment_url: "https://url",
            payment_method: null,
            expires_at: null,
            created_at: "2024-01-15T10:30:00Z",
          },
        },
      });

      const result = await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        gateway: 'tripay',
      });

      expect(result.orderId).toMatch(/^OC-\d+-123456789-[A-F0-9]+$/);
    });
  });

  // ─────────────────────── verifyWebhookSignature() ─────────────────

  describe("verifyWebhookSignature()", () => {
    it("should return true for a valid signature", () => {
      const body = JSON.stringify({ order_id: "ORD-001", status: "success" });
      const signature = generateValidSignature(body, WEBHOOK_SECRET);
      const result = PaymentService.verifyWebhookSignature(body, signature);
      expect(result).toBe(true);
    });

    it("should return false for an invalid signature", () => {
      const body = JSON.stringify({ order_id: "ORD-001", status: "success" });
      const result = PaymentService.verifyWebhookSignature(body, "wrong-signature");
      expect(result).toBe(false);
    });

    it("should return false when body is tampered", () => {
      const body = JSON.stringify({ order_id: "ORD-001", status: "success" });
      const signature = generateValidSignature(body, WEBHOOK_SECRET);
      const tamperedBody = JSON.stringify({ order_id: "ORD-002", status: "success" });
      const result = PaymentService.verifyWebhookSignature(tamperedBody, signature);
      expect(result).toBe(false);
    });

    it("should return false for empty signature", () => {
      const body = JSON.stringify({ order_id: "ORD-001", status: "success" });
      const result = PaymentService.verifyWebhookSignature(body, "");
      expect(result).toBe(false);
    });

    it("should return true when webhook secret is not configured (skip verification)", () => {
      (getConfig as jest.Mock).mockReturnValue({
        WEBHOOK_URL: "https://test.example.com",
        "1AI_PAYMENT_URL": "http://localhost:3100",
        "1AI_PAYMENT_API_KEY": "test-api-key",
        // intentionally omitting 1AI_PAYMENT_WEBHOOK_SECRET to test skip-verification path
      });

      const body = JSON.stringify({ order_id: "ORD-001" });
      const result = PaymentService.verifyWebhookSignature(body, "anything");
      expect(result).toBe(true);
    });
  });

  // ─────────────────────── handleNotification() ─────────────────────

  describe("handleNotification()", () => {
    describe("signature verification", () => {
      it("should reject notification with invalid signature", async () => {
        const body = JSON.stringify(makeNotification());
        const result = await PaymentService.handleNotification(body, "invalid-sig");

        expect(result.success).toBe(false);
        expect(result.message).toBe("Invalid signature");
      });

      it("should not process transaction when signature is invalid", async () => {
        const body = JSON.stringify(makeNotification());

        await PaymentService.handleNotification(body, "wrong-sig");

        expect(mockPrisma.transaction.findUnique).not.toHaveBeenCalled();
      });

      it("should log error for invalid signature", async () => {
        const body = JSON.stringify(makeNotification());

        await PaymentService.handleNotification(body, "invalid");

        expect(mockLogger.error).toHaveBeenCalledWith(
          "Invalid webhook signature from 1ai-payment",
        );
      });
    });

    describe("payload validation", () => {
      it("should reject when order_id is missing", async () => {
        const { body, signature } = makeNotificationWithSignature({ order_id: undefined });

        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Invalid payload");
      });

      it("should reject when status is missing", async () => {
        const { body, signature } = makeNotificationWithSignature({ status: undefined, event: undefined });

        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Invalid payload");
      });
    });

    describe("successful payment (topup)", () => {
      it("should update transaction status to success", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.update.mockResolvedValue({});
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Payment processed");
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { orderId: TEST_ORDER_ID, status: { not: "success" } },
            data: expect.objectContaining({ status: "success" }),
          }),
        );
      });

      it("should increment credit balance on successful payment", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.update.mockResolvedValue({});
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });

        await PaymentService.handleNotification(body, signature);

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { telegramId: TEST_USER_ID },
            data: expect.objectContaining({
              creditBalance: { increment: 6 },
            }),
          }),
        );
      });

      it("should update totalSpent on successful payment", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.update.mockResolvedValue({});
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });

        await PaymentService.handleNotification(body, signature);

        // totalSpent update is called with catch — expect user.update called at least twice
        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { telegramId: TEST_USER_ID },
            data: expect.objectContaining({
              totalSpent: { increment: 50000 },
            }),
          }),
        );
      });

      it("should store payment_method and paid_at on success", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.update.mockResolvedValue({});
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({
          status: "success",
          payment_method: "gopay",
          paid_at: "2024-01-15T10:35:00Z",
        });

        await PaymentService.handleNotification(body, signature);

        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              paymentMethod: "gopay",
              paidAt: expect.any(Date),
            }),
          }),
        );
      });
    });

    describe("successful payment (subscription)", () => {
      it("should create subscription for subscription transactions", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "pro_monthly",
        });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockCreateSubscription.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(mockCreateSubscription).toHaveBeenCalledWith(
          TEST_USER_ID,
          "pro",
          "monthly",
          TEST_ORDER_ID,
        );
      });

      it("should default to monthly when packageName suffix is not 'annual'", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "pro_yearly", // not 'annual'
        });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockCreateSubscription.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });
        await PaymentService.handleNotification(body, signature);

        // yearly is not 'annual' — defaults to monthly
        expect(mockCreateSubscription).toHaveBeenCalledWith(
          TEST_USER_ID,
          "pro",
          "monthly",
          TEST_ORDER_ID,
        );
      });

      it("should not call prisma.user.update for credit increment on subscription", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "pro_monthly",
        });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockCreateSubscription.mockResolvedValue({});

        const { body, signature } = makeNotificationWithSignature({ status: "success" });

        await PaymentService.handleNotification(body, signature);

        // user.update should NOT be called for credit increment — only subscription is created
        // totalSpent update may still be called for topups but not subscriptions
        // Actually for subscriptions, the source doesn't call user.update at all
        // (it only calls SubscriptionService.createSubscription)
        expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              creditBalance: expect.any(Object),
            }),
          }),
        );
      });
    });

    describe("duplicate webhook (already processed)", () => {
      it("should skip credit addition when updateMany returns count 0", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });

        const { body, signature } = makeNotificationWithSignature({ status: "success" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Already processed");
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it("should log warning about duplicate webhook", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });

        const { body, signature } = makeNotificationWithSignature({ status: "success" });

        await PaymentService.handleNotification(body, signature);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("Race condition"),
        );
      });
    });

    describe("pending status", () => {
      it("should return webhook processed for pending events", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        const { body, signature } = makeNotificationWithSignature({ status: "pending", event: "payment.pending" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Webhook processed");
      });
    });

    describe("failed / expired / cancelled statuses", () => {
      it("should set status to failed for 'failed' status", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });

        const { body, signature } = makeNotificationWithSignature({ status: "failed", event: "payment.failed" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Payment failed");
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { orderId: TEST_ORDER_ID, status: { not: "success" } },
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });

      it("should set status to failed for 'expired' status", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });

        const { body, signature } = makeNotificationWithSignature({ status: "expired", event: "payment.expired" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Payment failed");
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });

      it("should set status to failed for 'cancelled' status", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });

        const { body, signature } = makeNotificationWithSignature({ status: "cancelled", event: "payment.cancelled" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(true);
        expect(result.message).toBe("Payment failed");
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });
    });

    describe("transaction not found", () => {
      it("should return error when transaction is not found", async () => {
        mockPrisma.transaction.findUnique.mockResolvedValue(null);

        const { body, signature } = makeNotificationWithSignature({ status: "success" });
        const result = await PaymentService.handleNotification(body, signature);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Transaction not found");
      });
    });
  });

  // ─────────────────────── getTransactionStatus() ───────────────────

  describe("getTransactionStatus()", () => {
    it("should return transaction status for existing order", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: "success",
        amountIdr: BigInt(50000),
        paidAt: new Date("2024-01-15T10:35:00Z"),
      });

      const result = await PaymentService.getTransactionStatus(TEST_ORDER_ID);

      expect(result).toEqual({
        status: "success",
        amount: 50000,
        paidAt: expect.any(Date),
      });
    });

    it("should return null when transaction is not found", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      const result = await PaymentService.getTransactionStatus("nonexistent");

      expect(result).toBeNull();
    });

    it("should return null paidAt when transaction has no paidAt", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: "pending",
        amountIdr: BigInt(50000),
        paidAt: null,
      });

      const result = await PaymentService.getTransactionStatus(TEST_ORDER_ID);

      expect(result).toEqual({
        status: "pending",
        amount: 50000,
        paidAt: null,
      });
    });

    it("should query with correct orderId", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      await PaymentService.getTransactionStatus("ORD-999");

      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { orderId: "ORD-999" },
      });
    });
  });

  // ─────────────────────── sendFailureNotification() ────────────────

  describe("sendFailureNotification()", () => {
    it("should do nothing when bot instance is not set", async () => {
      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");
      // Should not throw or call any API
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("should send failed notification via bot", async () => {
      const sendMessage = jest.fn().mockResolvedValue(undefined) as MockFn;
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as Telegraf;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "en" });
      mockT.mockReturnValue("Payment failed notification text");

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(sendMessage).toHaveBeenCalledWith(
        Number(TEST_USER_ID),
        expect.any(String),
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });

    it("should send expired notification via bot", async () => {
      const sendMessage = jest.fn().mockResolvedValue(undefined) as MockFn;
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as Telegraf;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "id" });
      mockT.mockReturnValue("Pembayaran kadaluwarsa");

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "expired");

      expect(sendMessage).toHaveBeenCalledWith(
        Number(TEST_USER_ID),
        expect.any(String),
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });

    it("should use t() to get translated notification text", async () => {
      const sendMessage = jest.fn().mockResolvedValue(undefined) as MockFn;
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as Telegraf;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: null });
      mockT.mockReturnValue("Payment failed. Order: {orderId}");

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(mockT).toHaveBeenCalledWith(
        "payment_failed_notification",
        expect.objectContaining({ orderId: TEST_ORDER_ID }),
      );
    });

    it("should not throw when sendMessage fails", async () => {
      const sendMessage = jest.fn().mockRejectedValue(new Error("bot down")) as MockFn;
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as Telegraf;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "en" });

      // Should not throw
      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to send failure notification",
        expect.objectContaining({ error: "bot down" }),
      );
    });
  });
});

