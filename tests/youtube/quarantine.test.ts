/**
 * Quarantine Service Tests
 */

import { checkQuarantineEligibility } from "@/services/youtube/quarantine.service";

// Mock Prisma
jest.mock("@/config/database", () => ({
  prisma: {
    ytChannel: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ytPublishedVideo: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ytVideoMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ytQuarantineLog: {
      create: jest.fn(),
    },
  },
}));

describe("Quarantine Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return not eligible for non-existent channel", async () => {
    const { prisma } = require("@/config/database");
    prisma.ytChannel.findUnique.mockResolvedValue(null);

    const result = await checkQuarantineEligibility("non-existent");
    expect(result.eligible).toBe(false);
  });

  it("should return not eligible for already quarantined channel", async () => {
    const { prisma } = require("@/config/database");
    prisma.ytChannel.findUnique.mockResolvedValue({
      channelId: "ch1",
      trafficStatus: "quarantine",
      channelAgeDays: 210,
    });

    const result = await checkQuarantineEligibility("ch1");
    expect(result.eligible).toBe(false);
  });

  it("should return not eligible for young channel", async () => {
    const { prisma } = require("@/config/database");
    prisma.ytChannel.findUnique.mockResolvedValue({
      channelId: "ch1",
      trafficStatus: "growing",
      channelAgeDays: 30,
    });
    prisma.ytPublishedVideo.findMany.mockResolvedValue([]);
    prisma.ytVideoMetrics.findMany.mockResolvedValue([]);

    const result = await checkQuarantineEligibility("ch1");
    expect(result.eligible).toBe(false);
  });

  it("should return eligible for old channel with traffic drop", async () => {
    const { prisma } = require("@/config/database");
    prisma.ytChannel.findUnique.mockResolvedValue({
      channelId: "ch1",
      trafficStatus: "growing",
      channelAgeDays: 210,
    });
    // Mock: recent views = 100, previous views = 500 → 80% drop
    prisma.ytPublishedVideo.findMany
      .mockResolvedValueOnce([{ videoId: "v1" }, { videoId: "v2" }])
      .mockResolvedValueOnce([{ videoId: "v3" }, { videoId: "v4" }]);
    prisma.ytVideoMetrics.findMany
      .mockResolvedValueOnce([{ views: 100 }])
      .mockResolvedValueOnce([{ views: 500 }]);

    const result = await checkQuarantineEligibility("ch1");
    expect(result.eligible).toBe(true);
    expect(result.trigger).toContain("scheduled");
  });
});
