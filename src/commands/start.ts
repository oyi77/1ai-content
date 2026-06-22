/**
 * Start Command
 *
 * Handles /start command - entry point for new and returning users.
 * New users: show 4-language picker (ID, EN, RU, ZH) before onboarding.
 * Returning users: greet in their saved language.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { t } from "@/i18n/translations";
import { sendVilonaWelcomeAnimation } from "@/services/vilona-animation.service";
import { PaymentSettingsService } from "@/services/payment-settings.service";

import { getMainMenuKeyboard } from "@/config/pricing";
import { showMainDashboard } from "@/menus/unified-dashboard";

/**
 * Map Telegram language_code to our 4 supported UI languages.
 * Anything not explicitly mapped falls back to English.
 */
const TELEGRAM_LANG_MAP: Record<string, string> = {
  id: "id",
  en: "en",
  ru: "ru",
  uk: "ru", // Ukrainian → Russian fallback
  be: "ru", // Belarusian → Russian fallback
  "zh-hans": "zh",
  "zh-hant": "zh",
  zh: "zh",
};

/** Map Telegram language_code → one of the 4 UI languages */
function detectUILanguage(telegramLangCode?: string): string {
  if (!telegramLangCode) return "en";
  const lower = telegramLangCode.toLowerCase();
  if (TELEGRAM_LANG_MAP[lower]) return TELEGRAM_LANG_MAP[lower];
  const base = lower.split("-")[0];
  if (TELEGRAM_LANG_MAP[base]) return TELEGRAM_LANG_MAP[base];
  return "en"; // default to English for unknown languages
}

