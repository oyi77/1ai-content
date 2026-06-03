/**
 * Prisma Helpers Tests
 *
 * Tests for type-safe conversion utilities in prisma-helpers.ts.
 * Covers: credit balance conversions, telegram ID conversions,
 * user ID conversions, decimal creation, and type guards.
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  toUserCreditBalance,
  toUserCreditBalanceString,
  toTelegramId,
  fromTelegramId,
  toUserId,
  fromUserId,
  toDecimal,
  isDecimal,
  isBigInt,
} from '@/utils/prisma-helpers';

// ── toUserCreditBalance ──
describe('toUserCreditBalance', () => {
  it('should convert Decimal to number', () => {
    expect(toUserCreditBalance(new Decimal('100.50'))).toBe(100.5);
  });

  it('should return 0 for null', () => {
    expect(toUserCreditBalance(null)).toBe(0);
  });

  it('should return 0 for undefined', () => {
    expect(toUserCreditBalance(undefined)).toBe(0);
  });

  it('should handle zero', () => {
    expect(toUserCreditBalance(new Decimal(0))).toBe(0);
  });

  it('should handle negative values', () => {
    expect(toUserCreditBalance(new Decimal('-50.25'))).toBe(-50.25);
  });
});

// ── toUserCreditBalanceString ──
describe('toUserCreditBalanceString', () => {
  it('should convert Decimal to string preserving precision', () => {
    expect(toUserCreditBalanceString(new Decimal('100.50'))).toBe('100.5');
  });

  it('should return default "0" for null', () => {
    expect(toUserCreditBalanceString(null)).toBe('0');
  });

  it('should return default for undefined', () => {
    expect(toUserCreditBalanceString(undefined)).toBe('0');
  });

  it('should accept custom default value', () => {
    expect(toUserCreditBalanceString(null, 'N/A')).toBe('N/A');
  });
});

// ── toTelegramId ──
describe('toTelegramId', () => {
  it('should convert BigInt to string', () => {
    expect(toTelegramId(BigInt('123456789'))).toBe('123456789');
  });

  it('should return "0" for null', () => {
    expect(toTelegramId(null)).toBe('0');
  });

  it('should return "0" for undefined', () => {
    expect(toTelegramId(undefined)).toBe('0');
  });

  it('should handle very large IDs', () => {
    const largeId = BigInt('9007199254740993'); // > Number.MAX_SAFE_INTEGER
    expect(toTelegramId(largeId)).toBe('9007199254740993');
  });
});

// ── fromTelegramId ──
describe('fromTelegramId', () => {
  it('should convert string to BigInt', () => {
    expect(fromTelegramId('123456789')).toBe(BigInt('123456789'));
  });

  it('should convert number to BigInt', () => {
    expect(fromTelegramId(123456789)).toBe(BigInt(123456789));
  });

  it('should throw on invalid string', () => {
    expect(() => fromTelegramId('not-a-number')).toThrow('Invalid telegram ID');
  });

  it('should handle very large string IDs', () => {
    const result = fromTelegramId('9007199254740993');
    expect(result).toBe(BigInt('9007199254740993'));
  });
});

// ── toUserId ──
describe('toUserId', () => {
  it('should convert BigInt to string', () => {
    expect(toUserId(BigInt(42))).toBe('42');
  });

  it('should return "0" for null', () => {
    expect(toUserId(null)).toBe('0');
  });

  it('should return "0" for undefined', () => {
    expect(toUserId(undefined)).toBe('0');
  });
});

// ── fromUserId ──
describe('fromUserId', () => {
  it('should convert string to BigInt', () => {
    expect(fromUserId('42')).toBe(BigInt(42));
  });

  it('should convert number to BigInt', () => {
    expect(fromUserId(42)).toBe(BigInt(42));
  });

  it('should throw on invalid input', () => {
    expect(() => fromUserId('invalid')).toThrow('Invalid user ID');
  });
});

// ── toDecimal ──
describe('toDecimal', () => {
  it('should convert number to Decimal', () => {
    const result = toDecimal(100.5);
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toNumber()).toBe(100.5);
  });

  it('should return Decimal(0) for null', () => {
    const result = toDecimal(null);
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toNumber()).toBe(0);
  });

  it('should return Decimal(0) for undefined', () => {
    const result = toDecimal(undefined);
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toNumber()).toBe(0);
  });

  it('should handle zero', () => {
    expect(toDecimal(0).toNumber()).toBe(0);
  });

  it('should handle negative values', () => {
    expect(toDecimal(-50.25).toNumber()).toBe(-50.25);
  });
});

// ── isDecimal ──
describe('isDecimal', () => {
  it('should return true for Decimal instance', () => {
    expect(isDecimal(new Decimal(10))).toBe(true);
  });

  it('should return false for number', () => {
    expect(isDecimal(10)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isDecimal('10')).toBe(false);
  });

  it('should return false for null', () => {
    expect(isDecimal(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isDecimal(undefined)).toBe(false);
  });
});

// ── isBigInt ──
describe('isBigInt', () => {
  it('should return true for BigInt', () => {
    expect(isBigInt(BigInt(10))).toBe(true);
  });

  it('should return false for number', () => {
    expect(isBigInt(10)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isBigInt('10')).toBe(false);
  });

  it('should return false for null', () => {
    expect(isBigInt(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isBigInt(undefined)).toBe(false);
  });
});
