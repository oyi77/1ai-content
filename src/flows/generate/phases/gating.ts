// Pre-generation gating: user load, ban + subscription checks, cost math,
// free-trial slot claim, insufficient-credit reply.
// Split from generate.execution.ts — called once by executeGeneration.
import { t } from "@/i18n/translations";
import { prisma } from "@/config/database";
import { UserService } from "@/services/user.service";
import { creditsToUnits } from "@/config/pricing";
import { CampaignService } from "@/services/campaign.service";
import { clearGenerateSession } from "../../generate.types";
import type { ExecSetup, ExecUser } from "./types";

export interface GatingResult {
  user: ExecUser;
  cost: number;
  useFreeSlot: boolean;
  lang: string;
}

/** Null = already replied + session cleared; caller must return. */
export async function resolveGating(
  c: ExecSetup,
): Promise<GatingResult | null> {
  const dbUser = await UserService.findByTelegramId(c.telegramId);
  if (!dbUser) {
    await c.ctx.reply(t("gen.user_not_found", "id"));
  return null;
  }

  const lang = dbUser.language || "id";
  if (c.ctx.session) c.ctx.session.userLang = lang;

  if (dbUser.isBanned) {
    await c.ctx.reply(t("error.account_banned", lang));
    clearGenerateSession(c.ctx);
  return null;
  }

  // Check daily generation limit for subscribers
  if (dbUser.tier !== "free") {
    try {
      const { SubscriptionService } =
        await import("../../../services/subscription.service.js");
      const limitCheck = await SubscriptionService.canGenerate(
        BigInt(dbUser.telegramId),
      );
      if (
        limitCheck &&
        !limitCheck.allowed &&
        limitCheck.reason?.includes("Daily limit")
      ) {
        await c.ctx.reply(
          t("gen.daily_limit_reached", lang, {
            limit: String(limitCheck.reason.match(/\d+/)?.[0] || ""),
            reset: "24h",
          }),
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: t("btn.main_menu", lang),
                    callback_data: "main_menu",
                  },
                ],
              ],
            },
          },
        );
        clearGenerateSession(c.ctx);
  return null;
      }
    } catch {
      /* if check fails, allow generation */
    }
  }

  const unitBalance = creditsToUnits(Number(dbUser.creditBalance));

  // Cost check — use admin-configured pricing (falls back to static UNIT_COSTS if DB empty)
  const { getUnitCostAsync } = await import("../../../config/pricing.js");
  let cost = 0;
  if (c.action === "image_set")
    cost = await getUnitCostAsync("IMAGE_SET_7_SCENE");
  else if (c.action === "video")
    cost = await getUnitCostAsync(
      c.presetConfig.totalSeconds <= 15
        ? "VIDEO_15S"
        : c.presetConfig.totalSeconds <= 30
          ? "VIDEO_30S"
          : c.presetConfig.totalSeconds <= 60
            ? "VIDEO_60S"
            : "VIDEO_120S",
    );
  else if (c.action === "clone_style")
    cost = await getUnitCostAsync("CLONE_STYLE");
  else if (c.action === "campaign")
    cost = await CampaignService.getCampaignCost(
      (c.session.generateCampaignSize as 5 | 10) || 5,
    );

  // Free trial check for image_set and video (welcome bonus / daily free)
  let useFreeSlot = false;
  if (unitBalance < cost && (c.action === "image_set" || c.action === "video")) {
    // For video, only allow free trial for 15s (quick c.preset)
    if (c.action === "video" && c.presetConfig.totalSeconds > 15) {
      useFreeSlot = false;
    } else {
      const { canUseWelcomeBonus, getNextDailyFreeReset } =
        await import("../../../config/free-trial.js");
      if (canUseWelcomeBonus(dbUser)) {
        // Atomic check-and-set to prevent double-claim on concurrent requests
        const updated = await prisma.user.updateMany({
          where: { id: dbUser.id, welcomeBonusUsed: false },
          data: { welcomeBonusUsed: true },
        });
        if (updated.count > 0) {
          useFreeSlot = true;
        }
      }
      if (!useFreeSlot) {
        const dailyClaimed = await prisma.user.updateMany({
          where: { id: dbUser.id, dailyFreeUsed: false },
          data: {
            dailyFreeUsed: true,
            dailyFreeResetAt: getNextDailyFreeReset(),
          },
        });
        if (dailyClaimed.count > 0) useFreeSlot = true;
      }
    }
  }

  if (unitBalance < cost && !useFreeSlot) {
    const costCredits = cost / 10;
    const balCredits = unitBalance / 10;
    await c.ctx.reply(
      t("gen.insufficient_credits", lang, {
        cost: costCredits,
        balance: balCredits,
      }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("btn.topup", lang), callback_data: "topup" }],
          ],
        },
      },
    );
    clearGenerateSession(c.ctx);
  return null;
  }

  return { user: dbUser, cost, useFreeSlot, lang };
}
