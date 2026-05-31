import { BotContext } from "@/types";
import { t } from "@/i18n/translations";
import {
  handleDurationSelection,
  handleNicheSelection,
  handleStyleSelection,
  handlePlatformSelection,
  handleVOToggle,
  handleVOContinue,
  handleCustomPromptRequest,
  handleSkipPrompt,
  createCommand,
} from "@/commands/create";
import {
  promptsCommand,
} from "@/commands/prompts";

export async function handleGenerationCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  // make_video_from_image: start video flow pre-populated with last generated image context
  if (data === "make_video_from_image") {
    await ctx.answerCbQuery?.();
    const lang = ctx.session?.userLang || 'id';
    const lastDesc = ctx.session?.generateProductDesc;
    let lastImageUrl = ctx.session?.generateLastImageUrl;

    // Validate URL freshness — Telegram file links expire ~1h, provider URLs may expire sooner
    if (lastImageUrl) {
      try {
        const axios = (await import('axios')).default;
        const headRes = await axios.head(lastImageUrl, { timeout: 5000 }).catch(async (err: any) => {
          // Some CDNs return 405 on HEAD but work fine on GET — treat as valid
          if (err?.response?.status === 405) return { status: 405 };
          throw err;
        });
        void headRes; // URL is reachable
      } catch {
        // URL expired or unreachable — clear it and prompt re-upload
        lastImageUrl = undefined;
        if (ctx.session) delete (ctx.session as unknown as Record<string, unknown>).generateLastImageUrl;
        await ctx.reply(
          t('gen.image_url_expired', lang),
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: t('btn.upload_new_image', lang), callback_data: 'image_pref_upload' },
                { text: t('gen.btn_skip_ref', lang), callback_data: 'image_pref_skip' },
              ]],
            },
          }
        );
        return true;
      }
    }

    if (lastDesc) {
      if (ctx.session) {
        ctx.session.generateAction = 'video';
        if (lastImageUrl) ctx.session.generatePhotoUrl = lastImageUrl;
      }
      const { showGenerateMode } = await import("../../flows/generate.js");
      await showGenerateMode(ctx);
    } else {
      const { showGenerateMode } = await import("../../flows/generate.js");
      await showGenerateMode(ctx);
    }
    return true;
  }

  // V3 Flow: generate_start / create_video_new
  if (data === "generate_start" || data === "create_video_new") {
    const { showGenerateMode } = await import("../../flows/generate.js");
    await showGenerateMode(ctx);
    return true;
  }

  // mode_*
  if (data.startsWith("mode_")) {
    const { showGenerateAction } = await import("../../flows/generate.js");
    const mode = data.replace("mode_", "") as "basic" | "smart" | "pro";
    await showGenerateAction(ctx, mode);
    return true;
  }

  // action_*
  if (data.startsWith("action_")) {
    const { requestProductInput, showSmartPresetSelection } = await import("../../flows/generate.js");
    const action = data.replace("action_", "") as "image_set" | "video" | "clone_style" | "campaign";
    if (action === "video" && ctx.session?.generateMode === "smart") {
      await showSmartPresetSelection(ctx);
    } else {
      await requestProductInput(ctx, action);
    }
    return true;
  }

  // preset_*
  if (data.startsWith("preset_")) {
    const preset = data.replace("preset_", "");

    if (preset === "custom") {
      await ctx.answerCbQuery?.();
      const lang = ctx.session?.userLang || 'id';
      if (ctx.session) {
        ctx.session.state = "CUSTOM_DURATION_INPUT_V3";
      }
      await ctx.editMessageText(
        t('cb.custom_duration_v3', lang),
        { parse_mode: "Markdown" },
      );
      return true;
    }

    const { showSmartPlatformSelection } = await import("../../flows/generate.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Telegraf preset type
    await showSmartPlatformSelection(ctx, preset as any);
    return true;
  }

  // platform_*
  if (data.startsWith("platform_")) {
    const platform = data.replace("platform_", "") as "tiktok" | "instagram" | "youtube" | "square";
    if (ctx.session) ctx.session.generatePlatform = platform;
    if (ctx.session?.generateProductDesc) {
      const { showConfirmScreen } = await import("../../flows/generate.js");
      await showConfirmScreen(ctx);
    } else {
      const { requestProductInput } = await import("../../flows/generate.js");
      await requestProductInput(ctx, "video");
    }
    return true;
  }

  // campaign_size_*
  if (data === "campaign_size_5" || data === "campaign_size_10") {
    const { showConfirmScreen } = await import("../../flows/generate.js");
    if (ctx.session) ctx.session.generateCampaignSize = data === "campaign_size_5" ? 5 : 10;
    await showConfirmScreen(ctx);
    return true;
  }

  // img_ar_* — aspect ratio selection for image_set
  if (data.startsWith("img_ar_")) {
    await ctx.answerCbQuery?.();
    const ar = data.replace("img_ar_", "") as '9:16' | '1:1' | '16:9' | '4:5';
    if (ctx.session) ctx.session.generateAspectRatio = ar;
    const { showImageResolution } = await import("../../flows/generate.js");
    await showImageResolution(ctx);
    return true;
  }

  // img_res_* — resolution selection for image_set
  if (data.startsWith("img_res_")) {
    await ctx.answerCbQuery?.();
    const res = data.replace("img_res_", "") as 'standard' | 'hd' | 'ultra';
    if (ctx.session) ctx.session.generateResolution = res;
    const { showConfirmScreen } = await import("../../flows/generate.js");
    await showConfirmScreen(ctx);
    return true;
  }

  // imgset_preview_* — show generated scene images as preview (video already processing)
  if (data.startsWith("imgset_preview_")) {
    await ctx.answerCbQuery?.();
    const lang = ctx.session?.userLang || 'id';
    const urls = (ctx.session?.stateData?.imgsetPreviewUrls as string[] | undefined) || [];
    if (urls.length > 0) {
      const mediaGroup = urls.map((url, i) => ({
        type: 'photo' as const,
        media: url,
        ...(i === 0 ? { caption: t('gen.imgset_preview_caption', lang, { count: urls.length }), parse_mode: 'Markdown' as const } : {}),
      }));
      await ctx.replyWithMediaGroup(mediaGroup).catch(() => {});
    }
    await ctx.reply(t('gen.video_processing', lang), { parse_mode: 'Markdown' });
    return true;
  }

  // imgset_skip — skip preview, video already processing
  if (data === "imgset_skip") {
    await ctx.answerCbQuery?.();
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(t('gen.video_processing', lang), { parse_mode: 'Markdown' });
    return true;
  }

  // generate_start_* / generate_confirm
  if (data.startsWith("generate_start_") || data === "generate_confirm") {
    const { handleGenerateCallback } = await import("../../flows/generate.js");
    await handleGenerateCallback(ctx, data);
    return true;
  }

  // generate_variation / generate_new
  if (data === "generate_variation" || data === "generate_new") {
    const { showGenerateMode } = await import("../../flows/generate.js");
    await showGenerateMode(ctx);
    return true;
  }

  // image_pref_upload
  if (data === "image_pref_upload") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    if (ctx.session) ctx.session.state = 'AWAITING_GENERATE_IMAGE';
    await ctx.editMessageText(
      t('cb.send_reference_photo', lang),
      { parse_mode: 'Markdown' },
    );
    return true;
  }

  // image_pref_skip
  if (data === "image_pref_skip") {
    await ctx.answerCbQuery();
    if (ctx.session) {
      delete ctx.session.generatePhotoUrl;
      ctx.session.state = 'DASHBOARD';
    }
    const { continueAfterImagePreference } = await import('../../flows/generate.js');
    await continueAfterImagePreference(ctx);
    return true;
  }

  // Pro mode image upload controls
  if (data === "pro_image_complete_ai" || data === "pro_image_skip") {
    await ctx.answerCbQuery();
    if (ctx.session) {
      ctx.session.generatePhotoUploadDone = true;
      ctx.session.state = 'DASHBOARD';
    }
    const { showPromptSourceSelection } = await import('../../flows/generate.js');
    await showPromptSourceSelection(ctx);
    return true;
  }

  // Pro mode storyboard auto/manual
  if (data === "pro_storyboard_auto") {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.generateStoryboardMode = 'auto';
    const { showProTranscriptChoice } = await import('../../flows/generate.js');
    await showProTranscriptChoice(ctx);
    return true;
  }

  if (data === "pro_storyboard_manual") {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.generateStoryboardMode = 'manual';
    const { showProStoryboardEditor } = await import('../../flows/generate.js');
    await showProStoryboardEditor(ctx, 0);
    return true;
  }

  // Pro mode transcript auto/manual
  if (data === "pro_transcript_auto") {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.generateTranscriptMode = 'auto';
    const { showSmartPresetSelection } = await import('../../flows/generate.js');
    await showSmartPresetSelection(ctx);
    return true;
  }

  if (data === "pro_transcript_manual") {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.state = 'AWAITING_TRANSCRIPT_INPUT';
    await ctx.editMessageText(t('gen.transcript_input', ctx.session?.userLang || 'id'), { parse_mode: 'Markdown' });
    return true;
  }

  // Pro select duration
  if (data === "pro_select_duration") {
    const { showSmartPresetSelection } = await import("../../flows/generate.js");
    await showSmartPresetSelection(ctx);
    return true;
  }

  // edit_scene_*
  if (data.startsWith("edit_scene_")) {
    await ctx.answerCbQuery();
    const sceneId = data.replace("edit_scene_", "");
    const scenes = ctx.session?.generateScenes || [];
    const sceneIndex = scenes.findIndex((s) => s.sceneId === sceneId);
    if (ctx.session) {
      ctx.session.stateData = { ...(ctx.session.stateData as object || {}), editingSceneId: sceneId };
      ctx.session.state = "AWAITING_SCENE_EDIT";
    }
    const sceneNum = sceneIndex >= 0 ? sceneIndex + 1 : "?";
    await ctx.reply(
      t('cb2.edit_scene', ctx.session?.userLang || 'id', { sceneNum }),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  // Prompt source selection
  if (data === "prompt_source_library") {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await promptsCommand(ctx);
    return true;
  }

  if (data === "prompt_source_auto") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    const photoUrl = ctx.session?.generatePhotoUrl as string | undefined;
    const existingDesc = ctx.session?.generateProductDesc as string | undefined;

    if (!photoUrl && !existingDesc) {
      await ctx.editMessageText(t('gen.auto_prompt_no_input', lang), { parse_mode: 'Markdown' });
      return true;
    }

    await ctx.editMessageText(t('gen.auto_prompt_generating', lang), { parse_mode: 'Markdown' });

    let autoPrompt = '';
    if (photoUrl) {
      const { ContentAnalysisService } = await import('../../services/content-analysis.service.js');
      const analysis = await ContentAnalysisService.extractPrompt(photoUrl, 'image');
      autoPrompt = analysis.success && analysis.prompt ? analysis.prompt : '';
    }
    if (!autoPrompt && existingDesc) {
      const { detectIndustry } = await import('../../config/hpas-engine.js');
      const industry = detectIndustry(existingDesc);
      autoPrompt = `${existingDesc} — produk ${industry}`;
    }

    if (ctx.session && autoPrompt) {
      ctx.session.generateProductDesc = autoPrompt;
      ctx.session.state = 'DASHBOARD';
    }

    const { showConfirmScreen } = await import('../../flows/generate.js');
    await showConfirmScreen(ctx);
    return true;
  }

  if (data === "prompt_source_custom") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    if (ctx.session) ctx.session.state = 'AWAITING_PRODUCT_INPUT';
    const action = ctx.session?.generateAction || 'video';
    const actionLabelKeys: Record<string, string> = {
      image_set: 'cb.action_label_image_set',
      video: 'cb.action_label_video',
      campaign: 'cb.action_label_campaign',
    };
    const output = actionLabelKeys[action] ? t(actionLabelKeys[action], lang) : action;
    await ctx.editMessageText(
      t('cb.write_custom_prompt', lang, { output }),
      { parse_mode: 'Markdown' },
    );
    return true;
  }

  // Legacy creation: vcreate_* / create_image_new
  if (data.startsWith("vcreate_") || data === "create_image_new") {
    const { handleLegacyCreationCallback } = await import("./creation.js");
    if (await handleLegacyCreationCallback(ctx, data)) return true;
  }

  // duration_*
  if (data.startsWith("duration_")) {
    const durationStr = data.replace("duration_", "");
    await handleDurationSelection(ctx, durationStr);
    return true;
  }

  // custom_duration
  if (data === "custom_duration") {
    await handleDurationSelection(ctx, "custom_duration");
    return true;
  }

  // select_niche_* / niche_*
  if (data.startsWith("select_niche_")) {
    const nicheKey = data.replace("select_niche_", "");
    await handleNicheSelection(ctx, nicheKey);
    return true;
  }

  if (data.startsWith("niche_")) {
    const nicheKey = data.replace("niche_", "");
    await handleNicheSelection(ctx, nicheKey);
    return true;
  }

  // select_style_*
  if (data.startsWith("select_style_")) {
    const styleKey = data.replace("select_style_", "");
    await handleStyleSelection(ctx, styleKey);
    return true;
  }

  // create_platform_*
  if (data.startsWith("create_platform_")) {
    const platformKey = data.replace("create_platform_", "");
    await handlePlatformSelection(ctx, platformKey);
    return true;
  }

  // VO/subtitle toggle handlers
  if (data === "vo_toggle_vo") {
    await handleVOToggle(ctx, "vo");
    return true;
  }

  if (data === "vo_toggle_subtitles") {
    await handleVOToggle(ctx, "subtitles");
    return true;
  }

  if (data === "vo_continue") {
    await handleVOContinue(ctx);
    return true;
  }

  if (data === "create_custom_prompt") {
    await handleCustomPromptRequest(ctx);
    return true;
  }

  if (data === "create_skip_prompt") {
    await handleSkipPrompt(ctx);
    return true;
  }

  // Upload reference from VO continue screen
  if (data === "create_upload_reference") {
    await ctx.answerCbQuery();
    const lang = ctx.session?.userLang || 'id';
    if (ctx.session?.videoCreation)
      ctx.session.videoCreation.waitingForImage = true;
    ctx.session!.state = "CREATE_VIDEO_UPLOAD";
    await ctx.editMessageText(
      t('cb.upload_reference', lang),
      { parse_mode: "Markdown" },
    );
    return true;
  }

  // brief_skip
  if (data === "brief_skip") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.brief_skip', lang),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('btn.yes_create', lang), callback_data: "confirm_create" },
              { text: t('btn.cancel', lang), callback_data: "cancel_create" },
            ],
          ],
        },
      },
    );
    return true;
  }

  // confirm_create
  if (data === "confirm_create") {
    const { showGenerateMode } = await import("../../flows/generate.js");
    await showGenerateMode(ctx);
    return true;
  }

  // cancel_create
  if (data === "cancel_create") {
    const lang = ctx.session?.userLang || 'id';
    await ctx.editMessageText(
      t('cb.creation_cancelled', lang),
    );
    ctx.session.state = "DASHBOARD";
    return true;
  }

  // create_video (legacy → /create flow)
  if (data === "create_video") {
    const selectedPrompt = ctx.session?.stateData?.selectedPrompt as
      | string
      | undefined;
    if (selectedPrompt && ctx.session) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Session videoCreation init
      if (!ctx.session.videoCreation) ctx.session.videoCreation = {} as any;
      ctx.session.videoCreation!.customPrompt = selectedPrompt;
      ctx.session.videoCreation!.waitingForCustomPrompt = false;
      ctx.session.stateData = {
        ...ctx.session.stateData,
        selectedPrompt: undefined,
      };
    }
    await ctx.deleteMessage().catch(() => { });
    await createCommand(ctx);
    return true;
  }

  return false;
}
