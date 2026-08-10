// ── Agnes video provider: no-key safe-failure + async contract test ──
// Locks the registry gating and generateViaAgnes behavior WITHOUT live keys:
//  - empty AGNES_API_KEYS  → agnes_video disabled, generate() short-circuits, no network
//  - keys present          → enabled, full POST → host-root poll (video_id) → metadata.url flow
//  - round-robin           → keys alternate across generations
//
// Determinism notes:
//  - generateViaAgnes keeps a MODULE-GLOBAL key cursor (video-async.ts agnesKeyIndex),
//    so each test gets a fresh module via jest.resetModules() + fresh require.
//  - pollUntilComplete sleeps POLL_INTERVAL (5000ms) BEFORE the first poll, so the
//    poll-path test drives that sleep with fake timers instead of a >5s real wait.
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockConfig: Record<string, unknown> = {};
jest.mock("@/config/env", () => ({
  getConfig: jest.fn(() => mockConfig),
}));

// Stub network so the full async path runs deterministically under jest.
// Factory body must not READ the consts at eval time (jest.mock is hoisted) —
// delegate lazily inside wrappers, same closure pattern as the env mock.
const mockPost = jest.fn<any>();
const mockGet = jest.fn<any>();
jest.mock("axios", () => ({
  post: (...args: any[]) => mockPost(...args),
  get: (...args: any[]) => mockGet(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
  // Reset the module registry so generateViaAgnes's module-global key cursor
  // (agnesKeyIndex) starts at 0 for every test — absolute key order is deterministic.
  jest.resetModules();
});

// Type-only import: erased at runtime, so it never touches the jest.mock registry.
import type { VideoProvider } from "@/services/video-fallback/providers/providers-registry";

// Fresh module per call: after jest.resetModules() the registry module re-executes
// and re-reads the (mocked) config at getProviders() call time.
async function getAgnes() {
  // Sync extensionless require — the repo-proven CJS pattern (tests/routes, tests/e2e).
  // tsc cannot resolve dynamic import("@/...") under NodeNext (TS2307) and relative
  // dynamic import() needs an extension (TS2835); a require() call bypasses both while
  // jest.resetModules() still guarantees a fresh module instance at runtime.
  const { getProviders } = require("../../../src/services/video-fallback/providers/providers-registry") as {
    getProviders: () => VideoProvider[];
  };
  const agnes = getProviders().find((p) => p.key === "agnes_video");
  expect(agnes).toBeDefined();
  return agnes!;
}

describe("video fallback registry — agnes_video contract", () => {
  it("disables agnes_video and short-circuits without AGNES_API_KEYS (no network)", async () => {
    const agnes = await getAgnes();
    expect(agnes.enabled).toBe(false);

    const res = await agnes.generate({ prompt: "a cat", duration: 5, aspectRatio: "9:16" });
    expect(res).toEqual({ success: false, error: "AGNES_API_KEYS not configured", provider: "agnes_video" });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("enables agnes_video and completes POST → host-root poll → metadata.url with keys", async () => {
    jest.useFakeTimers();
    try {
      mockConfig.AGNES_API_KEYS = "key-a,key-b";
      mockConfig.AGNES_API_BASE = "https://apihub.agnes-ai.com/v1";
      mockConfig.AGNES_VIDEO_MODEL = "agnes-video-v2.0";
      mockPost.mockResolvedValue({ data: { video_id: "task-9" } });
      mockGet.mockResolvedValue({
        data: { status: "completed", metadata: { url: "https://cdn.agnes-ai.com/out.mp4" } },
      });

      const agnes = await getAgnes();
      expect(agnes.enabled).toBe(true);

      // pollUntilComplete sleeps POLL_INTERVAL (5s) before the first poll — fire that
      // timer with fake timers instead of waiting 5s for real.
      const resP = agnes.generate({ prompt: "a cat", duration: 5, aspectRatio: "9:16" });
      await jest.advanceTimersByTimeAsync(5000);
      const res = await resP;
      expect(res).toEqual({ success: true, videoUrl: "https://cdn.agnes-ai.com/out.mp4", provider: "agnes_video" });

      // Submit contract: POST {base}/videos with first key round-robin (key-a).
      // Chain aspect ratio (9:16) → width/height; duration (5s @24fps) → num_frames/frame_rate.
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        "https://apihub.agnes-ai.com/v1/videos",
        { model: "agnes-video-v2.0", prompt: "a cat", width: 720, height: 1280, num_frames: 121, frame_rate: 24 },
        expect.objectContaining({ timeout: 60000, headers: expect.objectContaining({ Authorization: "Bearer key-a" }) }),
      );

      // Poll quirk: host ROOT /agnesapi, param video_id (not under /v1)
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(
        "https://apihub.agnes-ai.com/agnesapi",
        expect.objectContaining({ params: { video_id: "task-9" }, timeout: 10000 }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("round-robins the second key on the next generation", async () => {
    mockConfig.AGNES_API_KEYS = "key-a,key-b";
    mockConfig.AGNES_API_BASE = "https://apihub.agnes-ai.com/v1";
    mockPost.mockResolvedValue({ data: { video_url: "https://cdn.agnes-ai.com/sync.mp4" } });

    const agnes = await getAgnes();
    await agnes.generate({ prompt: "first", duration: 5, aspectRatio: "16:9" });
    await agnes.generate({ prompt: "second", duration: 5, aspectRatio: "16:9" });

    expect(mockPost).toHaveBeenCalledTimes(2);
    const auths = mockPost.mock.calls.map((c) => (c[2] as { headers: { Authorization: string } }).headers.Authorization);
    expect(auths).toEqual(["Bearer key-a", "Bearer key-b"]);
  });

  it("throws ProviderError('Agnes: no task id') when the create response has no id", async () => {
    mockConfig.AGNES_API_KEYS = "key-a";
    mockPost.mockResolvedValue({ data: { status: "queued" } }); // neither sync url nor task id

    const agnes = await getAgnes();
    await expect(agnes.generate({ prompt: "a cat", duration: 3, aspectRatio: "1:1" })).rejects.toThrow(
      "Agnes: no task id",
    );
    expect(mockGet).not.toHaveBeenCalled(); // never started polling
  });

  it("throws ProviderError('Agnes: generation failed') when the poll reports failed", async () => {
    jest.useFakeTimers();
    try {
      mockConfig.AGNES_API_KEYS = "key-a";
      mockPost.mockResolvedValue({ data: { video_id: "task-9" } });
      mockGet.mockResolvedValue({ data: { status: "failed" } });

      const agnes = await getAgnes();
      const resP = agnes.generate({ prompt: "a cat", duration: 5, aspectRatio: "16:9" });
      // Subscribe to the rejection NOW: the poll reports "failed" and rejects resP
      // while jest.advanceTimersByTimeAsync is still unwinding, so a .rejects matcher
      // attached on the next line would be too late — jest fails the test on the
      // unhandled rejection (PromiseRejectionHandledWarning). An explicit .catch
      // routes the ProviderError into `caught` instead of the process handler.
      const caught = resP.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(5000); // first poll fires after POLL_INTERVAL
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Agnes: generation failed");
    } finally {
      jest.useRealTimers();
    }
  });
});
