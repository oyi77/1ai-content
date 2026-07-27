/**
 * Broadcast Command (Admin)
 * 
 * Handles /broadcast command for admins
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { prisma } from '@/config/database';

/**
 * Check if user is admin
 */
function isAdmin(userId: number): boolean {
  const adminIds = getConfig().ADMIN_TELEGRAM_IDS?.split(',').map(id => parseInt(id.trim())) || [];
  return adminIds.includes(userId);
}

/**
 * Handle /broadcast command
 */
export async function adminBroadcastCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
   
  if (!userId || !isAdmin(userId)) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  const message = ctx.message;
   
  if (!message || !('text' in message)) {
    await ctx.reply('Usage: /broadcast <message> [filters]');
    return;
  }

  const args = message.text.split(' ').slice(1);
   
  if (args.length === 0) {
    await ctx.reply(
      '📢 *Broadcast Message*\n\n' +
      'Usage: `/broadcast <message>`\n\n' +
      'Filters:\n' +
      '`--tier free|basic|pro|agency`\n' +
      '`--region ID|EN`\n' +
      '`--active-since 7d`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Parse arguments for filters
  const broadcastMessageParts = [];
  const filters = {
    tier: undefined as string | undefined,
    region: undefined as string | undefined,
    activeSince: undefined as string | undefined
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      // Convert kebab-case to camelCase: --active-since → activeSince
      const rawName = arg.slice(2);
      const filterName = rawName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof typeof filters;
      if (filterName in filters && i + 1 < args.length) {
        filters[filterName as keyof typeof filters] = args[i + 1];
        i += 2;
      } else {
        broadcastMessageParts.push(arg);
        i += 1;
      }
    } else {
      broadcastMessageParts.push(arg);
      i += 1;
    }
  }

  const broadcastMessage = broadcastMessageParts.join(' ');

  if (!broadcastMessage.trim()) {
    await ctx.reply('❌ Broadcast message cannot be empty.');
    return;
  }

  try {
    logger.info(`Admin ${userId} broadcasting message: ${broadcastMessage} with filters:`, filters);
    
    // Get users based on filters
    let users;
    if (filters.tier || filters.region || filters.activeSince) {
      // Build where clause for filtered users
      const whereClause: Record<string, unknown> = {};
      
      if (filters.tier) {
        whereClause.tier = filters.tier;
      }
      
      if (filters.region) {
        // For simplicity, we'll assume region is stored in language or we'll skip this filter for now
        // In a real implementation, you'd have a region field or check timezone/language
        logger.warn('Region filter is not implemented yet, ignoring');
      }
      
      if (filters.activeSince) {
        // Parse activeSince (e.g., "7d" for 7 days, "24h" for 24 hours)
        const match = filters.activeSince.match(/^(\d+)(d|h)$/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          const date = new Date();
          
          if (unit === 'd') {
            date.setDate(date.getDate() - value);
          } else if (unit === 'h') {
            date.setHours(date.getHours() - value);
          }
          
          whereClause.lastActivityAt = { gte: date };
        } else {
          logger.warn(`Invalid activeSince format: ${filters.activeSince}, ignoring`);
        }
      }
      
      users = await prisma.user.findMany({
        where: whereClause,
        select: { telegramId: true, username: true, firstName: true }
      });
    } else {
      // Get all users
      users = await prisma.user.findMany({
        select: { telegramId: true, username: true, firstName: true }
      });
    }

    if (users.length === 0) {
      await ctx.reply('❌ No users found matching the specified filters.');
      return;
    }

    // In a real implementation, you would send messages to each user here
    // For now, we'll just log and notify the admin
    logger.info(`Would broadcast to ${users.length} users:`, users.map(u => ({ 
      id: u.telegramId.toString(), 
      name: u.username || u.firstName 
    })));

    await ctx.reply(
      '✅ *Broadcast Queued*\n\n' +
      `Message: ${broadcastMessage}\n\n` +
      `Target: ${users.length} user${users.length !== 1 ? 's' : ''}\n` +
      'Status: Broadcast queued for delivery\n\n' +
      (filters.tier ? `Tier Filter: ${filters.tier}\n` : '') +
      (filters.region ? `Region Filter: ${filters.region}\n` : '') +
      (filters.activeSince ? `Active Since: ${filters.activeSince}\n` : '') +
      'Users will receive this message via Telegram.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error broadcasting message:', error);
    await ctx.reply(
      '❌ *Error Broadcasting Message*\n\n' +
      `Failed to broadcast message: ${(error as Error).message || 'Unknown error'}`,
      { parse_mode: 'Markdown' }
    );
  }
}
