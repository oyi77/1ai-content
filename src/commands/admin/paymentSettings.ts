import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { PaymentSettingsService } from "@/services/payment-settings.service";

function isAdmin(userId: number): boolean {
  const adminIds =
    getConfig()
      .SUPER_ADMIN_IDS?.split(",")
      .map((id) => parseInt(id.trim())) || [];
  return adminIds.includes(userId);
}

export async function paymentSettingsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("❌ You do not have permission to use this command.");
    return;
  }

  try {
    const settings = await PaymentSettingsService.getAllSettings();
    const defaultGateway = await PaymentSettingsService.getDefaultGateway();

    const midtransEnabled = settings["midtrans_enabled"] !== "false";
    const tripayEnabled = settings["tripay_enabled"] === "true";
    const duitkuEnabled = settings["duitku_enabled"] !== "false";

    await ctx.reply(
      `⚙️ *Payment Settings*\n\n` +
        `*Default Gateway:* ${defaultGateway.toUpperCase()}\n\n` +
        `*Gateway Status:*\n` +
        `• Midtrans: ${midtransEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `• Tripay: ${tripayEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `• Duitku: ${duitkuEnabled ? "✅ Enabled" : "❌ Disabled"}\n\n` +
        `Select an action:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔄 Set Default Gateway",
                callback_data: "admin_payment_default",
              },
            ],
            [
              {
                text: midtransEnabled
                  ? "❌ Disable Midtrans"
                  : "✅ Enable Midtrans",
                callback_data: "admin_payment_toggle_midtrans",
              },
              {
                text: tripayEnabled ? "❌ Disable Tripay" : "✅ Enable Tripay",
                callback_data: "admin_payment_toggle_tripay",
              },
            ],
            [
              {
                text: duitkuEnabled ? "❌ Disable Duitku" : "✅ Enable Duitku",
                callback_data: "admin_payment_toggle_duitku",
              },
            ],
            [{ text: "◀️ Back to Admin Menu", callback_data: "admin_menu" }],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error in payment settings command:", error);
    await ctx.reply("❌ Something went wrong. Please try again.");
  }
}

export async function handlePaymentDefaultGateway(
  ctx: BotContext,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.answerCbQuery("❌ Unauthorized");
    return;
  }

  await ctx.editMessageText(
    `🔄 *Select Default Gateway*\n\n` +
      `Choose which payment gateway will be shown by default:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💳 Midtrans",
              callback_data: "admin_payment_setdefault_midtrans",
            },
          ],
          [
            {
              text: "🏦 Duitku",
              callback_data: "admin_payment_setdefault_duitku",
            },
          ],
          [
            {
              text: "🔷 Tripay",
              callback_data: "admin_payment_setdefault_tripay",
            },
          ],
          [{ text: "◀️ Back", callback_data: "admin_payment_settings" }],
        ],
      },
    },
  );
}

export async function handlePaymentToggleGateway(
  ctx: BotContext,
  gateway: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.answerCbQuery("❌ Unauthorized");
    return;
  }

  try {
    const isEnabled = await PaymentSettingsService.isGatewayEnabled(gateway);
    await PaymentSettingsService.setGatewayEnabled(
      gateway,
      !isEnabled,
      BigInt(userId),
    );

    await ctx.answerCbQuery(
      `${gateway.toUpperCase()} ${!isEnabled ? "enabled" : "disabled"}!`,
    );
    await paymentSettingsCommand(ctx);
  } catch (error) {
    logger.error("Error toggling gateway:", error);
    await ctx.answerCbQuery("❌ Failed to update setting");
  }
}

export async function handlePaymentSetDefault(
  ctx: BotContext,
  gateway: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.answerCbQuery("❌ Unauthorized");
    return;
  }

  try {
    const isEnabled = await PaymentSettingsService.isGatewayEnabled(gateway);
    if (!isEnabled) {
      await ctx.answerCbQuery(
        `❌ Cannot set ${gateway} as default - it's disabled! Enable it first.`,
        { show_alert: true },
      );
      return;
    }

    await PaymentSettingsService.setDefaultGateway(gateway, BigInt(userId));
    await ctx.answerCbQuery(
      `✅ Default gateway set to ${gateway.toUpperCase()}!`,
    );
    await paymentSettingsCommand(ctx);
  } catch (error) {
    logger.error("Error setting default gateway:", error);
    await ctx.answerCbQuery("❌ Failed to update setting");
  }
}
