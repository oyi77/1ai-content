/**
 * Tests for PaymentGatewayBase abstract class.
 * Demonstrates the template-method pattern for payment gateways.
 */
import { jest } from '@jest/globals';
import { PaymentGatewayBase, buildWebhookEvent } from '@/services/payment-gateway.base';
import { ValidationError, PaymentError } from '@/utils/app-errors';

jest.mock('@/config/pricing', () => ({
  getPackagesAsync: jest.fn(async () => [
    { id: 'test-package', credits: 100, bonus: 10, priceIdr: 50000, name: 'Test' },
  ]),
}));

class TestGateway extends PaymentGatewayBase {
  readonly gatewayName = 'test';

  protected getApiBaseUrl(): string {
    return 'https://test.example.com';
  }

  protected getApiCredentials() {
    return { apiKey: 'test-key' };
  }

  protected buildOrderId(userId: bigint): string {
    return `TEST-${Date.now()}-${userId}-${this.randomSuffix()}`;
  }

  protected buildCreatePaymentPayload() {
    return { test: true };
  }

  protected parseCreatePaymentResponse() {
    return { orderId: 'TEST-1', paymentUrl: 'https://test/pay' };
  }

  protected verifyWebhookSignature(body: string, signature: string): boolean {
    return signature === 'valid-sig';
  }

  // Expose protected methods for testing
  public testBuildOrderContext = (params: any) => this.buildOrderContext(params);
  public testRandomSuffix = (n?: number) => this.randomSuffix(n);
  public testMapStatus = (s: string) => this.mapStatus(s);
  public testNormalize = (e: any) => this.normalizeWebhookEvent(e);
}

describe('PaymentGatewayBase', () => {
  let gateway: TestGateway;

  beforeEach(() => {
    gateway = new TestGateway();
  });

  it('exposes a gatewayName', () => {
    expect(gateway.gatewayName).toBe('test');
  });

  it('builds a unique order id per user', async () => {
    const order = await gateway.testBuildOrderContext({
      userId: 123n,
      packageId: 'test-package',
      username: 'alice',
    });
    expect(order.orderId).toMatch(/^TEST-\d+-123-[A-F0-9]+$/);
    expect(order.userId).toBe(123n);
  });

  it('throws ValidationError for unknown package', async () => {
    let caught: unknown = null;
    try {
      await gateway.testBuildOrderContext({
        userId: 1n,
        packageId: 'nonexistent',
        username: 'x',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
  });

  it('generates random suffix of correct length', () => {
    expect(gateway.testRandomSuffix()).toHaveLength(6);
    expect(gateway.testRandomSuffix(8)).toHaveLength(8);
  });

  it('maps status strings correctly', () => {
    expect(gateway.testMapStatus('PAID')).toBe('paid');
    expect(gateway.testMapStatus('SUCCESS')).toBe('paid');
    expect(gateway.testMapStatus('FAILED')).toBe('failed');
    expect(gateway.testMapStatus('EXPIRED')).toBe('failed');
    expect(gateway.testMapStatus('PENDING')).toBe('pending');
  });

  it('normalizes webhook events', () => {
    const event = gateway.testNormalize({
      merchant_ref: 'TEST-1',
      status: 'PAID',
      amount: 10000,
    });
    expect(event.orderId).toBe('TEST-1');
    expect(event.status).toBe('paid');
    expect(event.amount).toBe(10000);
  });

  it('verifies webhook signatures', async () => {
    await expect(gateway.handleWebhook('body', 'valid-sig', { ok: true }))
      .resolves.toBeDefined();
    let caught: unknown = null;
    try {
      await gateway.handleWebhook('body', 'bad-sig', { ok: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PaymentError);
  });

  it('buildWebhookEvent sets paidAt for paid status', () => {
    const event = buildWebhookEvent('test', 'ORDER-1', 'paid', 5000);
    expect(event.orderId).toBe('ORDER-1');
    expect(event.status).toBe('paid');
    expect(event.amount).toBe(5000);
    expect(event.paidAt).toBeInstanceOf(Date);
  });

  it('buildWebhookEvent omits paidAt for non-paid status', () => {
    const event = buildWebhookEvent('test', 'ORDER-1', 'failed');
    expect(event.paidAt).toBeUndefined();
  });

  it('default createTransaction throws when not implemented', async () => {
    let caught: unknown = null;
    try {
      await gateway.createTransaction({
        userId: 1n,
        packageId: 'any',
        username: 'test',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
  });
});
