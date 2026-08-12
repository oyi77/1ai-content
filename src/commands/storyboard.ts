/**
 * /storyboard Command
 *
 * Generates a visual storyboard with AI-generated images for each scene.
 * User sends a text prompt → system generates storyboard with images →
 * user approves → video generation queued.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";

import { StoryboardVisualService } from "@/services/storyboard-visual.service";
import { detectIndustry } from "@/config/hpas-engine";

/**
 * /storyboard entry command — asks user for a prompt.
 */
export async function storyboardCommand(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";

  ctx.session.state = "STORYBOARD_AWAITING_PROMPT";
  ctx.session.stateData = {};

  await ctx.reply(
    `🎬 *Storyboard Visual Generator*\n\n` +
      `Kirim deskripsi video kamu, dan aku akan buatkan storyboard preview dengan gambar visual!\n\n` +
      `Contoh:\n` +
      `• "Promo nasi goreng pedas gerobak pinggir jalan"\n` +
      `• "Tour rumah minimalis 2 lantai di BSD"\n` +
      `• "Before-after skincare glowing dalam 7 hari"\n` +
      `• "Unboxing gadget terbaru dari brand Korea"\n` +
      `• "Coffee shop aesthetic latte art"\n\n` +
      `💡 Kamu juga bisa kirim foto produk untuk referensi!`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "◀️ Menu Utama", callback_data: "main_menu" }],
        ],
      },
    },
  );
}

/**
 * Handle text prompt from STORYBOARD_AWAITING_PROMPT state.
 * Generates visual storyboard with images and shows preview.
 */
export async function handleStoryboardPrompt(ctx: BotContext): Promise<void> {
  const lang = ctx.session?.userLang || "id";
  const text = (ctx.message as any)?.text?.trim();
  if (!text) return;

  // Check photo attachment
  const photoUrl = ctx.session.stateData?.storyboardPhotoUrl as
    | string
    | undefined;

  // Detect niche from prompt
  const niche = detectIndustry(text) || "fnb";

  // Show loading message
  const loadingMsg = await ctx.reply(
    `🎬 *Generating Storyboard Preview...*\n\n` +
      `📝 Prompt: _${text.substring(0, 80)}${text.length > 80 ? "..." : ""}_\n` +
      `🏷️ Niche: ${niche.toUpperCase()}\n\n` +
      `⏳ Generating scene descriptions + gambar visual...\n` +
      `Ini butuh ~20-40 detik ya!`,
    { parse_mode: "Markdown" },
  );

  try {
    // Generate visual storyboard (text + images)
    const storyboard = await StoryboardVisualService.generate({
      niche,
      duration: 30,
      customPrompt: text,
      productDescription: text,
    });

    // Store in session for approve/reject flow
    ctx.session.stateData = {
      ...ctx.session.stateData,
      storyboardVisual: storyboard,
    };

    // Step 1: Send images as media group (if any)
    if (storyboard.images.length > 0) {
      const mediaGroup = StoryboardVisualService.formatMediaGroup(storyboard);

      try {
        await ctx.replyWithMediaGroup(mediaGroup);
      } catch (mediaErr) {
        logger.warn("Failed to send storyboard media group", mediaErr);
        // Continue with text-only
      }
    }

    // Step 2: Send caption with approve/reject buttons
    const caption = StoryboardVisualService.formatCaption(storyboard);

    await ctx.reply(caption, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Setuju & Generate Video",
              callback_data: "sba_approve",
            },
            { text: "✏️ Edit Prompt", callback_data: "sba_reject" },
          ],
          [{ text: "🔄 Regenerate Gambar", callback_data: "sba_regenerate" }],
          [{ text: "◀️ Menu Utama", callback_data: "main_menu" }],
        ],
      },
    });

    // Update session state
    ctx.session.state = "STORYBOARD_CONFIRM";

    logger.info("Storyboard visual preview shown", {
      userId: ctx.from?.id,
      niche,
      scenesCount: storyboard.scenes.length,
      imagesCount: storyboard.images.length,
    });
  } catch (err) {
    logger.error("Storyboard generation error", err);

    await ctx.reply(
      `❌ *Gagal Generate Storyboard*\n\n` +
        `Terjadi kesalahan saat membuat storyboard. Coba lagi dengan prompt yang berbeda ya!\n\n` +
        `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Coba Lagi", callback_data: "sba_reject" }],
            [{ text: "◀️ Menu Utama", callback_data: "main_menu" }],
          ],
        },
      },
    );
  }
}
