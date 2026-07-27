/**
 * Grant Credits Command (Admin)
 * 
 * Handles /grant_credits command for admins
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { UserService } from '@/services/user.service';
import { prisma } from '@/config/database';

/**
 * Check if user is admin
 */
function isAdmin(userId: number): boolean {
  const adminIds = getConfig().ADMIN_TELEGRAM_IDS?.split(',').map(id => parseInt(id.trim())) || [];
  return adminIds.includes(userId);
}

/**
 * Handle /grant_credits command
 */
export async function adminGrantCreditsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
   
  if (!userId || !isAdmin(userId)) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  const message = ctx.message;
   
  if (!message || !('text' in message)) {
    await ctx.reply('Usage: /grant_credits <user_id> <amount> <reason>');
    return;
  }

  const args = message.text.split(' ').slice(1);
   
  if (args.length < 3) {
    await ctx.reply(
      '💰 *Grant Credits*\n\n' +
      'Usage: `/grant_credits <user_id> <amount> <reason>`\n\n' +
      'Example:\n' +
      '`/grant_credits 123456789 10 "Bonus for referral"`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const targetUserId = args[0];
  const amount = parseFloat(args[1]);
  const reason = args.slice(2).join(' ');
   
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a positive number.');
    return;
  }

  try {
    // Find the user by telegram ID
    const user = await UserService.findByTelegramId(BigInt(targetUserId));
    
    if (!user) {
      await ctx.reply('❌ User not found. Please check the user ID.');
      return;
    }

    // Grant credits to the user
    await UserService.grantCredits(user.telegramId, amount, reason);
    
    logger.info(`Admin ${userId} granted ${amount} credits to user ${targetUserId}. Reason: ${reason}`);
   
    await ctx.reply(
      '✅ *Credits Granted*\n\n' +
      `User ID: ${targetUserId}\n` +
      `Username: ${user.username || user.firstName || 'Unknown'}\n` +
      `Amount: ${amount} credits\n` +
      `Reason: ${reason}\n\n` +
      'The user has been notified.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error granting credits:', error);
    await ctx.reply(
      '❌ *Error Granting Credits*\n\n' +
      `Failed to grant credits: ${(error as Error).message || 'Unknown error'}`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Handle /deduct_credits command
 */
export async function adminDeductCreditsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId || !isAdmin(userId)) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  const message = ctx.message;
  if (!message || !('text' in message)) {
    await ctx.reply('Usage: /deduct_credits <user_id> <amount> <reason>');
    return;
  }

  const args = message.text.split(' ').slice(1);
  if (args.length < 3) {
    await ctx.reply(
      '💳 *Deduct Credits*\n\n' +
      'Usage: `/deduct_credits <user_id> <amount> <reason>`\n\n' +
      'Example:\n' +
      '`/deduct_credits 123456789 5 "Chargeback refund"`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const targetUserId = args[0];
  const amount = parseFloat(args[1]);
  const reason = args.slice(2).join(' ');

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a positive number.');
    return;
  }

  try {
    const user = await UserService.findByTelegramId(BigInt(targetUserId));
    if (!user) {
      await ctx.reply('❌ User not found.');
      return;
    }

    const currentBalance = Number(user.creditBalance);
    if (currentBalance < amount) {
      await ctx.reply(
        `❌ User only has ${currentBalance} credits. Cannot deduct ${amount}.`,
      );
      return;
    }

    await prisma.user.update({
      where: { telegramId: BigInt(targetUserId) },
      data: { creditBalance: { decrement: amount } },
    });

    logger.info(`Admin ${userId} deducted ${amount} credits from user ${targetUserId}. Reason: ${reason}`);

    await ctx.reply(
      '✅ *Credits Deducted*\n\n' +
      `User: ${user.username || user.firstName || targetUserId}\n` +
      `Deducted: ${amount} credits\n` +
      `Previous: ${currentBalance}\n` +
      `New Balance: ${currentBalance - amount}\n` +
      `Reason: ${reason}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error deducting credits:', error);
    await ctx.reply(`❌ Failed to deduct credits: ${(error as Error).message || 'Unknown'}`);
  }
}
