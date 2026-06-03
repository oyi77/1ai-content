/**
 * Prisma Type Conversion Helpers
 *
 * Provides safe, type-aware conversion functions for Prisma field types.
 * This ensures consistent handling of Decimal, BigInt, and other special types
 * throughout the application.
 *
 * WHY: Prisma uses Decimal for financial precision and BigInt for large IDs,
 * but TypeScript/JavaScript often need number or string types. These helpers
 * centralize conversions and prevent runtime type errors.
 */

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Convert Prisma Decimal (creditBalance) to safe number
 *
 * Used for arithmetic operations and comparisons on credit balances.
 * Decimal is precise, but JavaScript needs number for math operations.
 *
 * @param decimal - Prisma Decimal value from database
 * @returns Safe number representation, or 0 if null/undefined
 *
 * @example
 * const user = await prisma.user.findUnique({ ... });
 * const balance = toUserCreditBalance(user.creditBalance); // number
 * if (balance >= 100) { ... }
 */
export function toUserCreditBalance(decimal: Decimal | null | undefined): number {
  if (!decimal) return 0;
  // Decimal.toNumber() is safe for credit balances (max 2 decimal places)
  return decimal.toNumber();
}

/**
 * Convert Prisma Decimal to string for precise decimal representation
 *
 * Use when you need to preserve exact decimal places without float rounding.
 * Useful for database storage, API responses, and logging.
 *
 * @param decimal - Prisma Decimal value
 * @param defaultValue - Value to return if decimal is null/undefined
 * @returns String with exact decimal representation
 *
 * @example
 * const balanceStr = toUserCreditBalanceString(user.creditBalance);
 * // Preserves "100.50" exactly, without float precision loss
 */
export function toUserCreditBalanceString(
  decimal: Decimal | null | undefined,
  defaultValue = '0'
): string {
  if (!decimal) return defaultValue;
  return decimal.toString();
}

/**
 * Convert Prisma BigInt (telegramId) to string for API responses/logging
 *
 * Telegram IDs are BigInt in database but need to be strings in Telegram API
 * and for JSON serialization (JSON doesn't support BigInt).
 *
 * @param bigint - BigInt value from database
 * @returns String representation of the BigInt
 *
 * @example
 * const user = await prisma.user.findUnique({ ... });
 * const telegramIdStr = toTelegramId(user.telegramId);
 * await telegram.sendMessage(telegramIdStr, 'Hello!');
 */
export function toTelegramId(bigint: bigint | null | undefined): string {
  if (!bigint) return '0';
  return bigint.toString();
}

/**
 * Convert string/number telegram ID to BigInt for database queries
 *
 * Used when receiving telegram IDs from Telegram API or user input.
 * Ensures type safety when querying the database.
 *
 * @param str - String or number telegram ID
 * @returns BigInt for database operations
 * @throws Error if input cannot be converted to valid BigInt
 *
 * @example
 * const telegramId = fromTelegramId(ctx.from.id);
 * const user = await prisma.user.findUnique({
 *   where: { telegramId }
 * });
 */
export function fromTelegramId(str: string | number): bigint {
  try {
    return BigInt(str);
  } catch (error) {
    throw new Error(`Invalid telegram ID: ${str}. Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convert Prisma BigInt user ID to string for API responses
 *
 * User IDs are BigInt in database for scalability but need to be strings
 * in APIs and JSON responses.
 *
 * @param bigint - BigInt user ID
 * @returns String representation
 *
 * @example
 * const userId = toUserId(user.id);
 * res.json({ userId, creditBalance: toUserCreditBalance(user.creditBalance) });
 */
export function toUserId(bigint: bigint | null | undefined): string {
  if (!bigint) return '0';
  return bigint.toString();
}

/**
 * Convert string/number user ID to BigInt for database queries
 *
 * Used when receiving user IDs from API inputs or external sources.
 *
 * @param str - String or number user ID
 * @returns BigInt for database operations
 * @throws Error if input cannot be converted to valid BigInt
 *
 * @example
 * const userId = fromUserId(req.body.userId);
 * const user = await prisma.user.findUnique({ where: { id: userId } });
 */
export function fromUserId(str: string | number): bigint {
  try {
    return BigInt(str);
  } catch (error) {
    throw new Error(`Invalid user ID: ${str}. Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create Prisma Decimal from number for database storage
 *
 * Converts JavaScript number to Prisma Decimal for credit operations.
 * Safe for credit balances and amounts with up to 2 decimal places.
 *
 * @param num - Number value to convert
 * @returns Prisma Decimal for database operations
 *
 * @example
 * const creditDelta = new Decimal(50.25);
 * await prisma.user.update({
 *   where: { id: userId },
 *   data: { creditBalance: { increment: toDecimal(50.25) } }
 * });
 */
export function toDecimal(num: number | null | undefined): Decimal {
  if (num === null || num === undefined) return new Decimal(0);
  return new Decimal(num.toString()); // Use string to avoid float precision issues
}

/**
 * Type guard: check if value is a valid Decimal
 *
 * @param value - Value to check
 * @returns True if value is a Decimal instance
 */
export function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

/**
 * Type guard: check if value is a valid BigInt
 *
 * @param value - Value to check
 * @returns True if value is a BigInt
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}
