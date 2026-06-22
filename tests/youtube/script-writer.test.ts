/**
 * Script Writer Service Tests
 */

import { generateScript } from "@/services/youtube/script-writer.service";

describe("Script Writer Service", () => {
  it("should generate script with timestamps", async () => {
    const result = await generateScript(
      "Cerita misteri kerajaan Majapahit",
      "misteri",
      "tier_1_cold_start",
      "RAHASIA MAJAPAHIT",
    );

    expect(result.script).toBeTruthy();
    expect(result.script.length).toBeGreaterThan(100);
    expect(result.timestamps.length).toBeGreaterThanOrEqual(3);
    expect(result.durationEstimate).toBeGreaterThan(0);
    expect(result.hookType).toBeTruthy();
    expect(result.toneVariant).toBe("misteri");
  });

  it("should have hook as first timestamp", async () => {
    const result = await generateScript(
      "Test summary",
      "horror",
      "tier_1_cold_start",
      "Test Title",
    );

    expect(result.timestamps[0].time).toBe("00:00");
    expect(result.timestamps[0].label).toBe("Hook");
  });

  it("should generate longer scripts for higher tiers", async () => {
    const tier1 = await generateScript("Test", "misteri", "tier_1_cold_start", "Title");
    const tier3 = await generateScript("Test", "misteri", "tier_3_established", "Title");

    expect(tier3.durationEstimate).toBeGreaterThan(tier1.durationEstimate);
  });

  it("should include CTA in final segment", async () => {
    const result = await generateScript(
      "Test",
      "heroik",
      "tier_1_cold_start",
      "Title",
    );

    const lastSegment = result.timestamps[result.timestamps.length - 1];
    expect(lastSegment.label).toContain("CTA");
  });
});
