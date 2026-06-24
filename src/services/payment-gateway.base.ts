/**
 * PaymentGatewayBase — abstract base class for payment gateway integrations.
 *
 * Per REFACTORING_AUDIT.md §4.1, eliminates ~950 lines of duplicated code
 * across tripay, duitku, and nowpayments services.
 *
 * Pattern (Template Method):
 *   Each gateway subclasses PaymentGatewayBase and implements:
 *   - gatewayName (string)
 *   - getApiBaseUrl() (production vs sandbox)
 *   - getApiCredentials() (key/secret)
 *   - buildOrderId(userId) - format gateway-specific order id
 *   - buildCreatePaymentPayload(order) - gateway-specific request body
 *   - parseCreatePaymentResponse(response) - extract orderId/paymentUrl
 *   - verifyWebhookSignature(body, signature) - validate incoming webhooks
 *
 * Shared concerns in base:
 *   - Order id generation with crypto random
 *   - Package lookup with validation
 *   - Standardized error handling
 *   - Webhook event normalization
 */
import crypto from 'crypto';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getPackagesAsync } from '@/config/pricing';
import { getConfig } from '@/config/env';
import { ValidationError, PaymentError } from '@/utils/app-errors';

export interface CreatePaymentParams {
  userId: bigint;
  packageId: string;
  username: string;
  email?: string;
  phone?: string;
  paymentMethod?: string;
}

export interface CreatePaymentResult {
  orderId: string;
  paymentUrl: string;
  vaNumber?: string;
  reference?: string;
  rawResponse?: unknown;
}

export interface WebhookEvent {
  orderId: string;
  status: 'paid' | 'failed' | 'pending' | 'expired';
  amount?: number;
  paidAt?: Date;
  rawEvent: unknown;
}

export interface OrderContext {
  orderId: string;
  userId: bigint;
  packageId: string;
  amount: number;
  credits: number;
  username: string;
}

export abstract class PaymentGatewayBase {
  /** Short identifier (e.g., "tripay", "duitku", "nowpayments") */
  abstract readonly gatewayName: string;

  /** Get the API base URL (production or sandbox) */
  protected abstract getApiBaseUrl(): string;

  /** Get API credentials (key, secret) */
  protected abstract getApiCredentials(): { apiKey: string; secretKey?: string; merchantCode?: string };

  /** Build the gateway-specific order id */
  protected abstract buildOrderId(userId: bigint): string;

  /** Build the gateway-specific request payload for creating a payment */
  protected abstract buildCreatePaymentPayload(order: OrderContext, callbackUrl: string, returnUrl: string): unknown;

  /** Parse the gateway-specific response and return the standard result */
  protected abstract parseCreatePaymentResponse(response: unknown): CreatePaymentResult;

  /** Verify the signature of an incoming webhook */
  protected abstract verifyWebhookSignature(body: string, signature: string): boolean;

  /** Optional: normalize a webhook event into the standard format */
  protected normalizeWebhookEvent(rawEvent: unknown): WebhookEvent {
    // Default implementation - subclasses can override
    const event = rawEvent as Record<string, unknown>;
    return {
      orderId: String(event.merchant_ref || event.orderId || event.reference || ''),
      status: this.mapStatus(String(event.status || '')),
      amount: Number(event.amount || event.total_amount || 0),
      paidAt: event.paid_at ? new Date(String(event.paid_at)) : undefined,
      rawEvent,
    };
  }

  /** Map gateway-specific status string to standard status */
  protected mapStatus(rawStatus: string): WebhookEvent['status'] {
    const s = rawStatus.toUpperCase();
    if (['PAID', 'SUCCESS', 'COMPLETED', 'CONFIRMED'].includes(s)) return 'paid';
    if (['FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(s)) return 'failed';
    return 'pending';
  }

  /**
   * Look up the package and build the order context.
   * Subclasses should call this from their createTransaction() method.
   */
  protected async buildOrderContext(params: CreatePaymentParams): Promise<OrderContext> {
    const packages = await getPackagesAsync();
    const pkg = packages.find((p) => p.id === params.packageId);
    if (!pkg) {
      throw new ValidationError('Invalid package', 'packageId');
    }
    const credits = pkg.credits + (pkg.bonus || 0);
    const orderId = this.buildOrderId(params.userId);
    return {
      orderId,
      userId: params.userId,
      packageId: params.packageId,
      amount: pkg.priceIdr || pkg.priceIdr,
      credits,
      username: params.username,
    };
  }

  /** Generate a random suffix for order IDs */
  protected randomSuffix(length = 6): string {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length)
      .toUpperCase();
  }

  /** Standardized error logging for gateway failures */
  protected logGatewayError(operation: string, error: unknown, context?: Record<string, unknown>): void {
    logger.error(`[${this.gatewayName}] ${operation} failed:`, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
  }

  /**
   * Default implementation of createTransaction.
   * Subclasses can override if they need special behavior, but most can use this as-is.
   */
  async createTransaction(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const order = await this.buildOrderContext(params);
    const callbackUrl = `${getConfig().WEBHOOK_URL}/webhook/${this.gatewayName}`;
    const returnUrl = `${getConfig().WEBHOOK_URL}/payment/finish`;
    const payload = this.buildCreatePaymentPayload(order, callbackUrl, returnUrl);

    try {
      // Subclass-specific HTTP call is expected to be made here, but to keep
      // the base class HTTP-agnostic, we delegate to a hook. Default: throw.
      throw new PaymentError(this.gatewayName, 'createTransaction() not implemented. Override in subclass.');
    } catch (error: any) {
      if (error instanceof PaymentError) throw error;
      this.logGatewayError('createTransaction', error, { orderId: order.orderId });
      throw new PaymentError(this.gatewayName, `Transaction creation failed: ${error.message}`);
    }
  }

  /**
   * Default implementation of webhook handler.
   * Subclasses override to add gateway-specific signature verification.
   */
  async handleWebhook(rawBody: string, signature: string, parsed: unknown): Promise<WebhookEvent> {
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      throw new PaymentError(this.gatewayName, 'Invalid webhook signature');
    }
    return this.normalizeWebhookEvent(parsed);
  }
}

/**
 * Helper: build a webhook event with sensible defaults.
 */
export function buildWebhookEvent(
  gateway: string,
  orderId: string,
  status: WebhookEvent['status'],
  amount?: number,
): WebhookEvent {
  return {
    orderId,
    status,
    amount,
    paidAt: status === 'paid' ? new Date() : undefined,
    rawEvent: { gateway, orderId, status, amount },
  };
}
