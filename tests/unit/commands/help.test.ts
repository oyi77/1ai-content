import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { helpCommand } from "@/commands/help";
import { createMockContext } from "../../fixtures";

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("Help Command", () => {
  let ctx: ReturnType<typeof createMockContext>;

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("helpCommand", () => {
    it("should show help message", async () => {
      await helpCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("1AI Content");
    });

    it("should show all command categories", async () => {
      await helpCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("/prompts");
      expect(replyCall[0]).toContain("GENERATE");
      expect(replyCall[0]).toContain("ACCOUNT");
    });

    it("should show all available commands", async () => {
      await helpCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("/prompts");
      expect(replyCall[0]).toContain("/create");
      expect(replyCall[0]).toContain("/topup");
      expect(replyCall[0]).toContain("/subscription");
      expect(replyCall[0]).toContain("/settings");
      expect(replyCall[0]).toContain("/videos");
      expect(replyCall[0]).toContain("/profile");
      expect(replyCall[0]).toContain("/support");
    });

    it("should show creative tools section", async () => {
      await helpCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("GENERATE");
      expect(replyCall[0]).toContain("/create");
      expect(replyCall[0]).toContain("/trending");
    });

    it("should show quick tips section", async () => {
      await helpCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("INFO");
      expect(replyCall[0]).toContain("/prompts");
      expect(replyCall[0]).toContain("/daily");
    });

    it("should show main menu button", async () => {
      await helpCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard[0][0].callback_data).toBe("main_menu");
    });

    it("should use MarkdownV2 parse mode", async () => {
      await helpCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[1].parse_mode).toBe("Markdown");
    });
  });
});
