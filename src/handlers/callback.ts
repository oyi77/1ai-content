/**
 * Callback Handler
 *
 * Thin dispatcher that routes all callback queries to domain-specific modules.
 */

import { BotContext } from "@/types";
import { logger } from "@/utils/logger";
import { t } from "@/i18n/translations";
import { handleNavigationCallbacks } from "./callbacks/navigation";
import { handleSettingsCallbacks } from "./callbacks/settings";
import { handleGenerationCallbacks } from "./callbacks/generation";
import { handleVideoCallbacks } from "./callbacks/video";
import { handleSocialCallbacks } from "./callbacks/social";
import { handleReferralCallbacks } from "./callbacks/referral";
import { handleAdminCallbacks } from "./callbacks/admin";
import { handleImageCallbacks } from "./callbacks/image";
import { handleCloneCallbacks } from "./callbacks/clone";
import { handlePaymentCallbacks } from "./callbacks/payment";
import { handleOnboardingCallbacks } from "./callbacks/onboarding";
import { handlePromptLibraryCallbacks } from "./callbacks/promptLibrary";
import { handlePromptsCallback } from "./callbacks/prompts";
import { handleAccountCallback } from "./callbacks/account";
import { handleAvatarTalkCallbacks } from "./callbacks/avatar-talk";
import { handleMediaIntentCallback } from "./callbacks/media-intent";
import { handleEbookCallbacks } from "./callbacks/ebook";
import { handleStoryboardCallbacks } from './callbacks/storyboard';
import { handleContentFactoryCallbacks } from "./callbacks/content-factory";

/**
 * Handle callback queries
 */
export async function callbackHandler(ctx: BotContext): Promise<void> {
  try {
    const callbackQuery = ctx.callbackQuery;

    if (!callbackQuery || !("data" in callbackQuery)) {
      return;
    }

    const data = callbackQuery.data;

    logger.debug("Callback received:", { userId: ctx.from?.id, data });

    // Fire-and-forget event logging for intercepted users
    if (ctx.from?.id) {
      const fromId = ctx.from.id;
      import('@/services/intercept.service.js').then(({ InterceptService }) => {
        InterceptService.isIntercepted(BigInt(fromId)).then(intercepted => {
          if (!intercepted) return;
          InterceptService.logEvent(BigInt(fromId), 'callback', data || '', {
            state: ctx.session?.state,
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }

    // Route in order: more specific before general

    if (await handleMediaIntentCallback(ctx, data)) return;
    if (await handleNavigationCallbacks(ctx, data)) return;
    if (await handleOnboardingCallbacks(ctx, data)) return;
    if (await handleAdminCallbacks(ctx, data)) return;

    // Account/payment (topup_*, duitku_method_*, check_payment_*, subscribe_*, etc.)
    if (await handleAccountCallback(ctx, data)) return;

    if (await handlePaymentCallbacks(ctx, data)) return;
    if (await handleReferralCallbacks(ctx, data)) return;
    if (await handleSettingsCallbacks(ctx, data)) return;

    // Generation (V3 flow + legacy creation)
    if (await handleGenerationCallbacks(ctx, data)) return;

    // Prompts library (use_prompt_*, prompts_niche_*, generate_free_*, etc.)
    if (await handlePromptsCallback(ctx, data)) return;
    if (await handlePromptLibraryCallbacks(ctx, data)) return;

    // Image generation (img_*, avatar_*, imgref_*, generate_image_v3_*, image_*)
    if (await handleImageCallbacks(ctx, data)) return;

    // Talking photo (avatar_talk_*)
    if (await handleAvatarTalkCallbacks(ctx, data)) return;

    // Video management (video_*, videos_*, copy_caption_*, create_similar_*, feedback_*)
    if (await handleVideoCallbacks(ctx, data)) return;

    // Social / post automation (auto_post_*, publish_video_*, manage_accounts, connect_account_*, etc.)
    if (await handleSocialCallbacks(ctx, data)) return;

    // Storyboard visual (sba_approve, sba_reject, sba_regenerate)
    if (await handleStoryboardCallbacks(ctx, data)) return;

    // Clone, storyboard, repurpose, disassemble, copy_prompt
    if (await handleCloneCallbacks(ctx, data)) return;

    // Ebook generation (ebook_*)
    if (await handleEbookCallbacks(ctx, data)) return;
    // Content Factory (suno_*, voice_*, music_*, loop_*, publish_*)
    if (await handleContentFactoryCallbacks(ctx, data)) return;

    // Unknown callback
    logger.warn("Unknown callback:", data);
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('cb.unknown_action', lang));
  } catch (error) {
    logger.error("Error in callback handler:", error);
    const lang = ctx.session?.userLang || 'id';
    // Reset state to DASHBOARD so user doesn't get stuck
    if (ctx.session) {
      ctx.session.state = 'DASHBOARD';
      ctx.session.stateData = {};
    }
    try {
      await ctx.answerCbQuery(t('error.generic', lang));
    } catch { /* answer may have already been sent */ }
  }
}
