/**
 * Ebook Command — Telegram bot commands for ebook generation
 *
 * Integrates with the 1ai-content ebook generator to provide
 * ebook generation capabilities via the Telegram bot interface.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { ebookService } from "@/services/ebook.service";
import { t } from "@/i18n/translations";

const LANGUAGES: Record<string, string> = {
  id: "🇮🇩 Indonesia",
  en: "🇺🇸 English",
  ms: "🇲🇾 Melayu",
  th: "🇹🇭 ไทย",
  vi: "🇻🇳 Tiếng Việt",
  tl: "🇵🇭 Filipino",
};

const PRODUCT_MODES: Record<string, string> = {
  lead_magnet: "🧲 Lead Magnet",
  paid_ebook: "💰 Paid Ebook",
  bonus: "🎁 Bonus Content",
  authority: "👑 Authority Building",
};

/**
 * Show ebook menu
 */
export async function ebookCommand(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📖 Buat Ebook Baru", callback_data: "ebook_create" },
        { text: "📁 Ebook Saya", callback_data: "ebook_list" },
      ],
      [
        { text: "❓ Bantuan Ebook", callback_data: "ebook_help" },
        { text: "🔙 Kembali", callback_data: "back_dashboard" },
      ],
    ],
  };

  await ctx.reply(
    "📚 *AI Ebook Generator*\n\n" +
      "Buat ebook profesional dari satu ide saja!\n\n" +
      "✨ Fitur:\n" +
      "• Multi-stage AI pipeline\n" +
      "• Export PDF, DOCX, EPUB\n" +
      "• Lead magnet, paid ebook, bonus\n" +
      "• Cover design otomatis\n\n" +
      "Pilih opsi di bawah:",
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

/**
 * Handle ebook creation flow
 */
export async function handleEbookCreate(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  // Check if ebook API is available
  const isHealthy = await ebookService.healthCheck();
  if (!isHealthy) {
    await ctx.reply(
      "⚠️ Ebook service sedang tidak tersedia. Silakan coba lagi nanti.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  ctx.session!.state = "EBOOK_IDEA";
  await ctx.reply(
    "📖 *Buat Ebook Baru*\n\n" +
      "Kirimkan ide atau topik ebook Anda (10-5000 karakter).\n\n" +
      "Contoh:\n" +
      "• _Panduan Lengkap Belajar Digital Marketing untuk Pemula_\n" +
      "• _101 Resep Masakan Rumahan yang Mudah dan Enak_\n" +
      "• _Strategi Bisnis Online dari Nol hingga Sukses_",
    { parse_mode: "Markdown" }
  );
}

/**
 * Handle idea input
 */
export async function handleEbookIdea(
  ctx: BotContext,
  message: Record<string, unknown>
): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  if (!message.text || (message.text as string).length < 10) {
    await ctx.reply("❌ Ide terlalu pendek. Minimal 10 karakter.");
    return;
  }

  ctx.session!.ebookIdea = message.text as string;
  ctx.session!.state = "EBOOK_TITLE";

  await ctx.reply(
    "✅ Ide diterima!\n\n" +
      "Sekarang kirimkan judul ebook (atau ketik _auto_ untuk judul otomatis):",
    { parse_mode: "Markdown" }
  );
}

/**
 * Handle ebook title input
 */
export async function handleEbookTitle(
  ctx: BotContext,
  message: Record<string, unknown>
): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  const title =
    (message.text as string) === "auto" ? undefined : message.text as string;

  ctx.session!.ebookTitle = title;
  ctx.session!.state = "EBOOK_CHAPTERS";

  await ctx.reply(
    "📝 Berapa jumlah chapter? (3-50)\n\n" +
      "Rekomendasi:\n" +
      "• Lead magnet: 5-10 chapter\n" +
      "• Ebook biasa: 10-20 chapter\n" +
      "• Komprehensif: 20-30 chapter",
    { parse_mode: "Markdown" }
  );
}

/**
 * Handle ebook chapters input
 */
export async function handleEbookChapters(
  ctx: BotContext,
  message: Record<string, unknown>
): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  const chapters = parseInt(message.text as string);
  if (isNaN(chapters) || chapters < 3 || chapters > 50) {
    await ctx.reply("❌ Jumlah chapter harus 3-50.");
    return;
  }

  ctx.session!.ebookChapters = chapters;
  ctx.session!.state = "EBOOK_LANGUAGE";

  const keyboard = {
    inline_keyboard: Object.entries(LANGUAGES).map(([code, name]) => [
      { text: name, callback_data: `ebook_lang_${code}` },
    ]),
  };

  await ctx.reply("🌐 Pilih bahasa ebook:", {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * Handle language selection
 */
export async function handleEbookLanguage(
  ctx: BotContext,
  data: string
): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  const language = data.replace("ebook_lang_", "");

  ctx.session!.ebookLanguage = language;
  ctx.session!.state = "EBOOK_MODE";

  const keyboard = {
    inline_keyboard: Object.entries(PRODUCT_MODES).map(([code, name]) => [
      { text: name, callback_data: `ebook_mode_${code}` },
    ]),
  };

  await ctx.reply("📦 Pilih tipe ebook:", {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * Handle product mode selection and start generation
 */
export async function handleEbookMode(
  ctx: BotContext,
  data: string
): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  const mode = data.replace("ebook_mode_", "");

  ctx.session!.ebookMode = mode;
  ctx.session!.state = "DASHBOARD";

  const idea = ctx.session!.ebookIdea as string;
  const title = ctx.session!.ebookTitle as string | undefined;
  const chapters = ctx.session!.ebookChapters as number;
  const language = ctx.session!.ebookLanguage as string;

  await ctx.reply(
    "⏳ Membuat ebook...\n\n" +
      `📝 Ide: ${idea.substring(0, 100)}...\n` +
      `📖 Judul: ${title || "Auto-generated"}\n` +
      `📄 Chapter: ${chapters}\n` +
      `🌐 Bahasa: ${LANGUAGES[language]}\n` +
      `📦 Tipe: ${PRODUCT_MODES[mode]}\n\n` +
      "Proses ini membutuhkan waktu 5-15 menit...",
    { parse_mode: "Markdown" }
  );

  try {
    const ownerId = ctx.from?.id?.toString();

    // Create project
    const project = await ebookService.createProject(
      {
        idea,
        title,
        chapter_count: chapters,
        target_language: language,
        product_mode: mode,
      },
      ownerId
    );

    // Start generation
    await ebookService.generate(project.id, ownerId);

    // Store project ID for tracking
    ctx.session!.ebookProjectId = project.id;

    // Poll for completion in background
    pollEbookGeneration(ctx, project.id, ownerId);
  } catch (err: unknown) {
    const error = err as Error;
    logger.error("Ebook creation failed:", error);
    await ctx.reply(`❌ Gagal membuat ebook: ${error.message}`, {
      parse_mode: "Markdown",
    });
  }
}

/**
 * Poll for ebook generation completion
 */
async function pollEbookGeneration(
  ctx: BotContext,
  projectId: number,
  owner?: string
): Promise<void> {
  try {
    const status = await ebookService.waitForCompletion(projectId, owner);

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "📄 Download PDF",
            callback_data: `ebook_download_${projectId}_pdf`,
          },
          {
            text: "📝 Download DOCX",
            callback_data: `ebook_download_${projectId}_docx`,
          },
        ],
        [
          {
            text: "📚 Download EPUB",
            callback_data: `ebook_download_${projectId}_epub`,
          },
          {
            text: "👁️ Lihat Preview",
            callback_data: `ebook_preview_${projectId}`,
          },
        ],
        [{ text: "🔙 Kembali", callback_data: "back_dashboard" }],
      ],
    };

    await ctx.reply(
      "✅ *Ebook selesai dibuat!*\n\n" +
        `📖 Project ID: ${projectId}\n` +
        `📊 Status: ${status.status}\n\n` +
        "Pilih format download:",
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } catch (err: unknown) {
    const error = err as Error;
    logger.error("Ebook polling failed:", error);
    await ctx.reply(`❌ Ebook generation gagal: ${error.message}`, {
      parse_mode: "Markdown",
    });
  }
}

/**
 * Handle ebook download
 */
export async function handleEbookDownload(
  ctx: BotContext,
  data: string
): Promise<void> {
  const parts = data.split("_");
  const projectId = parseInt(parts[2]);
  const format = parts[3] as "pdf" | "docx" | "epub";

  try {
    const ownerId = ctx.from?.id?.toString();
    const file = await ebookService.download(projectId, format, ownerId);
    await ctx.replyWithDocument(
      { source: file.buffer, filename: file.filename },
      { caption: `📥 Ebook ${format.toUpperCase()} siap.` }
    );
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn(`Ebook download via Telegram failed (${projectId} ${format}): ${error.message}`);
    const url = ebookService.getDownloadUrl(
      projectId,
      format,
      ctx.from?.id?.toString()
    );
    await ctx.reply(
      `📥 Download ebook (${format.toUpperCase()}):\n\n${url}`,
      { parse_mode: "Markdown" }
    );
  }
}

/**
 * Handle ebook preview
 */
export async function handleEbookPreview(
  ctx: BotContext,
  data: string
): Promise<void> {
  const projectId = parseInt(data.split("_")[2]);

  try {
    const exportData = await ebookService.getExport(
      projectId,
      ctx.from?.id?.toString()
    );

    let preview = "📖 *Ebook Preview*\n\n";
    preview += `📝 Judul: ${exportData.metadata.title}\n`;
    preview += `📄 Total: ${exportData.metadata.total_word_count} kata\n`;
    preview += `📚 Chapter: ${exportData.metadata.chapter_count}\n\n`;

    preview += "*Daftar Isi:*\n";
    for (const ch of exportData.chapters) {
      preview += `${ch.number}. ${ch.title} (${ch.word_count} kata)\n`;
    }

    await ctx.reply(preview, { parse_mode: "Markdown" });
  } catch (err: unknown) {
    const error = err as Error;
    await ctx.reply(`❌ Gagal memuat preview: ${error.message}`, {
      parse_mode: "Markdown",
    });
  }
}

/**
 * List user's ebook projects
 */
export async function handleEbookList(ctx: BotContext): Promise<void> {
  try {
    const projects = await ebookService.listProjects(
      10,
      ctx.from?.id?.toString()
    );

    if (projects.length === 0) {
      await ctx.reply("📭 Anda belum memiliki ebook.", {
        parse_mode: "Markdown",
      });
      return;
    }

    let list = "📁 *Ebook Saya:*\n\n";
    for (const p of projects) {
      list += `📖 ${p.title || "Untitled"}\n`;
      list += `   ID: ${p.id} | Status: ${p.status}\n`;
      list += `   Mode: ${p.product_mode}\n\n`;
    }

    await ctx.reply(list, { parse_mode: "Markdown" });
  } catch (err: unknown) {
    const error = err as Error;
    await ctx.reply(`❌ Gagal memuat ebook: ${error.message}`, {
      parse_mode: "Markdown",
    });
  }
}
