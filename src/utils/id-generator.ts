/**
 * Synthetic BigInt ID Generator
 *
 * Generates negative BigInt values for email-only users.
 * Telegram IDs are always positive, so negative values are safe from collision.
 * Format: -{timestamp}{random-5-digits}
 * Example: -172217280012345
 */
let sequence = 0;

export function generateSyntheticId(): bigint {
  const ts = Date.now();
  sequence = (sequence + 1) % 100000;
  return BigInt(`-${ts}${String(sequence).padStart(5, '0')}`);
}
