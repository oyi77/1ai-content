/**
 * Generate Flow — Callback Router
 *
 * Routes inline keyboard callbacks to the appropriate generate-flow handler.
 * Extracted from generate.ts to break up the god object.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import {
  showGenerateMode,
  showGenerateAction,
  showConfirmScreen,
  showSmartPresetSelection,
  showSmartPlatformSelection,
} from "./generate.ui";
import { requestProductInput } from "./generate.input";
import { executeGeneration } from "./generate.execution";
import type { GenerateMode, Platform } from "./generate.types";
import type { DurationPreset } from "@/config/hpas-engine";

// ── Callback Router ───────────────────────────────────────────────────────────

export async function handleGenerateCallback(
  ctx: BotContext,
  data: string,
): Promise<boolean> {
  if (
    !data.startsWith("generate_") ||
    data.startsWith("mode_") ||
    data.startsWith("action_") ||
    data.startsWith("preset_") ||
    data.startsWith("platform_") ||
    data.startsWith("campaign_size")
  )
    return false;

  try {
    if (data === "generate_start") {
      await showGenerateMode(ctx);
      return true;
    }

    // Mode selection
    if (data === "mode_basic") {
      await showGenerateAction(ctx, "basic");
      return true;
    }
    if (data === "mode_smart") {
      await showGenerateAction(ctx, "smart");
      return true;
    }
    if (data === "mode_pro") {
      await showGenerateAction(ctx, "pro");
      return true;
    }

    // Action selection
    if (data === "action_image_set") {
      await requestProductInput(ctx, "image_set");
      return true;
    }
    if (data === "action_clone_style") {
      await requestProductInput(ctx, "clone_style");
      return true;
    }
    if (data === "action_campaign") {
      await requestProductInput(ctx, "campaign");
      return true;
    }
    if (data === "action_video") {
      const mode = (ctx.session?.generateMode as GenerateMode) || "basic";
      if (mode === "smart") {
        await showSmartPresetSelection(ctx);
        return true;
      }
      if (mode === "basic") {
        await requestProductInput(ctx, "video");
        return true;
      }
      await requestProductInput(ctx, "video");
      return true;
    }

    // Smart mode
    if (data.startsWith("preset_")) {
      const preset = data.replace("preset_", "") as DurationPreset;
      await showSmartPlatformSelection(ctx, preset);
      return true;
    }

    if (data.startsWith("platform_")) {
      const platform = data.replace("platform_", "") as Platform;
      if (ctx.session) ctx.session.generatePlatform = platform;
      await requestProductInput(ctx, "video");
      return true;
    }

    // Campaign size
    if (data === "campaign_size_5") {
      if (ctx.session) ctx.session.generateCampaignSize = 5;
      await showConfirmScreen(ctx);
      return true;
    }
    if (data === "campaign_size_10") {
      if (ctx.session) ctx.session.generateCampaignSize = 10;
      await showConfirmScreen(ctx);
      return true;
    }

    // Confirm → execute
    if (data === "generate_confirm") {
      await ctx.answerCbQuery?.("⏳ Memproses...");
      await executeGeneration(ctx);
      return true;
    }
  } catch (err) {
    logger.error("handleGenerateCallback error", err);
  }

  return false;
}
