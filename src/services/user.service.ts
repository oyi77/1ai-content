/**
 * User Service (Facade)
 *
 * Re-exports all user-related operations from domain-specific services.
 * Maintains backward compatibility with existing imports.
 *
 * Domain breakdown:
 * - user-crud.service.ts: CRUD operations (find, create, update, ban/unban)
 * - user-credits.service.ts: Credit management and refund processing
 * - user-referral.service.ts: Referral code generation
 * - user-telegram.service.ts: Telegram DM sending
 * - user-stats.service.ts: User statistics and quota checks
 */

// Re-export all CRUD operations
export { UserCrudService } from "./user-crud.service";

// Re-export credit operations
export { UserCreditsService } from "./user-credits.service";

// Re-export referral operations
export { UserReferralService } from "./user-referral.service";

// Re-export Telegram operations
export { UserTelegramService } from "./user-telegram.service";

// Re-export stats operations
export { UserStatsService } from "./user-stats.service";

// Facade that re-exports everything as static methods on UserService
// This maintains backward compatibility with code that imports UserService directly
import { UserCrudService } from "./user-crud.service";
import { UserCreditsService } from "./user-credits.service";
import { UserReferralService } from "./user-referral.service";
import { UserTelegramService } from "./user-telegram.service";
import { UserStatsService } from "./user-stats.service";
import { User, Prisma } from "@prisma/client";

/**
 * @deprecated Use domain-specific services instead:
 * - UserCrudService for CRUD operations
 * - UserCreditsService for credit management
 * - UserReferralService for referral codes
 * - UserTelegramService for Telegram DMs
 * - UserStatsService for stats
 *
 * For backward compatibility, this class re-exports all methods as static:
 * UserService.findByTelegramId() === UserCrudService.findByTelegramId()
 */
export class UserService {
  // CRUD operations
  static findByTelegramId = UserCrudService.findByTelegramId;
  static findByUuid = UserCrudService.findByUuid;
  static create = UserCrudService.create;
  static update = UserCrudService.update;
  static updateActivity = UserCrudService.updateActivity;
  static findByReferralCode = UserCrudService.findByReferralCode;
  static ban = UserCrudService.ban;
  static unban = UserCrudService.unban;

  // Credit operations
  static addCredits = UserCreditsService.addCredits;
  static grantCredits = UserCreditsService.grantCredits;
  static grantWelcomeBonus = UserCreditsService.grantWelcomeBonus;
  static deductCredits = UserCreditsService.deductCredits;
  static refundCredits = UserCreditsService.refundCredits;
  static queueRefundRetry = UserCreditsService.queueRefundRetry;
  static processRefundRetries = UserCreditsService.processRefundRetries;
  static hasEnoughCredits = UserCreditsService.hasEnoughCredits;
  static expireStaleCredits = UserCreditsService.expireStaleCredits;

  // Referral operations
  static generateReferralCode = UserReferralService.generateReferralCode;

  // Telegram operations
  static setBotInstance = UserTelegramService.setBotInstance;
  static sendMessage = UserTelegramService.sendMessage;
  static get botInstance() {
    return UserTelegramService.getBotInstance();
  }

  // Stats operations
  static getDailyGenerationCount = UserStatsService.getDailyGenerationCount;
  static canGenerate = UserStatsService.canGenerate;
  static getStats = UserStatsService.getStats;
}

// Also export as default for convenience
export default UserService;
