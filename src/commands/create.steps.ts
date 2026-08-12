/**
 * Create Command — Legacy Step Handlers
 *
 * The old step-by-step create flow (niche → style → platform → duration → VO).
 * Still used by callback handlers in generation.ts.
 * Extracted from create.ts god object.
 */

import { BotContext } from "@/types";
import type { InlineKeyboardButton } from "@telegraf/types/markup";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import {
  NICHES,
  generateStoryboard as genStoryboardFromService,
} from "@/services/video-generation.service";
import {
  getVideoCreditCost,
  SUBSCRIPTION_PLANS,
  CUSTOM_DURATION_MIN,
} from "@/config/pricing";
import { t } from "@/i18n/translations";

/** Resolve the user's preferred language from the DB record. */
function getUserLang(dbUser: { language?: string } | null): string {
  return dbUser?.language || "id";
}

/**
 * Handle duration selection - simplified for MVP (no mode selection needed)
 */
export async function handleDurationSelection(
  ctx: BotContext,
  durationStr: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    // Parse duration and scenes (format: duration_15_2 or duration_30_4)
    let duration: number, scenes: number | null;

    // Resolve language
    const langUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(langUser);

    if (durationStr === "custom_duration") {
      await ctx.reply(t("create.custom_duration_prompt", lang));
      ctx.session.state = "CUSTOM_DURATION_INPUT";
      return;
    }

    const parts = durationStr.replace("duration_", "").split("_");
    duration = parseInt(parts[0]);
    scenes = parts[1] ? parseInt(parts[1]) : null;

    // Auto-calculate scenes: standard 5s per scene
    if (!scenes) {
      const SCENE_DURATION = 5;
      scenes = Math.ceil(duration / SCENE_DURATION);
      duration = scenes * SCENE_DURATION;
      logger.info(
        `📊 Auto-calculated: ${scenes} scenes × ${SCENE_DURATION}s = ${duration}s total`,
      );
    }

    // Validate duration
    if (duration < CUSTOM_DURATION_MIN) {
      await ctx
        .answerCbQuery(t("msg.invalid_duration", ctx.session?.userLang || "id"))
        .catch(() => {});
      return;
    }

    const user = ctx.from;
    if (!user) return;

    // Get or create user
    let dbUser = await UserService.findByTelegramId(BigInt(user.id.toString()));

    // If user doesn't exist, create them (guard against concurrent creation)
    if (!dbUser) {
      try {
        dbUser = await UserService.create({
          telegramId: BigInt(user.id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        });
        await ctx.reply(`👋 Welcome to 1AI Content!`);
      } catch (err) {
        if ((err as { code: string })?.code === "P2002") {
          // Created concurrently by another handler — fetch the existing record
          dbUser = await UserService.findByTelegramId(BigInt(user.id));
        } else {
          throw err;
        }
      }
    }

    if (!dbUser) return;

    if (ctx.session) {
      ctx.session.userMode = dbUser.userMode || "content_creator";
    }

    const creditCost = getVideoCreditCost(duration);

    if (Number(dbUser.creditBalance) < creditCost) {
      await ctx
        .answerCbQuery(
          t("gen.insufficient_credits", ctx.session?.userLang || "id", {
            cost: "?",
            balance: "0",
          }),
        )
        .catch(() => {});
      const minPlan = SUBSCRIPTION_PLANS.lite;
      const maxPlan = SUBSCRIPTION_PLANS.agency;
      await ctx.reply(
        `Insufficient credits.\n\n` +
          `Current: ${dbUser.creditBalance} | Needed: ${creditCost}\n\n` +
          `Top Up -- Buy credits instantly\n` +
          `Subscribe -- Get ${minPlan.monthlyCredits}-${maxPlan.monthlyCredits} credits/month (better value!)\n\n` +
          `Which would you like?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Top Up", callback_data: "topup" },
                { text: "Subscribe", callback_data: "open_subscription" },
              ],
            ],
          },
        },
      );
      return;
    }

    const niche = ctx.session.selectedNiche || "fnb";
    const selectedStyles = ctx.session.selectedStyles || [];
    const platform =
      (ctx.session.stateData?.selectedPlatform as string) || "tiktok";

    const storyboard = genStoryboardFromService(
      niche,
      selectedStyles,
      duration,
      scenes,
    );

    const sceneLabel =
      scenes > 1 ? t("create.scenes", lang) : t("create.scene", lang);

    // Store creation state before showing VO settings
    ctx.session.videoCreation = {
      mode: scenes > 1 ? "extended" : "short",
      niche,
      platform,
      totalDuration: duration,
      scenes,
      storyboard,
      jobId: "",
      waitingForImage: false,
      enableVO: true, // default ON
      enableSubtitles: true, // default ON
    };

    // Show VO/Subtitle toggle step
    const voLabel = ctx.session.videoCreation.enableVO ? "ON" : "OFF";
    const subLabel = ctx.session.videoCreation.enableSubtitles ? "ON" : "OFF";

    await ctx.editMessageText(
      `${t("create.almost_ready", lang)}\n\n` +
        `${t("create.niche_label", lang)}: ${niche}\n` +
        `${t("create.duration_label", lang)}: ${duration}s (${scenes} ${sceneLabel})\n` +
        `${t("create.credit_cost_label", lang)}: ${creditCost}\n\n` +
        `🎙️ Voice Over: ${voLabel}\n` +
        `📝 Subtitles: ${subLabel}\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `🎙️ Toggle VO`,
                callback_data: "vo_toggle_vo",
              },
              {
                text: `📝 Toggle Subs`,
                callback_data: "vo_toggle_subtitles",
              },
            ],
            [{ text: "▶️ Continue", callback_data: "vo_continue" }],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling duration selection:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

/**
 * Handle niche selection
 */
export async function handleNicheSelection(
  ctx: BotContext,
  nicheKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    const nicheConfig = (
      NICHES as Record<string, (typeof NICHES)[keyof typeof NICHES] | undefined>
    )[nicheKey];
    if (!nicheConfig) {
      await ctx
        .answerCbQuery(
          t("topup.invalid_package", ctx.session?.userLang || "id"),
        )
        .catch(() => {});
      return;
    }

    ctx.session.selectedNiche = nicheKey;

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);
    const styleButtons: InlineKeyboardButton[][] = (
      nicheConfig.styles as readonly string[]
    ).flatMap((s) => {
      if (!s || typeof s !== "string") return [];
      return [
        [
          {
            text: s.charAt(0).toUpperCase() + s.slice(1),
            callback_data: `select_style_${s}`,
          },
        ],
      ];
    });
    styleButtons.push([
      {
        text: t("create.change_category", lang),
        callback_data: "create_video_new",
      },
    ]);

    await ctx.editMessageText(
      `✅ ${nicheConfig.emoji} ${nicheConfig.name} ${t("create.niche_selected", lang)}\n\n` +
        t("create.select_style", lang),
      {
        reply_markup: {
          inline_keyboard: styleButtons,
        },
      },
    );
  } catch (error) {
    logger.error("Error handling niche selection:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

/**
 * Handle style selection - then show platform picker
 */
export async function handleStyleSelection(
  ctx: BotContext,
  styleKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    ctx.session.selectedStyles = [styleKey];

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    // Show platform picker (new step between style and duration)
    await ctx.editMessageText(
      `${t("create.style_selected", lang)}\n\n` +
        t("create.select_platform", lang),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("create.platform_tiktok", lang),
                callback_data: "create_platform_tiktok",
              },
              {
                text: t("create.platform_youtube", lang),
                callback_data: "create_platform_youtube",
              },
            ],
            [
              {
                text: t("create.platform_instagram", lang),
                callback_data: "create_platform_instagram",
              },
              {
                text: t("create.platform_square", lang),
                callback_data: "create_platform_square",
              },
            ],
            [
              {
                text: t("create.change_style", lang),
                callback_data: `select_niche_${ctx.session.selectedNiche || "fnb"}`,
              },
            ],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling style selection:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}

// Platform to aspect ratio mapping
const PLATFORM_ASPECT_RATIOS: Record<string, string> = {
  tiktok: "9:16",
  youtube: "16:9",
  instagram: "4:5",
  square: "1:1",
};

/**
 * Handle platform selection - then show duration picker
 */
export async function handlePlatformSelection(
  ctx: BotContext,
  platformKey: string,
): Promise<void> {
  try {
    if (!ctx.session) return;

    // Store selected platform in session
    ctx.session.stateData = {
      ...ctx.session.stateData,
      selectedPlatform: platformKey,
    };

    // Resolve language
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id.toString()))
      : null;
    const lang = getUserLang(dbUser);

    const aspectRatio = PLATFORM_ASPECT_RATIOS[platformKey] || "9:16";

    // Show duration picker
    await ctx.editMessageText(
      `${t("create.platform_selected", lang)} (${aspectRatio})\n\n` +
        `${t("create.extend_mode", lang)}\n\n` +
        t("create.select_duration", lang),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("create.duration_quick", lang),
                callback_data: "duration_15_1",
              },
              {
                text: t("create.duration_standard", lang),
                callback_data: "duration_30_2",
              },
            ],
            [
              {
                text: t("create.duration_long", lang),
                callback_data: "duration_60_4",
              },
              {
                text: t("create.duration_extended", lang),
                callback_data: "duration_120_8",
              },
            ],
            [
              {
                text: t("create.custom_duration", lang),
                callback_data: "custom_duration",
              },
            ],
            [
              {
                text: t("create.change_category", lang),
                callback_data: "create_video_new",
              },
            ],
          ],
        },
      },
    );
  } catch (error) {
    logger.error("Error handling platform selection:", error);
    await ctx
      .answerCbQuery(t("error.generic", ctx.session?.userLang || "id"))
      .catch(() => {});
  }
}
