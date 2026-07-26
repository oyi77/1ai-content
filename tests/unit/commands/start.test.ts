/**
 * Start Command Unit Tests
 *
 * Tests for /start command handler
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { startCommand } from "@/commands/start";
import { createMockContext, mockUser, mockPremiumUser } from "../../fixtures";

// Mock dependencies
jest.mock("@/services/user.service", () => ({
  UserService: {
    findByTelegramId: jest.fn(),
    updateActivity: jest.fn(),
  },
}));

jest.mock("@/services/vilona-animation.service", () => ({
  sendVilonaWelcomeAnimation: jest.fn() as any,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@/services/payment-settings.service", () => ({
  PaymentSettingsService: {
    getPricingConfig: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
    getEnabledGateways: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  },
}));

jest.mock("@/config/languages", () => ({
  LANGUAGES: {
    id: { code: "id", label: "Bahasa Indonesia" },
    en: { code: "en", label: "English" },
    ms: { code: "ms", label: "Bahasa Melayu" },
    th: { code: "th", label: "Thai" },
    vi: { code: "vi", label: "Vietnamese" },
    zh: { code: "zh", label: "Chinese" },
    ja: { code: "ja", label: "Japanese" },
    ko: { code: "ko", label: "Korean" },
    ar: { code: "ar", label: "Arabic" },
    ru: { code: "ru", label: "Russian" },
    fr: { code: "fr", label: "French" },
    de: { code: "de", label: "German" },
    es: { code: "es", label: "Spanish" },
    pt: { code: "pt", label: "Portuguese" },
  },
}));

describe("Start Command", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let UserService: any;
  let sendVilonaWelcomeAnimation: any;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockContext();
    UserService = require("@/services/user.service").UserService;
    sendVilonaWelcomeAnimation =
      require("@/services/vilona-animation.service").sendVilonaWelcomeAnimation;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("startCommand", () => {
    it("should handle missing user gracefully", async () => {
      ctx.from = undefined as any;

      await startCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
      expect(UserService.findByTelegramId).not.toHaveBeenCalled();
    });

    it("should show 4-language picker for new users", async () => {
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(UserService.findByTelegramId).toHaveBeenCalledWith(
        BigInt(ctx.from.id),
      );
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      // Should show multilingual language picker prompt
      expect(replyCall[0]).toContain("Please select your language");
      // First button should be Indonesian (onboard_lang_id)
      expect(
        replyCall[1].reply_markup.inline_keyboard[0][0].callback_data,
      ).toBe("onboard_lang_id");
      // Should have 4 language buttons
      expect(replyCall[1].reply_markup.inline_keyboard).toHaveLength(4);
    });

    it("should detect language from Telegram language_code", async () => {
      ctx.from.language_code = "id";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("id");
    });

    it("should handle language code with region (e.g., en-US)", async () => {
      ctx.from.language_code = "en-US";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should fallback to English for unsupported language", async () => {
      ctx.from.language_code = "xyz";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle missing language_code", async () => {
      ctx.from.language_code = undefined;
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should extract start payload from message", async () => {
      ctx.message = { text: "/start referral_123", message_id: 1 };
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.startPayload).toBe("referral_123");
    });

    it("should set ONBOARDING_LANGUAGE state for new users", async () => {
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.state).toBe("ONBOARDING_LANGUAGE");
    });

    it("should show main menu for existing users", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 10,
        tier: "free",
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(UserService.updateActivity).toHaveBeenCalledWith(
        BigInt(ctx.from.id),
      );
      expect(sendVilonaWelcomeAnimation).toHaveBeenCalledWith(ctx);
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("Selamat datang");
      expect(replyCall[1].reply_markup.keyboard).toHaveLength(6);
    });

    it("should show correct credit emoji for zero balance", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 0,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("⚠️");
    });

    it("should show correct credit emoji for low balance (< 3)", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 2,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("🟡");
    });

    it("should show correct credit emoji for sufficient balance (>= 3)", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 10,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("🟢");
    });

    it("should store credit balance in session", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        creditBalance: 15,
        tier: "pro",
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(ctx.session?.creditBalance).toBe(15);
      expect(ctx.session?.tier).toBe("pro");
    });

    it("should set DASHBOARD state for existing users", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(ctx.session?.state).toBe("DASHBOARD");
    });

    it("should show ban message for banned users", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        language: "en",
        isBanned: true,
        banReason: "Violation of terms",
      });
      UserService.updateActivity.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(sendVilonaWelcomeAnimation).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("account has been restricted");
      expect(replyCall[0]).toContain("Violation of terms");
    });

    it("should show default ban reason when none provided", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        language: "en",
        isBanned: true,
        banReason: null,
      });
      UserService.updateActivity.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("No reason provided");
    });

    it("should handle database errors gracefully", async () => {
      UserService.findByTelegramId.mockRejectedValue(
        new Error("Database error"),
      );

      await startCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
      );
    });

    it("should handle missing session gracefully", async () => {
      ctx.session = undefined as any;
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      // Should not throw, just skip session updates
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should show correct inline keyboard buttons for existing users", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      const keyboard = ctx.reply.mock.calls[0][1].reply_markup.keyboard;
      // Keyboard is language-aware — mock user has language:'id'
      expect(keyboard[0][0].text).toContain("🎬");
      expect(keyboard[0][1].text).toContain("🖼️");
      expect(keyboard[1][0].text).toContain("📚");
      expect(keyboard[2][0].text).toContain("📁");
      expect(keyboard[4][1].text).toContain("⚙️");
    });

    it("should handle zh-hans language code", async () => {
      ctx.from.language_code = "zh-hans";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("zh");
    });

    // Languages outside the 4 supported UI languages (id/en/ru/zh) fall back to "en"
    it("should handle pt-br language code (falls back to en)", async () => {
      ctx.from.language_code = "pt-br";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle ms language code (falls back to en)", async () => {
      ctx.from.language_code = "ms";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle th language code (falls back to en)", async () => {
      ctx.from.language_code = "th";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle vi language code (falls back to en)", async () => {
      ctx.from.language_code = "vi";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle ja language code (falls back to en)", async () => {
      ctx.from.language_code = "ja";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle ko language code (falls back to en)", async () => {
      ctx.from.language_code = "ko";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle ar language code (falls back to en)", async () => {
      ctx.from.language_code = "ar";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle ru language code", async () => {
      ctx.from.language_code = "ru";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("ru");
    });

    it("should handle fr language code (falls back to en)", async () => {
      ctx.from.language_code = "fr";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle de language code (falls back to en)", async () => {
      ctx.from.language_code = "de";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle es language code (falls back to en)", async () => {
      ctx.from.language_code = "es";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle case-insensitive language codes", async () => {
      ctx.from.language_code = "EN";
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.detectedLang).toBe("en");
    });

    it("should handle message without start payload", async () => {
      ctx.message = { text: "/start", message_id: 1 };
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.startPayload).toBeNull();
    });

    it("should handle missing message object", async () => {
      ctx.message = undefined;
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.session?.stateData?.startPayload).toBeNull();
    });

    it("should handle premium user with high credit balance", async () => {
      UserService.findByTelegramId.mockResolvedValue({
        ...mockPremiumUser,
        creditBalance: 100,
        tier: "pro",
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(ctx.session?.creditBalance).toBe(100);
      expect(ctx.session?.tier).toBe("pro");
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain("🟢");
    });

    it("should handle user with no username", async () => {
      ctx.from.username = undefined;
      UserService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        isBanned: false,
      });
      UserService.updateActivity.mockResolvedValue(undefined);
      sendVilonaWelcomeAnimation.mockResolvedValue(undefined);

      await startCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle user with no last_name", async () => {
      ctx.from.last_name = undefined;
      UserService.findByTelegramId.mockResolvedValue(null);

      await startCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
    });
  });
});
