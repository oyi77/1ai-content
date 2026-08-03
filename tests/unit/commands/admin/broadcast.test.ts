import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { adminBroadcastCommand } from "@/commands/admin/broadcast";
import { createMockContext, mockUser } from "../../../fixtures";

jest.mock("@/config/database", () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@/config/queue", () => ({
  addNotificationJob: jest.fn(),
}));

describe("Admin Broadcast Command", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let prisma: any;
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
    prisma = require("@/config/database").prisma;
    logger = require("@/utils/logger").logger;
    process.env.ADMIN_TELEGRAM_IDS = "123456789";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ADMIN_TELEGRAM_IDS;
  });

  describe("adminBroadcastCommand", () => {
    it("should reject non-admin users", async () => {
      ctx.from.id = 999999999;
      ctx.message = { text: "/broadcast Hello", message_id: 1 };

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should handle missing user gracefully", async () => {
      ctx.from = undefined as any;
      ctx.message = { text: "/broadcast Hello", message_id: 1 };

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should show usage when no message provided", async () => {
      ctx.message = { text: "/broadcast", message_id: 1 };

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Broadcast Message");
      expect(replyCall[0]).toContain("Usage:");
    });

    it("should show usage when message is empty", async () => {
      ctx.message = { text: "/broadcast   ", message_id: 1 };

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Broadcast message cannot be empty.",
      );
    });

    it("should broadcast to all users when no filters", async () => {
      ctx.message = { text: "/broadcast Hello everyone!", message_id: 1 };
      prisma.user.findMany.mockResolvedValue([
        { telegramId: BigInt(111), username: "user1", firstName: "User" },
        { telegramId: BigInt(222), username: "user2", firstName: "User" },
      ]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Broadcast Queued");
      expect(replyCall[0]).toContain("2 users");
    });

    it("should filter by tier", async () => {
      ctx.message = { text: "/broadcast Hello --tier pro", message_id: 1 };
      prisma.user.findMany.mockResolvedValue([
        { telegramId: BigInt(111), username: "pro_user", firstName: "Pro" },
      ]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tier: "pro" }),
        }),
      );
    });

    it("should filter by active-since (days)", async () => {
      ctx.message = {
        text: "/broadcast Hello --active-since 7d",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it("should filter by active-since (hours)", async () => {
      ctx.message = {
        text: "/broadcast Hello --active-since 24h",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it("should filter by active-since (hours)", async () => {
      ctx.message = {
        text: "/broadcast Hello --active-since 24h",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it("should handle multiple filters", async () => {
      ctx.message = {
        text: "/broadcast Hello --tier pro --active-since 7d",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it("should filter by active-since (hours)", async () => {
      ctx.message = {
        text: "/broadcast Hello --active-since 24h",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it("should handle multiple filters", async () => {
      ctx.message = {
        text: "/broadcast Hello --tier pro --active-since 7d",
        message_id: 1,
      };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tier: "pro",
            lastActivityAt: expect.any(Object),
          }),
        }),
      );
    });

    it("should show no users message when no users found", async () => {
      ctx.message = { text: "/broadcast Hello", message_id: 1 };
      prisma.user.findMany.mockResolvedValue([]);

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ No users found matching the specified filters.",
      );
    });

    it("should log broadcast action", async () => {
      ctx.message = { text: "/broadcast Hello everyone!", message_id: 1 };
      prisma.user.findMany.mockResolvedValue([
        { telegramId: BigInt(111), username: "user1", firstName: "User" },
      ]);

      await adminBroadcastCommand(ctx as any);

      expect(logger.info).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      ctx.message = { text: "/broadcast Hello", message_id: 1 };
      prisma.user.findMany.mockRejectedValue(new Error("Database error"));

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Error Broadcasting Message");
    });

    it("should handle missing message gracefully", async () => {
      ctx.message = undefined;

      await adminBroadcastCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Usage: /broadcast <message> [filters]",
      );
    });
  });
});
