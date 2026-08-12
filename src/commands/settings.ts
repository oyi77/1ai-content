/**
 * Settings Command
 *
 * Displays user preferences in their configured language.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";

export async function settingsCommand(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply(t("social.unable_identify_user", "id"));
      return;
    }

    // Fetch user to get saved language and current settings
    const dbUser = await UserService.findByTelegramId(BigInt(userId));
    const lang = dbUser?.language || "en";

    // Build language display name
    const langLabels: Record<string, string> = {
      id: "🇮🇩 Bahasa Indonesia",
      en: "🇬🇧 English",
      ru: "🇷🇺 Русский",
      zh: "🇨🇳 中文",
    };
    const currentLangLabel = langLabels[lang] || lang.toUpperCase();

    const notificationsOn = dbUser?.notificationsEnabled !== false;
    const autoRenewalOn = dbUser?.autoRenewal === true;

    await ctx.reply(
      `${t("settings.title", lang)}\n\n` +
        `${t("settings.description", lang)}\n\n` +
        `${t("settings.language_label", lang)} ${currentLangLabel}\n` +
        `${t("settings.notifications_label", lang)} ${notificationsOn ? t("settings.enabled", lang) : t("settings.disabled", lang)}\n` +
        `${t("settings.autorenewal_label", lang)} ${autoRenewalOn ? t("settings.enabled", lang) : t("settings.disabled", lang)}\n\n` +
        `${t("settings.what_to_change", lang)}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("settings.btn_language", lang),
                callback_data: "settings_language",
              },
            ],
            [
              {
                text: t("settings.btn_notifications", lang),
                callback_data: "settings_notifications",
              },
            ],
            [
              {
                text: t("settings.btn_autorenewal", lang),
                callback_data: "settings_autorenewal",
              },
            ],
          ],
        },
      },
    );

    ctx.session.state = "DASHBOARD";
  } catch (error) {
    logger.error("settingsCommand error:", error);
    try {
      await ctx.reply(t("error.generic", "id"));
    } catch {
      /* ignore */
    }
  }
}
