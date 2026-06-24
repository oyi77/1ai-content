/**
 * Unit Tests — PaymentService
 *
 * Comprehensive test coverage for Midtrans payment gateway integration.
 * Tests all exported methods, edge cases, and error scenarios.
 */

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import crypto from "crypto";

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
    findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  },
};

jest.mock("@/config/database", () => ({
  prisma: mockPrisma,
}));

// Mock axios
const mockAxiosPost = jest.fn() as MockFn;
jest.mock("axios", () => ({
  default: {
    post: mockAxiosPost,
  },
  post: mockAxiosPost,
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

// Mock ReferralService
const mockProcessCommissions = jest.fn() as MockFn;
jest.mock("@/services/referral.service", () => ({
  ReferralService: {
    processCommissions: mockProcessCommissions,
  },
}));

// Mock SubscriptionService
const mockCreateSubscription = jest.fn() as MockFn;
jest.mock("@/services/subscription.service", () => ({
  SubscriptionService: {
    createSubscription: mockCreateSubscription,
  },
}));

// Mock AnalyticsService
const mockTrackPurchase = jest.fn() as MockFn;
jest.mock("@/services/analytics.service", () => ({
  AnalyticsService: {
    trackPurchase: mockTrackPurchase,
  },
}));

// Set environment variables for tests
process.env.MIDTRANS_SERVER_KEY = "test-server-key";
process.env.MIDTRANS_ENVIRONMENT = "sandbox";
process.env.WEBHOOK_URL = "https://test.example.com";

// Import after mocks are set up
import { PaymentService } from "@/services/payment.service";
import { getPackagesAsync, getSubscriptionPlansAsync } from "@/config/pricing";

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
const SERVER_KEY = "test-server-key";

// ── Helpers ──

function generateValidSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

function validSignatureFor(orderId: string, statusCode: string, grossAmount: string) {
  return generateValidSignature(orderId, statusCode, grossAmount, SERVER_KEY);
}

function makeNotification(overrides: Record<string, string> = {}) {
  return {
    order_id: TEST_ORDER_ID,
    status_code: "200",
    gross_amount: "50000",
    signature_key: validSignatureFor(TEST_ORDER_ID, "200", "50000"),
    transaction_status: "settlement",
    payment_type: "bank_transfer",
    ...overrides,
  };
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
    gateway: "midtrans",
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

function mockSuccessTopupFlow(transaction?: Record<string, unknown>) {
  const tx = transaction ?? makeTransaction();
  mockPrisma.transaction.findUnique.mockResolvedValue(tx);
  mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue({
    username: "testuser",
    createdAt: new Date(),
    creditBalance: BigInt(100),
  });
  mockPrisma.transaction.update.mockResolvedValue({});
  mockTrackPurchase.mockResolvedValue(undefined);
  mockProcessCommissions.mockResolvedValue(undefined);
  mockGetSubscriptionPlansAsync.mockResolvedValue({});
}

// ── Tests ──

describe("PaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default bot instance to null so notification tests don't send messages
    PaymentService.setBotInstance(null as unknown as InstanceType<typeof import("telegraf").Telegraf>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─────────────────────── setBotInstance / getBotInstance ────────────

  describe("setBotInstance / getBotInstance", () => {
    it("should default to null when no bot is set", () => {
      PaymentService.setBotInstance(null as unknown as InstanceType<typeof import("telegraf").Telegraf>);
      expect(PaymentService.getBotInstance()).toBeNull();
    });

    it("should store and retrieve the bot instance", () => {
      const mockBot = { telegram: { sendMessage: jest.fn() } } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      expect(PaymentService.getBotInstance()).toBe(mockBot);
    });

    it("should allow replacing the bot instance", () => {
      const bot1 = { id: 1 } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      const bot2 = { id: 2 } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
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
          token: "test-token-123",
          redirect_url: "https://sandbox.midtrans.com/snap/v2/transactions/test-token-123",
        },
      });

      const result = await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        username: "testuser",
      });

      expect(result).toHaveProperty("orderId");
      expect(result).toHaveProperty("token", "test-token-123");
      expect(result).toHaveProperty("redirectUrl");
      expect(result.redirectUrl).toContain("midtrans.com");
    });

    it("should create transaction record in database", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: { token: "tok", redirect_url: "https://url" },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        username: "testuser",
      });

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: TEST_USER_ID,
            type: "topup",
            packageName: "starter",
            gateway: "midtrans",
            status: "pending",
          }),
        }),
      );
    });

    it("should use 'User' as default first_name when no username given", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: { token: "tok", redirect_url: "https://url" },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          customer_details: { first_name: "User" },
        }),
        expect.any(Object),
      );
    });

    it("should calculate credits as package credits + bonus", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: { token: "tok", redirect_url: "https://url" },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "growth",
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

    it("should call Midtrans API with correct auth header", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: { token: "tok", redirect_url: "https://url" },
      });

      await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
        username: "testuser",
      });

      const expectedAuth = Buffer.from("test-server-key:").toString("base64");
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("midtrans.com/snap/v1/transactions"),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        }),
      );
    });

    it("should throw ValidationError for invalid package ID", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "nonexistent",
        }),
      ).rejects.toThrow("Invalid package");
    });

    it("should throw ValidationError when packages list is empty", async () => {
      mockGetPackagesAsync.mockResolvedValue([]);
      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
        }),
      ).rejects.toThrow("Invalid package");
    });

    it("should throw PaymentError when Midtrans API call fails", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockRejectedValue({
        response: { data: { error: "bad request" } },
        message: "Request failed",
      });

      await expect(
        PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
          username: "testuser",
        }),
      ).rejects.toThrow("Failed to create payment transaction");
    });

    it("should log error details when Midtrans API call fails", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      const apiError = {
        response: { data: { error: "bad request" } },
        message: "Request failed",
      };
      mockAxiosPost.mockRejectedValue(apiError);

      try {
        await PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
        });
      } catch {
        // expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Midtrans API error:",
        { error: "bad request" },
      );
    });

    it("should use error.message when no response data is available", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockRejectedValue(new Error("Network timeout"));

      try {
        await PaymentService.createTransaction({
          userId: TEST_USER_ID,
          packageId: "starter",
        });
      } catch {
        // expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Midtrans API error:",
        "Network timeout",
      );
    });

    it("should generate orderId with OC- prefix containing userId", async () => {
      mockGetPackagesAsync.mockResolvedValue(makePackages());
      mockPrisma.transaction.create.mockResolvedValue({ id: "tx-123" });
      mockAxiosPost.mockResolvedValue({
        data: { token: "tok", redirect_url: "https://url" },
      });

      const result = await PaymentService.createTransaction({
        userId: TEST_USER_ID,
        packageId: "starter",
      });

      expect(result.orderId).toMatch(/^OC-\d+-123456789-[A-F0-9]+$/);
    });
  });

  // ─────────────────────── verifySignature() ────────────────────────

  describe("verifySignature()", () => {
    it("should return true for a valid signature", () => {
      const signature = validSignatureFor("ORD-001", "200", "50000");
      const result = PaymentService.verifySignature("ORD-001", "200", "50000", signature);
      expect(result).toBe(true);
    });

    it("should return false for an invalid signature", () => {
      const result = PaymentService.verifySignature("ORD-001", "200", "50000", "wrong-sig");
      expect(result).toBe(false);
    });

    it("should return false when orderId is tampered", () => {
      const signature = validSignatureFor("ORD-001", "200", "50000");
      const result = PaymentService.verifySignature("ORD-TAMPERED", "200", "50000", signature);
      expect(result).toBe(false);
    });

    it("should return false when statusCode is tampered", () => {
      const signature = validSignatureFor("ORD-001", "200", "50000");
      const result = PaymentService.verifySignature("ORD-001", "400", "50000", signature);
      expect(result).toBe(false);
    });

    it("should return false when grossAmount is tampered", () => {
      const signature = validSignatureFor("ORD-001", "200", "50000");
      const result = PaymentService.verifySignature("ORD-001", "200", "99999", signature);
      expect(result).toBe(false);
    });

    it("should return false for empty signature", () => {
      const result = PaymentService.verifySignature("ORD-001", "200", "50000", "");
      expect(result).toBe(false);
    });
  });

  // ─────────────────────── handleNotification() ─────────────────────

  describe("handleNotification()", () => {
    describe("signature verification", () => {
      it("should reject notification with invalid signature", async () => {
        const notification = makeNotification({ signature_key: "invalid-sig" });
        const result = await PaymentService.handleNotification(notification);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Invalid signature");
      });

      it("should not query database when signature is invalid", async () => {
        const notification = makeNotification({ signature_key: "invalid-sig" });
        await PaymentService.handleNotification(notification);

        expect(mockPrisma.transaction.findUnique).not.toHaveBeenCalled();
      });
    });

    describe("transaction lookup", () => {
      it("should return failure when transaction is not found", async () => {
        mockPrisma.transaction.findUnique.mockResolvedValue(null);
        const notification = makeNotification();
        const result = await PaymentService.handleNotification(notification);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Transaction not found");
      });

      it("should log error when transaction is not found", async () => {
        mockPrisma.transaction.findUnique.mockResolvedValue(null);
        await PaymentService.handleNotification(makeNotification());

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Transaction not found"),
        );
      });
    });

    describe("settlement / capture → success (topup)", () => {
      it("should process settlement status as success with credit addition", async () => {
        const tx = makeTransaction({ type: "topup", packageName: "starter" });
        mockSuccessTopupFlow(tx);

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "settlement" }),
        );

        expect(result.success).toBe(true);
        expect(result.message).toBe("Notification processed");
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: { not: "success" } }),
            data: expect.objectContaining({ status: "success" }),
          }),
        );
      });

      it("should process capture status as success", async () => {
        const tx = makeTransaction({ type: "topup" });
        mockSuccessTopupFlow(tx);

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "capture" }),
        );

        expect(result.success).toBe(true);
      });

      it("should increment user credit balance on topup", async () => {
        const tx = makeTransaction({ type: "topup", creditsAmount: BigInt(22) });
        mockSuccessTopupFlow(tx);
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { telegramId: TEST_USER_ID },
            data: expect.objectContaining({ creditBalance: { increment: 22 } }),
          }),
        );
      });

      it("should update user tier when planConfig has tier", async () => {
        const tx = makeTransaction({ type: "topup", packageName: "starter" });
        mockSuccessTopupFlow(tx);
        mockGetSubscriptionPlansAsync.mockResolvedValue({
          starter: { tier: "basic" },
        });

        await PaymentService.handleNotification(makeNotification());

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              creditBalance: { increment: 6 },
              tier: "basic",
            }),
          }),
        );
      });

      it("should not set tier when planConfig has no tier", async () => {
        const tx = makeTransaction({ type: "topup", packageName: "unknown_pkg" });
        mockSuccessTopupFlow(tx);
        mockGetSubscriptionPlansAsync.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        const firstUserUpdate = mockPrisma.user.update.mock.calls[0];
        expect(firstUserUpdate[0].data).not.toHaveProperty("tier");
      });

      it("should process referral commissions after success", async () => {
        mockSuccessTopupFlow();

        await PaymentService.handleNotification(makeNotification());

        expect(mockProcessCommissions).toHaveBeenCalledWith(
          TEST_ORDER_ID,
          50000,
          TEST_USER_ID,
        );
      });

      it("should track purchase analytics after success", async () => {
        mockSuccessTopupFlow();

        await PaymentService.handleNotification(makeNotification());

        expect(mockTrackPurchase).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: TEST_USER_ID.toString(),
            amount_idr: 50000,
            transaction_id: TEST_ORDER_ID,
          }),
        );
      });

      it("should update transaction with UTM and conversion data", async () => {
        mockSuccessTopupFlow();
        mockPrisma.user.findUnique.mockResolvedValue({
          username: "testuser",
          utmSource: "google",
          utmCampaign: "spring",
          utmContent: "banner",
          lpVariant: "v2",
          fbc: "fb.1.abc",
          fbp: "fbp.123",
          ttclid: "tt.456",
          createdAt: new Date(),
        });

        await PaymentService.handleNotification(makeNotification());

        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { orderId: TEST_ORDER_ID },
            data: expect.objectContaining({
              utmCampaign: "spring",
              utmContent: "banner",
              lpVariant: "v2",
            }),
          }),
        );
      });

      it("should not block on analytics failure", async () => {
        mockSuccessTopupFlow();
        mockTrackPurchase.mockRejectedValue(new Error("GA4 down"));

        const result = await PaymentService.handleNotification(makeNotification());

        expect(result.success).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("Analytics tracking failed"),
        );
      });
    });

    describe("settlement → success (subscription)", () => {
      it("should call SubscriptionService.createSubscription for subscription type", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "pro_monthly",
          creditsAmount: BigInt(50),
        });
        mockSuccessTopupFlow(tx);
        mockCreateSubscription.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        expect(mockCreateSubscription).toHaveBeenCalledWith(
          TEST_USER_ID,
          "pro",
          "monthly",
          TEST_ORDER_ID,
        );
      });

      it("should parse annual billing cycle from packageName", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "agency_annual",
        });
        mockSuccessTopupFlow(tx);
        mockCreateSubscription.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        expect(mockCreateSubscription).toHaveBeenCalledWith(
          TEST_USER_ID,
          "agency",
          "annual",
          TEST_ORDER_ID,
        );
      });

      it("should default to monthly when packageName suffix is not 'annual'", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "lite_monthly",
        });
        mockSuccessTopupFlow(tx);
        mockCreateSubscription.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        expect(mockCreateSubscription).toHaveBeenCalledWith(
          TEST_USER_ID,
          "lite",
          "monthly",
          TEST_ORDER_ID,
        );
      });

      it("should not call prisma.user.update for credit increment on subscription", async () => {
        const tx = makeTransaction({
          type: "subscription",
          packageName: "pro_monthly",
        });
        mockSuccessTopupFlow(tx);
        mockCreateSubscription.mockResolvedValue({});

        await PaymentService.handleNotification(makeNotification());

        // user.update should NOT be called for credit increment — only subscription is created
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });
    });

    describe("duplicate webhook (already processed)", () => {
      it("should skip credit addition when updateMany returns count 0", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });

        const result = await PaymentService.handleNotification(makeNotification());

        expect(result.success).toBe(true);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
        expect(mockProcessCommissions).not.toHaveBeenCalled();
      });

      it("should log warning about duplicate webhook", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });

        await PaymentService.handleNotification(makeNotification());

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("Duplicate webhook"),
        );
      });
    });

    describe("pending status", () => {
      it("should update transaction status to pending", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "pending" }),
        );

        expect(result.success).toBe(true);
        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { orderId: TEST_ORDER_ID },
            data: expect.objectContaining({ status: "pending" }),
          }),
        );
      });
    });

    describe("failed / deny / cancel / expire statuses", () => {
      it("should set status to failed for 'deny'", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "deny" }),
        );

        expect(result.success).toBe(true);
        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });

      it("should set status to failed for 'cancel'", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "cancel" }),
        );

        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });

      it("should set status to failed for 'expire'", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "expire" }),
        );

        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: "failed" }),
          }),
        );
      });

      it("should record payment_method on status update", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "deny", payment_type: "credit_card" }),
        );

        expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ paymentMethod: "credit_card" }),
          }),
        );
      });
    });

    describe("refund status", () => {
      it("should reverse credits on refund when transaction was success", async () => {
        const tx = makeTransaction({ creditsAmount: BigInt(10) });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.findUnique.mockResolvedValue({ creditBalance: BigInt(50) });
        mockPrisma.user.update.mockResolvedValue({});

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(result.success).toBe(true);
        expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              orderId: TEST_ORDER_ID,
              status: "success",
            }),
            data: expect.objectContaining({ status: "refunded" }),
          }),
        );
      });

      it("should decrement credits by the granted amount", async () => {
        const tx = makeTransaction({ creditsAmount: BigInt(10) });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.findUnique.mockResolvedValue({ creditBalance: BigInt(50) });
        mockPrisma.user.update.mockResolvedValue({});

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { creditBalance: { decrement: 10 } },
          }),
        );
      });

      it("should decrement only up to current balance", async () => {
        const tx = makeTransaction({ creditsAmount: BigInt(100) });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.findUnique.mockResolvedValue({ creditBalance: BigInt(30) });
        mockPrisma.user.update.mockResolvedValue({});

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { creditBalance: { decrement: 30 } },
          }),
        );
      });

      it("should skip decrement when current balance is zero", async () => {
        const tx = makeTransaction({ creditsAmount: BigInt(10) });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.user.findUnique.mockResolvedValue({ creditBalance: BigInt(0) });

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it("should skip refund when transaction was not in success state", async () => {
        const tx = makeTransaction();
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });

        const result = await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(result.success).toBe(true);
        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("not in success state"),
        );
      });

      it("should skip decrement when creditsAmount is zero", async () => {
        const tx = makeTransaction({ creditsAmount: BigInt(0) });
        mockPrisma.transaction.findUnique.mockResolvedValue(tx);
        mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });

        await PaymentService.handleNotification(
          makeNotification({ transaction_status: "refund" }),
        );

        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      });
    });
  });

  // ─────────────────────── getTransactionStatus() ───────────────────

  describe("getTransactionStatus()", () => {
    it("should return transaction status for existing order", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: "success",
        amountIdr: BigInt(50000),
        creditsAmount: BigInt(6),
      });

      const result = await PaymentService.getTransactionStatus(TEST_ORDER_ID);

      expect(result).toEqual({
        status: "success",
        amount: 50000,
        credits: 6,
      });
    });

    it("should return null when transaction is not found", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      const result = await PaymentService.getTransactionStatus("nonexistent");

      expect(result).toBeNull();
    });

    it("should return 0 credits when creditsAmount is null", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        status: "pending",
        amountIdr: BigInt(50000),
        creditsAmount: null,
      });

      const result = await PaymentService.getTransactionStatus(TEST_ORDER_ID);

      expect(result).toEqual({
        status: "pending",
        amount: 50000,
        credits: 0,
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
      const sendMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "en" });

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(sendMessage).toHaveBeenCalledWith(
        TEST_USER_ID.toString(),
        expect.any(String),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });

    it("should send expired notification via bot", async () => {
      const sendMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "id" });

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "expired");

      expect(sendMessage).toHaveBeenCalledWith(
        TEST_USER_ID.toString(),
        expect.any(String),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });

    it("should default language to 'id' when user has no language set", async () => {
      const sendMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: null });

      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(sendMessage).toHaveBeenCalled();
      // Verify user lookup was made
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { telegramId: TEST_USER_ID },
        }),
      );
    });

    it("should not throw when sendMessage fails", async () => {
      const sendMessage = jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error("bot down"));
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockResolvedValue({ language: "en" });

      // Should not throw
      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to send payment failure notification"),
        expect.anything(),
      );
    });

    it("should not throw when user lookup fails", async () => {
      const sendMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
      const mockBot = {
        telegram: { sendMessage },
      } as unknown as InstanceType<typeof import("telegraf").Telegraf>;
      PaymentService.setBotInstance(mockBot);
      mockPrisma.user.findUnique.mockRejectedValue(new Error("db error"));

      // Should not throw — catch block handles it
      await PaymentService.sendFailureNotification(TEST_USER_ID, TEST_ORDER_ID, "failed");

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
