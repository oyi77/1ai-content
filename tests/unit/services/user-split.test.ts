/**
 * User Service Split Files — Direct Tests
 *
 * Tests the new domain-specific service classes:
 * - UserCrudService
 * - UserCreditsService
 * - UserReferralService
 * - UserTelegramService
 * - UserStatsService
 */

import { UserCrudService } from '@/services/user-crud.service';
import { UserCreditsService } from '@/services/user-credits.service';
import { UserReferralService } from '@/services/user-referral.service';
import { UserTelegramService } from '@/services/user-telegram.service';
import { UserStatsService } from '@/services/user-stats.service';

// ── UserCrudService ──
describe('UserCrudService', () => {
  it('should be defined', () => {
    expect(UserCrudService).toBeDefined();
    expect(typeof UserCrudService.findByTelegramId).toBe('function');
    expect(typeof UserCrudService.findByUuid).toBe('function');
    expect(typeof UserCrudService.create).toBe('function');
    expect(typeof UserCrudService.update).toBe('function');
    expect(typeof UserCrudService.updateActivity).toBe('function');
    expect(typeof UserCrudService.findByReferralCode).toBe('function');
    expect(typeof UserCrudService.ban).toBe('function');
    expect(typeof UserCrudService.unban).toBe('function');
  });
});

// ── UserCreditsService ──
describe('UserCreditsService', () => {
  it('should be defined', () => {
    expect(UserCreditsService).toBeDefined();
    expect(typeof UserCreditsService.addCredits).toBe('function');
    expect(typeof UserCreditsService.grantCredits).toBe('function');
    expect(typeof UserCreditsService.grantWelcomeBonus).toBe('function');
    expect(typeof UserCreditsService.deductCredits).toBe('function');
    expect(typeof UserCreditsService.refundCredits).toBe('function');
    expect(typeof UserCreditsService.queueRefundRetry).toBe('function');
    expect(typeof UserCreditsService.processRefundRetries).toBe('function');
    expect(typeof UserCreditsService.hasEnoughCredits).toBe('function');
    expect(typeof UserCreditsService.expireStaleCredits).toBe('function');
  });
});

// ── UserReferralService ──
describe('UserReferralService', () => {
  it('should be defined', () => {
    expect(UserReferralService).toBeDefined();
    expect(typeof UserReferralService.generateReferralCode).toBe('function');
  });

  it('should generate a referral code with REF- prefix', async () => {
    // Mock prisma
    const { prisma } = await import('@/config/database.js');
    (prisma.user.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const code = await UserReferralService.generateReferralCode('TestUser');
    expect(code).toMatch(/^REF-[A-Z0-9]+-[A-Z0-9]{4}$/);
  });

  it('should fallback to random code if name is empty', async () => {
    const { prisma } = await import('@/config/database.js');
    (prisma.user.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const code = await UserReferralService.generateReferralCode('');
    expect(code).toMatch(/^REF-USER-[A-Z0-9]{4}$/);
  });
});

// ── UserTelegramService ──
describe('UserTelegramService', () => {
  it('should be defined', () => {
    expect(UserTelegramService).toBeDefined();
    expect(typeof UserTelegramService.setBotInstance).toBe('function');
    expect(typeof UserTelegramService.sendMessage).toBe('function');
    expect(typeof UserTelegramService.getBotInstance).toBe('function');
  });

  it('should return false when sending message without bot instance', async () => {
    const result = await UserTelegramService.sendMessage('123456', 'test message');
    expect(result).toBe(false);
  });
});

// ── UserStatsService ──
describe('UserStatsService', () => {
  it('should be defined', () => {
    expect(UserStatsService).toBeDefined();
    expect(typeof UserStatsService.getDailyGenerationCount).toBe('function');
    expect(typeof UserStatsService.canGenerate).toBe('function');
    expect(typeof UserStatsService.getStats).toBe('function');
  });

  it('should return zero stats for non-existent user', async () => {
    const { prisma } = await import('@/config/database.js');
    (prisma.user.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const stats = await UserStatsService.getStats(BigInt(999999));
    expect(stats).toEqual({
      videosCreated: 0,
      totalSpent: 0,
      referralCount: 0,
      commissionEarned: 0,
    });
  });
});
