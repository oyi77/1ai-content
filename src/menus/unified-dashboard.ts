/**
 * Unified Button Dashboard
 *
 * All bot navigation via inline buttons.
 * /start or /menu → main dashboard → sub-menus → actions
 */

import { BotContext } from "@/types";
import { UserService } from "@/services/user.service";
import { prisma } from "@/config/database";

type InlineButton = { text: string; callback_data: string };
type InlineRow = InlineButton[];

// ── Main Dashboard ──

export async function showMainDashboard(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply("Unable to identify user."); return; }

  const dbUser = await UserService.findByTelegramId(BigInt(user.id));
  const lang = dbUser?.language || "en";
  const credits = dbUser ? Number(dbUser.creditBalance) : 0;
  const tier = dbUser?.tier || "free";
  const creditEmoji = credits === 0 ? "⚠️" : credits < 3 ? "🟡" : "🟢";

  const text = [
    `👋 ${user.first_name}`,
    "",
    `🤖 Vilona Content Automation`,
    "",
    "Pilih menu:",
  ].join("\n");

  const buttons: InlineRow[] = [
    [
      { text: "🎬 Buat Video", callback_data: "menu_create" },
      { text: "🖼️ Buat Foto", callback_data: "menu_image" },
    ],
    [
      { text: "🖼️ Carousel", callback_data: "carousel_regenerate" },
      { text: "🤖 AutoPilot", callback_data: "autopilot_run" },
    ],
    [
      { text: "📅 Calendar", callback_data: "menu_calendar" },
      { text: "🧪 A/B Test", callback_data: "menu_abtest" },
    ],
    [
      { text: "🔥 Trending", callback_data: "menu_trending" },
      { text: "📁 Video Saya", callback_data: "menu_videos" },
    ],
    [
      { text: "💬 AI Chat", callback_data: "menu_chat" },
      { text: "📚 Prompts", callback_data: "menu_prompts" },
    ],
    [
      { text: "👤 Profil", callback_data: "menu_profile" },
      { text: "⚙️ Settings", callback_data: "menu_settings" },
    ],
    [
      { text: "🆘 Support", callback_data: "menu_support" },
      { text: "📖 Help", callback_data: "menu_help" },
    ],
  ];

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery?.();
    await ctx.editMessageText(text, { reply_markup: { inline_keyboard: buttons } });
  } else {
    await ctx.reply(text, { reply_markup: { inline_keyboard: buttons } });
  }
}

// ── Sub-menus ──

