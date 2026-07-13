/**
 * Payment webhook integration tests
 *
 * Tests the HTTP-level behaviour of all payment webhook endpoints:
 * - Telegram webhook (secret-token guard)
 * - Midtrans (SHA-512 HMAC signature)
 * - Tripay  (SHA-256 HMAC signature)
 * - NOWPayments (SHA-512 HMAC sorted-body signature)
 * - Duitku  (MD5 signature)
 *
 * All downstream services are mocked — this file only validates routing,
 * signature checking, and HTTP response codes.
 */

import request from 'supertest';
import fastify from 'fastify';
import crypto from 'crypto';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const TEST_TRIPAY_PRIVATE_KEY = 'test-tripay-private-key';
const TEST_MIDTRANS_SERVER_KEY = 'test-midtrans-server-key';
const TEST_NOWPAYMENTS_IPN_SECRET = 'test-nowpayments-ipn-secret';
const TEST_DUITKU_MERCHANT_CODE = 'D1234';
const TEST_DUITKU_API_KEY = 'test-duitku-api-key';

process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.TRIPAY_PRIVATE_KEY = TEST_TRIPAY_PRIVATE_KEY;
process.env.MIDTRANS_SERVER_KEY = TEST_MIDTRANS_SERVER_KEY;
process.env.NOWPAYMENTS_IPN_SECRET = TEST_NOWPAYMENTS_IPN_SECRET;
process.env.DUITKU_MERCHANT_CODE = TEST_DUITKU_MERCHANT_CODE;
process.env.DUITKU_API_KEY = TEST_DUITKU_API_KEY;
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
    TRIPAY_PRIVATE_KEY: 'test-tripay-private-key',
    MIDTRANS_SERVER_KEY: 'test-midtrans-server-key',
    NOWPAYMENTS_IPN_SECRET: 'test-nowpayments-ipn-secret',
    DUITKU_MERCHANT_CODE: 'D1234',
    DUITKU_API_KEY: 'test-duitku-api-key',
    MIDTRANS_ENVIRONMENT: 'sandbox',
    DUITKU_ENVIRONMENT: 'sandbox',
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
    publish: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    transaction: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/config/queue', () => ({
  videoQueue: { add: jest.fn() },
  paymentQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
  billingQueue: { add: jest.fn() },
  cleanupQueue: { add: jest.fn() },
}));

jest.mock('../../src/workers/retention.worker', () => ({
  retentionQueue: { add: jest.fn() },
  RetentionWorker: jest.fn(),
}));

jest.mock('../../src/services/payment.service', () => ({
  PaymentService: {
    handleNotification: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
  },
}));

jest.mock('../../src/services/duitku.service', () => ({
  DuitkuService: {
    handleCallback: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
  },
}));

jest.mock('../../src/services/nowpayments.service', () => ({
  NowPaymentsService: {
    handleWebhook: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
  },
}));

