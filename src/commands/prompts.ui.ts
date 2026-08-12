/**
 * Prompts Command — UI Layer
 *
 * All show* functions for prompt library display.
 * Extracted from prompts.ts to separate UI from command logic.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { UserService } from "@/services/user.service";
import { SavedPromptService } from "@/services/saved-prompt.service";
import { prisma } from "@/config/database";
import type { InlineKeyboardButton } from "@telegraf/types/markup";
import { SavedPrompt } from "@prisma/client";
import { t } from "@/i18n/translations";
import {
  PROMPT_LIBRARY,
  TRENDING_PROMPTS,
  findAnyPrompt,
  getPromptById,
} from "./prompts.data";

// ─── Show prompts for a specific niche ───────────────────────────────────────

export async function showNichePrompts(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  const niche = PROMPT_LIBRARY[nicheKey];
  if (!niche) {
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("prompt.niche_not_found", lang));
    return;
  }

  const telegramId = ctx.from?.id;
  let savedPrompts: unknown[] = [];
  let adminPrompts: SavedPrompt[] = [];
  try {
    adminPrompts = await prisma.savedPrompt.findMany({
      where: { userId: BigInt(0), niche: nicheKey },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch {
    /* non-critical */
  }

  if (telegramId) {
    try {
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (dbUser)
        savedPrompts = await SavedPromptService.getByUser(
          dbUser.id as unknown as bigint,
          nicheKey,
        );
    } catch {
      /* non-critical */
    }
  }

  const hasAdmin = adminPrompts.length > 0;
  const hasSaved = savedPrompts.length > 0;

  let msg = `${niche.emoji} **${niche.label} PROMPT TEMPLATES**\n`;
  msg += `────────────────────────────────────────────\n\n`;
  msg += `Berikut prompt terbaik untuk niche ${niche.label}:\n\n`;

  const rows: InlineKeyboardButton[][] = [];
  let rowNum = 1;

  if (hasSaved) {
    rows.push([
      {
        text: `📌 Prompt Tersimpan Saya (${savedPrompts.length})`,
        callback_data: `my_prompts_${nicheKey}`,
      },
    ]);
  }

  if (hasAdmin) {
    msg += `⭐ **Dari Admin:**\n`;
    adminPrompts.forEach((p) => {
      msg += `**${rowNum}. ${p.title}**\n`;
      msg += `\`${p.prompt.slice(0, 100)}${p.prompt.length > 100 ? "..." : ""}\`\n\n`;
      rows.push([
        {
          text: `${rowNum++}. ${p.title} ⭐`,
          callback_data: `use_admin_prompt_${p.id}`,
        },
      ]);
    });
  }

  msg += `**PROMPT TEMPLATES:**\n`;
  niche.prompts.forEach((p) => {
    msg += `**${rowNum}. ${p.title}** ⭐ ${p.successRate}% success\n`;
    msg += `───────────────────────────\n`;
    msg += `\`${p.prompt.slice(0, 100)}${p.prompt.length > 100 ? "..." : ""}\`\n\n`;
    msg += `✅ Cocok untuk: ${p.suitable}\n\n`;
    rows.push([
      {
        text: `${rowNum++}. ${p.title} ⭐`,
        callback_data: `use_prompt_${p.id}`,
      },
    ]);
  });

  msg += `────────────────────────────────────────────\n`;
  msg += `💡 **Cara Pakai:**\n`;
  msg += `Ketik \`/use 1\` untuk pakai prompt #1\n`;
  msg += `Ketik \`/customize 1\` untuk modifikasi prompt`;

  rows.push([
    {
      text: "➕ Tambah Custom Prompt",
      callback_data: `add_custom_prompt_${nicheKey}`,
    },
  ]);
  rows.push([
    { text: "◀️ Kembali ke Semua Niche", callback_data: "back_prompts" },
  ]);

  const markup = { inline_keyboard: rows };
  try {
    if (edit)
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }
}

// ─── Show prompt detail ──────────────────────────────────────────────────────

