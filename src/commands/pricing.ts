import { BotContext } from "@/types";
import { t } from "@/i18n/translations";
import { getUnitCostAsync, getPackagesAsync } from "@/config/pricing";

export async function pricingCommand(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  const [video15, video30, video60, imgSet, cloneStyle] = await Promise.all([
    getUnitCostAsync("VIDEO_15S"),
    getUnitCostAsync("VIDEO_30S"),
    getUnitCostAsync("VIDEO_60S"),
    getUnitCostAsync("IMAGE_SET_7_SCENE"),
    getUnitCostAsync("CLONE_STYLE"),
  ]);

  const packages = await getPackagesAsync();

  let text = `💰 *${t("pricing.title", lang)}*\n\n`;
  text += `*${t("pricing.per_video", lang)}*\n`;
  text += `⚡ 15s — ${video15 / 10} credits\n`;
  text += `🎯 30s — ${video30 / 10} credits\n`;
  text += `📽️ 60s — ${video60 / 10} credits\n`;
  text += `📸 Image Set (7) — ${imgSet / 10} credits\n`;
  text += `🔄 Clone Style — ${cloneStyle / 10} credits\n\n`;

  text += `*${t("pricing.packages", lang)}*\n`;
  for (const pkg of packages) {
    const priceStr = pkg.priceIdr
      ? `Rp ${pkg.priceIdr.toLocaleString("id-ID")}`
      : "";
    text += `${pkg.name} — ${pkg.totalCredits || pkg.credits} credits — ${priceStr}\n`;
  }

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: t("btn.topup", lang), callback_data: "topup" }],
        [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
      ],
    },
  });
}
