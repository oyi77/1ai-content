import { BotContext } from "@/types";
import {
  paymentSettingsCommand,
  handlePaymentDefaultGateway,
  handlePaymentToggleGateway,
  handlePaymentSetDefault,
} from "@/commands/admin/paymentSettings";

export async function handleAdminCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  if (data === "admin_payment_settings") {
    await paymentSettingsCommand(ctx);
    return true;
  }

  if (data === "admin_payment_default") {
    await handlePaymentDefaultGateway(ctx);
    return true;
  }

  if (data.startsWith("admin_payment_toggle_")) {
    const gateway = data.replace("admin_payment_toggle_", "");
    await handlePaymentToggleGateway(ctx, gateway);
    return true;
  }

  if (data.startsWith("admin_payment_setdefault_")) {
    const gateway = data.replace("admin_payment_setdefault_", "");
    await handlePaymentSetDefault(ctx, gateway);
    return true;
  }

  if (data === "admin_menu") {
    await ctx.answerCbQuery();
    await paymentSettingsCommand(ctx);
    return true;
  }

  return false;
}
