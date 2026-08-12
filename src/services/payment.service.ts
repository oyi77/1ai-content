/**
 * Payment Service — 1ai-payment API Integration
 *
 * Handles unified payment gateway integration via 1ai-payment API.
 * Supports: Midtrans, Tripay, Duitku, NOWPayments
 *
 * Migration from direct gateway calls to centralized 1ai-payment:
 * - All gateway calls go through 1ai-payment HTTP API
 * - Webhook signatures verified using 1ai-payment secret
 * - Order ID passed as Idempotency-Key for safe retries
 * - Normalized event format from all gateways
 */

import axios, { AxiosError } from "axios";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { ReferralService } from "@/services/referral.service";
import { SubscriptionService } from "@/services/subscription.service";
import { AnalyticsService } from "@/services/analytics.service";
import {
  PlanKey,
  BillingCycle,
  SUBSCRIPTION_PLANS,
  getPlanPrice,
  getPackagesAsync,
  getSubscriptionPlansAsync,
} from "@/config/pricing";
import crypto from "crypto";
import { Telegraf } from "telegraf";
import { secureRandomString } from "@/utils/crypto";
import { t } from "@/i18n/translations";
import { getConfig } from "@/config/env";
import {
  ValidationError,
  PaymentError,
  NotFoundError,
} from "@/utils/app-errors";

/**
 * Typed response from 1ai-payment API create payment endpoint
 */
