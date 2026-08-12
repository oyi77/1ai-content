import { BotContext } from "@/types";
import { P2pService } from "@/services/p2p.service";
import { t } from "@/i18n/translations";

export async function sendCommand(ctx: BotContext): Promise<void> {
  const message = ctx.message as unknown as Record<string, unknown>;
  if (!message || !message.text) return;

  const args = (message.text as string).split(" ");
  if (args.length !== 3) {
    const lang = ctx.from?.language_code || "id";
    await ctx.reply(t("social.send_usage", lang), { parse_mode: "HTML" });
    return;
  }

  const recipientIdStr = args[1];
  const amountStr = args[2];
  const senderId = BigInt(ctx.from!.id);

  let recipientId: bigint;
  try {
    recipientId = BigInt(recipientIdStr);
  } catch (err) {
    const lang2 = ctx.from?.language_code || "id";
    await ctx.reply(t("social.invalid_recipient_id", lang2));
    return;
  }

  const amount = Number(amountStr);
  if (isNaN(amount) || amount < 1) {
    const lang3 = ctx.from?.language_code || "id";
    await ctx.reply(t("social.amount_positive", lang3));
    return;
  }

  try {
    const { fee, totalDeduction } = await P2pService.validateTransfer(
      senderId,
      recipientId,
      amount,
    );

    await ctx.reply(
      `💸 *Transfer Confirmation*\n\n` +
        `You are about to send *${amount}* credits to ID \`${recipientIdStr}\`.\n` +
        `💳 Network Fee (0.5%): *${fee}* credits\n` +
        `🔥 Total Deduction: *${totalDeduction}* credits\n\n` +
        `Do you want to proceed?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Confirm Transfer",
                callback_data: `confirm_send_${recipientIdStr}_${amount}`,
              },
              { text: "❌ Cancel", callback_data: "cancel_send" },
            ],
          ],
        },
      },
    );
  } catch (error) {
    const lang4 = ctx.from?.language_code || "id";
    await ctx.reply(
      t("social.transfer_failed", lang4, { error: (error as Error).message }),
    );
  }
}
