import { describe, expect, it } from "@jest/globals";
import { PROVIDER_CONFIG, VIDEO_PROVIDERS_SORTED } from "@/config/providers";

/**
 * Contract: the Smart Provider Router scores providers from
 * `PROVIDER_CONFIG.video` (via ProviderSettingsService.getSortedVideoProviders()).
 * `agnes_video` must be registered there so Agnes participates in router
 * scoring (circuit breaker + history counters) instead of only being
 * reachable through the video-fallback safety-net tail.
 */
describe("PROVIDER_CONFIG.video — Agnes integration contract", () => {
  it("registers agnes_video in the router-scored video pool", () => {
    const agnes = PROVIDER_CONFIG.video.agnes_video;
    expect(agnes).toBeDefined();
    expect(agnes).toMatchObject({
      name: "Agnes Video",
      supportsImg2Video: false,
      maxDuration: 5,
      env: "AGNES_API_KEYS",
    });
    // Async polling provider — mirror did's timeout posture.
    expect(agnes?.timeout).toBeGreaterThanOrEqual(90000);
    expect(agnes?.recoveryTimeout).toBeGreaterThanOrEqual(120000);
  });

  it("orders agnes_video after did in VIDEO_PROVIDERS_SORTED", () => {
    const keys = VIDEO_PROVIDERS_SORTED.map((p) => p.key);
    expect(keys).toContain("agnes_video");
    expect(keys.indexOf("agnes_video")).toBeGreaterThan(keys.indexOf("did"));
  });
});
