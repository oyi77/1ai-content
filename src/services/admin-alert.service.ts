/**
 * Admin Alert Service
 *
 * Sends critical error notifications to a Telegram admin group.
 * Set ADMIN_ALERT_CHAT_ID env var to the group chat ID.
 *
 * To get the chat ID:
 * 1. Add the bot to the admin group
 * 2. Send any message in the group
 * 3. Visit: https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
 * 4. Find the chat.id (negative number for groups)
 */

import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import type { Telegram } from 'telegraf';

let telegramInstance: Telegram | null = null;

/** Set the Telegram instance (call once at startup) */
export function setAlertTelegram(telegram: Telegram): void {
  telegramInstance = telegram;
}

type AlertLevel = 'critical' | 'warning' | 'info';

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Send an alert to the admin group.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export function sendAdminAlert(
  level: AlertLevel,
  title: string,
  details?: Record<string, any>,
): void {
  const ALERT_CHAT_ID = getConfig().ADMIN_ALERT_CHAT_ID || '';
  if (!ALERT_CHAT_ID || !telegramInstance) return;

  const emoji = LEVEL_EMOJI[level];
  const detailLines = details
    ? Object.entries(details)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `• *${k}:* \`${String(v).slice(0, 200)}\``)
        .join('\n')
    : '';

  const message =
    `${emoji} *${level.toUpperCase()}: ${title}*\n\n` +
    (detailLines ? `${detailLines}\n\n` : '') +
    `_${new Date().toISOString()}_`;

  telegramInstance
    .sendMessage(ALERT_CHAT_ID, message, { parse_mode: 'Markdown' })
    .catch((err: any) => {
      logger.warn(`Admin alert delivery failed: ${err.message}`);
    });
}
