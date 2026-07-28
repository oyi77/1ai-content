/**
 * Tests for whitelabel.service.ts
 *
 * Verifies:
 * - register: owner validation, tier check, duplicate token, creation
 * - getByToken: lookup by bot token
 * - getByOwner: list bots for owner
 * - processCommission: commission calc, inactive bot skip, commission record
 * - withdraw: balance check, proportional distribution, insufficient funds
 * - updateBranding: partial update
 * - deactivate: sets isActive false
 * - getStats: aggregated stats across bots
 */
import { jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { WhiteLabelService } from '@/services/whitelabel.service';

// ── Mocks ──

const mockPrisma = {
  user: {
    findUnique: jest.fn<any>(),
  },
  whiteLabelBot: {
    create: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  commission: {
    create: jest.fn<any>(),
  },
};

const mockLogger = {
  info: jest.fn<any>(),
  error: jest.fn<any>(),
  warn: jest.fn<any>(),
};

jest.mock('@/config/database', () => ({
  get prisma() {
    return mockPrisma;
  },
}));

jest.mock('@/utils/logger', () => ({
  get logger() {
    return mockLogger;
  },
}));

// ── Helpers ──

function makeBot(overrides: Partial<any> = {}) {
  return {
    id: 1n,
    ownerId: 100n,
    uuid: 'bot-uuid-1',
    botToken: 'token-abc',
    botUsername: 'my_bot',
    brandName: 'TestBrand',
    welcomeMsg: 'Hello!',
    logoUrl: null,
    commissionRate: new Decimal('0.1'),
    isActive: true,
    totalEarned: new Decimal('0'),
    totalWithdrawn: new Decimal('0'),
    totalSales: new Decimal('0'),
    userCount: 0,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: 1n,
    telegramId: 100n,
    tier: 'agency',
    ...overrides,
  };
}

// ── Tests ──

describe('WhiteLabelService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────── register ───────────────────────

  describe('register', () => {
    const baseParams = {
      ownerId: 100n,
      botToken: 'new-bot-token',
      brandName: 'CoolBot',
      welcomeMsg: 'Welcome!',
    };

    it('registers a new whitelabel bot successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(makeUser());
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(null);
      const created = makeBot({ botToken: 'new-bot-token', brandName: 'CoolBot' });
      mockPrisma.whiteLabelBot.create.mockResolvedValueOnce(created);

      const result = await WhiteLabelService.register(baseParams);

      expect(result).toEqual(created);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { telegramId: 100n },
      });
      expect(mockPrisma.whiteLabelBot.findUnique).toHaveBeenCalledWith({
        where: { botToken: 'new-bot-token' },
      });
      expect(mockPrisma.whiteLabelBot.create).toHaveBeenCalledWith({
        data: {
          ownerId: 100n,
          botToken: 'new-bot-token',
          brandName: 'CoolBot',
          welcomeMsg: 'Welcome!',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('CoolBot'),
      );
    });

    it('throws when owner not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(WhiteLabelService.register(baseParams)).rejects.toThrow(
        'Owner not found',
      );
    });

    it('throws when owner is not agency tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(makeUser({ tier: 'free' }));

      await expect(WhiteLabelService.register(baseParams)).rejects.toThrow(
        'Only agency tier can create whitelabel bots',
      );
    });

    it('throws when bot token already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(makeUser());
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(makeBot());

      await expect(WhiteLabelService.register(baseParams)).rejects.toThrow(
        'Bot token already registered',
      );
    });

    it('passes null when welcomeMsg is omitted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(makeUser());
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(null);
      mockPrisma.whiteLabelBot.create.mockResolvedValueOnce(makeBot({ welcomeMsg: null }));

      await WhiteLabelService.register({
        ownerId: 100n,
        botToken: 'tok',
        brandName: 'NoWelcome',
      });

      expect(mockPrisma.whiteLabelBot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ welcomeMsg: null }),
      });
    });
  });

  // ─────────────────────── getByToken ───────────────────────

  describe('getByToken', () => {
    it('returns bot when found', async () => {
      const bot = makeBot({ botToken: 'tok-123' });
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(bot);

      const result = await WhiteLabelService.getByToken('tok-123');

      expect(result).toEqual(bot);
      expect(mockPrisma.whiteLabelBot.findUnique).toHaveBeenCalledWith({
        where: { botToken: 'tok-123' },
      });
    });

    it('returns null when not found', async () => {
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(null);

      const result = await WhiteLabelService.getByToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────── getByOwner ───────────────────────

  describe('getByOwner', () => {
    it('returns bots ordered by createdAt desc', async () => {
      const bots = [makeBot({ id: 2n }), makeBot({ id: 1n })];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);

      const result = await WhiteLabelService.getByOwner(100n);

      expect(result).toEqual(bots);
      expect(mockPrisma.whiteLabelBot.findMany).toHaveBeenCalledWith({
        where: { ownerId: 100n },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when owner has no bots', async () => {
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce([]);

      const result = await WhiteLabelService.getByOwner(999n);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────── processCommission ───────────────────────

  describe('processCommission', () => {
    it('calculates commission and updates bot stats', async () => {
      const bot = makeBot({ commissionRate: new Decimal('0.15'), ownerId: 100n });
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(bot);
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce({});
      mockPrisma.commission.create.mockResolvedValueOnce({});

      await WhiteLabelService.processCommission(1n, 200n, 10000);

      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          totalEarned: { increment: 1500 },
          totalSales: { increment: 10000 },
          userCount: { increment: 1 },
        },
      });
      expect(mockPrisma.commission.create).toHaveBeenCalledWith({
        data: {
          referrerId: 100n,
          referredId: 200n,
          amount: 1500,
          tier: 0,
          status: 'available',
          availableAt: expect.any(Date),
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('1500'),
      );
    });

    it('does nothing when bot not found', async () => {
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(null);

      await WhiteLabelService.processCommission(999n, 200n, 5000);

      expect(mockPrisma.whiteLabelBot.update).not.toHaveBeenCalled();
      expect(mockPrisma.commission.create).not.toHaveBeenCalled();
    });

    it('does nothing when bot is inactive', async () => {
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(
        makeBot({ isActive: false }),
      );

      await WhiteLabelService.processCommission(1n, 200n, 5000);

      expect(mockPrisma.whiteLabelBot.update).not.toHaveBeenCalled();
      expect(mockPrisma.commission.create).not.toHaveBeenCalled();
    });

    it('handles zero transaction amount', async () => {
      const bot = makeBot({ commissionRate: new Decimal('0.1') });
      mockPrisma.whiteLabelBot.findUnique.mockResolvedValueOnce(bot);
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce({});
      mockPrisma.commission.create.mockResolvedValueOnce({});

      await WhiteLabelService.processCommission(1n, 200n, 0);

      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          totalEarned: { increment: 0 },
          totalSales: { increment: 0 },
        }),
      });
    });
  });

  // ─────────────────────── withdraw ───────────────────────

  describe('withdraw', () => {
    it('processes withdrawal across multiple bots proportionally', async () => {
      const bots = [
        makeBot({ id: 1n, totalEarned: new Decimal('6000'), totalWithdrawn: new Decimal('0') }),
        makeBot({ id: 2n, totalEarned: new Decimal('4000'), totalWithdrawn: new Decimal('0') }),
      ];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);
      mockPrisma.whiteLabelBot.update.mockResolvedValue({});

      const result = await WhiteLabelService.withdraw(100n, 5000);

      expect(result).toBe(true);
      // Bot 1 has 60% of earned → 60% of 5000 = 3000
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { totalWithdrawn: { increment: 3000 } },
      });
      // Bot 2 has 40% of earned → 40% of 5000 = 2000
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 2n },
        data: { totalWithdrawn: { increment: 2000 } },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Withdrawal'),
      );
    });

    it('throws when amount exceeds available balance', async () => {
      const bots = [
        makeBot({ totalEarned: new Decimal('1000'), totalWithdrawn: new Decimal('500') }),
      ];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);

      await expect(WhiteLabelService.withdraw(100n, 1000)).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('skips bots with zero earned share', async () => {
      const bots = [
        makeBot({ id: 1n, totalEarned: new Decimal('10000'), totalWithdrawn: new Decimal('0') }),
        makeBot({ id: 2n, totalEarned: new Decimal('0'), totalWithdrawn: new Decimal('0') }),
      ];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);
      mockPrisma.whiteLabelBot.update.mockResolvedValue({});

      await WhiteLabelService.withdraw(100n, 5000);

      // Only bot 1 should be updated (bot 2 has 0 earned)
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { totalWithdrawn: { increment: 5000 } },
      });
    });

    it('allows withdrawal of exact available balance', async () => {
      const bots = [
        makeBot({ totalEarned: new Decimal('3000'), totalWithdrawn: new Decimal('1000') }),
      ];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);
      mockPrisma.whiteLabelBot.update.mockResolvedValue({});

      const result = await WhiteLabelService.withdraw(100n, 2000);

      expect(result).toBe(true);
    });

    it('returns true with empty bots when amount is 0', async () => {
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce([]);

      const result = await WhiteLabelService.withdraw(100n, 0);

      expect(result).toBe(true);
    });
  });

  // ─────────────────────── updateBranding ───────────────────────

  describe('updateBranding', () => {
    it('updates partial branding fields', async () => {
      const updated = makeBot({ brandName: 'NewName', welcomeMsg: 'Hi!' });
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce(updated);

      const result = await WhiteLabelService.updateBranding(1n, {
        brandName: 'NewName',
        welcomeMsg: 'Hi!',
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { brandName: 'NewName', welcomeMsg: 'Hi!' },
      });
    });

    it('updates only logoUrl', async () => {
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce(makeBot({ logoUrl: 'https://img.png' }));

      await WhiteLabelService.updateBranding(1n, { logoUrl: 'https://img.png' });

      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { logoUrl: 'https://img.png' },
      });
    });

    it('handles empty updates object', async () => {
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce(makeBot());

      await WhiteLabelService.updateBranding(1n, {});

      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {},
      });
    });
  });

  // ─────────────────────── deactivate ───────────────────────

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      const deactivated = makeBot({ isActive: false });
      mockPrisma.whiteLabelBot.update.mockResolvedValueOnce(deactivated);

      const result = await WhiteLabelService.deactivate(1n);

      expect(result).toEqual(deactivated);
      expect(mockPrisma.whiteLabelBot.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { isActive: false },
      });
    });
  });

  // ─────────────────────── getStats ───────────────────────

  describe('getStats', () => {
    it('aggregates stats across all bots', async () => {
      const bots = [
        makeBot({
          id: 1n,
          brandName: 'BrandA',
          botUsername: 'bot_a',
          isActive: true,
          totalEarned: new Decimal('5000'),
          totalWithdrawn: new Decimal('1000'),
          totalSales: new Decimal('50000'),
          userCount: 10,
          commissionRate: new Decimal('0.1'),
        }),
        makeBot({
          id: 2n,
          brandName: 'BrandB',
          botUsername: 'bot_b',
          isActive: false,
          totalEarned: new Decimal('3000'),
          totalWithdrawn: new Decimal('500'),
          totalSales: new Decimal('20000'),
          userCount: 5,
          commissionRate: new Decimal('0.15'),
        }),
      ];
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce(bots);

      const result = await WhiteLabelService.getStats(100n);

      expect(result.botCount).toBe(2);
      expect(result.activeBots).toBe(1);
      expect(result.totalEarned).toBe(8000);
      expect(result.totalWithdrawn).toBe(1500);
      expect(result.availableBalance).toBe(6500);
      expect(result.totalUsers).toBe(15);
      expect(result.totalSales).toBe(70000);
      expect(result.bots).toHaveLength(2);
      expect(result.bots[0]).toEqual({
        id: 1n,
        brandName: 'BrandA',
        botUsername: 'bot_a',
        userCount: 10,
        totalEarned: 5000,
        commissionRate: 0.1,
        isActive: true,
      });
    });

    it('returns zeros when owner has no bots', async () => {
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce([]);

      const result = await WhiteLabelService.getStats(999n);

      expect(result.botCount).toBe(0);
      expect(result.activeBots).toBe(0);
      expect(result.totalEarned).toBe(0);
      expect(result.totalWithdrawn).toBe(0);
      expect(result.availableBalance).toBe(0);
      expect(result.totalUsers).toBe(0);
      expect(result.totalSales).toBe(0);
      expect(result.bots).toEqual([]);
    });

    it('queries with correct owner filter', async () => {
      mockPrisma.whiteLabelBot.findMany.mockResolvedValueOnce([]);

      await WhiteLabelService.getStats(42n);

      expect(mockPrisma.whiteLabelBot.findMany).toHaveBeenCalledWith({
        where: { ownerId: 42n },
      });
    });
  });
});
