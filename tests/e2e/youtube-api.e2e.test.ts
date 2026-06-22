/**
 * E2E tests for YouTube Dashboard API routes + Service integration.
 * Mocks Prisma since DB tables may not exist yet.
 */

// Mock Prisma before any imports
jest.mock("@/config/database", () => ({
  prisma: {
    ytChannel: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    ytPublishedVideo: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    ytIdea: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ytVideoMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    ytNicheCpmResearch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    ytQuarantineLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ytBreakoutCluster: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

let app: any;
let request: any;

beforeAll(async () => {
  const fastify = require("fastify")({ logger: false });
  const { youtubeDashboardRoutes } = require("@/routes/youtube/dashboard.route");
  await fastify.register(require("@fastify/view"), {
    engine: { ejs: require("ejs") },
    root: require("path").join(__dirname, "../../src/views"),
  });
  await fastify.register(youtubeDashboardRoutes);
  await fastify.ready();
  app = fastify;
  request = supertest(fastify.server);
});

afterAll(async () => {
  if (app) await app.close();
});

const supertest = require("supertest");

describe("YouTube Dashboard API E2E", () => {
  it("GET /youtube/dashboard returns 200 with HTML", async () => {
    const res = await request.get("/youtube/dashboard");
    expect(res.status).toBe(200);
    expect(res.text).toContain("YouTube Dashboard");
    expect(res.text).toContain("<table>");
    expect(res.text).toContain("Channel ID");
  });

  it("GET /youtube/channels/:id returns 404 for non-existent", async () => {
    const res = await request.get("/youtube/channels/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("GET /youtube/videos returns 200 with array", async () => {
    const res = await request.get("/youtube/videos");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("videos");
    expect(Array.isArray(res.body.videos)).toBe(true);
  });

  it("GET /youtube/reports returns 200 with stats", async () => {
    const res = await request.get("/youtube/reports");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalChannels");
    expect(res.body).toHaveProperty("totalPublished");
    expect(res.body).toHaveProperty("channels");
  });
});

describe("YouTube Service Integration", () => {
  it("config returns all getters with defaults", () => {
    const config = require("@/config/youtube.config");
    expect(config.getTier1Duration()).toBe(15);
    expect(config.getTier2Duration()).toBe(30);
    expect(config.getTier3Duration()).toBe(60);
    expect(config.getBreakoutCtrThreshold()).toBeCloseTo(0.08);
    expect(config.getRecoveryThreshold()).toBeCloseTo(0.80);
    expect(config.getDailyApiQuota()).toBe(10000);
    expect(config.getUsUploadTime()).toBe("15:00");
    expect(config.getIdUploadTime()).toBe("20:00");
    expect(config.getMaxUploadsPerDay()).toBe(2);
    expect(config.getProvenThemeRatio()).toBeCloseTo(0.70);
    expect(config.getMaxSimilarityScore()).toBeCloseTo(0.70);
    expect(config.getMinSampleRate()).toBe(44100);
    expect(config.getMinVideoWidth()).toBe(1920);
    expect(config.getMinThumbWidth()).toBe(1280);
    expect(config.getMaxTitleLength()).toBe(100);
    expect(config.getMinTags()).toBe(15);
    expect(config.getMaxTags()).toBe(30);
  });

  it("NICHE_VERTICALS has all expected niches", () => {
    const { NICHE_VERTICALS } = require("@/config/youtube.config");
    expect(Object.keys(NICHE_VERTICALS)).toEqual(
      expect.arrayContaining(["folklore_history", "music", "true_crime", "science_nature", "educational"])
    );
    expect(NICHE_VERTICALS.music.productionFormat).toBe("music_visualizer");
    expect(NICHE_VERTICALS.folklore_history.productionFormat).toBe("narrated_slideshow");
  });

  it("quality-gate validateSeo catches violations", () => {
    const { validateSeo } = require("@/services/youtube/quality-gate.service");
    const valid = validateSeo("Title", "A".repeat(200), Array.from({length: 20}, (_, i) => `t${i}`));
    expect(valid.failures).toHaveLength(0);

    const longTitle = validateSeo("A".repeat(101), "B".repeat(200), ["t1"]);
    expect(longTitle.failures.length).toBeGreaterThan(0);

    const fewTags = validateSeo("Title", "A".repeat(200), ["t1"]);
    expect(fewTags.warnings.some((w: string) => w.includes("Tags"))).toBe(true);
  });

  it("script-writer generates script with timestamps", async () => {
    const { generateScript } = require("@/services/youtube/script-writer.service");
    const result = await generateScript("Test story", "misteri", "tier_1_cold_start", "Test Title");
    expect(result.script).toBeTruthy();
    expect(result.script.length).toBeGreaterThan(50);
    expect(result.timestamps.length).toBeGreaterThanOrEqual(3);
    expect(result.timestamps[0].time).toBe("00:00");
    expect(result.timestamps[0].label).toBe("Hook");
    expect(result.durationEstimate).toBe(15 * 60);
  });

  it("seo-optimizer generates valid package", async () => {
    const { generateSeoPackage } = require("@/services/youtube/seo-optimizer.service");
    const result = await generateSeoPackage("RAHASIA MAJAPAHIT", "Sejarah kerajaan", "folklore_history");
    expect(result.title).toBeTruthy();
    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
    expect(result.tags.length).toBeLessThanOrEqual(30);
    expect(result.titleCandidates).toBeDefined();
    expect(result.ctrEstimate).toBeGreaterThan(0);
  });

  it("niche-research runs with mocked DB", async () => {
    const { runNicheCpmResearch } = require("@/services/youtube/niche-research.service");
    const result = await runNicheCpmResearch();
    expect(result).toBeTruthy();
    expect(result.researchDate).toBeTruthy();
    expect(result.cpmSnapshot).toBeTruthy();
    expect(Object.keys(result.cpmSnapshot).length).toBeGreaterThan(0);
    expect(result.nicheAnalysis.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]).toHaveProperty("nicheVertical");
    expect(result.recommendations[0]).toHaveProperty("targetCountry");
    expect(result.recommendations[0]).toHaveProperty("estimatedCpm");
  });

  it("quarantine eligibility check works with mocked DB", async () => {
    const { checkQuarantineEligibility } = require("@/services/youtube/quarantine.service");
    const result = await checkQuarantineEligibility("nonexistent");
    expect(result).toHaveProperty("eligible");
    expect(result.eligible).toBe(false);
  });

  it("triage-decision thresholds are configurable", () => {
    const config = require("@/config/youtube.config");
    expect(config.getTriageDeadMaxViews()).toBe(100);
    expect(config.getTriageDeadMaxCtr()).toBeCloseTo(0.02);
    expect(config.getTriageDeadMaxAvd()).toBeCloseTo(0.20);
    expect(config.getTriageGoodMinCtr()).toBeCloseTo(0.05);
    expect(config.getTriageGoodMinAvd()).toBeCloseTo(0.40);
  });

  it("circuit breaker thresholds are configurable", () => {
    const config = require("@/config/youtube.config");
    expect(config.getCircuitBreakerThreshold("voice")).toBe(5);
    expect(config.getCircuitBreakerThreshold("image")).toBe(10);
    expect(config.getCircuitBreakerThreshold("video")).toBe(3);
    expect(config.getCircuitBreakerThreshold("music")).toBe(5);
    expect(config.getCircuitBreakerResetMs("voice")).toBe(1800000);
  });
});
