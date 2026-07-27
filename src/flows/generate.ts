/**
 * Generate Flow — Barrel Re-Export
 *
 * This file re-exports everything from the sub-modules for
 * backward compatibility. Do NOT add new code here.
 *
 * Responsibilities:
 * - generate.types.ts: types, helpers (clearGenerateSession, getStepIndicator, downloadToLocal)
 * - generate.ui.ts: all show* UI functions
 * - generate.input.ts: input handlers + routing
 * - generate.execution.ts: executeGeneration
 * - generate.callback.ts: handleGenerateCallback
 */

// ── Types & Helpers ──
export { clearGenerateSession, getStepIndicator, downloadToLocal } from './generate.types';
export type {
  GenerateMode,
  GenerateAction,
  Platform,
  GeneratedSceneData,
  ManualSceneData,
} from './generate.types';

// ── UI Functions ──
export {
  showGenerateMode,
  showGenerateAction,
  showImagePreference,
  showPromptSourceSelection,
  showImageAspectRatio,
  showImageResolution,
  showProImageUpload,
  showProStoryboardChoice,
  showProStoryboardEditor,
  showProTranscriptChoice,
  showSmartPresetSelection,
  showSmartPlatformSelection,
  showProSceneReview,
  showConfirmScreen,
  showPostDelivery,
} from './generate.ui';

// ── Input Handlers & Routing ──
export {
  handleProductInput,
  requestProductInput,
  continueAfterImagePreference,
  handleMultiImageUpload,
  handleStoryboardEdit,
  handleTranscriptInput,
} from './generate.input';

// ── Execution Engine ──
export { executeGeneration } from './generate.execution';

// ── Callback Router ──
export { handleGenerateCallback } from './generate.callback';
