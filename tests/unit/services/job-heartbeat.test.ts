/**
 * JobHeartbeatService unit tests
 *
 * Covers: beat/get round-trip, partial merge, clear, staleness
 * (missing heartbeat => Infinity), isStale threshold.
 */

const store = new Map<string, { value: string; ttl?: number }>();

jest.mock("@/config/redis", () => ({
  redis: {
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, { value });
      return "OK";
    }),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { JobHeartbeatService } from "@/services/job-heartbeat.service";

describe("JobHeartbeatService", () => {
  beforeEach(() => store.clear());

  it("beat + get round-trips stage and progress", async () => {
    await JobHeartbeatService.beat("VID-1", {
      stage: "started",
      progress: 0,
    });
    const hb = await JobHeartbeatService.get("VID-1");
    expect(hb).not.toBeNull();
    expect(hb!.stage).toBe("started");
    expect(hb!.progress).toBe(0);
    expect(hb!.updatedAt).toBeGreaterThan(0);
  });

  it("merges partial updates (progress preserved across stage beats)", async () => {
    await JobHeartbeatService.beat("VID-2", {
      stage: "processing",
      progress: 42,
      provider: "veo",
    });
    await JobHeartbeatService.beat("VID-2", { stage: "rendering" });
    const hb = await JobHeartbeatService.get("VID-2");
    expect(hb!.stage).toBe("rendering");
    expect(hb!.progress).toBe(42);
    expect(hb!.provider).toBe("veo");
  });

  it("clear removes the heartbeat", async () => {
    await JobHeartbeatService.beat("VID-3", {
      stage: "started",
      progress: 0,
    });
    await JobHeartbeatService.clear("VID-3");
    expect(await JobHeartbeatService.get("VID-3")).toBeNull();
  });

  it("stalenessMs is Infinity when no heartbeat exists", async () => {
    expect(await JobHeartbeatService.stalenessMs("VID-missing")).toBe(
      Infinity,
    );
    expect(await JobHeartbeatService.isStale("VID-missing", 1000)).toBe(true);
  });

  it("isStale respects the threshold", async () => {
    await JobHeartbeatService.beat("VID-4", {
      stage: "processing",
      progress: 10,
    });
    // Fresh beat => not stale for a 10-min window
    expect(await JobHeartbeatService.isStale("VID-4", 10 * 60 * 1000)).toBe(
      false,
    );
    // Zero threshold => stale immediately
    expect(await JobHeartbeatService.isStale("VID-4", 0, Date.now() + 1)).toBe(
      true,
    );
  });

  it("records failureReason on failure beats", async () => {
    await JobHeartbeatService.beat("VID-5", {
      stage: "failed",
      failureReason: "provider 429",
    });
    const hb = await JobHeartbeatService.get("VID-5");
    expect(hb!.stage).toBe("failed");
    expect(hb!.failureReason).toBe("provider 429");
  });
});
