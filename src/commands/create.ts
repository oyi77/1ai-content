/**
 * Create Command — Barrel Re-export
 *
 * Previously a 1227-line monolithic god object.
 * Split into 7 focused modules:
 *
 *   create.redirect.ts       — createCommand (entry point)
 *   create.steps.ts          — handleDurationSelection, handleNicheSelection, handleStyleSelection, handlePlatformSelection
 *   create.caption.ts        — generateCaption
 *   create.vo.ts             — handleVOToggle, handleVOContinue, handleCustomPromptRequest, handleSkipPrompt
 *   create.generation.ts     — generateVideoAsync, generateExtendedVideoAsync
 *   create.helpers.ts        — buildPrompt, getAspectRatio, getStyleForNiche (internal)
 *   create.notifications.ts  — sendSuccessNotification, sendErrorNotification (internal)
 *
 * Internal helpers (buildPrompt, getAspectRatio, getStyleForNiche) and
 * notification functions are NOT re-exported here to match the original
 * export surface of the monolithic create.ts.
 */

export { createCommand } from './create.redirect';
export { handleDurationSelection, handleNicheSelection, handleStyleSelection, handlePlatformSelection } from './create.steps';
export { generateCaption } from './create.caption';
export { handleVOToggle, handleVOContinue, handleCustomPromptRequest, handleSkipPrompt } from './create.vo';
export { generateVideoAsync, generateExtendedVideoAsync } from './create.generation';
