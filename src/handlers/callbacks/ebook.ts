/**
 * Ebook Callback Handler
 *
 * Handles all ebook-related callback queries from inline keyboards.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import {
  handleEbookCreate,
  handleEbookList,
  handleEbookDownload,
  handleEbookPreview,
} from "@/commands/ebook";

/**
 * Handle ebook-related callbacks
 * Returns true if handled, false otherwise
 */
export async function handleEbookCallbacks(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  try {
    if (data === "ebook_create") {
      await handleEbookCreate(ctx);
      return true;
    }

    if (data === "ebook_list") {
      await handleEbookList(ctx);
      return true;
    }

    if (data.startsWith("ebook_download_")) {
      await handleEbookDownload(ctx, data);
      return true;
    }

    if (data.startsWith("ebook_preview_")) {
      await handleEbookPreview(ctx, data);
      return true;
    }

    if (data === "ebook_help") {
      await ctx.reply(
        "📖 *Bantuan Ebook Generator*\n\n" +
          "📖 */ebook* - Buka menu ebook\n\n" +
          "*Fitur:*\n" +
          "• Buat ebook dari ide sederhana\n" +
          "• Export PDF, DOCX, EPUB\n" +
          "• Lead magnet, paid ebook, bonus\n" +
          "• Cover design otomatis\n\n" +
          "*Cara Penggunaan:*\n" +
          "1. Ketik */ebook* atau pilih di menu\n" +
          "2. Pilih 'Buat Ebook Baru'\n" +
          "3. Masukkan ide ebook\n" +
          "4. Pilih bahasa dan tipe\n" +
          "5. Tunggu proses generate (5-15 menit)\n" +
          "6. Download ebook Anda!",
        { parse_mode: "Markdown" },
      );
      return true;
    }

    if (data.startsWith("ebook_lang_")) {
      const { handleEbookLanguage } = await import("@/commands/ebook.js");
      await handleEbookLanguage(ctx, data);
      return true;
    }

    if (data.startsWith("ebook_mode_")) {
      const { handleEbookMode } = await import("@/commands/ebook.js");
      await handleEbookMode(ctx, data);
      return true;
    }

    return false;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error("Ebook callback error:", error);
    await ctx.reply(`❌ Error: ${error.message}`, { parse_mode: "Markdown" });
    return true;
  }
}
