import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { adminSystemStatusCommand } from "@/commands/admin/systemStatus";
import { createMockContext } from "../../../fixtures";

jest.mock("@/config/queue", () => ({
  getQueueStats: jest.fn(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("Admin System Status Command", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let getQueueStats: jest.Mock;
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
    getQueueStats = require("@/config/queue").getQueueStats;
    logger = require("@/utils/logger").logger;
    process.env.ADMIN_TELEGRAM_IDS = "123456789";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ADMIN_TELEGRAM_IDS;
  });

  describe("adminSystemStatusCommand", () => {
    it("should reject non-admin users", async () => {
      ctx.from.id = 999999999;

      await adminSystemStatusCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should handle missing user gracefully", async () => {
      ctx.from = undefined as any;

      await adminSystemStatusCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ You do not have permission to use this command.",
      );
    });

    it("should show system status", async () => {
      (getQueueStats as any).mockResolvedValue({
        video: { waiting: 5, active: 2 },
        payment: { waiting: 0, active: 1 },
        notification: { waiting: 10, active: 3 },
      });

      await adminSystemStatusCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("System Status");
      expect(replyCall[0]).toContain("OpenClaw Core:");
      expect(replyCall[0]).toContain("Connected");
      expect(replyCall[0]).toContain("PostgreSQL:");
      expect(replyCall[0]).toContain("Redis:");
    });

    it("should show queue statistics", async () => {
      (getQueueStats as any).mockResolvedValue({
        video: { waiting: 5, active: 2 },
        payment: { waiting: 0, active: 1 },
        notification: { waiting: 10, active: 3 },
      });

      await adminSystemStatusCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Video Queue: 5 waiting, 2 active");
      expect(replyCall[0]).toContain("Payment Queue: 0 waiting, 1 active");
      expect(replyCall[0]).toContain(
        "Notification Queue: 10 waiting, 3 active",
      );
    });

    it("should show active users and videos generated", async () => {
      (getQueueStats as any).mockResolvedValue({
        video: { waiting: 0, active: 0 },
        payment: { waiting: 0, active: 0 },
        notification: { waiting: 0, active: 0 },
      });

      await adminSystemStatusCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Active Users:");
      expect(replyCall[0]).toContain("Videos Generated (24h):");
    });

    it("should handle queue stats errors gracefully", async () => {
      (getQueueStats as any).mockRejectedValue(new Error("Queue error"));

      await adminSystemStatusCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Failed to get system status. Please try again.",
      );
    });

    it("should log errors", async () => {
      (getQueueStats as any).mockRejectedValue(new Error("Queue error"));

      await adminSystemStatusCommand(ctx as any);

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
