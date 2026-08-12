import { BotContext } from "@/types";
import { UserService } from "@/services/user.service";
import { prisma } from "@/config/database";
import {
  getLangConfig,
  LANGUAGE_LIST,
  LANG_PAGE_SIZE,
} from "@/config/languages";
import { t } from "@/i18n/translations";

export async function handleSettingsCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  // account_menu
  if (data === "account_menu") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || "id";
    await ctx.editMessageText(t("cb.account_title", lang), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t("btn.referral_code", lang),
              callback_data: "open_referral",
            },
          ],
          [{ text: t("btn.help_faq", lang), callback_data: "open_help" }],
          [{ text: t("btn.main_menu", lang), callback_data: "main_menu" }],
        ],
      },
    });
    return true;
  }

  if (data === "account_settings") {
    data = "open_settings";
    // fall through to open_settings handler below
  }

  if (data === "open_settings" || data === "settings") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    const user = userId
      ? await UserService.findByTelegramId(BigInt(userId))
      : null;
    const uiLang = ctx.session?.userLang || user?.language || "id";
    const langDisplay = getLangConfig(user?.language || "id").label;
    const notif = user?.notificationsEnabled
      ? t("cb2.notif_enabled", uiLang)
      : t("cb2.notif_disabled", uiLang);
    const autoRenew = user?.autoRenewal
      ? t("cb2.notif_enabled", uiLang)
      : t("cb2.notif_disabled", uiLang);

    const settingsText = t("cb2.settings_title", uiLang, {
      lang: langDisplay,
      notif,
      autoRenew,
    });
    const settingsMarkup = {
      inline_keyboard: [
        [
          {
            text: t("cb2.settings_lang_btn", uiLang),
            callback_data: "settings_language",
          },
        ],
        [
          {
            text: t("cb2.settings_notif_btn", uiLang),
            callback_data: "settings_notifications",
          },
        ],
        [
          {
            text: t("cb2.settings_autorenewal_btn", uiLang),
            callback_data: "settings_autorenewal",
          },
        ],
        [{ text: t("cb2.back_to_menu", uiLang), callback_data: "main_menu" }],
      ],
    };
    try {
      await ctx.editMessageText(settingsText, {
        parse_mode: "Markdown",
        reply_markup: settingsMarkup,
      });
    } catch {
      await ctx.reply(settingsText, {
        parse_mode: "Markdown",
        reply_markup: settingsMarkup,
      });
    }
    return true;
  }

  // Language selection
  if (data === "settings_language" || data.startsWith("lang_page_")) {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    const user = userId
      ? await UserService.findByTelegramId(BigInt(userId))
      : null;
    const currentLang = user?.language || "id";
    const currentConfig = getLangConfig(currentLang);

    const page = data.startsWith("lang_page_")
      ? parseInt(data.replace("lang_page_", ""))
      : 0;
    const start = page * LANG_PAGE_SIZE;
    const pageItems = LANGUAGE_LIST.slice(start, start + LANG_PAGE_SIZE);
    const totalPages = Math.ceil(LANGUAGE_LIST.length / LANG_PAGE_SIZE);

    const langButtons: Array<Array<{ text: string; callback_data: string }>> =
      [];
    for (let i = 0; i < pageItems.length; i += 2) {
      const row: Array<{ text: string; callback_data: string }> = [];
      for (let j = i; j < Math.min(i + 2, pageItems.length); j++) {
        const lang = pageItems[j];
        const check = lang.code === currentLang ? " \u2705" : "";
        row.push({
          text: `${lang.flag} ${lang.label}${check}`,
          callback_data: `set_language_${lang.code}`,
        });
      }
      langButtons.push(row);
    }

    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 0)
      navRow.push({
        text: "\u25c0\ufe0f Prev",
        callback_data: `lang_page_${page - 1}`,
      });
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: "noop" });
    if (page < totalPages - 1)
      navRow.push({
        text: "Next \u25b6\ufe0f",
        callback_data: `lang_page_${page + 1}`,
      });
    langButtons.push(navRow);

    langButtons.push([
      {
        text: t("cb2.back_to_settings", currentLang),
        callback_data: "open_settings",
      },
    ]);

    const UI_LANG_QUICK_PICK = [
      { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia" },
      { code: "en", flag: "🇬🇧", label: "English" },
      { code: "ru", flag: "🇷🇺", label: "Русский" },
      { code: "zh", flag: "🇨🇳", label: "中文" },
    ];
    if (page === 0) {
      const quickRow = UI_LANG_QUICK_PICK.map((l) => ({
        text: `${l.flag}${l.code === currentLang ? " ✅" : ""}`,
        callback_data: `set_language_${l.code}`,
      }));
      langButtons.unshift(quickRow);
    }

    const uiLangTitle: Record<string, string> = {
      id: "🌐 *Ganti Bahasa*",
      en: "🌐 *Change Language*",
      ru: "🌐 *Изменить язык*",
      zh: "🌐 *更改语言*",
    };
    const uiLangCurrent: Record<string, string> = {
      id: "Saat ini",
      en: "Current",
      ru: "Текущий",
      zh: "当前",
    };
    const uiLangHint: Record<string, string> = {
      id: "Pilih bahasa. Mempengaruhi tampilan bot, voice over, subtitle, dan caption.",
      en: "Select language. Affects bot UI, voice over, subtitles, and captions.",
      ru: "Выберите язык. Влияет на интерфейс, озвучку, субтитры и подписи.",
      zh: "选择语言。影响界面、配音、字幕和说明文字。",
    };

    await ctx.editMessageText(
      `${uiLangTitle[currentLang] || "🌐 *Change Language*"}\n\n` +
        `${uiLangCurrent[currentLang] || "Current"}: ${currentConfig.flag} ${currentConfig.label}\n\n` +
        `${uiLangHint[currentLang] || "Select language. Affects bot UI, voice over, subtitles, and captions."}`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: langButtons },
      },
    );
    return true;
  }

  // set_language_
  if (data.startsWith("set_language_")) {
    const langCode = data.replace("set_language_", "");
    const langCfg = getLangConfig(langCode);
    await ctx.answerCbQuery(`${langCfg.flag} ${langCfg.label} ✅`);
    const userId = ctx.from?.id;
    if (userId) {
      await UserService.update(BigInt(userId), { language: langCode });
    }
    if (ctx.session) {
      ctx.session.userLang = langCode;
    }
    await ctx.editMessageText(
      t("cb2.lang_updated", langCode, {
        flag: langCfg.flag,
        label: langCfg.label,
      }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("cb2.back_to_settings", langCode),
                callback_data: "open_settings",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  // Notifications toggle
  if (data === "settings_notifications") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    const user = userId
      ? await UserService.findByTelegramId(BigInt(userId))
      : null;
    const enabled = user?.notificationsEnabled ?? true;
    const lang = ctx.session?.userLang || "id";
    const statusText = enabled
      ? t("cb2.notif_enabled", lang)
      : t("cb2.notif_disabled", lang);
    await ctx.editMessageText(
      t("cb2.notifications_title", lang, { status: statusText }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: enabled
                  ? t("cb2.turn_off_notif", lang)
                  : t("cb2.turn_on_notif", lang),
                callback_data: "toggle_notifications",
              },
            ],
            [
              {
                text: t("cb2.back_to_settings", lang),
                callback_data: "open_settings",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  if (data === "toggle_notifications") {
    const userId = ctx.from?.id;
    if (!userId) {
      const lang = ctx.session?.userLang || "id";
      await ctx.answerCbQuery(t("misc.user_not_found_error", lang));
      return true;
    }
    const user = await UserService.findByTelegramId(BigInt(userId));
    const newValue = !(user?.notificationsEnabled ?? true);
    await UserService.update(BigInt(userId), {
      notificationsEnabled: newValue,
    });
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(
      newValue
        ? t("cb2.notif_toggle_on", lang)
        : t("cb2.notif_toggle_off", lang),
    );
    const statusText = newValue
      ? t("cb2.notif_enabled", lang)
      : t("cb2.notif_disabled", lang);
    const actionText = newValue
      ? t("cb2.notif_action_enabled", lang)
      : t("cb2.notif_action_disabled", lang);
    await ctx.editMessageText(
      t("cb2.notif_updated", lang, { status: statusText, action: actionText }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: newValue
                  ? t("cb2.turn_off_notif", lang)
                  : t("cb2.turn_on_notif", lang),
                callback_data: "toggle_notifications",
              },
            ],
            [
              {
                text: t("cb2.back_to_settings", lang),
                callback_data: "open_settings",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  // Auto-renewal
  if (data === "settings_autorenewal") {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    const user = userId
      ? await UserService.findByTelegramId(BigInt(userId))
      : null;
    const enabled = user?.autoRenewal ?? false;
    const lang = ctx.session?.userLang || "id";
    const statusText = enabled
      ? t("cb2.notif_enabled", lang)
      : t("cb2.notif_disabled", lang);
    await ctx.editMessageText(
      t("cb2.autorenewal_title", lang, { status: statusText }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: enabled
                  ? t("cb2.disable_autorenewal", lang)
                  : t("cb2.enable_autorenewal", lang),
                callback_data: "toggle_autorenewal",
              },
            ],
            [
              {
                text: t("cb2.back_to_settings", lang),
                callback_data: "open_settings",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  if (data === "toggle_autorenewal") {
    const userId = ctx.from?.id;
    if (!userId) {
      const lang = ctx.session?.userLang || "id";
      await ctx.answerCbQuery(t("misc.user_not_found_error", lang));
      return true;
    }
    const user = await UserService.findByTelegramId(BigInt(userId));
    const newValue = !(user?.autoRenewal ?? false);
    await UserService.update(BigInt(userId), { autoRenewal: newValue });
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(
      newValue
        ? t("cb2.autorenewal_toggle_on", lang)
        : t("cb2.autorenewal_toggle_off", lang),
    );
    const statusText = newValue
      ? t("cb2.notif_enabled", lang)
      : t("cb2.notif_disabled", lang);
    const actionText = newValue
      ? t("cb2.notif_action_enabled", lang)
      : t("cb2.notif_action_disabled", lang);
    await ctx.editMessageText(
      t("cb2.autorenewal_updated", lang, {
        status: statusText,
        action: actionText,
      }),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: newValue
                  ? t("cb2.disable_autorenewal", lang)
                  : t("cb2.enable_autorenewal", lang),
                callback_data: "toggle_autorenewal",
              },
            ],
            [
              {
                text: t("cb2.back_to_settings", lang),
                callback_data: "open_settings",
              },
            ],
          ],
        },
      },
    );
    return true;
  }

  // Notifications unsubscribe
  if (data === "notif_unsubscribe") {
    await ctx.answerCbQuery();
    const uid = ctx.from?.id;
    if (uid) {
      await prisma.user.update({
        where: { telegramId: BigInt(uid) },
        data: { notificationsEnabled: false },
      });
    }
    const lang = ctx.session?.userLang || "id";
    await ctx.reply(t("cb2.notif_unsubscribed", lang), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t("btn.settings", lang), callback_data: "open_settings" }],
        ],
      },
    });
    return true;
  }

  return false;
}
