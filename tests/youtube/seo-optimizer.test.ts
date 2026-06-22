/**
 * SEO Optimizer Service Tests
 */

import { generateSeoPackage } from "@/services/youtube/seo-optimizer.service";

describe("SEO Optimizer Service", () => {
  it("should generate valid SEO package", async () => {
    const result = await generateSeoPackage(
      "RAHASIA GELAP MAJAPAHIT",
      "Cerita misteri tentang kerajaan Majapahit",
      "folklore_history",
    );

    expect(result.title).toBeTruthy();
    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.description.length).toBeGreaterThanOrEqual(100);
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
    expect(result.tags.length).toBeLessThanOrEqual(30);
  });

  it("should generate title candidates", async () => {
    const result = await generateSeoPackage(
      "Misteri Kerajaan Majapahit",
      "Sejarah",
      "folklore_history",
    );

    expect(result.titleCandidates).toBeDefined();
    expect(result.titleCandidates!.length).toBeGreaterThanOrEqual(1);
  });

  it("should estimate CTR for trigger words", async () => {
    const result = await generateSeoPackage(
      "RAHASIA TERSEMBUNYI MAJAPAHIT",
      "Cerita",
      "folklore_history",
    );

    expect(result.ctrEstimate).toBeDefined();
    expect(result.ctrEstimate!).toBeGreaterThan(0.03);
  });

  it("should respect max title length", async () => {
    const result = await generateSeoPackage(
      "A".repeat(200),
      "Description",
      "music",
    );

    expect(result.title.length).toBeLessThanOrEqual(100);
  });

  it("should handle music niche", async () => {
    const result = await generateSeoPackage(
      "Lofi Hip Hop Study Beats",
      "Chill music for studying",
      "music",
    );

    expect(result.tags).toContainEqual(expect.stringMatching(/music|lofi|chill/i));
  });
});
