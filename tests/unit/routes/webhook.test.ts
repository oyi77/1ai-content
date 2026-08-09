import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import crypto from "crypto";

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};
jest.mock("@/utils/logger", () => ({
  logger: mockLogger,
}));

const mockPaymentServiceHandleNotification = jest.fn();
jest.mock("@/services/payment.service", () => ({
  PaymentService: {
    handleNotification: mockPaymentServiceHandleNotification,
  },
}));

const mockDuitkuServiceHandleCallback = jest.fn();
jest.mock("@/services/duitku.service", () => ({
  DuitkuService: {
    handleCallback: mockDuitkuServiceHandleCallback,
  },
}));

const mockNowPaymentsServiceHandleWebhook = jest.fn();
jest.mock("@/services/nowpayments.service", () => ({
  NowPaymentsService: {
    handleWebhook: mockNowPaymentsServiceHandleWebhook,
  },
}));

jest.mock("@/services/user.service", () => ({
  UserService: {
    findByTelegramId: jest.fn<any>().mockResolvedValue({ language: 'id' }),
  },
}));

jest.mock("@/i18n/translations", () => ({
  t: jest.fn<any>((key: string, _lang: string, params?: any) => {
    if (key === 'payment.crypto_success') return `Pembayaran Crypto Berhasil! ${params?.coin || 'CRYPTO'} ${params?.amount || ''}`;
    return key;
  }),
}));

jest.mock("@/config/database", () => ({
  prisma: {
    transaction: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  },
}));

jest.mock("@/services/admin-alert.service", () => ({
  sendAdminAlert: jest.fn(),
}));

const mockHandleUpdate = jest.fn();
const mockSendMessage = jest.fn();
const mockBot = {
  handleUpdate: mockHandleUpdate,
  telegram: {
    sendMessage: mockSendMessage,
  },
};

process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.MIDTRANS_SERVER_KEY = "test-midtrans-server-key";
process.env.TRIPAY_PRIVATE_KEY = "test-tripay-private-key";
process.env.TRIPAY_MERCHANT_CODE = "test-tripay-merchant-code";
process.env.NOWPAYMENTS_IPN_SECRET = "test-nowpayments-ipn-secret";

import { webhookRoutes } from "@/routes/webhook";

function createMockRequest(body: any, headers: Record<string, string> = {}) {
  return {
    body,
    headers,
  };
}

function createMockReply() {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply;
}

function createMockServer() {
  const routes: Record<string, Record<string, Function>> = {
    post: {},
  };

  const server = {
    post: jest.fn((path: string, handler: Function) => {
      routes.post[path] = handler;
    }),
  };

  return { server, routes };
}