interface PaymentApiResponse {
  success: boolean;
  data: {
    id: string;
    gateway: string;
    gateway_reference: string;
    status: "pending" | "success" | "failed" | "expired" | "cancelled";
    amount: number;
    currency: string;
    payment_url: string;
    payment_method: string | null;
    expires_at: string | null;
    created_at: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Typed forwarded webhook event from 1ai-payment
 */
interface ForwardedPaymentEvent {
  event:
    | "payment.success"
    | "payment.pending"
    | "payment.failed"
    | "payment.expired"
    | "payment.cancelled";
  gateway: string;
  order_id: string;
  gateway_reference: string | null;
  status: "success" | "pending" | "failed" | "expired" | "cancelled";
  amount: number;
  currency: string;
  payment_method: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

/**
 * Get 1ai-payment API configuration
 */
function get1aiPaymentConfig() {
  const config = getConfig();
  return {
    baseUrl: config["1AI_PAYMENT_URL"],
    apiKey: config["1AI_PAYMENT_API_KEY"] || "test-key",
    webhookSecret: config["1AI_PAYMENT_WEBHOOK_SECRET"] || "",
  };
}

export class PaymentService {
  /** Optional reference to the running Telegraf bot instance for sending fulfillment notifications. */
  private static botInstance: Telegraf | null = null;

  /**
   * Register the bot instance so the service can send proactive messages.
   */
  static setBotInstance(bot: Telegraf): void {
    this.botInstance = bot;
  }

  /**
   * Retrieve the registered bot instance (used by other payment services).
   */
  static getBotInstance(): Telegraf | null {
    return this.botInstance;
  }

  /**
   * Create a payment via 1ai-payment API
   * Uses order_id as idempotency key for safe retries
   */
  static async createTransaction(params: {
    userId: bigint;
    packageId: string;
    username?: string;
    gateway: "midtrans" | "tripay" | "duitku" | "nowpayments";
    paymentMethod?: string;
  }): Promise<{ orderId: string; token: string; redirectUrl: string }> {
    // Resolve package: topup package (e.g. "starter") or web subscription (e.g. "sub_pro_monthly")
    let type: "topup" | "subscription" = "topup";
    let packageName = params.packageId;
    let price: number;
    let credits: number;

    if (params.packageId.startsWith("sub_")) {
      // Web subscription buy — mint like the bot flow (type 'subscription', packageName `${plan}_${cycle}`)
      const [planKey, billingCycle] = params.packageId.slice(4).split("_") as [
        PlanKey,
        BillingCycle | undefined,
      ];
      const plan = SUBSCRIPTION_PLANS[planKey];
      if (
        !plan ||
        !billingCycle ||
        (billingCycle !== "monthly" && billingCycle !== "annual")
      ) {
        throw new ValidationError("Invalid package", "packageId");
      }
      type = "subscription";
      packageName = `${planKey}_${billingCycle}`;
      price = getPlanPrice(planKey, billingCycle);
      credits = plan.monthlyCredits;
    } else {
      const packages = await getPackagesAsync();
      const pkg = packages.find((p) => p.id === params.packageId);
      if (!pkg) {
        throw new ValidationError("Invalid package", "packageId");
      }
      price = pkg.priceIdr || 0;
      credits = pkg.credits + (pkg.bonus || 0);
    }

    // Generate order ID — ensures uniqueness
    const timestamp = Date.now();
    const random = secureRandomString(6);
    const orderId = `OC-${timestamp}-${params.userId}-${random}`;

    // Create transaction record locally first
    await prisma.transaction.create({
      data: {
        orderId,
        userId: params.userId,
        type,
        packageName,
        amountIdr: price,
        creditsAmount: credits,
        gateway: "unified",
        status: "pending",
      },
    });

    try {
      const paymentConfig = get1aiPaymentConfig();
      const callbackUrl = `${getConfig().WEBHOOK_URL}/webhook/1ai-payment`;

      const requestBody: Record<string, unknown> = {
        gateway: params.gateway,
        amount: price,
        currency: "IDR",
        project_order_id: orderId,
        callback_url: callbackUrl,
        metadata: {
          userId: params.userId.toString(),
          packageId: params.packageId,
          credits,
        },
        customer: {
          name: params.username || "User",
        },
      };

      if (params.paymentMethod) {
        requestBody.payment_method = params.paymentMethod;
      }

      const response = await axios.post<PaymentApiResponse>(
        `${paymentConfig.baseUrl}/api/payments`,
        requestBody,
        {
          headers: {
            "X-API-Key": paymentConfig.apiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": orderId,
          },
        },
      );

      if (!response.data.success || !response.data.data) {
        const errorMsg =
          response.data.error?.message || "Unknown error from payment API";
        logger.error("1ai-payment API error:", {
          error: errorMsg,
          data: response.data,
        });
        throw new PaymentError("1ai-payment", errorMsg);
      }

      const paymentData = response.data.data;
      logger.info(`Created transaction via 1ai-payment: ${orderId}`, {
        paymentId: paymentData.id,
        gateway: paymentData.gateway,
      });

      return {
        orderId,
        token: paymentData.id,
        redirectUrl: paymentData.payment_url,
      };
    } catch (error) {
      logger.error("1ai-payment API error:", {
        error:
          error instanceof AxiosError
            ? error.response?.data
            : error instanceof Error
              ? error.message
              : String(error),
        orderId,
      });
      throw new PaymentError(
        "1ai-payment",
        "Failed to create payment transaction",
      );
    }
  }

  /**
   * Verify webhook signature from 1ai-payment
   * Uses HMAC-SHA256 with webhook_secret and order_id
   */
  static verifyWebhookSignature(body: string, signature: string): boolean {
    const paymentConfig = get1aiPaymentConfig();
    if (!paymentConfig.webhookSecret) {
      logger.error(
        "Webhook secret not configured — rejecting 1ai-payment webhook (fail-closed)",
      );
      return false;
    }
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", paymentConfig.webhookSecret)
      .update(body)
      .digest("hex");

    return this.timingSafeEqual(signature, expectedSignature);
  }

  private static timingSafeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  /**
   * Handle webhook from 1ai-payment
   * Receives normalized payment events from all gateways
   */
  static async handleNotification(
    body: unknown,
    signature: string,
    opts: { skipSignature?: boolean } = {},
  ): Promise<{ success: boolean; message: string }> {
    // Verify signature
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    if (
      !opts.skipSignature &&
      !this.verifyWebhookSignature(bodyStr, signature)
    ) {
      logger.error("Invalid webhook signature from 1ai-payment");
      return { success: false, message: "Invalid signature" };
    }
    // Parse body if it's a string (webhook payload)
    const parsedBody: ForwardedPaymentEvent =
      typeof body === "string"
        ? JSON.parse(body)
        : (body as ForwardedPaymentEvent);
    if (!parsedBody.order_id || !parsedBody.status) {
      logger.error("Invalid webhook payload — missing order_id or status", {
        event: parsedBody,
      });
      return { success: false, message: "Invalid payload" };
    }
    const event = parsedBody;

    // Find transaction
    const transaction = await prisma.transaction.findUnique({
      where: { orderId: event.order_id },
    });

    if (!transaction) {
      logger.error(`Transaction not found: ${event.order_id}`);
      return { success: false, message: "Transaction not found" };
    }

    // Map normalized status to internal status
    let newStatus = transaction.status;
    switch (event.status) {
      case "success":
        newStatus = "success";
        break;
      case "pending":
        newStatus = "pending";
        break;
      case "failed":
      case "expired":
      case "cancelled":
        newStatus = "failed";
        break;
    }

    if (newStatus === "success") {
      // Atomic guard: only flip to success once
      const updateResult = await prisma.transaction.updateMany({
        where: { orderId: event.order_id, status: { not: "success" } },
        data: {
          status: "success",
          paymentMethod: event.payment_method || "unknown",
          paidAt: event.paid_at ? new Date(event.paid_at) : new Date(),
        },
      });

      if (updateResult.count === 1) {
        // This process won the race — process exactly once
        const credits = Number(transaction.creditsAmount) || 0;

        if (transaction.type === "subscription") {
          const parts = (transaction.packageName ?? "").split("_");
          const plan = parts[0] as PlanKey;
          const billingCycle: BillingCycle =
            parts[1] === "annual" ? "annual" : "monthly";

          await SubscriptionService.createSubscription(
            transaction.userId,
            plan,
            billingCycle,
            event.order_id,
          );
          logger.info(
            `Subscription activated: ${plan}/${billingCycle} for user ${transaction.userId}`,
            {
              gateway: event.gateway,
            },
          );
          this.sendFulfillmentNotification(
            transaction.userId,
            credits,
            plan,
          ).catch((err) =>
            logger.error("Fulfillment notification failed", {
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        } else {
          const plans = await getSubscriptionPlansAsync();
          const planConfig = plans[transaction.packageName ?? ""];
          const userUpdateData: Record<string, unknown> = {
            creditBalance: { increment: credits },
          };
          if (planConfig && planConfig.tier) {
            userUpdateData.tier = planConfig.tier;
          }

          await prisma.user.update({
            where: { telegramId: transaction.userId },
            data: userUpdateData,
          });

          await prisma.user
            .update({
              where: { telegramId: transaction.userId },
              data: {
                totalSpent: { increment: Number(transaction.amountIdr) },
              },
            })
            .catch(() => {
              /* non-critical */
            });

          logger.info(
            `Topup confirmed: ${credits} credits for user ${transaction.userId}`,
            {
              gateway: event.gateway,
              amount: event.amount,
            },
          );
          this.sendFulfillmentNotification(
            transaction.userId,
            credits,
            transaction.packageName ?? "unknown",
          ).catch((err) =>
            logger.error("Fulfillment notification failed", {
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }

        // Track payment
        // Analytics tracking handled elsewhere (trackPurchase requires different data structure)
        return { success: true, message: "Payment processed" };
      } else {
        logger.warn(
          `Race condition detected for order ${event.order_id} — another handler already processed`,
        );
        return { success: true, message: "Already processed" };
      }
    } else if (newStatus === "failed") {
      // Mark as failed
      await prisma.transaction.updateMany({
        where: { orderId: event.order_id, status: { not: "success" } },
        data: { status: "failed" },
      });

      logger.warn(`Payment failed: ${event.order_id}`, {
        status: event.status,
      });
      this.sendFailureNotification(
        transaction.userId,
        event.order_id,
        "failed",
      ).catch((err) =>
        logger.error("Failure notification failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      return { success: true, message: "Payment failed" };
    }

    return { success: true, message: "Webhook processed" };
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(orderId: string): Promise<{
    status: "pending" | "success" | "failed" | "expired";
    amount: number;
    paidAt: Date | null;
  } | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { orderId },
    });

    if (!transaction) return null;

    return {
      status: transaction.status as
        | "pending"
        | "success"
        | "failed"
        | "expired",
      amount: Number(transaction.amountIdr),
      paidAt: transaction.paidAt,
    };
  }

  /**
   * Get available packages
   */
  static async getPackages() {
    return getPackagesAsync();
  }

  /**
   * Send payment failure/expiry notification to user
   */
  static async sendFailureNotification(
    telegramId: bigint,
    orderId: string,
    status: "failed" | "expired",
  ): Promise<void> {
    const bot = this.getBotInstance();
    if (!bot) return;

    const statusText = status === "expired" ? "expired" : "failed";
    const message = t("payment_" + statusText + "_notification", {
      orderId,
      supportUrl: "https://support.example.com",
    });

    try {
      await bot.telegram.sendMessage(Number(telegramId), message, {
        parse_mode: "HTML",
      });
    } catch (err) {
      logger.error("Failed to send failure notification", {
        error: err instanceof Error ? err.message : String(err),
        telegramId: telegramId.toString(),
      });
    }
  }

  /**
   * Send fulfillment notification to user
   */
  private static async sendFulfillmentNotification(
    telegramId: bigint,
    credits: number,
    tier: string,
  ): Promise<void> {
    const bot = this.getBotInstance();
    if (!bot) return;

    const message = t("payment_success_notification", {
      credits,
      tier,
      dashboardUrl: "https://dashboard.example.com",
    });

    try {
      await bot.telegram.sendMessage(Number(telegramId), message, {
        parse_mode: "HTML",
      });
    } catch (err) {
      logger.error("Failed to send fulfillment notification", {
        error: err instanceof Error ? err.message : String(err),
        telegramId: telegramId.toString(),
      });
    }
  }
}
