/**
 * Video Generation Worker — Barrel Re-export
 *
 * Aggregates all sub-modules for backward compatibility.
 * Previously a 1368-line god object, now split into 8 focused modules.
 *
 * Sub-modules:
 *   video-generation.types.ts      — VideoGenerationJobData + interfaces
 *   video-generation.helpers.ts    — notifyProgress, startTimeoutWatcher, buildPrompt, getAspectRatio, etc.
 *   video-generation.vo.ts         — generateVOScript, generateVOScriptWithAI, applyVOPipeline
 *   video-generation.caption.ts    — generateCaption, NICHE_HASHTAGS data
 *   video-generation.scene.ts      — processSingleScene, processExtendedScenes
 *   video-generation.notify.ts     — sendVideoToUser
 *   video-generation.campaign.ts   — handleCampaignJobComplete
 *   video-generation.init.ts       — startVideoWorker (main export)
 */

export type { VideoGenerationJobData, GeneratedCaption } from './video-generation.types';
export { startVideoWorker } from './video-generation.init';
