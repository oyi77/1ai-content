/**
 * Create Command — Redirect to V3 Flow
 *
 * /create entry point now redirects to the V3 generation flow.
 * Extracted from create.ts god object.
 */

import { BotContext } from "@/types";

/**
 * Handle /create command - Redirected to V3 Flow
 */
export async function createCommand(ctx: BotContext): Promise<void> {
  const { showGenerateMode } = await import("../flows/generate.js");
  return await showGenerateMode(ctx);
}
