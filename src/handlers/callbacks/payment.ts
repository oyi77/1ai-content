import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { t } from "@/i18n/translations";

export async function handlePaymentCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  // payment_*
  if (data.startsWith("payment_")) {
    const lang = ctx.session?.userLang || "id";
    const [, method, packageId] = data.split("_");

    const isProduction = process.env.NODE_ENV === "production";
    await ctx.editMessageText(t("cb.payment_processing", lang, { method }), {
      reply_markup: {
        inline_keyboard: isProduction
          ? []
          : [
              [
                {
                  text: t("btn.simulate_success", lang),
                  callback_data: `simulate_success_${packageId}`,
                },
              ],
            ],
      },
    });
    return true;
  }

  // simulate_success_*
  if (data.startsWith("simulate_success_")) {
    if (process.env.NODE_ENV === "production") {
      logger.warn(`Blocked simulate_success attempt from user ${ctx.from?.id}`);
      await ctx.answerCbQuery("This feature is disabled.").catch(() => {});
      return true;
    }

    const packageId = data.replace("simulate_success_", "");

    const credits: Record<string, number> = {
      starter: 6,
      growth: 18,
      scale: 75,
      enterprise: 260,
    };

    const lang = ctx.session?.userLang || "id";
    await ctx.editMessageText(
      t("cb.payment_success_sim", lang, { credits: credits[packageId] || 0 }),
    );
    return true;
  }

  // transaction_history
  if (data === "transaction_history") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId: BigInt(userId) },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const lang = ctx.session?.userLang || "id";
      if (transactions.length === 0) {
        await ctx.editMessageText(t("cb2.tx_history_empty", lang), {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: t("cb2.topup_now", lang), callback_data: "topup" }],
              [
                {
                  text: t("cb2.back_to_menu", lang),
                  callback_data: "main_menu",
                },
              ],
            ],
          },
        });
        return true;
      }

      let message = t("cb2.tx_history_title", lang) + "\n\n";
      message += t("cb2.tx_history_recent", lang) + "\n\n";

      for (const tx of transactions) {
        const date = tx.createdAt.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const statusEmoji =
          tx.status === "success"
            ? "✅"
            : tx.status === "pending"
              ? "⏳"
              : "❌";
        const amount = Number(tx.amountIdr).toLocaleString("id-ID");
        const credits = tx.creditsAmount
          ? Number(tx.creditsAmount).toFixed(1)
          : "-";
        message += `${statusEmoji} ${date} | ${tx.type} | Rp ${amount} | ${credits} credits\n`;
      }

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("cb2.back_to_menu", lang), callback_data: "main_menu" }],
          ],
        },
      });
    } catch (error) {
      logger.error("Transaction history error:", error);
      const lang2 = ctx.session?.userLang || "id";
      await ctx.editMessageText(t("cb2.tx_history_failed", lang2), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("cb2.back_to_menu", lang2),
                callback_data: "main_menu",
              },
            ],
          ],
        },
      });
    }
    return true;
  }

  return false;
}
