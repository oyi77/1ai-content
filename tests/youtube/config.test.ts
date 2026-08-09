/**
 * YouTube Config Tests
 *
 * Verifies all config getters return values from env with defaults.
 */

describe("YouTube Config", () => {
  it("should export all config getters", () => {
    const config = require("@/config/youtube.config");
    expect(typeof config.getTier1Duration).toBe("function");
    expect(typeof config.getTier2Duration).toBe("function");
    expect(typeof config.getTier3Duration).toBe("function");
    expect(typeof config.getQuarantineTriggerAgeDays).toBe("function");
    expect(typeof config.getTrafficDropThreshold).toBe("function");
    expect(typeof config.getRecoveryThreshold).toBe("function");
    expect(typeof config.getMinSampleRate).toBe("function");
    expect(typeof config.getMinVideoWidth).toBe("function");
    expect(typeof config.getMinVideoHeight).toBe("function");
    expect(typeof config.getMaxVideoFileSizeMb).toBe("function");
    expect(typeof config.getMinThumbWidth).toBe("function");
    expect(typeof config.getMinThumbHeight).toBe("function");
    expect(typeof config.getMaxTitleLength).toBe("function");
    expect(typeof config.getMinTags).toBe("function");
    expect(typeof config.getMaxTags).toBe("function");
  });

  it("should return sensible defaults", () => {
    const config = require("@/config/youtube.config");
    expect(config.getTier1Duration()).toBe(15);
    expect(config.getTier2Duration()).toBe(30);
    expect(config.getTier3Duration()).toBe(60);
    expect(config.getQuarantineTriggerAgeDays()).toEqual([200, 230]);
    expect(config.getTrafficDropThreshold()).toBeCloseTo(0.4);
    expect(config.getRecoveryThreshold()).toBeCloseTo(0.8);
    expect(config.getMinSampleRate()).toBe(44100);
    expect(config.getMinVideoWidth()).toBe(1920);
    expect(config.getMinVideoHeight()).toBe(1080);
    expect(config.getMaxVideoFileSizeMb()).toBe(2048);
    expect(config.getMinThumbWidth()).toBe(1280);
    expect(config.getMinThumbHeight()).toBe(720);
    expect(config.getMaxTitleLength()).toBe(100);
    expect(config.getMinTags()).toBe(15);
    expect(config.getMaxTags()).toBe(30);
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
