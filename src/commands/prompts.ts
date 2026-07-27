/**
 * Prompts Command — Barrel Re-export
 *
 * Aggregates data + UI + command entry point modules.
 * Previously a 1235-line god object, now split into 3 focused modules.
 *
 * Sub-modules:
 *   prompts.data.ts   — PROMPT_LIBRARY, TRENDING_PROMPTS, findAnyPrompt, getPromptById, getUserDailyPrompt
 *   prompts.ui.ts     — showNichePrompts, showPromptDetail, showCustomizePrompt, showMyPrompts, startAddCustomPrompt
 *   (this file)       — promptsCommand, dailyCommand, trendingCommand, fingerprintCommand, saveLibraryPrompt
 */

export { PROMPT_LIBRARY, TRENDING_PROMPTS, MYSTERY_PROMPTS, findAnyPrompt, getPromptById, getUserDailyPrompt } from './prompts.data';
export { showNichePrompts, showPromptDetail, showCustomizePrompt, showMyPrompts, startAddCustomPrompt } from './prompts.ui';
export { promptsCommand, dailyCommand, trendingCommand, fingerprintCommand, saveLibraryPrompt } from './prompts.commands';
