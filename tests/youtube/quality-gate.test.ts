/**
 * Quality Gate Service Tests
 */

import { validateSeo, validateAudio, validateVideo, validateThumbnail, runQualityGate } from "@/services/youtube/quality-gate.service";

describe("Quality Gate Service", () => {
  describe("validateSeo", () => {
    it("should pass with valid SEO data", () => {
      const result = validateSeo(
        "RAHASIA GELAP MAJAPAHIT",
        "A".repeat(200),
        Array.from({ length: 20 }, (_, i) => `tag${i}`),
      );
      expect(result.failures).toHaveLength(0);
    });

    it("should fail when title exceeds max length", () => {
      const result = validateSeo("A".repeat(101), "B".repeat(200), ["tag1"]);
      expect(result.failures).toContainEqual(expect.stringContaining("Title"));
    });

    it("should warn when tags count is below minimum", () => {
      const result = validateSeo("Title", "A".repeat(200), ["tag1", "tag2"]);
      expect(result.warnings).toContainEqual(expect.stringContaining("Tags"));
    });

    it("should warn when description is too short", () => {
      const result = validateSeo("Title", "Short", ["tag1"]);
      expect(result.warnings).toContainEqual(expect.stringContaining("Description"));
    });
  });

  describe("runQualityGate", () => {
    it("should pass with valid SEO package and no files", async () => {
      const result = await runQualityGate({
        ideaId: "test-idea",
        channelId: "test-channel",
        nicheVertical: "folklore_history",
        productionFormat: "narrated_slideshow",
        finalVideoPath: "",
        thumbnailPath: "",
        seoPackage: {
          title: "Test Title",
          description: "A".repeat(200),
          tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
        },
      });
      expect(result.checks).toContain("seo");
    });

    it("should fail when SEO has blocking failures", async () => {
      const result = await runQualityGate({
        ideaId: "test-idea",
        channelId: "test-channel",
        nicheVertical: "folklore_history",
        productionFormat: "narrated_slideshow",
        finalVideoPath: "",
        thumbnailPath: "",
        seoPackage: {
          title: "A".repeat(101),
          description: "Short",
          tags: [],
        },
      });
      expect(result.blockingFailures.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });
});