jest.mock('../../src/services/user.service', () => ({
  UserService: {
    findByTelegramId: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/services/admin-alert.service', () => ({
  sendAdminAlert: jest.fn(),
}));

// ── Signature helpers ──────────────────────────────────────────────────────

function midtransSignature(orderId: string, statusCode: string, grossAmount: string): string {
  return crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${TEST_MIDTRANS_SERVER_KEY}`)
    .digest('hex');
}

function tripaySignature(body: object): string {
  return crypto
    .createHmac('sha256', TEST_TRIPAY_PRIVATE_KEY)
    .update(JSON.stringify(body))
    .digest('hex');
}

function nowpaymentsSignature(body: object): string {
  const sorted = JSON.stringify(
    Object.keys(body as any)
      .sort()
      .reduce((acc: any, key) => { acc[key] = (body as any)[key]; return acc; }, {}),
  );
  return crypto
    .createHmac('sha512', TEST_NOWPAYMENTS_IPN_SECRET)
    .update(sorted)
    .digest('hex');
}

function duitkuSignature(merchantCode: string, amount: string, orderId: string): string {
  return crypto
    .createHash('md5')
    .update(`${merchantCode}${amount}${orderId}${TEST_DUITKU_API_KEY}`)
    .digest('hex');
}

// ── Test suite ─────────────────────────────────────────────────────────────

let webhookRoutes: (server: any, options: any) => Promise<void>;
let isolatedPaymentService: any;
let isolatedDuitkuService: any;
let isolatedNowPaymentsService: any;

// Minimal Telegraf bot stub (webhookRoutes requires a bot instance)
const mockBot = {
  handleUpdate: jest.fn().mockResolvedValue(undefined),
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({}),
  },
};

describe('Payment Webhook Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      jest.isolateModules(async () => {
        ({ webhookRoutes } = require('../../src/routes/webhook'));
        ({ PaymentService: isolatedPaymentService } = require('../../src/services/payment.service'));
        ({ DuitkuService: isolatedDuitkuService } = require('../../src/services/duitku.service'));
        ({ NowPaymentsService: isolatedNowPaymentsService } = require('../../src/services/nowpayments.service'));
        resolve();
      });
    });

    app = fastify({ logger: false });
    await app.register(webhookRoutes, { bot: mockBot });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Telegram webhook ──

  describe('POST /webhook/telegram', () => {
    it('returns 401 when x-telegram-bot-api-secret-token header is missing', async () => {
      const res = await request(app.server)
        .post('/webhook/telegram')
        .send({ update_id: 1 });
      expect(res.status).toBe(401);
    });

    it('returns 401 when x-telegram-bot-api-secret-token header is wrong', async () => {
      const res = await request(app.server)
        .post('/webhook/telegram')
        .set('x-telegram-bot-api-secret-token', 'wrong-secret')
        .send({ update_id: 1 });
      expect(res.status).toBe(401);
    });

    it('returns 200 ok:true when correct secret is supplied', async () => {
      const res = await request(app.server)
        .post('/webhook/telegram')
        .set('x-telegram-bot-api-secret-token', TEST_WEBHOOK_SECRET)
        .send({ update_id: 1, message: { text: 'hi' } });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Midtrans webhook ──

  describe('POST /webhook/midtrans', () => {
    it('calls PaymentService.handleNotification with the normalized payload', async () => {
      const orderId = 'OC-123456-789-ABC';
      const statusCode = '200';
      const grossAmount = '50000.00';
      const signature = midtransSignature(orderId, statusCode, grossAmount);

      const res = await request(app.server)
        .post('/webhook/midtrans')
        .send({
          order_id: orderId,
          status_code: statusCode,
          gross_amount: grossAmount,
          signature_key: signature,
          transaction_status: 'settlement',
          payment_type: 'bank_transfer',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(isolatedPaymentService.handleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: orderId }),
        signature,
      );
    });

    it('returns 200 ok:true even on deny status (PaymentService handles status mapping)', async () => {
      const orderId = 'OC-DENY-1';
      const statusCode = '202';
      const grossAmount = '25000.00';
      const signature = midtransSignature(orderId, statusCode, grossAmount);

      const res = await request(app.server)
        .post('/webhook/midtrans')
        .send({
          order_id: orderId,
          status_code: statusCode,
          gross_amount: grossAmount,
          signature_key: signature,
          transaction_status: 'deny',
          payment_type: 'credit_card',
        });

      expect(res.status).toBe(200);
    });
  });

  // ── Tripay webhook ──

  describe('POST /webhook/tripay', () => {
    it('returns 401 when x-signature header is missing', async () => {
      const body = { merchant_ref: 'TRP-001', status: 'PAID', amount: 50000 };
      const res = await request(app.server)
        .post('/webhook/tripay')
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 401 when x-signature is wrong', async () => {
      const body = { merchant_ref: 'TRP-001', status: 'PAID', amount: 50000 };
      const res = await request(app.server)
        .post('/webhook/tripay')
        .set('x-signature', 'bad-signature')
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 200 ok:true when x-signature is valid', async () => {
      const body = {
        merchant_ref: 'TRP-001',
        status: 'PAID',
        amount: 50000,
        status_code: 200,
        payment_method: 'BRIVA',
        signature: 'some-tripay-sig',
      };
      const sig = tripaySignature(body);

      const res = await request(app.server)
        .post('/webhook/tripay')
        .set('x-signature', sig)
        .send(body);

      expect(res.status).toBe(200);
    });

    it('passes EXPIRED status through PaymentService.handleNotification', async () => {
      const body = {
        merchant_ref: 'TRP-002',
        status: 'EXPIRED',
        amount: 25000,
        status_code: 200,
        payment_method: 'BRIVA',
        signature: 'tripay-sig',
      };
      const sig = tripaySignature(body);

      await request(app.server)
        .post('/webhook/tripay')
        .set('x-signature', sig)
        .send(body);

      expect(isolatedPaymentService.handleNotification).toHaveBeenCalledWith(
        expect.objectContaining({ transaction_status: 'failed' }),
      );
    });
  });

  // ── NOWPayments webhook ──

  describe('POST /webhook/nowpayments', () => {
    it('returns 400 when x-nowpayments-sig header is missing', async () => {
      const body = { order_id: 'CRYPTO-1-123', payment_status: 'finished', payment_id: 'np-1' };
      const res = await request(app.server)
        .post('/webhook/nowpayments')
        .send(body);
      expect(res.status).toBe(400);
    });

    it('returns 401 when x-nowpayments-sig is invalid', async () => {
      const body = { order_id: 'CRYPTO-1-123', payment_status: 'finished', payment_id: 'np-1' };
      const res = await request(app.server)
        .post('/webhook/nowpayments')
        .set('x-nowpayments-sig', 'bad-sig')
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 200 ok:true when signature is valid', async () => {
      const body = {
        order_id: 'CRYPTO-1614000000000-987654321',
        payment_status: 'finished',
        payment_id: 'np-42',
        pay_currency: 'BTC',
        price_amount: '10.00',
      };
      const sig = nowpaymentsSignature(body);

      const res = await request(app.server)
        .post('/webhook/nowpayments')
        .set('x-nowpayments-sig', sig)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBeDefined();
    });

    it('calls NowPaymentsService.handleWebhook with the request body', async () => {
      const body = {
        order_id: 'CRYPTO-1614000000001-111222333',
        payment_status: 'confirmed',
        payment_id: 'np-99',
      };
      const sig = nowpaymentsSignature(body);

      await request(app.server)
        .post('/webhook/nowpayments')
        .set('x-nowpayments-sig', sig)
        .send(body);

      expect(isolatedNowPaymentsService.handleWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: body.order_id }),
      );
    });
  });

  // ── Duitku webhook ──

  describe('POST /webhook/duitku', () => {
    it('calls DuitkuService.handleCallback with the request body fields', async () => {
      const orderId = 'DQ-001';
      const amount = '75000';
      const signature = duitkuSignature(TEST_DUITKU_MERCHANT_CODE, amount, orderId);

      const body = {
        merchantCode: TEST_DUITKU_MERCHANT_CODE,
        amount,
        merchantOrderId: orderId,
        resultCode: '00',
        reference: 'DQ-REF-001',
        signature,
      };

      const res = await request(app.server)
        .post('/webhook/duitku')
        .send(body);

      expect(res.status).toBe(200);
      expect(isolatedDuitkuService.handleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantCode: TEST_DUITKU_MERCHANT_CODE,
          merchantOrderId: orderId,
          resultCode: '00',
        }),
      );
    });

    it('returns 200 with ok:true on successful callback processing', async () => {
      isolatedDuitkuService.handleCallback.mockResolvedValueOnce({ success: true, message: 'Credits added' });

      const orderId = 'DQ-002';
      const amount = '50000';
      const signature = duitkuSignature(TEST_DUITKU_MERCHANT_CODE, amount, orderId);

      const res = await request(app.server)
        .post('/webhook/duitku')
        .send({
          merchantCode: TEST_DUITKU_MERCHANT_CODE,
          amount,
          merchantOrderId: orderId,
          resultCode: '00',
          reference: 'DQ-REF-002',
          signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns ok:false when DuitkuService.handleCallback indicates failure', async () => {
      isolatedDuitkuService.handleCallback.mockResolvedValueOnce({ success: false, message: 'Invalid signature' });

      const res = await request(app.server)
        .post('/webhook/duitku')
        .send({
          merchantCode: TEST_DUITKU_MERCHANT_CODE,
          amount: '10000',
          merchantOrderId: 'DQ-FAIL',
          resultCode: '99',
          reference: 'DQ-REF-FAIL',
          signature: 'any-value',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
    });
  });
});