/** The 4 UI languages offered during onboarding */
const UI_LANGUAGES = [
  { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
];

/**
 * Handle /start command
 */
export async function startCommand(ctx: BotContext): Promise<void> {
  try {
    const user = ctx.from;

    if (!user) {
      await ctx.reply(t("social.unable_identify_user", "id"));
      return;
    }

    logger.info(
      `User started bot: ${user.id} (${user.username || "no username"})`,
    );

    // Check if user exists in database
    const existingUser = await UserService.findByTelegramId(BigInt(user.id));

    if (existingUser) {
      // Update activity
      await UserService.updateActivity(BigInt(user.id));

      // Check if banned
      if (existingUser.isBanned) {
        const lang = existingUser.language || "en";
        const banMsg: Record<string, string> = {
          id: `❌ Akun kamu dibatasi.\n\nAlasan: ${existingUser.banReason || "Tidak ada alasan"}\n\nHubungi support jika ini adalah kesalahan.`,
          en: `❌ Your account has been restricted.\n\nReason: ${existingUser.banReason || "No reason provided"}\n\nContact support if you believe this is an error.`,
          ru: `❌ Ваш аккаунт ограничен.\n\nПричина: ${existingUser.banReason || "Причина не указана"}\n\nСвяжитесь с поддержкой, если считаете это ошибкой.`,
          zh: `❌ 您的账号已被限制。\n\n原因：${existingUser.banReason || "未提供原因"}\n\n如有异议请联系客服。`,
        };
        await ctx.reply(banMsg[lang] || banMsg.en);
        return;
      }

      // ── Vilona welcome animation (non-blocking) ──────────────────────────
      await sendVilonaWelcomeAnimation(ctx);

      const lang = existingUser.language || "en";
      const credBal = Number(existingUser.creditBalance);
      const credEmoji = credBal === 0 ? "⚠️" : credBal < 3 ? "🟡" : "🟢";

      // Store language + credits in session for quick access
      if (ctx.session) {
        ctx.session.creditBalance = credBal;
        ctx.session.tier = existingUser.tier || "free";
        ctx.session.userLang = lang;
        ctx.session.state = "DASHBOARD";
        ctx.session.lastActivity = new Date();
      }

      // Send reply keyboard (persistent bottom bar)
      const customWelcome = await PaymentSettingsService.getPricingConfig(
        "system",
        "welcome_message",
      );
      const welcomeText =
        customWelcome ||
        `${t("menu.hello", lang, { name: user.first_name })}\n\n${credEmoji} ${t("menu.credits_label", lang)}: *${credBal}*\n\n${t("menu.today_question", lang)}`;
      await ctx.reply(welcomeText, {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: getMainMenuKeyboard(lang),
          resize_keyboard: true,
        },
      });

      // Persona picker for users who haven't set one yet (non-blocking)
      if (!existingUser.userMode) {
        await ctx.reply(
          '🎯 *Atur profil kamu untuk pengalaman yang lebih personal:*',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏪 UMKM', callback_data: 'persona_set_umkm' }, { text: '🎥 Creator', callback_data: 'persona_set_content_creator' }],
                [{ text: '🎬 Director', callback_data: 'persona_set_movie_director' }, { text: '🎌 Anime', callback_data: 'persona_set_anime_studio' }],
                [{ text: '💼 Corporate', callback_data: 'persona_set_corporate' }, { text: '🏢 Agency', callback_data: 'persona_set_agency' }],
              ],
            },
          }
        );
      }

      // Also send unified dashboard (button-based navigation)
      await showMainDashboard(ctx);

      // Legacy inline menu (kept for backward compat)
      await ctx.reply(t("cb.main_menu_quick_actions", lang), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t("btn.create_video", lang),
                callback_data: "create_video_new",
              },
              {
                text: t("btn.create_image", lang),
                callback_data: "image_from_prompt",
              },
            ],
            [
              {
                text: t("btn.browse_prompts", lang),
                callback_data: "back_prompts",
              },
              {
                text: t("btn.trending", lang),
                callback_data: "prompts_trending",
              },
            ],
            [
              { text: t("btn.topup", lang), callback_data: "topup" },
              { text: t("btn.my_videos", lang), callback_data: "videos_list" },
            ],
          ],
        },
      });
      return;
    }

    // ── NEW USER: extract UTM / referral data, then show language picker ───
    const msg = ctx.message as { text?: string } | undefined;
    const startPayload = msg?.text?.split(" ")[1];

    const utmParams: any = {};
    const attributionParams: any = {};

    if (startPayload) {
      try {
        const params = new URLSearchParams(startPayload.replace("?", ""));
        utmParams.utm_source = params.get("utm_source") || undefined;
        utmParams.utm_medium = params.get("utm_medium") || undefined;
        utmParams.utm_campaign = params.get("utm_campaign") || undefined;
        utmParams.utm_content = params.get("utm_content") || undefined;
        utmParams.lp_variant = params.get("lp_variant") || undefined;
        attributionParams.fbc = params.get("fbc") || undefined;
        attributionParams.fbp = params.get("fbp") || undefined;
        attributionParams.ttclid = params.get("ttclid") || undefined;
      } catch (e) {
        logger.warn(
          `Failed to parse UTM params from start payload: ${startPayload}`,
        );
      }
    }

    // Detect preferred UI language from Telegram client settings
    const detectedLang = detectUILanguage(user.language_code);

    if (ctx.session) {
      ctx.session.state = "ONBOARDING_LANGUAGE";
      ctx.session.lastActivity = new Date();
      ctx.session.stateData = {
        startPayload: startPayload || null,
        detectedLang,
        utmParams,
        attributionParams,
      };
    }

    // Show 4-language picker — message is intentionally in all 4 languages
    // so every user can read it regardless of their language
    await ctx.reply(
      `🌐 *Pilih bahasa kamu*\n` +
        `🌐 *Please select your language*\n` +
        `🌐 *Выберите язык*\n` +
        `🌐 *请选择您的语言*`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: UI_LANGUAGES.map((l) => [
            {
              text: `${l.flag} ${l.label}`,
              // Use onboard_lang_* — the existing handler creates user + shows translated onboarding
              callback_data: `onboard_lang_${l.code}`,
            },
          ]),
        },
      },
    );
  } catch (error) {
    logger.error("Error in start command:", error);
    await ctx.reply(t("error.generic", "id"));
  }
}
