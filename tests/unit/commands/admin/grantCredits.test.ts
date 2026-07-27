import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { adminGrantCreditsCommand } from "@/commands/admin/grantCredits";
import { createMockContext, mockUser } from "../../../fixtures";

jest.mock("@/services/user.service", () => ({
  UserService: {
    findByTelegramId: jest.fn(),
    grantCredits: jest.fn(),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("Admin Grant Credits Command", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let UserService: any;
  let logger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockContext();
    ctx.session = {
      state: "DASHBOARD",
      lastActivity: new Date(),
      creditBalance: 10,
      tier: "free",
      stateData: {},
    };
    UserService = require("@/services/user.service").UserService;
    logger = require("@/utils/logger").logger;
    process.env.ADMIN_TELEGRAM_IDS = "123456789";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ADMIN_TELEGRAM_IDS;
  });

  describe("adminGrantCreditsCommand", () => {
    it("should reject non-admin users", async () => {
      ctx.from.id = 999999999;
      ctx.message = { text: "/grant_credits 111111111 10 test", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should handle missing user gracefully", async () => {
      ctx.from = undefined as any;
      ctx.message = { text: "/grant_credits 111111111 10 test", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should show usage when no arguments provided", async () => {
      ctx.message = { text: "/grant_credits", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Grant Credits");
      expect(replyCall[0]).toContain("Usage:");
    });

    it("should show usage when insufficient arguments", async () => {
      ctx.message = { text: "/grant_credits 111111111", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Usage:");
    });

    it("should show error for invalid amount", async () => {
      ctx.message = {
        text: "/grant_credits 111111111 invalid test",
        message_id: 1,
      };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Invalid amount. Please enter a positive number.",
      );
    });

    it("should show error for zero amount", async () => {
      ctx.message = { text: "/grant_credits 111111111 0 test", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Invalid amount. Please enter a positive number.",
      );
    });

    it("should show error for negative amount", async () => {
      ctx.message = { text: "/grant_credits 111111111 -5 test", message_id: 1 };

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Invalid amount. Please enter a positive number.",
      );
    });

    it("should show error when user not found", async () => {
      ctx.message = { text: "/grant_credits 111111111 10 test", message_id: 1 };
      UserService.findByTelegramId.mockResolvedValue(null);

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ User not found. Please check the user ID.",
      );
    });

    it("should grant credits successfully", async () => {
      ctx.message = {
        text: "/grant_credits 111111111 10 Bonus for referral",
        message_id: 1,
      };
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        id: BigInt(1),
        telegramId: BigInt(111111111),
        username: "testuser",
      });
      UserService.grantCredits.mockResolvedValue(undefined);

      await adminGrantCreditsCommand(ctx as any);

      expect(UserService.grantCredits).toHaveBeenCalledWith(
        BigInt(111111111),
        10,
        "Bonus for referral",
      );
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Credits Granted");
      expect(replyCall[0]).toContain("111111111");
      expect(replyCall[0]).toContain("10");
      expect(replyCall[0]).toContain("Bonus for referral");
    });

    it("should log grant action", async () => {
      ctx.message = {
        text: "/grant_credits 111111111 10 Bonus",
        message_id: 1,
      };
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        id: BigInt(1),
        telegramId: BigInt(111111111),
      });
      UserService.grantCredits.mockResolvedValue(undefined);

      await adminGrantCreditsCommand(ctx as any);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("granted"),
      );
    });

    it("should handle database errors gracefully", async () => {
      ctx.message = { text: "/grant_credits 111111111 10 test", message_id: 1 };
      UserService.findByTelegramId.mockRejectedValue(
        new Error("Database error"),
      );

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Error Granting Credits");
    });

    it("should handle missing message gracefully", async () => {
      ctx.message = undefined;

      await adminGrantCreditsCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Usage: /grant_credits <user_id> <amount> <reason>",
      );
    });

    it("should handle user with no username", async () => {
      ctx.message = {
        text: "/grant_credits 111111111 10 Bonus",
        message_id: 1,
      };
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        id: BigInt(1),
        telegramId: BigInt(111111111),
        username: null,
        firstName: "Test",
      });
      UserService.grantCredits.mockResolvedValue(undefined);

      await adminGrantCreditsCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Test");
    });
  });
});
