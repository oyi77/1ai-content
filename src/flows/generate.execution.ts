/**
 * Generate Flow — Execution Engine (orchestrator).
 *
 * Pipeline phases live in generate/phases/*.ts; this file keeps setup
 * (idempotency lock, params, reference-image download), dispatch,
 * and the catch/finally (lock release, temp cleanup).
 */
import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { detectIndustry, DURATION_PRESETS } from "@/config/hpas-engine";
import { clearGenerateSession, downloadToLocal } from "./generate.types";
import type { GenerateAction, Platform } from "./generate.types";
import type { DurationPreset, DurationPresetConfig } from "@/config/hpas-engine";
import type { ExecSetup } from "./generate/phases/types";
import { resolveGating } from "./generate/phases/gating";
import { runFreeTrial } from "./generate/phases/free-trial";
import { runImageSet } from "./generate/phases/image-set";
import { runVideo } from "./generate/phases/video";
import { runCloneStyle } from "./generate/phases/clone-style";
import { runCampaign } from "./generate/phases/campaign";
import fs from "fs";

export async function executeGeneration(ctx: BotContext): Promise<void> {
  const session = ctx.session;
  if (!session) return;

  const telegramId = BigInt(ctx.from!.id);

  // Idempotency lock: prevent double-click from deducting credits twice
  const { redis } = await import("../config/redis.js");
  const lockKey = `generating:${telegramId}`;
  const lockAcquired = await redis.set(lockKey, "1", "EX", 300, "NX");
  if (lockAcquired !== "OK") {
    await ctx.reply(t("gen.already_processing", ctx.session?.userLang || "id"));
    return;
  }

  const action = (session.generateAction as GenerateAction) || "video";
  const productDesc = (session.generateProductDesc as string) || "";
  const rawPhotoUrl = session.generatePhotoUrl as string | undefined;
  const preset = (session.generatePreset as DurationPreset) || "standard";
  const platform = (session.generatePlatform as Platform) || "tiktok";

  // Download reference image to local file so providers can read it (they check fs.existsSync)
  let photoUrl: string | undefined;
  if (rawPhotoUrl) {
    const localRef = await downloadToLocal(
      rawPhotoUrl,
      `ref_${telegramId}_${Date.now()}.jpg`,
    );
    photoUrl = localRef || rawPhotoUrl; // Fall back to URL if download fails
  }

  const presetConfig =
    preset === "custom" && session.customPresetConfig
      ? (session.customPresetConfig as unknown as DurationPresetConfig)
      : DURATION_PRESETS[preset];
  const industry = detectIndustry(productDesc);

  const setup: ExecSetup = {
    ctx,
    session,
    telegramId,
    action,
    productDesc,
    photoUrl,
    preset,
    presetConfig,
    platform,
    industry,
    lockKey,
    redis,
  };

  try {
    const gated = await resolveGating(setup);
    if (!gated) return;
    const c = { ...setup, ...gated };

    if (c.useFreeSlot) {
      await runFreeTrial(c);
      return;
    }

    await ctx.reply(t("gen.generating", c.lang), { parse_mode: "Markdown" });

    if (c.action === "image_set") {
      await runImageSet(c);
      return;
    }
    if (c.action === "video") {
      await runVideo(c);
      return;
    }
    if (c.action === "clone_style") {
      await runCloneStyle(c);
      return;
    }
    if (c.action === "campaign") {
      await runCampaign(c);
      return;
    }
  } catch (err) {
    logger.error("executeGeneration error", err);
    clearGenerateSession(ctx);
    await ctx.reply(t("gen.generation_failed", ctx.session?.userLang || "id"));
  } finally {
    // Release idempotency lock
    await redis
      .del(lockKey)
      .catch((err) =>
        logger.warn("Redis cleanup failed", { error: err.message }),
      );
    // Cleanup temp reference image file
    if (photoUrl && !photoUrl.startsWith("http") && fs.existsSync(photoUrl)) {
      try {
        fs.unlinkSync(photoUrl);
      } catch {
        /* ignore */
      }
    }
  }
}
