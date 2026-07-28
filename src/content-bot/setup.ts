/**
 * Content Bot — Setup
 *
 * Bot creation, middleware, session management.
 */
import { Telegraf } from "telegraf";
import { BotContext } from "@/types";
import { initConfig } from "@/config/env";

export const appConfig = initConfig();
export const bot = new Telegraf<BotContext>(appConfig.BOT_TOKEN);

bot.use(async (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {
      state: "START",
      stateData: {},
      lastActivity: new Date(),
    } as any;
  }
  ctx.session.lastActivity = new Date();
  await next();
});

// In-memory session store
const sessions = new Map<string, { state: string; data: Record<string, unknown> }>();

export function getSession(userId: number) {
  const key = String(userId);
  if (!sessions.has(key)) sessions.set(key, { state: "idle", data: {} });
  return sessions.get(key)!;
}