function generateMidtransSignature(
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

// Tripay signs `${merchantCode}${merchantRef}${amount}` with HMAC-SHA256 using
// the merchant private key — mirrors TripayService.generateSignature.
function generateTripaySignature(body: any, privateKey: string): string {
  return crypto
    .createHmac("sha256", privateKey)
    .update(
      (process.env.TRIPAY_MERCHANT_CODE || "") +
        (body.merchant_ref || "") +
        Number(body.amount ?? 0),
    )
    .digest("hex");
}

function generateNowPaymentsSignature(body: any, ipnSecret: string): string {
  const sortedBody = JSON.stringify(
    Object.keys(body)
      .sort()
      .reduce((acc: any, key) => {
        acc[key] = body[key];
        return acc;
      }, {}),
  );
  return crypto
    .createHmac("sha512", ipnSecret)
    .update(sortedBody)
    .digest("hex");
}

function generateDuitkuSignature(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
  apiKey: string,
): string {
  return crypto
    .createHash("md5")
    .update(merchantCode + amount + merchantOrderId + apiKey)
    .digest("hex");
}

describe("Webhook Routes", () => {
  let server: any;
  let routes: Record<string, Record<string, Function>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockServer = createMockServer();
    server = mockServer.server;
    routes = mockServer.routes;
    await webhookRoutes(server, { bot: mockBot as any });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Route Registration", () => {
    it("should register all webhook routes", () => {
      expect(server.post).toHaveBeenCalledWith(
        "/webhook/telegram",
        expect.any(Function),
      );
      expect(server.post).toHaveBeenCalledWith(
        "/webhook/midtrans",
        expect.any(Function),
      );
      expect(server.post).toHaveBeenCalledWith(
        "/webhook/tripay",
        expect.any(Function),
      );
      expect(server.post).toHaveBeenCalledWith(
        "/webhook/nowpayments",
        expect.any(Function),
      );
      expect(server.post).toHaveBeenCalledWith(
        "/webhook/duitku",
        expect.any(Function),
      );
    });
  });

  describe("POST /webhook/telegram", () => {
    const telegramHandler = () => routes.post["/webhook/telegram"];

    it("should process valid Telegram update successfully", async () => {
      const update = { update_id: 123, message: { text: "hello" } };
      const request = createMockRequest(update, {
        "x-telegram-bot-api-secret-token": process.env.WEBHOOK_SECRET!,
      });
      const reply = createMockReply();

      (mockHandleUpdate as any).mockResolvedValue(undefined);

      const result = await telegramHandler()(request, reply);

      expect(mockHandleUpdate).toHaveBeenCalledWith(update);
      expect(result).toBeUndefined();
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });

    it("should reject request with invalid webhook secret", async () => {
      const update = { update_id: 123, message: { text: "hello" } };
      const request = createMockRequest(update, {
        "x-telegram-bot-api-secret-token": "wrong-secret",
      });
      const reply = createMockReply();

      const result = await telegramHandler()(request, reply);

      expect(mockHandleUpdate).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
      expect(mockLogger.warn).toHaveBeenCalledWith("Invalid webhook secret");
    });

    it("should reject request with missing webhook secret", async () => {
      const update = { update_id: 123, message: { text: "hello" } };
      const request = createMockRequest(update, {});
      const reply = createMockReply();

      const result = await telegramHandler()(request, reply);

      expect(mockHandleUpdate).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("should handle bot.handleUpdate error gracefully", async () => {
      const update = { update_id: 123, message: { text: "hello" } };
      const request = createMockRequest(update, {
        "x-telegram-bot-api-secret-token": process.env.WEBHOOK_SECRET!,
      });
      const reply = createMockReply();

      const error = new Error("Bot processing error");
      (mockHandleUpdate as any).mockRejectedValue(error);

      const result = await telegramHandler()(request, reply);

      expect(result).toBeUndefined();
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ ok: true });
      // handler logs async processing error through .catch()
      await Promise.resolve();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Telegram webhook processing error:",
        error,
      );
    });

    it("should handle callback query updates", async () => {
      const update = {
        update_id: 456,
        callback_query: { id: "cb123", data: "button_click" },
      };
      const request = createMockRequest(update, {
        "x-telegram-bot-api-secret-token": process.env.WEBHOOK_SECRET!,
      });
      const reply = createMockReply();

      (mockHandleUpdate as any).mockResolvedValue(undefined);

      const result = await telegramHandler()(request, reply);

      expect(mockHandleUpdate).toHaveBeenCalledWith(update);
      expect(result).toBeUndefined();
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("POST /webhook/midtrans", () => {
    const midtransHandler = () => routes.post["/webhook/midtrans"];

    it("should process valid Midtrans notification successfully", async () => {
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const request = createMockRequest(body, {
        "x-signature": body.signature_key,
      });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      const result = await midtransHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: body.order_id }),
        body.signature_key,
        { skipSignature: true },
      );
      expect(reply.send).toHaveBeenCalledWith({ ok: true, message: "Notification processed" });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Midtrans webhook received:",
        { order_id: body.order_id, status: body.transaction_status },
      );
    });

    it("should reject an invalid Midtrans signature with 401 before touching PaymentService", async () => {
      // The webhook verifies the Midtrans SHA512 signature itself and only
      // delegates to PaymentService.handleNotification when it is valid.
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "invalid-signature",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };

      const request = createMockRequest(body, {
        "x-signature": "invalid-signature",
      });
      const reply = createMockReply();

      const result = await midtransHandler()(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid signature" });
      expect(mockPaymentServiceHandleNotification).not.toHaveBeenCalled();
    });

    it("should reject a tampered order_id with 401 before touching PaymentService", async () => {
      // The webhook recomputes the Midtrans SHA512 over the actual body; a
      // tampered order_id produces a signature mismatch and the request is
      // rejected with 401 before PaymentService is invoked.
      const originalBody = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };
      const validSignature = generateMidtransSignature(
        originalBody.order_id,
        originalBody.status_code,
        originalBody.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const tamperedBody = { ...originalBody, order_id: "TAMPERED-ORDER-ID" };
      const request = createMockRequest(tamperedBody, {
        "x-signature": validSignature,
      });
      const reply = createMockReply();

      const result = await midtransHandler()(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid signature" });
      expect(mockPaymentServiceHandleNotification).not.toHaveBeenCalled();
    });

    it("should handle PaymentService error gracefully", async () => {
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const request = createMockRequest(body, {
        "x-signature": body.signature_key,
      });
      const reply = createMockReply();

      const error = new Error("Database error");
      (mockPaymentServiceHandleNotification as any).mockRejectedValue(error);

      const result = await midtransHandler()(request, reply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Midtrans webhook error:",
        error,
      );
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });

    it("should process capture status correctly", async () => {
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "capture",
        payment_type: "credit_card",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const request = createMockRequest(body, {
        "x-signature": body.signature_key,
      });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      const result = await midtransHandler()(request, reply);

      expect(reply.send).toHaveBeenCalledWith({ ok: true, message: "Notification processed" });
    });

    it("should process pending status correctly", async () => {
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "pending",
        payment_type: "bank_transfer",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const request = createMockRequest(body, {
        "x-signature": body.signature_key,
      });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      const result = await midtransHandler()(request, reply);

      expect(reply.send).toHaveBeenCalledWith({ ok: true, message: "Notification processed" });
    });
  });

  describe("POST /webhook/tripay", () => {
    const tripayHandler = () => routes.post["/webhook/tripay"];

    it("should process valid Tripay notification successfully", async () => {
      const body = {
        reference: "TP-123456789",
        merchant_ref: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith({
        order_id: String(body.merchant_ref || ""),
        status: "success",
        gateway: "tripay",
        payment_method: "BCA",
        paid_at: null,
        amount: 50000,
      }, signature, { skipSignature: true });
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        success: true,
        message: "Notification processed",
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Tripay webhook received:",
        body,
      );
    });

    it("should reject request with invalid Tripay signature", async () => {
      const body = {
        reference: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 50000,
        signature: "invalid-signature",
        payment_method: "BCA",
      };

      const request = createMockRequest(body, {
        "x-callback-signature": "invalid-signature",
      });
      const reply = createMockReply();

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        message: "Invalid signature",
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Invalid Tripay signature",
        expect.objectContaining({ received: "invalid-signature" }),
      );
    });

    it("should accept legacy x-signature header as fallback", async () => {
      const body = {
        reference: "TP-123456789",
        merchant_ref: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: "TP-123456789",
          status: "success",
          gateway: "tripay",
        }),
        signature,
        { skipSignature: true },
      );
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        success: true,
        message: "Notification processed",
      });
    });

    it("should map PAID status to success", async () => {
      const body = {
        reference: "TP-123456789",
        merchant_ref: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should map EXPIRED status to failed", async () => {
      const body = {
        reference: "TP-123456789",
        status: "EXPIRED",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should map FAILED status to failed", async () => {
      const body = {
        reference: "TP-123456789",
        status: "FAILED",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should map CANCELLED status to failed", async () => {
      const body = {
        reference: "TP-123456789",
        status: "CANCELLED",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should map unknown status to pending", async () => {
      const body = {
        reference: "TP-123456789",
        status: "UNPAID",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should handle missing status_code gracefully", async () => {
      const body = {
        reference: "TP-123456789",
        status: "PAID",
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success", gateway: "tripay" }),
        signature,
        { skipSignature: true },
      );
    });

    it("should handle missing amount gracefully", async () => {
      const body = {
        reference: "TP-123456789",
        status: "PAID",
        status_code: 200,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await tripayHandler()(request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success", gateway: "tripay", amount: 0 }),
        signature,
        { skipSignature: true },
      );
    });

    it("should handle PaymentService error gracefully", async () => {
      const body = {
        reference: "TP-123456789",
        merchant_ref: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 50000,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      const error = new Error("Database error");
      (mockPaymentServiceHandleNotification as any).mockRejectedValue(error);

      const result = await tripayHandler()(request, reply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Tripay webhook error:",
        error,
      );
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });
  });

  describe("POST /webhook/nowpayments", () => {
    const nowpaymentsHandler = () => routes.post["/webhook/nowpayments"];

    it("should process valid NOWPayments notification successfully", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
        pay_currency: "usdtbsc",
        price_amount: 20,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockResolvedValue(undefined);

      const result = await nowpaymentsHandler()(request, reply);

      expect(mockNowPaymentsServiceHandleWebhook).toHaveBeenCalledWith(body);
      expect(result).toEqual({ ok: true, message: "Credits added" });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "NOWPayments webhook received:",
        body,
      );
    });

    it("should reject request with invalid NOWPayments signature", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
      };

      const request = createMockRequest(body, {
        "x-nowpayments-sig": "invalid-signature",
      });
      const reply = createMockReply();

      const result = await nowpaymentsHandler()(request, reply);

      expect(mockNowPaymentsServiceHandleWebhook).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid signature" });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "NOWPayments: invalid IPN signature",
      );
    });

    it("should process request without signature when IPN_SECRET not set", async () => {
      const originalSecret = process.env.NOWPAYMENTS_IPN_SECRET;
      delete process.env.NOWPAYMENTS_IPN_SECRET;

      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
      };

      const request = createMockRequest(body, {});
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });

      const result = await nowpaymentsHandler()(request, reply);

      expect(mockNowPaymentsServiceHandleWebhook).toHaveBeenCalledWith(body);
      expect(result).toEqual({ ok: true, message: "Credits added" });

      process.env.NOWPAYMENTS_IPN_SECRET = originalSecret;
    });

    it("should send Telegram notification when credits are added", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
        pay_currency: "usdtbsc",
        price_amount: 20,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockResolvedValue(undefined);

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).toHaveBeenCalledWith(
        "123456789",
        expect.stringContaining("Pembayaran Crypto Berhasil"),
        { parse_mode: "Markdown" },
      );
    });

    it("should extract telegram ID from order_id correctly", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-999888777",
        payment_id: 98765,
        pay_currency: "bnbbsc",
        price_amount: 50,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockResolvedValue(undefined);

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).toHaveBeenCalledWith(
        "999888777",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should not send notification when credits are not added", async () => {
      const body = {
        payment_status: "waiting",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Status noted",
      });

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should not send notification when success is false", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: false,
        message: "Transaction not found",
      });

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should handle notification send failure gracefully", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
        pay_currency: "usdtbsc",
        price_amount: 20,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockRejectedValue(
        new Error("Telegram API error"),
      );

      const result = await nowpaymentsHandler()(request, reply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to notify user about crypto payment:",
        expect.any(Error),
      );
      expect(result).toEqual({ ok: true, message: "Credits added" });
    });

    it("should use default coin when pay_currency is missing", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
        price_amount: 20,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockResolvedValue(undefined);

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("CRYPTO"),
        expect.any(Object),
      );
    });

    it("should handle missing price_amount gracefully", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
        pay_currency: "usdtbsc",
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });
      (mockSendMessage as any).mockResolvedValue(undefined);

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining("$"),
        expect.any(Object),
      );
    });

    it("should handle NowPaymentsService error gracefully", async () => {
      const body = {
        payment_status: "finished",
        order_id: "CRYPTO-1234567890-123456789",
        payment_id: 98765,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      const error = new Error("Service error");
      (mockNowPaymentsServiceHandleWebhook as any).mockRejectedValue(error);

      const result = await nowpaymentsHandler()(request, reply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "NOWPayments webhook error:",
        error,
      );
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });

    it("should not send notification when order_id is missing", async () => {
      const body = {
        payment_status: "finished",
        payment_id: 98765,
      };
      const signature = generateNowPaymentsSignature(
        body,
        process.env.NOWPAYMENTS_IPN_SECRET!,
      );

      const request = createMockRequest(body, {
        "x-nowpayments-sig": signature,
      });
      const reply = createMockReply();

      (mockNowPaymentsServiceHandleWebhook as any).mockResolvedValue({
        success: true,
        message: "Credits added",
      });

      await nowpaymentsHandler()(request, reply);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("POST /webhook/duitku", () => {
    const duitkuHandler = () => routes.post["/webhook/duitku"];

    it("should process valid Duitku callback successfully", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-1234567890-123456789",
        resultCode: "00",
        reference: "DUTK-REF-123",
        signature: "",
      };
      body.signature = generateDuitkuSignature(
        body.merchantCode,
        body.amount,
        body.merchantOrderId,
        process.env.DUITKU_API_KEY || "",
      );

      const request = createMockRequest(body);
      const reply = createMockReply();

      (mockDuitkuServiceHandleCallback as any).mockResolvedValue({
        success: true,
        message: "Callback processed",
      });

      const result = await duitkuHandler()(request, reply);

      expect(mockDuitkuServiceHandleCallback).toHaveBeenCalledWith({
        merchantCode: body.merchantCode,
        amount: body.amount,
        merchantOrderId: body.merchantOrderId,
        resultCode: body.resultCode,
        reference: body.reference,
        signature: body.signature,
      });
      expect(result).toEqual({ ok: true, message: "Callback processed" });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Duitku callback received:",
        body,
      );
    });

    it("should handle failed payment callback", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-1234567890-123456789",
        resultCode: "02",
        reference: "DUTK-REF-123",
        signature: "",
      };
      body.signature = generateDuitkuSignature(
        body.merchantCode,
        body.amount,
        body.merchantOrderId,
        process.env.DUITKU_API_KEY || "",
      );

      const request = createMockRequest(body);
      const reply = createMockReply();

      (mockDuitkuServiceHandleCallback as any).mockResolvedValue({
        success: true,
        message: "Callback processed",
      });

      const result = await duitkuHandler()(request, reply);

      expect(result).toEqual({ ok: true, message: "Callback processed" });
    });

    it("should handle pending payment callback", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-1234567890-123456789",
        resultCode: "01",
        reference: "DUTK-REF-123",
        signature: "",
      };
      body.signature = generateDuitkuSignature(
        body.merchantCode,
        body.amount,
        body.merchantOrderId,
        process.env.DUITKU_API_KEY || "",
      );

      const request = createMockRequest(body);
      const reply = createMockReply();

      (mockDuitkuServiceHandleCallback as any).mockResolvedValue({
        success: true,
        message: "Callback processed",
      });

      const result = await duitkuHandler()(request, reply);

      expect(result).toEqual({ ok: true, message: "Callback processed" });
    });

    it("should handle DuitkuService error gracefully", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-1234567890-123456789",
        resultCode: "00",
        reference: "DUTK-REF-123",
        signature: "",
      };
      body.signature = generateDuitkuSignature(
        body.merchantCode,
        body.amount,
        body.merchantOrderId,
        process.env.DUITKU_API_KEY || "",
      );

      const request = createMockRequest(body);
      const reply = createMockReply();

      const error = new Error("Database error");
      (mockDuitkuServiceHandleCallback as any).mockRejectedValue(error);

      const result = await duitkuHandler()(request, reply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Duitku webhook error:",
        error,
      );
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });

    it("should handle invalid signature from DuitkuService", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-1234567890-123456789",
        resultCode: "00",
        reference: "DUTK-REF-123",
        signature: "invalid-signature",
      };

      const request = createMockRequest(body);
      const reply = createMockReply();

      (mockDuitkuServiceHandleCallback as any).mockResolvedValue({
        success: false,
        message: "Invalid signature",
      });

      const result = await duitkuHandler()(request, reply);

      expect(result).toEqual({ ok: false, message: "Invalid signature" });
    });

    it("should handle transaction not found from DuitkuService", async () => {
      const body = {
        merchantCode: "DS12345",
        amount: "50000",
        merchantOrderId: "OC-NON-EXISTENT",
        resultCode: "00",
        reference: "DUTK-REF-123",
        signature: "",
      };

      const request = createMockRequest(body);
      const reply = createMockReply();

      (mockDuitkuServiceHandleCallback as any).mockResolvedValue({
        success: false,
        message: "Transaction not found",
      });

      const result = await duitkuHandler()(request, reply);

      expect(result).toEqual({ ok: false, message: "Transaction not found" });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty request body for telegram webhook", async () => {
      const request = createMockRequest(
        {},
        {
          "x-telegram-bot-api-secret-token": process.env.WEBHOOK_SECRET!,
        },
      );
      const reply = createMockReply();

      (mockHandleUpdate as any).mockResolvedValue(undefined);

      const result = await routes.post["/webhook/telegram"](request, reply);

      expect(result).toBeUndefined();
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });

    it("should handle concurrent webhook requests", async () => {
      const body = {
        order_id: "OC-1234567890-123456789-ABC123",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      const requests = Array(3)
        .fill(null)
        .map(() => {
          const request = createMockRequest(body, {
            "x-signature": body.signature_key,
          });
          const reply = createMockReply();
          return routes.post["/webhook/midtrans"](request, reply);
        });

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.send).toHaveBeenCalledWith({ ok: true, message: "Notification processed" });
      });
    });

    it("should handle special characters in order IDs", async () => {
      const body = {
        order_id: "OC-123-456-ABC-!@#$%^&*()",
        status_code: "200",
        gross_amount: "50000",
        signature_key: "",
        transaction_status: "settlement",
        payment_type: "bank_transfer",
      };
      body.signature_key = generateMidtransSignature(
        body.order_id,
        body.status_code,
        body.gross_amount,
        process.env.MIDTRANS_SERVER_KEY!,
      );

      const request = createMockRequest(body, {
        "x-signature": body.signature_key,
      });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      const result = await routes.post["/webhook/midtrans"](request, reply);

      expect(reply.send).toHaveBeenCalledWith({ ok: true, message: "Notification processed" });
    });

    it("should handle very large amounts", async () => {
      const body = {
        reference: "TP-123456789",
        status: "PAID",
        status_code: 200,
        amount: 999999999,
        signature: "",
        payment_method: "BCA",
      };
      const signature = generateTripaySignature(
        body,
        process.env.TRIPAY_PRIVATE_KEY!,
      );

      const request = createMockRequest(body, { "x-callback-signature": signature });
      const reply = createMockReply();

      (mockPaymentServiceHandleNotification as any).mockResolvedValue({
        success: true,
        message: "Notification processed",
      });

      await routes.post["/webhook/tripay"](request, reply);

      expect(mockPaymentServiceHandleNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: "",
          status: "success",
          gateway: "tripay",
          amount: 999999999,
          payment_method: "BCA",
          paid_at: null,
        }),
        signature,
        { skipSignature: true },
      );
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        success: true,
        message: "Notification processed",
      });
    });
  });
});
