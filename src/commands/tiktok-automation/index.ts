/**
 * TikTok Automation Commands — Barrel Re-export
 *
 * Previously a 1175-line god object, now split into focused command files:
 *   - carousel.ts   — /carousel command
 *   - autopilot.ts  — /autopilot command
 *   - calendar.ts   — /calendar command
 *   - abtest.ts     — /abtest command
 *   - repurpose.ts  — /repurpose & /regen commands
 *   - remeta.ts     — /remeta command
 *   - callbacks.ts  — Callback handlers for tik tok automation
 */

export { carouselCommand } from './carousel';
export { autopilotCommand } from './autopilot';
export { calendarCommand } from './calendar';
export { abtestCommand } from './abtest';
export { repurposeCommand, regenCommand } from './repurpose';
export { remetaCommand } from './remeta';
export { handleTikTokAutomationCallbacks } from './callbacks';
