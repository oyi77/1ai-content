import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { UserService } from "@/services/user.service";
import { SubscriptionService } from "@/services/subscription.service";
import { User } from "@prisma/client";
import { t } from "@/i18n/translations";
import {
  SUBSCRIPTION_PLANS,
  PlanKey,
  BillingCycle,
  getPlanPrice,
} from "@/config/pricing";
import { prisma } from "@/config/database";
import axios from "axios";
import crypto from "crypto";

const formatIdr = (amount: number): string =>
  new Intl.NumberFormat("id-ID").format(amount);

function formatPrice(idr: number, lang: string): string {
  const usdRate = getConfig().USD_TO_IDR_RATE;
  if (lang === "id") return `Rp ${formatIdr(idr)}`;
  const usd = (idr / usdRate).toFixed(2);
  return `$${usd} (~Rp ${formatIdr(idr)})`;
}

function getDuitkuBaseUrl() {
  return (getConfig().DUITKU_ENVIRONMENT || "sandbox") === "production"
    ? "https://passport.duitku.com"
    : "https://sandbox.duitku.com";
}
function getMerchantCode() {
  return getConfig().DUITKU_MERCHANT_CODE || "";
}
function getApiKey() {
  return getConfig().DUITKU_API_KEY || "";
}

export async function subscriptionCommand(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    const telegramId = BigInt(user.id);
    const dbUser = await UserService.findByTelegramId(telegramId);
    if (!dbUser) {
      await ctx.reply(t("sub.start_first", "id"));
      return;
    }

    const activeSub =
      await SubscriptionService.getActiveSubscription(telegramId);
    const isActive =
      activeSub !== null && new Date(activeSub.currentPeriodEnd) > new Date();

    let statusText = "";
    if (isActive) {
      const planConfig = SUBSCRIPTION_PLANS[activeSub.plan as PlanKey];
      const daysLeft = Math.ceil(
        (new Date(activeSub.currentPeriodEnd).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      statusText =
        `📌 *Current Plan:* ${planConfig?.name ?? activeSub.plan} (${activeSub.billingCycle})\n` +
        `💳 Credits remaining: ${dbUser.creditBalance}\n` +
        `📅 Renews in: ${daysLeft} day${daysLeft !== 1 ? "s" : ""}\n\n`;
    } else {
      statusText = `📌 *Current Plan:* Free\n💳 Credits: ${dbUser.creditBalance}\n\n`;
    }

    const lang = dbUser?.language || ctx.from?.language_code || "id";
    const planKeys = Object.keys(SUBSCRIPTION_PLANS) as PlanKey[];
    let plansText = `*${t("sub.available_plans", lang)}:*\n\n`;
    for (const key of planKeys) {
      const plan = SUBSCRIPTION_PLANS[key];
      plansText +=
        `*${plan.name}* — ${plan.monthlyCredits} ${t("sub.credits_per_month", lang)}\n` +
        `${t("sub.monthly", lang)}: ${formatPrice(plan.monthlyPriceIdr, lang)} | ${t("sub.annual", lang)}: ${formatPrice(plan.annualPriceIdr, lang)} _(${t("sub.save_2_months", lang)})_\n` +
        plan.features.map((f) => `  • ${f}`).join("\n") +
        "\n\n";
    }

    plansText +=
      "*Enterprise* — Custom\n" +
      "• Unlimited credits & integrations\n" +
      "• Dedicated account manager";

    const planRows = planKeys.map((key) => {
      const plan = SUBSCRIPTION_PLANS[key];
      return [
        {
          text: `${plan.name} /mo ${formatPrice(plan.monthlyPriceIdr, lang)}`,
          callback_data: `subscribe_${key}_monthly`,
        },
        {
          text: `${plan.name} /yr ${formatPrice(plan.annualPriceIdr, lang)}`,
          callback_data: `subscribe_${key}_annual`,
        },
      ];
    });

    await ctx.reply(`⭐ *Subscription Plans*\n\n${statusText}${plansText}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...planRows,
          [
            {
              text: "📞 Contact for Enterprise",
              url: "https://t.me/openclaw_support",
            },
          ],
          ...(isActive
            ? [
                [
                  {
                    text: "❌ Cancel Subscription",
                    callback_data: "cancel_subscription",
                  },
                ],
              ]
            : []),
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
  } catch (error) {
    logger.error("Error in subscription command:", error);
    await ctx.reply(t("error.generic", "id"));
  }
}

export async function handleSubscriptionPurchase(
  ctx: BotContext,
  plan: PlanKey,
  cycle: BillingCycle,
): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    await ctx.answerCbQuery("...").catch(() => {});

    const price = getPlanPrice(plan, cycle);
    const planConfig = SUBSCRIPTION_PLANS[plan];
    const telegramId = BigInt(user.id);
    const orderId = `OC-${Date.now()}-${telegramId}`;

    const signature = crypto
      .createHash("md5")
      .update(getMerchantCode() + orderId + price + getApiKey())
      .digest("hex");

    await prisma.transaction.create({
      data: {
        orderId,
        userId: telegramId,
        type: "subscription",
        packageName: `${plan}_${cycle}`,
        amountIdr: price,
        creditsAmount: planConfig.monthlyCredits,
        gateway: "duitku",
        status: "pending",
      },
    });

    const webhookUrl = getConfig().WEBHOOK_URL;
    const response = await axios.post(
      `${getDuitkuBaseUrl()}/webapi/api/merchant/v2/inquiry`,
      {
        merchantCode: getMerchantCode(),
        paymentAmount: price,
        paymentMethod: "VC",
        merchantOrderId: orderId,
        productDetails: `${planConfig.name} Subscription (${cycle}) — ${planConfig.monthlyCredits} credits/mo`,
        customerVaName: user.username || user.first_name || "Customer",
        email: user.username
          ? `${user.username}@tg.openclaw.bot`
          : `tg${user.id}@tg.openclaw.bot`,
        phoneNumber: "",
        callbackUrl: `${webhookUrl}/webhook/duitku`,
        returnUrl: `${webhookUrl}/payment/finish`,
        signature,
        expiryPeriod: 60,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const paymentUrl: string = response.data.paymentUrl;

    await ctx.editMessageText(
      `💳 *${planConfig.name} Subscription (${cycle})*\n\n` +
        `Amount: Rp ${formatIdr(price)}\n` +
        `Credits: ${planConfig.monthlyCredits}/month\n` +
        `Order: \`${orderId}\`\n\n` +
        `Click below to complete payment.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Pay Now", url: paymentUrl }],
            [
              {
                text: "✅ I've Paid",
                callback_data: `check_payment_${orderId}`,
              },
            ],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error creating subscription payment:", error);
    let dbUser2: User | null = null;
    try {
      if (ctx.from)
        dbUser2 = await UserService.findByTelegramId(BigInt(ctx.from.id));
    } catch {
      /* ignore */
    }
    const lang2 = dbUser2?.language || "id";
    try {
      await ctx.editMessageText(t("sub.payment_create_failed", lang2));
    } catch {
      try {
        await ctx.reply(t("sub.payment_create_failed", lang2));
      } catch {
        /* ignore */
      }
    }
  }
}

export async function handleCancelSubscription(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;
    if (!user) return;

    await ctx.answerCbQuery("...").catch(() => {});
    await SubscriptionService.cancelSubscription(BigInt(user.id));

    let dbUser: User | null = null;
    try {
      if (ctx.from)
        dbUser = await UserService.findByTelegramId(BigInt(ctx.from.id));
    } catch {
      /* ignore */
    }
    const lang = dbUser?.language || ctx.from?.language_code || "id";
    const cancelMsg = t("sub.cancelled", lang);
    try {
      await ctx.editMessageText(cancelMsg, { parse_mode: "Markdown" });
    } catch {
      try {
        await ctx.reply(cancelMsg, { parse_mode: "Markdown" });
      } catch {
        /* ignore */
      }
    }
  } catch (error) {
    logger.error("Error cancelling subscription:", error);
    let dbUser3: User | null = null;
    try {
      if (ctx.from)
        dbUser3 = await UserService.findByTelegramId(BigInt(ctx.from.id));
    } catch {
      /* ignore */
    }
    const lang3 = dbUser3?.language || "id";
    try {
      await ctx.editMessageText(t("sub.cancel_failed", lang3));
    } catch {
      try {
        await ctx.reply(t("sub.cancel_failed", lang3));
      } catch {
        /* ignore */
      }
    }
  }
}