export async function showPromptDetail(
  ctx: BotContext,
  promptId: string,
  edit = false,
): Promise<void> {
  const p = await findAnyPrompt(promptId);
  if (!p) {
    const dbUser = ctx.from
      ? await UserService.findByTelegramId(BigInt(ctx.from.id))
      : null;
    const lang = dbUser?.language || "id";
    await ctx.reply(t("cb.prompt_not_found", lang));
    return;
  }

  let credits = "?";
  try {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
      if (dbUser) credits = String(dbUser.creditBalance);
    }
  } catch {
    /* ignore */
  }

  const credLine =
    credits !== "?" ? `💰 Saldo kamu: **${credits} credits** ✓\n\n` : "";
  const msg =
    `✅ **Prompt Aktif!**\n\n─────────────────────────────────────\n` +
    `📋 **${p.title}**\n─────────────────────────────────────\n\n` +
    `\`${p.prompt}\`\n\n─────────────────────────────────────\n\n` +
    `🎬 **Langkah Selanjutnya:**\n\n1. **Upload foto produk kamu** (opsional)\n` +
    `→ AI akan animasikan foto jadi video\n\n2. **Atau langsung generate**\n` +
    `→ AI akan buat visual dari prompt ini\n\n─────────────────────────────────────\n` +
    `📊 **Credit Estimator:**\n${credLine}` +
    `• Video 5 detik: 0.2 credits\n• Video 15 detik: 0.5 credits\n` +
    `• Video 30 detik: 1.0 credits\n• Video 60 detik: 2.0 credits`;

  const markup = {
    inline_keyboard: [
      [{ text: "🚀 Buat Video Sekarang!", callback_data: "create_video_new" }],
      [
        {
          text: "🖼️ Buat Gambar Saja",
          callback_data: `generate_image_v3_${promptId}`,
        },
      ],
      [
        { text: "🔧 Customize", callback_data: `customize_prompt_${promptId}` },
        { text: "💾 Simpan", callback_data: `save_prompt_${promptId}` },
      ],
      [
        {
          text: "◀️ Kembali ke Niche",
          callback_data: `prompts_niche_${p.niche}`,
        },
      ],
    ],
  };

  try {
    if (edit)
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }

  if (ctx.session) {
    ctx.session.generateProductDesc = p.prompt;
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      selectedPrompt: p.prompt,
      selectedPromptId: p.id,
    };
  }
}

// ─── Customize prompt ────────────────────────────────────────────────────────

export async function showCustomizePrompt(
  ctx: BotContext,
  promptId: string,
  edit = false,
): Promise<void> {
  const p = await getPromptById(promptId);
  const base = p ? p.prompt : "Prompt kustom";

  const msg =
    `🔧 **PROMPT CUSTOMIZER**\n─────────────────────────────────────\n\n` +
    `Base prompt:\n\`${base.slice(0, 100)}${base.length > 100 ? "..." : ""}\`\n\n` +
    `─────────────────────────────────────\n**MODIFY OPTIONS:**\n` +
    `─────────────────────────────────────\n\n📐 **Style**\n` +
    `[Cinematic] [Minimalist] [Editorial] [Dramatic] [Fun]\n\n💡 **Lighting**\n` +
    `[Golden Hour] [Studio] [Natural] [Neon] [Moody]\n\n🎭 **Mood**\n` +
    `[Cozy] [Energetic] [Luxury] [Professional] [Casual]\n\n⏱️ **Duration**\n` +
    `[5 sec] [15 sec] [30 sec] [60 sec]\n\n📱 **Platform**\n` +
    `[TikTok 9:16] [IG Reels] [YouTube Shorts] [FB Reels]\n\n` +
    `─────────────────────────────────────\n\nKetik pilihanmu, contoh:\n` +
    `"style dramatic, lighting neon, duration 10 sec"\n\natau jelaskan perubahan yang kamu mau!`;

  const markup = {
    inline_keyboard: [
      [
        {
          text: "🎬 Cinematic",
          callback_data: `cust_style_cinematic_${promptId}`,
        },
        {
          text: "⚡ Dramatic",
          callback_data: `cust_style_dramatic_${promptId}`,
        },
        {
          text: "✨ Minimalist",
          callback_data: `cust_style_minimal_${promptId}`,
        },
      ],
      [
        {
          text: "🌅 Golden Hour",
          callback_data: `cust_light_golden_${promptId}`,
        },
        { text: "💡 Studio", callback_data: `cust_light_studio_${promptId}` },
        { text: "🌙 Moody", callback_data: `cust_light_moody_${promptId}` },
      ],
      [{ text: "◀️ Kembali", callback_data: `use_prompt_${promptId}` }],
    ],
  };

  if (ctx.session) {
    ctx.session.state = "CUSTOMIZING_PROMPT";
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      customizingPromptId: promptId,
      basePrompt: base,
    };
  }

  try {
    if (edit)
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: markup,
      });
    else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  } catch {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  }
}

