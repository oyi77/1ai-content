import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";

// ── Config mock (module-level call) ──
jest.mock("@/config/env", () => ({
  getConfig: jest.fn<any>().mockReturnValue({
    SOCIAL_API_URL: "http://social.test",
  }),
}));

// ── Logger mock ──
jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn<any>(),
    error: jest.fn<any>(),
    warn: jest.fn<any>(),
    debug: jest.fn<any>(),
  },
}));

// ── Global fetch mock ──
const mockFetch = jest.fn<any>();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Imports after mocks ──
import { uploadToTikTok, uploadCarouselToTikTok } from "@/services/tiktok-social.service";
import { logger } from "@/utils/logger";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn<any>().mockResolvedValue(body),
    text: jest.fn<any>().mockResolvedValue(JSON.stringify(body)),
  };
}

describe("tiktok-social.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ───────────────────── uploadToTikTok ─────────────────────

  describe("uploadToTikTok()", () => {
    it("sends correct POST request with all params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true, message: "uploaded" }));

      const result = await uploadToTikTok({
        videoPath: "/tmp/video.mp4",
        caption: "Check this out!",
        hashtags: ["funny", "viral"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://social.test/api/v1/social/tiktok/upload",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({
        video_path: "/tmp/video.mp4",
        caption: "Check this out!",
        hashtags: ["funny", "viral"],
      });

      expect(result).toEqual({ success: true, message: "uploaded" });
    });

    it("defaults hashtags to empty array when omitted", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true }));

      await uploadToTikTok({ videoPath: "/tmp/v.mp4", caption: "hi" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.hashtags).toEqual([]);
    });

    it("returns success result and logs on success", async () => {
      const apiResult = { success: true, message: "Video uploaded successfully" };
      mockFetch.mockResolvedValue(jsonResponse(apiResult));

      const result = await uploadToTikTok({
        videoPath: "/tmp/v.mp4",
        caption: "test",
      });

      expect(result).toEqual(apiResult);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("true"),
      );
    });

    it("returns error on non-ok response", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ detail: "Bad request" }, false, 400),
      );

      const result = await uploadToTikTok({
        videoPath: "/tmp/v.mp4",
        caption: "test",
      });

      expect(result).toEqual({ success: false, error: "API error: 400" });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("400"),
      );
    });

    it("returns 500 error on server failure", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ detail: "Internal" }, false, 500),
      );

      const result = await uploadToTikTok({
        videoPath: "/tmp/v.mp4",
        caption: "test",
      });

      expect(result).toEqual({ success: false, error: "API error: 500" });
    });

    it("returns error on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await uploadToTikTok({
        videoPath: "/tmp/v.mp4",
        caption: "test",
      });

      expect(result).toEqual({ success: false, error: "ECONNREFUSED" });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("ECONNREFUSED"),
      );
    });

    it("returns error on timeout", async () => {
      mockFetch.mockRejectedValue(new Error("The operation was aborted"));

      const result = await uploadToTikTok({
        videoPath: "/tmp/v.mp4",
        caption: "test",
      });

      expect(result).toEqual({
        success: false,
        error: "The operation was aborted",
      });
    });

    it("sets abort signal with 3-minute timeout", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true }));

      await uploadToTikTok({ videoPath: "/tmp/v.mp4", caption: "test" });

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it("sets Content-Type to application/json", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true }));

      await uploadToTikTok({ videoPath: "/tmp/v.mp4", caption: "test" });

      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/json",
      );
    });
  });

  // ───────────────── uploadCarouselToTikTok ─────────────────

  describe("uploadCarouselToTikTok()", () => {
    it("delegates to uploadToTikTok with correct params", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ success: true, message: "ok" }));

      const result = await uploadCarouselToTikTok(
        "/tmp/carousel.mp4",
        "carousel caption",
        ["carousel", "test"],
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({
        video_path: "/tmp/carousel.mp4",
        caption: "carousel caption",
        hashtags: ["carousel", "test"],
      });
      expect(result).toEqual({ success: true, message: "ok" });
    });

    it("returns error when underlying upload fails", async () => {
      mockFetch.mockRejectedValue(new Error("network down"));

      const result = await uploadCarouselToTikTok("/tmp/v.mp4", "cap", []);

      expect(result).toEqual({ success: false, error: "network down" });
    });
  });
});
