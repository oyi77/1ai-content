import crypto from 'crypto';

/** Timing-safe string comparison to prevent timing attacks */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate cryptographically secure random string.
 * Use for: payment IDs, session tokens, security-critical values.
 * Do NOT use for: random array selection (Math.random() is fine for that).
 */
export function secureRandomString(length: number = 8): string {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
    .toUpperCase();
}

/**
 * Generate cryptographically secure random integer in range [0, max).
 * Use for: security-critical random selections.
 */
export function secureRandomInt(max: number): number {
  const bytes = crypto.randomBytes(4);
  return bytes.readUInt32BE(0) % max;
}
