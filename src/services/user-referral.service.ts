/**
 * User Referral Service
 *
 * Referral code generation
 */

import { prisma } from "@/config/database";
import { secureRandomInt } from "@/utils/crypto";

export class UserReferralService {
  /**
   * Generate a unique referral code
   * Format: REF-{NAME}-{RANDOM} or REF-{RANDOM} as fallback
   */
  static async generateReferralCode(name: string): Promise<string> {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const sanitizeName = (n: string) =>
      n
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8);
    const base = sanitizeName(name) || "USER";
    for (let attempt = 0; attempt < 10; attempt++) {
      const random = Array.from(
        { length: 4 },
        () => charset[secureRandomInt(charset.length)],
      ).join("");
      const code = `REF-${base}-${random}`;
      const existing = await prisma.user.findUnique({
        where: { referralCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    // Fallback to UUID-based
    const random = Array.from(
      { length: 8 },
      () => charset[secureRandomInt(charset.length)],
    ).join("");
    return `REF-${random}`;
  }
}