export async function showCreateMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("🎬 *Buat Konten*\n\nPilih jenis konten:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎥 Video dari Ide", callback_data: "create_video_new" }],
        [{ text: "🔗 Video dari Link", callback_data: "create_from_link" }],
        [{ text: "📄 Video dari File", callback_data: "create_from_file" }],
        [{ text: "🎤 Voiceover AI", callback_data: "create_voice" }],
        [{ text: "🎵 Musik AI", callback_data: "create_music" }],
        [{ text: "🔁 Video Loop", callback_data: "create_loop" }],
        [{ text: "🔄 Repurpose (Anti-Copyright)", callback_data: "create_regen" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showImageMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("🖼️ *Buat Foto*\n\nPilih jenis foto:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛍️ Product Photo", callback_data: "img_product" }, { text: "🍔 F&B Food", callback_data: "img_fnb" }],
        [{ text: "🏠 Real Estate", callback_data: "img_realestate" }, { text: "🚗 Car/Auto", callback_data: "img_car" }],
        [{ text: "💄 Beauty", callback_data: "img_beauty" }, { text: "🏢 Corporate", callback_data: "img_services" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showPromptsMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("📚 *Prompt Library*\n\nBrowse prompts:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔥 Trending", callback_data: "prompts_trending" }, { text: "🎁 Daily", callback_data: "prompts_daily" }],
        [{ text: "🧬 Fingerprint", callback_data: "prompts_fingerprint" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showVideosMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("📁 *Video Saya*\n\nManage your videos:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 Semua Video", callback_data: "videos_list" }],
        [{ text: "⭐ Favorit", callback_data: "videos_favorites" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showTopupMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("💰 *Topup Credits*\n\nPilih nominal:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Topup Sekarang", callback_data: "topup" }],
        [{ text: "📊 Riwayat Transaksi", callback_data: "topup_history" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showSubscriptionMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("⭐ *Subscription*\n\nManage your plan:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 Lihat Plan", callback_data: "subscription_plans" }],
        [{ text: "🔄 Upgrade", callback_data: "subscription_upgrade" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showProfileMenu(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;
  await ctx.answerCbQuery?.();

  const dbUser = await UserService.findByTelegramId(BigInt(user.id));
  const credits = dbUser ? Number(dbUser.creditBalance) : 0;
  const tier = dbUser?.tier || "free";
  const videos = dbUser ? await prisma.video.count({ where: { userId: BigInt(user.id) } }) : 0;

  const text = [
    "👤 *Profil*",
    "",
    `Name: ${user.first_name} ${user.last_name || ""}`,
    `Username: @${user.username || "N/A"}`,
    `ID: ${user.id}`,
    `Tier: ${tier}`,
    `Credits: ${credits}`,
    `Videos: ${videos}`,
  ].join("\n");

  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showReferralMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  const user = ctx.from;
  if (!user) return;

  const dbUser = await UserService.findByTelegramId(BigInt(user.id));
  const refCode = dbUser?.referralCode || "N/A";

  await ctx.editMessageText(`👥 *Referral*\n\nKode referral: \`${refCode}\`\n\nShare kode ini untuk dapat bonus credits!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Referral Stats", callback_data: "referral_stats" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showSettingsMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("⚙️ *Settings*\n\nPilih pengaturan:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌐 Bahasa", callback_data: "settings_language" }],
        [{ text: "🔔 Notifikasi", callback_data: "settings_notifications" }],
        [{ text: "🗑️ Hapus Akun", callback_data: "settings_delete_account" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showSupportMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("🆘 *Support*\n\nButuh bantuan?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💬 Chat Admin", callback_data: "support_chat" }],
        [{ text: "📖 FAQ", callback_data: "support_faq" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showHelpMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText(
    "📖 *Panduan Vilona Content*\n\n" +
    "🎬 `/create` — Buat video dari ide/link/file\n" +
    "🖼️ `/image` — Buat foto produk AI\n" +
    "🖼️ `/carousel` — Buat TikTok carousel\n" +
    "🤖 `/autopilot` — Auto-generate & publish\n" +
    "📅 `/calendar` — Content calendar\n" +
    "🧪 `/abtest` — A/B testing konten\n" +
    "💬 `/chat` — Chat dengan AI\n" +
    "🔥 `/trending` — Lihat trending\n" +
    "🔥 `/viral` — Cari konten viral\n" +
    "✂️ `/clip` — Download & clip video\n" +
    "🕵️ `/scrape` — Scrape kompetitor",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Kembali", callback_data: "menu_main" }],
        ],
      },
    },
  );
}

export async function showEbookMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("📖 *Ebook AI*\n\nBuat ebook dengan AI:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📝 Buat Ebook Baru", callback_data: "ebook_create" }],
        [{ text: "📚 Ebook Saya", callback_data: "ebook_list" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showTrendingMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText("🔥 *Trending*\n\nLihat yang lagi viral:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔥 Viral Videos", callback_data: "viral_scan" }],
        [{ text: "📊 Trending Prompts", callback_data: "prompts_trending" }],
        [{ text: "🔥 Scan & Generate Konten", callback_data: "trending_scan_generate" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showChatMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();
  await ctx.editMessageText(
    "💬 *AI Chat Assistant*\n\n" +
    "Chat langsung dengan AI untuk:\n" +
    "• Brainstorm ide konten\n" +
    "• Tulis caption viral\n" +
    "• Riset topik\n" +
    "• Tanya apapun\n\n" +
    "Ketik pesan kamu langsung di chat ini!",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Kembali", callback_data: "menu_main" }],
        ],
      },
    },
  );
}

export async function showCalendarMenu(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;
  await ctx.answerCbQuery?.();

  const text = [
    "📅 *Content Calendar*",
    "",
    "Jadwalkan konten kamu untuk auto-publish.",
    "",
    "📌 *Fitur:*",
    "• Schedule video & carousel",
    "• Auto-publish ke TikTok",
    "• Bulk schedule 1 minggu",
    "• Stats & tracking",
    "",
 "Ketik `/calendar` untuk lihat jadwal",
    "Ketik `/calendar schedule <topic> | <tanggal>` untuk schedule",
  ].join("\n");

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📅 Lihat Jadwal", callback_data: "cal_list_all" },
          { text: "📊 Stats", callback_data: "cal_stats" },
        ],
        [{ text: "➕ Schedule Sekarang", callback_data: "cal_schedule" }],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}

export async function showABTestMenu(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery?.();

  const text = [
    "🧪 *A/B Testing*",
    "",
    "Test 2 versi konten untuk lihat mana yang lebih viral.",
    "",
    "📌 *Fitur:*",
    "• AI generate 2 variant (A & B)",
    "• Track views, likes, shares, comments",
    "• Auto-determine winner",
    "",
    "Ketik `/abtest` untuk lihat test",
    "Ketik `/abtest create <topic>` untuk bikin test baru",
  ].join("\n");

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ New Test", callback_data: "ab_new" },
          { text: "▶️ Running", callback_data: "ab_list_running" },
        ],
        [
          { text: "✅ Results", callback_data: "ab_list_completed" },
          { text: "📊 Stats", callback_data: "ab_stats" },
        ],
        [{ text: "🔙 Kembali", callback_data: "menu_main" }],
      ],
    },
  });
}
