/**
 * YouTube Config Tests
 *
 * Verifies all config getters return values from env with defaults.
 */

describe("YouTube Config", () => {
  it("should export all config getters", () => {
    const config = require("@/config/youtube.config");
    expect(typeof config.getUsUploadTime).toBe("function");
    expect(typeof config.getIdUploadTime).toBe("function");
    expect(typeof config.getMaxUploadsPerDay).toBe("function");
    expect(typeof config.getTier1Duration).toBe("function");
    expect(typeof config.getTier2Duration).toBe("function");
    expect(typeof config.getTier3Duration).toBe("function");
    expect(typeof config.getBreakoutViewsMultiplier).toBe("function");
    expect(typeof config.getBreakoutCtrThreshold).toBe("function");
    expect(typeof config.getBreakoutAvdThreshold).toBe("function");
    expect(typeof config.getTriageDeadMaxViews).toBe("function");
    expect(typeof config.getTriageGoodMinCtr).toBe("function");
    expect(typeof config.getRecoveryThreshold).toBe("function");
    expect(typeof config.getProvenThemeRatio).toBe("function");
    expect(typeof config.getDailyApiQuota).toBe("function");
    expect(typeof config.getMinSampleRate).toBe("function");
    expect(typeof config.getMinVideoWidth).toBe("function");
    expect(typeof config.getMaxTitleLength).toBe("function");
    expect(typeof config.getMaxSimilarityScore).toBe("function");
  });

  it("should return sensible defaults", () => {
    const config = require("@/config/youtube.config");
    expect(config.getTier1Duration()).toBe(15);
    expect(config.getTier2Duration()).toBe(30);
    expect(config.getTier3Duration()).toBe(60);
    expect(config.getBreakoutCtrThreshold()).toBeCloseTo(0.08);
    expect(config.getRecoveryThreshold()).toBeCloseTo(0.80);
    expect(config.getDailyApiQuota()).toBe(10000);
    expect(config.getMinSampleRate()).toBe(44100);
    expect(config.getMinVideoWidth()).toBe(1920);
    expect(config.getMaxTitleLength()).toBe(100);
  });

  it("should have NICHE_VERTICALS", () => {
    const { NICHE_VERTICALS } = require("@/config/youtube.config");
    expect(NICHE_VERTICALS).toBeDefined();
    expect(NICHE_VERTICALS.folklore_history).toBeDefined();
    expect(NICHE_VERTICALS.music).toBeDefined();
    expect(NICHE_VERTICALS.true_crime).toBeDefined();
    expect(NICHE_VERTICALS.music.productionFormat).toBe("music_visualizer");
    expect(NICHE_VERTICALS.folklore_history.productionFormat).toBe("narrated_slideshow");
  });
});