// ─── Show user's saved prompts ───────────────────────────────────────────────

export async function showMyPrompts(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
    if (!dbUser) return;

    const saved = await SavedPromptService.getByUser(
      dbUser.id as unknown as bigint,
      nicheKey,
    );
    const niche = PROMPT_LIBRARY[nicheKey];

    if (saved.length === 0) {
      const msg = `📌 *Prompt Tersimpan — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n\nBelum ada prompt tersimpan di niche ini.\n\n_Tap 💾 Simpan di detail prompt untuk menyimpan!_`;
      const markup = {
        inline_keyboard: [
          [
            {
              text: `◀️ Kembali ke ${niche?.emoji} ${niche?.label}`,
              callback_data: `prompts_${nicheKey}`,
            },
          ],
        ],
      };
      if (edit)
        await ctx
          .editMessageText(msg, {
            parse_mode: "Markdown",
            reply_markup: markup,
          })
          .catch(() =>
            ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
          );
      else
        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
      return;
    }

    let msg = `📌 *Prompt Tersimpan — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n_${saved.length} prompt kamu_ 👇\n\n`;
    saved.forEach((p, i) => {
      msg += `*${i + 1}. ${p.title}*\n`;
      msg += `\`${p.prompt.slice(0, 80)}${p.prompt.length > 80 ? "..." : ""}\`\n`;
      msg += `📊 Dipakai ${p.usageCount}x\n\n`;
    });

    const rows: InlineKeyboardButton[][] = saved.map((p, i) => [
      { text: `${i + 1}. ${p.title}`, callback_data: `use_saved_${p.id}` },
      { text: "🗑️", callback_data: `del_saved_${p.id}_${nicheKey}` },
    ]);
    rows.push([
      {
        text: "➕ Tambah Custom Prompt",
        callback_data: `add_custom_prompt_${nicheKey}`,
      },
    ]);
    rows.push([
      {
        text: `◀️ Kembali ke ${niche?.emoji} ${niche?.label}`,
        callback_data: `prompts_${nicheKey}`,
      },
    ]);

    const markup = { inline_keyboard: rows };
    if (edit)
      await ctx
        .editMessageText(msg, { parse_mode: "Markdown", reply_markup: markup })
        .catch(() =>
          ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
        );
    else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
  } catch (err) {
    logger.error("showMyPrompts error:", err);
    const errLang =
      (ctx.from
        ? (
            await UserService.findByTelegramId(BigInt(ctx.from.id)).catch(
              () => null,
            )
          )?.language
        : null) || "id";
    await ctx.reply(t("prompt.saved_load_failed", errLang));
  }
}

// ─── Add custom prompt flow ──────────────────────────────────────────────────

export async function startAddCustomPrompt(
  ctx: BotContext,
  nicheKey: string,
  edit = false,
): Promise<void> {
  const niche = PROMPT_LIBRARY[nicheKey];
  const msg =
    `➕ *Tambah Custom Prompt — ${niche?.emoji || ""} ${niche?.label || nicheKey}*\n\n` +
    `Ketik prompt kamu sekarang.\n\n*Tips prompt yang baik:*\n• Minimal 10 kata\n` +
    `• Sertakan: subjek, style, lighting, mood\n• Contoh: _"Cinematic shot produk skincare dengan golden hour lighting, soft bokeh background, premium aesthetic"_\n\n_Ketik promptnya langsung, atau tap Batal_`;

  const markup = {
    inline_keyboard: [
      [{ text: "❌ Batal", callback_data: `prompts_${nicheKey}` }],
    ],
  };

  if (ctx.session) {
    ctx.session.state = "CUSTOM_PROMPT_CREATION";
    ctx.session.stateData = {
      ...(ctx.session.stateData || {}),
      addingPromptNiche: nicheKey,
    };
  }

  if (edit)
    await ctx
      .editMessageText(msg, { parse_mode: "Markdown", reply_markup: markup })
      .catch(() =>
        ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup }),
      );
  else await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: markup });
}
