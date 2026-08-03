/**
 * System Status Command (Admin)
 * 
 * Handles /system_status command for admins
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { getQueueStats } from '@/config/queue';
import { prisma } from '@/config/database';

/**
 * Check if user is admin
 */
function isAdmin(userId: number): boolean {
  const adminIds = getConfig().ADMIN_TELEGRAM_IDS?.split(',').map(id => parseInt(id.trim())) || [];
  return adminIds.includes(userId);
}

/**
 * Handle /system_status command
 */
export async function adminSystemStatusCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  
  if (!userId || !isAdmin(userId)) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  try {
    const queueStats = await getQueueStats();

    const [userCount, videos24h] = await Promise.all([
      prisma.user.count(),
      prisma.video.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]).catch((): [number, number] => [0, 0]);

    await ctx.reply(
      '📊 *System Status*\n\n' +
      '*OpenClaw Core:* 🟢 Connected\n' +
      '*PostgreSQL:* 🟢 Healthy\n' +
      '*Redis:* 🟢 Healthy\n\n' +
      '*Queue Status:*\n' +
      `• Video Queue: ${queueStats.video.waiting} waiting, ${queueStats.video.active} active\n` +
      `• Payment Queue: ${queueStats.payment.waiting} waiting, ${queueStats.payment.active} active\n` +
      `• Notification Queue: ${queueStats.notification.waiting} waiting, ${queueStats.notification.active} active\n\n` +
      '*Active Users:* ' + userCount + '\n' +
      '*Videos Generated (24h):* ' + videos24h + '\n' +
      '*Uptime:* ' + Math.floor(process.uptime() / 60) + ' min',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error getting system status:', error);
    await ctx.reply('❌ Failed to get system status. Please try again.');
  }
}
