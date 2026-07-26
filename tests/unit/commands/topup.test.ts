/**
 * Topup Command Unit Tests
 *
 * Tests for /topup command handler and related functions
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import {
  topupCommand,
  handleTopupSelection,
  handlePaymentGateway,
  checkPayment,
  handleTopupExtraCredit,
  handleStarsMenu,
  handleStarsInvoice,
  handleCryptoMenu,
  handleCryptoCoinSelect,
  handleCryptoPayment,
  STARS_PACKAGES,
} from "@/commands/topup";
import {
  createMockContext,
  mockUser,
  mockPremiumUser,
  mockTransaction,
} from "../../fixtures";

jest.mock("@/services/user.service", () => ({
  UserService: {
    findByTelegramId: jest.fn(),
  },
}));

jest.mock("@/services/payment.service", () => ({
  PaymentService: {
    getPackages: jest.fn(() => [
      { id: "starter", name: "Starter", price: 49000, totalCredits: 6 },
      { id: "growth", name: "Growth", price: 149000, totalCredits: 22 },
    ]),
    createTransaction: jest.fn(),
    getTransactionStatus: jest.fn(),
  },
}));


jest.mock("@/services/payment-settings.service", () => ({
  PaymentSettingsService: {
    getEnabledGateways: jest.fn(),
  },
}));

jest.mock("@/services/subscription.service", () => ({
  SubscriptionService: {
    isSubscribed: jest.fn(),
  },
}));

jest.mock("@/services/nowpayments.service", () => ({
  NowPaymentsService: {
    createPayment: jest.fn(),
  },
  CRYPTO_PACKAGES: [
    { credits: 1, usd: 0.5 },
    { credits: 5, usd: 2.0 },
    { credits: 10, usd: 3.5 },
  ],
  CRYPTO_COINS: [
    { id: "usdtbsc", label: "USDT (BSC)", emoji: "💵" },
    { id: "bnb", label: "BNB", emoji: "🟡" },
    { id: "matic", label: "MATIC", emoji: "🟣" },
    { id: "ton", label: "TON", emoji: "💎" },
  ],
}));

jest.mock("@/config/pricing", () => ({
  EXTRA_CREDIT_PACKAGES: [
    { id: "extra_1", credits: 1 },
    { id: "extra_5", credits: 5 },
    { id: "extra_10", credits: 10 },
  ],
  getCreditPriceIdr: jest.fn((tier: string) =>
    tier === "free" ? 20000 : 10000,
  ),
  getExtraCreditPackagePrice: jest.fn(
    (credits: number, tier: string) =>
      credits * (tier === "free" ? 20000 : 10000),
  ),
  getUnitCostAsync: (jest.fn() as any).mockResolvedValue(20000),
  getPackagesAsync: (jest.fn() as any).mockResolvedValue([
    { id: "starter", name: "Starter", credits: 6, bonus: 0, priceIdr: 49000 },
    { id: "growth", name: "Growth", credits: 16, bonus: 6, priceIdr: 149000 },
  ]),
  SUBSCRIPTION_PLANS: {
    lite: { monthlyCredits: 30 },
    pro: { monthlyCredits: 100 },
  },
}));

jest.mock("@/config/database", () => ({
  prisma: {
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("axios", () => ({
  default: {
    post: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => "mock_signature"),
  })),
}));

describe("Topup Command", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let UserService: any;
  let PaymentService: any;
  let PaymentSettingsService: any;
  let SubscriptionService: any;
  let NowPaymentsService: any;
  let prisma: any;
  let axios: any;
  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockContext();
    ctx.session = {
      state: "DASHBOARD",
      lastActivity: new Date(),
      creditBalance: 10,
      tier: "free",
      stateData: {},
    };
    UserService = require("@/services/user.service").UserService;
    PaymentService = require("@/services/payment.service").PaymentService;
    PaymentSettingsService =
      require("@/services/payment-settings.service").PaymentSettingsService;
    SubscriptionService =
      require("@/services/subscription.service").SubscriptionService;
    NowPaymentsService =
      require("@/services/nowpayments.service").NowPaymentsService;
    prisma = require("@/config/database").prisma;
    axios = require("axios").default;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("topupCommand", () => {
    it("should handle missing user gracefully", async () => {
      ctx.from = undefined as any;

      await topupCommand(ctx as any);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should show message when user not found", async () => {
      UserService.findByTelegramId.mockResolvedValue(null);

      await topupCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });

    it("should show topup menu for non-subscriber", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Top Up Credits");
      expect(replyCall[0]).toContain("Subscribe to save up to 50%");
    });

    it("should show subscriber pricing for subscribed users", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockPremiumUser,
        creditBalance: 50,
        tier: "pro",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(true);

      await topupCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Subscriber");
      expect(replyCall[0]).not.toContain("Subscribe to save");
    });

    it("should show extra credit packages", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Bulk Packages");
    });

    it("should show bulk packages", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Bulk Packages");
    });

    it("should show Telegram Stars option", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      const starsButton = keyboard.find((row: any) =>
        row.some((btn: any) => btn.callback_data === "topup_stars_menu"),
      );
      expect(starsButton).toBeDefined();
    });

    it("should show Crypto option", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      const cryptoButton = keyboard.find((row: any) =>
        row.some((btn: any) => btn.callback_data === "topup_crypto_menu"),
      );
      expect(cryptoButton).toBeDefined();
    });

    it("should show main menu button", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      const lastRow = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe("main_menu");
    });

    it("should show upsell for non-subscribers", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 5,
        tier: "free",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(false);

      await topupCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      const upsellButton = keyboard.find((row: any) =>
        row.some((btn: any) => btn.callback_data === "open_subscription"),
      );
      expect(upsellButton).toBeDefined();
    });

    it("should not show upsell for subscribers", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockPremiumUser,
        creditBalance: 50,
        tier: "pro",
      });
      SubscriptionService.isSubscribed.mockResolvedValue(true);

      await topupCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      const upsellButton = keyboard.find((row: any) =>
        row.some(
          (btn: any) =>
            btn.callback_data === "open_subscription" &&
            btn.text.includes("save"),
        ),
      );
      expect(upsellButton).toBeUndefined();
    });

    it("should handle database errors gracefully", async () => {
      UserService.findByTelegramId.mockRejectedValue(
        new Error("Database error"),
      );

      await topupCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleTopupSelection", () => {
    it("should handle missing user", async () => {
      ctx.from = undefined as any;

      await handleTopupSelection(ctx as any, "starter");

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it("should auto-select single gateway", async () => {
      PaymentSettingsService.getEnabledGateways.mockResolvedValue([
        { id: "midtrans", name: "Midtrans" },
      ]);
      PaymentService.createTransaction.mockResolvedValue({
        orderId: "ORDER-123",
        paymentUrl: "https://payment.example.com",
      });

      await handleTopupSelection(ctx as any, "starter");

      expect(PaymentService.createTransaction).toHaveBeenCalled();
    });

    it("should show gateway selection for multiple gateways", async () => {
      PaymentSettingsService.getEnabledGateways.mockResolvedValue([
        { id: "midtrans", name: "Midtrans" },
        { id: "duitku", name: "Duitku" },
      ]);

      await handleTopupSelection(ctx as any, "starter");

      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Select Payment Gateway");
    });

    it("should handle errors gracefully", async () => {
      PaymentSettingsService.getEnabledGateways.mockRejectedValue(
        new Error("Service error"),
      );

      await handleTopupSelection(ctx as any, "starter");

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handlePaymentGateway", () => {
    it("should handle missing user", async () => {
      ctx.from = undefined as any;

      await handlePaymentGateway(ctx as any, "starter", "midtrans");

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it("should create Midtrans transaction", async () => {
      PaymentService.createTransaction.mockResolvedValue({
        orderId: "ORDER-123",
        paymentUrl: "https://payment.example.com",
      });

      await handlePaymentGateway(ctx as any, "starter", "midtrans");

      expect(PaymentService.createTransaction).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Payment Ready");
      expect(editCall[0]).toContain("Midtrans");
    });

    it("should create Duitku transaction directly", async () => {
      (PaymentService.createTransaction as jest.Mock).mockResolvedValue({
        orderId: "ORDER-123",
        redirectUrl: "https://duitku.example.com/pay",
      });

      await handlePaymentGateway(ctx as any, "starter", "duitku");

      expect(PaymentService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ gateway: "duitku" }),
      );
      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Payment Ready");
      expect(editCall[0]).toContain("Duitku");
    });

    it("should show pay now and check payment buttons", async () => {
      PaymentService.createTransaction.mockResolvedValue({
        orderId: "ORDER-123",
        paymentUrl: "https://payment.example.com",
      });

      await handlePaymentGateway(ctx as any, "starter", "midtrans");

      const editCall = ctx.editMessageText.mock.calls[0];
      const keyboard = editCall[1].reply_markup.inline_keyboard;
      expect(keyboard[0][0].text).toContain("Pay Now");
      expect(keyboard[1][0].callback_data).toBe("check_payment_ORDER-123");
    });

    it("should handle errors gracefully", async () => {
      PaymentService.createTransaction.mockRejectedValue(
        new Error("Payment error"),
      );

      await handlePaymentGateway(ctx as any, "starter", "midtrans");

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create payment"),
      );
    });
  });

  describe("checkPayment", () => {
    it("should show success message for successful payment", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        status: "success",
        creditsAmount: 6,
        orderId: "ORDER-123",
      });

      await checkPayment(ctx as any, "ORDER-123");

      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Payment Successful");
      expect(editCall[0]).toContain("6");
    });

    it("should show pending message for pending payment", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        status: "pending",
        orderId: "ORDER-123",
      });

      await checkPayment(ctx as any, "ORDER-123");

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        expect.stringContaining("pending"),
        { show_alert: true },
      );
    });

    it("should show failed message for failed payment", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        status: "failed",
        orderId: "ORDER-123",
      });

      await checkPayment(ctx as any, "ORDER-123");

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
        expect.anything(),
      );
    });

    it("should handle transaction not found", async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await checkPayment(ctx as any, "ORDER-123");

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
    });

    it("should handle errors gracefully", async () => {
      prisma.transaction.findUnique.mockRejectedValue(
        new Error("Service error"),
      );

      await checkPayment(ctx as any, "ORDER-123");

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleTopupExtraCredit", () => {
    it("should handle missing user", async () => {
      ctx.from = undefined as any;

      await handleTopupExtraCredit(ctx as any, 5);

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it("should handle user not found", async () => {
      UserService.findByTelegramId.mockResolvedValue(null);

      await handleTopupExtraCredit(ctx as any, 5);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
    });

    it("should create extra credit payment", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        tier: "free",
      });
      PaymentSettingsService.getEnabledGateways.mockResolvedValue([{ id: 'duitku', gateway: 'duitku' }]);
      (PaymentService.createTransaction as jest.Mock).mockResolvedValue({
        orderId: "ORDER-EXTRA-5",
        redirectUrl: "https://duitku.example.com/pay",
      });

      await handleTopupExtraCredit(ctx as any, 5);

      expect(PaymentService.createTransaction).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        tier: "free",
      });
      PaymentSettingsService.getEnabledGateways.mockResolvedValue([{ id: 'duitku', gateway: 'duitku' }]);
      (PaymentService.createTransaction as jest.Mock).mockRejectedValue(new Error("Payment error"));

      await handleTopupExtraCredit(ctx as any, 5);

      // Mock user has language: 'id' → Indonesian error message
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Gagal membuat pembayaran"),
      );
    });
  });

  describe("handleStarsMenu", () => {
    it("should show Stars packages", async () => {
      await handleStarsMenu(ctx as any);

      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Bayar dengan Telegram Stars");
      expect(editCall[1].reply_markup.inline_keyboard.length).toBeGreaterThan(
        0,
      );
    });

    it("should show all Stars packages", async () => {
      await handleStarsMenu(ctx as any);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const packageButtons = keyboard.filter((row: any) =>
        row.some((btn: any) => btn.callback_data?.startsWith("topup_stars_")),
      );
      expect(packageButtons.length).toBe(STARS_PACKAGES.length);
    });

    it("should show back button", async () => {
      await handleStarsMenu(ctx as any);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const lastRow = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe("topup");
    });

    it("should handle errors gracefully", async () => {
      ctx.editMessageText.mockRejectedValue(new Error("Edit error"));

      await handleStarsMenu(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleStarsInvoice", () => {
    it("should handle invalid package", async () => {
      await handleStarsInvoice(ctx as any, 999);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("❌"));
    });

    it("should handle missing user", async () => {
      ctx.from = undefined as any;

      await handleStarsInvoice(ctx as any, 1);

      expect(ctx.replyWithInvoice).not.toHaveBeenCalled();
    });

    it("should send invoice for valid package", async () => {
      await handleStarsInvoice(ctx as any, 1);

      expect(ctx.telegram.sendInvoice).toHaveBeenCalled();
      const invoiceCall = ctx.telegram.sendInvoice.mock.calls[0];
      expect(invoiceCall[1].currency).toBe("XTR");
      expect(invoiceCall[1].prices[0].amount).toBe(15);
    });

    it("should handle errors gracefully", async () => {
      ctx.telegram.sendInvoice.mockRejectedValue(new Error("Invoice error"));

      await handleStarsInvoice(ctx as any, 1);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleCryptoMenu", () => {
    it("should show crypto packages", async () => {
      await handleCryptoMenu(ctx as any);

      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Pembayaran Crypto");
    });

    it("should show all crypto packages", async () => {
      await handleCryptoMenu(ctx as any);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const packageButtons = keyboard.filter((row: any) =>
        row.some((btn: any) =>
          btn.callback_data?.startsWith("topup_crypto_pkg_"),
        ),
      );
      expect(packageButtons.length).toBe(3);
    });

    it("should show back button", async () => {
      await handleCryptoMenu(ctx as any);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const lastRow = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe("topup");
    });

    it("should handle errors gracefully", async () => {
      ctx.editMessageText.mockRejectedValue(new Error("Edit error"));

      await handleCryptoMenu(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleCryptoCoinSelect", () => {
    it("should handle invalid package", async () => {
      await handleCryptoCoinSelect(ctx as any, 999);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("❌"));
    });

    it("should show coin selector for valid package", async () => {
      await handleCryptoCoinSelect(ctx as any, 5);

      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("5 Kredit");
      expect(editCall[0]).toContain("$2.00");
    });

    it("should show all supported coins", async () => {
      await handleCryptoCoinSelect(ctx as any, 5);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const coinButtons = keyboard.filter((row: any) =>
        row.some((btn: any) =>
          btn.callback_data?.startsWith("topup_crypto_pay_"),
        ),
      );
      expect(coinButtons.length).toBe(4);
    });

    it("should show back button", async () => {
      await handleCryptoCoinSelect(ctx as any, 5);

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      const lastRow = keyboard[keyboard.length - 1];
      expect(lastRow[0].callback_data).toBe("topup_crypto_menu");
    });

    it("should handle errors gracefully", async () => {
      ctx.editMessageText.mockRejectedValue(new Error("Edit error"));

      await handleCryptoCoinSelect(ctx as any, 5);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("handleCryptoPayment", () => {
    it("should handle missing user", async () => {
      ctx.from = undefined as any;

      await handleCryptoPayment(ctx as any, 5, "usdtbsc");

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it("should create crypto payment", async () => {
      NowPaymentsService.createPayment.mockResolvedValue({
        payAmount: "2.0",
        payCurrency: "usdtbsc",
        payAddress: "0x1234567890abcdef",
        orderId: "CRYPTO-123",
      });

      await handleCryptoPayment(ctx as any, 5, "usdtbsc");

      expect(NowPaymentsService.createPayment).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalled();
      const editCall = ctx.editMessageText.mock.calls[0];
      expect(editCall[0]).toContain("Crypto Payment Created");
      expect(editCall[0]).toContain("0x1234567890abcdef");
    });

    it("should show back to top up button", async () => {
      NowPaymentsService.createPayment.mockResolvedValue({
        payAmount: "2.0",
        payCurrency: "usdtbsc",
        payAddress: "0x1234567890abcdef",
        orderId: "CRYPTO-123",
      });

      await handleCryptoPayment(ctx as any, 5, "usdtbsc");

      const keyboard =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard[0][0].callback_data).toBe("topup");
    });

    it("should handle errors gracefully", async () => {
      NowPaymentsService.createPayment.mockRejectedValue(
        new Error("Payment error"),
      );

      await handleCryptoPayment(ctx as any, 5, "usdtbsc");

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });
  });

  describe("STARS_PACKAGES", () => {
    it("should have correct package structure", () => {
      expect(STARS_PACKAGES).toBeDefined();
      expect(STARS_PACKAGES.length).toBe(4);
      STARS_PACKAGES.forEach((pkg) => {
        expect(pkg).toHaveProperty("credits");
        expect(pkg).toHaveProperty("stars");
        expect(pkg.credits).toBeGreaterThan(0);
        expect(pkg.stars).toBeGreaterThan(0);
      });
    });

    it("should have increasing stars for more credits", () => {
      for (let i = 1; i < STARS_PACKAGES.length; i++) {
        expect(STARS_PACKAGES[i].stars).toBeGreaterThan(
          STARS_PACKAGES[i - 1].stars,
        );
      }
    });
  });
});
