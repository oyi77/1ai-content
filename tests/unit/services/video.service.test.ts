/**
 * Unit Tests — VideoService
 *
 * Comprehensive test coverage for all VideoService methods including:
 * - CRUD operations (createJob, getByJobId, updateProgress, setOutput, updateStatus, deleteVideo)
 * - Query methods (getUserVideos, getNiches, getPlatforms, getStoryboardTemplate)
 * - Generation methods (generatePrompt, generateScenePrompt, generateCaption, generateStoryboard)
 * - Processing methods (processJob)
 * - Edge cases (job not found, provider failures, invalid data)
 */

import { VideoService } from "@/services/video.service";
import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import { processVideoJob } from "@/services/video-generation.service";
import { getVideoCreditCost } from "@/config/pricing";
import { getAILabel } from "@/config/languages";

// ── Mocks ──

jest.mock("@/config/database", () => ({
  prisma: {
    video: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/config/env", () => {
  const config: Record<string, unknown> = {
    GEMINI_API_KEY: "test-key",
  };
  return {
    getConfig: () => config,
  };
});

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/services/video-generation.service", () => ({
  processVideoJob: jest.fn(),
}));

jest.mock("@/config/pricing", () => ({
  getVideoCreditCost: jest.fn(),
}));

jest.mock("@/config/languages", () => ({
  getAILabel: jest.fn(),
}));

// ── Test Data ──

const mockVideo = {
  id: BigInt(1),
  userId: BigInt(123),
  jobId: "VID-1234567890-123-abc123",
  title: "Test Video",
  niche: "fnb",
  platform: "tiktok",
  duration: 30,
  scenes: 5,
  status: "processing",
  progress: 0,
  creditsUsed: 1.0,
  videoUrl: null,
  thumbnailUrl: null,
  downloadUrl: null,
  errorMessage: null,
  completedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("VideoService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createJob ──

  describe("createJob()", () => {
    it("should create a video job with correct parameters", async () => {
      (getVideoCreditCost as jest.Mock).mockReturnValue(1.0);
      (prisma.video.create as jest.Mock).mockResolvedValue(mockVideo);

      const params = {
        userId: BigInt(123),
        niche: "fnb",
        platform: "tiktok",
        duration: 30,
        scenes: 5,
        title: "Test Video",
      };

      const result = await VideoService.createJob(params);

      expect(getVideoCreditCost).toHaveBeenCalledWith(30);
      expect(prisma.video.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: BigInt(123),
          niche: "fnb",
          platform: "tiktok",
          duration: 30,
          scenes: 5,
          title: "Test Video",
          status: "processing",
          progress: 0,
          creditsUsed: 1.0,
        }),
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Created video job:"),
      );
      expect(result).toEqual(mockVideo);
    });

    it("should generate default title when not provided", async () => {
      (getVideoCreditCost as jest.Mock).mockReturnValue(1.0);
      (prisma.video.create as jest.Mock).mockResolvedValue(mockVideo);

      const params = {
        userId: BigInt(123),
        niche: "fnb",
        platform: "tiktok",
        duration: 30,
        scenes: 5,
      };

      await VideoService.createJob(params);

      expect(prisma.video.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: expect.stringContaining("Video"),
        }),
      });
    });

    it("should generate unique job ID", async () => {
      (getVideoCreditCost as jest.Mock).mockReturnValue(1.0);
      (prisma.video.create as jest.Mock).mockResolvedValue(mockVideo);

      const params = {
        userId: BigInt(123),
        niche: "fnb",
        platform: "tiktok",
        duration: 30,
        scenes: 5,
      };

      await VideoService.createJob(params);

      expect(prisma.video.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobId: expect.stringMatching(/^VID-\d+-123-[a-z0-9]+$/),
        }),
      });
    });
  });

  // ── updateProgress ──

  describe("updateProgress()", () => {
    it("should update progress without status", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        progress: 50,
      });

      const result = await VideoService.updateProgress("VID-123", 50);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: {
          progress: 50,
          status: undefined,
          completedAt: undefined,
        },
      });
      expect(result.progress).toBe(50);
    });

    it("should update progress with status", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        progress: 75,
        status: "rendering",
      });

      await VideoService.updateProgress("VID-123", 75, "rendering");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: {
          progress: 75,
          status: "rendering",
          completedAt: undefined,
        },
      });
    });

    it("should set completedAt when status is completed", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        progress: 100,
        status: "completed",
      });

      await VideoService.updateProgress("VID-123", 100, "completed");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: {
          progress: 100,
          status: "completed",
          completedAt: expect.any(Date),
        },
      });
    });
  });

  // ── setOutput ──

  describe("setOutput()", () => {
    it("should set video output URLs and mark as completed", async () => {
      const updatedVideo = {
        ...mockVideo,
        videoUrl: "https://cdn.example.com/video.mp4",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        downloadUrl: "https://cdn.example.com/download.mp4",
        status: "completed",
        progress: 100,
      };
      (prisma.video.update as jest.Mock).mockResolvedValue(updatedVideo);

      const urls = {
        videoUrl: "https://cdn.example.com/video.mp4",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        downloadUrl: "https://cdn.example.com/download.mp4",
      };

      const result = await VideoService.setOutput("VID-123", urls);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: expect.objectContaining({
          videoUrl: "https://cdn.example.com/video.mp4",
          thumbnailUrl: "https://cdn.example.com/thumb.jpg",
          downloadUrl: "https://cdn.example.com/download.mp4",
          status: "completed",
          progress: 100,
          completedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe("completed");
    });

    it("should handle partial URLs", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue(mockVideo);

      await VideoService.setOutput("VID-123", {
        videoUrl: "https://cdn.example.com/video.mp4",
      });

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: expect.objectContaining({
          videoUrl: "https://cdn.example.com/video.mp4",
          status: "completed",
          progress: 100,
        }),
      });
    });
  });

  // ── updateStatus ──

  describe("updateStatus()", () => {
    it("should update status without error message", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        status: "rendering",
      });

      await VideoService.updateStatus("VID-123", "rendering");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: {
          status: "rendering",
          errorMessage: undefined,
        },
      });
    });

    it("should update status with error message", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        status: "failed",
        errorMessage: "Provider error",
      });

      await VideoService.updateStatus("VID-123", "failed", "Provider error");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: {
          status: "failed",
          errorMessage: "Provider error",
        },
      });
    });

    it("should set completedAt and progress to 100 when status is completed", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        status: "completed",
      });

      await VideoService.updateStatus("VID-123", "completed");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
          progress: 100,
        }),
      });
    });
  });

  // ── getByJobId ──

  describe("getByJobId()", () => {
    it("should return video when found", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(mockVideo);

      const result = await VideoService.getByJobId("VID-123");

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
      });
      expect(result).toEqual(mockVideo);
    });

    it("should return null when video not found", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await VideoService.getByJobId("VID-NONEXISTENT");

      expect(result).toBeNull();
    });
  });

  // ── deleteVideo ──

  describe("deleteVideo()", () => {
    it("should soft delete video by setting status to deleted", async () => {
      (prisma.video.update as jest.Mock).mockResolvedValue({
        ...mockVideo,
        status: "deleted",
      });

      await VideoService.deleteVideo("VID-123");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: { status: "deleted" },
      });
      expect(logger.info).toHaveBeenCalledWith("Soft-deleted video: VID-123");
    });
  });

  // ── getUserVideos ──

  describe("getUserVideos()", () => {
    it("should return user videos with default limit", async () => {
      const videos = [mockVideo, { ...mockVideo, id: BigInt(2) }];
      (prisma.video.findMany as jest.Mock).mockResolvedValue(videos);

      const result = await VideoService.getUserVideos(BigInt(123));

      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          userId: BigInt(123),
          status: { not: "deleted" },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 0,
      });
      expect(result).toHaveLength(2);
    });

    it("should respect custom limit", async () => {
      (prisma.video.findMany as jest.Mock).mockResolvedValue([mockVideo]);

      await VideoService.getUserVideos(BigInt(123), 5);

      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          userId: BigInt(123),
          status: { not: "deleted" },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        skip: 0,
      });
    });

    it("should exclude deleted videos", async () => {
      (prisma.video.findMany as jest.Mock).mockResolvedValue([]);

      await VideoService.getUserVideos(BigInt(123));

      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { not: "deleted" },
        }),
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 0,
      });
    });
  });

  // ── generatePrompt ──

  describe("generatePrompt()", () => {
    it("should generate prompt for known niche and platform", () => {
      const result = VideoService.generatePrompt({
        niche: "fnb",
        platform: "tiktok",
        duration: 30,
        productDescription: "Delicious burger",
      });

      expect(result).toContain("30-second");
      expect(result).toContain("F&B");
      expect(result).toContain("tiktok");
      expect(result).toContain("9:16");
      expect(result).toContain("Delicious burger");
    });

    it("should generate prompt without product description", () => {
      const result = VideoService.generatePrompt({
        niche: "product",
        platform: "instagram",
        duration: 15,
      });

      expect(result).toContain("15-second");
      expect(result).toContain("Product");
      expect(result).not.toContain("Product:");
    });

    it("should handle unknown niche gracefully", () => {
      const result = VideoService.generatePrompt({
        niche: "unknown",
        platform: "tiktok",
        duration: 30,
      });

      expect(result).toContain("general");
      expect(result).toContain("professional");
    });

    it("should handle unknown platform gracefully", () => {
      const result = VideoService.generatePrompt({
        niche: "fnb",
        platform: "unknown",
        duration: 30,
      });

      expect(result).toContain("9:16"); // default aspect ratio
    });
  });

  // ── getCreditCost ──

  describe("getCreditCost()", () => {
    it("should return credit cost for duration", () => {
      (getVideoCreditCost as jest.Mock).mockReturnValue(1.0);

      const result = VideoService.getCreditCost(30);

      expect(getVideoCreditCost).toHaveBeenCalledWith(30);
      expect(result).toBe(1.0);
    });

    it("should handle different durations", () => {
      (getVideoCreditCost as jest.Mock).mockReturnValue(0.5);

      const result = VideoService.getCreditCost(15);

      expect(getVideoCreditCost).toHaveBeenCalledWith(15);
      expect(result).toBe(0.5);
    });
  });

  // ── getNiches ──

  describe("getNiches()", () => {
    it("should return all available niches", () => {
      const result = VideoService.getNiches();

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "fnb",
            name: expect.stringContaining("F&B"),
          }),
          expect.objectContaining({
            id: "realestate",
            name: expect.stringContaining("Real Estate"),
          }),
          expect.objectContaining({
            id: "product",
            name: expect.stringContaining("Product"),
          }),
          expect.objectContaining({
            id: "car",
            name: expect.stringContaining("Car"),
          }),
          expect.objectContaining({
            id: "beauty",
            name: expect.stringContaining("Beauty"),
          }),
          expect.objectContaining({
            id: "services",
            name: expect.stringContaining("Services"),
          }),
        ]),
      );
    });

    it("should return array with id and name properties", () => {
      const result = VideoService.getNiches();

      result.forEach((niche) => {
        expect(niche).toHaveProperty("id");
        expect(niche).toHaveProperty("name");
        expect(typeof niche.id).toBe("string");
        expect(typeof niche.name).toBe("string");
      });
    });
  });

  // ── getPlatforms ──

  describe("getPlatforms()", () => {
    it("should return all available platforms", () => {
      const result = VideoService.getPlatforms();

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "tiktok", aspectRatio: "9:16" }),
          expect.objectContaining({ id: "instagram", aspectRatio: "9:16" }),
          expect.objectContaining({ id: "youtube", aspectRatio: "9:16" }),
          expect.objectContaining({ id: "facebook", aspectRatio: "4:5" }),
          expect.objectContaining({ id: "twitter", aspectRatio: "1:1" }),
        ]),
      );
    });

    it("should include resolution and maxDuration", () => {
      const result = VideoService.getPlatforms();

      result.forEach((platform) => {
        expect(platform).toHaveProperty("id");
        expect(platform).toHaveProperty("aspectRatio");
        expect(platform).toHaveProperty("resolution");
        expect(platform).toHaveProperty("maxDuration");
      });
    });
  });

  // ── generateStoryboard ──

  describe("generateStoryboard()", () => {
    it("should generate storyboard for known niche", async () => {
      const result = await VideoService.generateStoryboard({
        niche: "fnb",
        duration: 15,
        productDescription: "Delicious burger",
      });

      expect(result).toHaveProperty("scenes");
      expect(result).toHaveProperty("totalDuration");
      expect(result).toHaveProperty("caption");
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.totalDuration).toBeLessThanOrEqual(15);
    });

    it("should use custom scenes when provided", async () => {
      const customScenes = [
        { scene: 1, duration: 5, type: "hook", description: "Custom hook" },
        {
          scene: 2,
          duration: 5,
          type: "content",
          description: "Custom content",
        },
      ];

      const result = await VideoService.generateStoryboard({
        niche: "fnb",
        duration: 10,
        customScenes,
      });

      expect(result.scenes[0].description).toBe("Custom hook");
      expect(result.scenes[1].description).toBe("Custom content");
    });

    it("should limit scenes based on duration", async () => {
      const result = await VideoService.generateStoryboard({
        niche: "realestate",
        duration: 10, // Only 2 scenes at 5s each
      });

      expect(result.scenes.length).toBeLessThanOrEqual(2);
    });

    it("should generate scene prompts", async () => {
      const result = await VideoService.generateStoryboard({
        niche: "product",
        duration: 15,
      });

      result.scenes.forEach((scene) => {
        expect(scene).toHaveProperty("prompt");
        expect(typeof scene.prompt).toBe("string");
        expect(scene.prompt.length).toBeGreaterThan(0);
      });
    });

    it("should handle unknown niche", async () => {
      const result = await VideoService.generateStoryboard({
        niche: "unknown",
        duration: 15,
      });

      expect(result).toHaveProperty("scenes");
      expect(result).toHaveProperty("caption");
    });
  });

  // ── generateScenePrompt ──

  describe("generateScenePrompt()", () => {
    it("should generate scene prompt with niche style", () => {
      const result = VideoService.generateScenePrompt({
        niche: "fnb",
        sceneType: "hook",
        description: "Close-up of burger",
      });

      expect(result).toContain("Close-up of burger");
      expect(result).toContain("appetizing");
      expect(result).toContain("cinematic");
      expect(result).toContain("4K");
    });

    it("should include product description when provided", () => {
      const result = VideoService.generateScenePrompt({
        niche: "product",
        sceneType: "features",
        description: "Product showcase",
        productDescription: "Premium smartphone",
      });

      expect(result).toContain("Product showcase");
      expect(result).toContain("Premium smartphone");
    });

    it("should use default style for unknown niche", () => {
      const result = VideoService.generateScenePrompt({
        niche: "unknown",
        sceneType: "hook",
        description: "Test scene",
      });

      expect(result).toContain("professional");
    });
  });

  // ── generateCaption ──

  describe("generateCaption()", () => {
    it("should generate Indonesian caption for fnb niche", async () => {
      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "id",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate English caption for fnb niche", async () => {
      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "en",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should prepend product description when provided", async () => {
      const result = await VideoService.generateCaption({
        niche: "product",
        productDescription: "Amazing product",
        sceneCount: 4,
        language: "en",
      });

      expect(result).toContain("Amazing product");
    });

    it("should fallback to services captions for unknown niche", async () => {
      const result = await VideoService.generateCaption({
        niche: "unknown_niche",
        sceneCount: 4,
        language: "en",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should call Gemini API for non-id/en languages", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: "Generated Thai caption" }] } },
            ],
          }),
      });
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "th",
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toContain("Generated Thai caption");
    });

    it("should prepend product description when Gemini succeeds", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: "Generated Thai caption" }] } },
            ],
          }),
      });
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        productDescription: "Delicious burger",
        sceneCount: 4,
        language: "th",
      });

      expect(result).toContain("Delicious burger");
      expect(result).toContain("Generated Thai caption");
    });

    it("should fallback to English when Gemini API fails", async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error("API Error"));
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "th",
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Gemini caption generation failed"),
      );
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should fallback to English with product description when Gemini fails", async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error("API Error"));
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        productDescription: "Tasty food",
        sceneCount: 4,
        language: "th",
      });

      expect(result).toContain("Tasty food");
      expect(typeof result).toBe("string");
    });

    it("should fallback to services captions for unknown niche when Gemini fails", async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error("API Error"));
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "unknown_niche",
        sceneCount: 4,
        language: "th",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should fallback to English when Gemini API returns non-ok response", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "th",
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Gemini caption generation failed"),
      );
      expect(typeof result).toBe("string");
    });

    it("should fallback to English when Gemini API returns empty response", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      });
      global.fetch = mockFetch;
      process.env.GEMINI_API_KEY = "test-key";
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "th",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should fallback to English when GEMINI_API_KEY is not configured", async () => {
      delete process.env.GEMINI_API_KEY;
      (getAILabel as jest.Mock).mockReturnValue("Thai");

      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
        language: "th",
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should default to Indonesian when language not specified", async () => {
      const result = await VideoService.generateCaption({
        niche: "fnb",
        sceneCount: 4,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ── getStoryboardTemplate ──

  describe("getStoryboardTemplate()", () => {
    it("should return storyboard template for known niche", () => {
      const result = VideoService.getStoryboardTemplate("fnb");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("scene");
      expect(result[0]).toHaveProperty("duration");
      expect(result[0]).toHaveProperty("type");
      expect(result[0]).toHaveProperty("description");
    });

    it("should return empty array for unknown niche", () => {
      const result = VideoService.getStoryboardTemplate("unknown");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should return templates for all known niches", () => {
      const niches = [
        "fnb",
        "realestate",
        "product",
        "car",
        "beauty",
        "services",
      ];

      niches.forEach((niche) => {
        const result = VideoService.getStoryboardTemplate(niche);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  // ── updateStoryboardTemplate ──

  describe("updateStoryboardTemplate()", () => {
    it("should update storyboard template for known niche", () => {
      const newScenes = [
        { scene: 1, duration: 5, type: "intro", description: "New intro" },
        { scene: 2, duration: 5, type: "outro", description: "New outro" },
      ];

      const result = VideoService.updateStoryboardTemplate("fnb", newScenes);

      expect(result).toBe(true);
      // Verify the template was updated
      const template = VideoService.getStoryboardTemplate("fnb");
      expect(template[0].description).toBe("New intro");
    });

    it("should return true even for unknown niche", () => {
      const newScenes = [
        { scene: 1, duration: 5, type: "test", description: "Test" },
      ];

      const result = VideoService.updateStoryboardTemplate(
        "unknown",
        newScenes,
      );

      expect(result).toBe(true);
    });
  });

  // ── processJob ──

  describe("processJob()", () => {
    it("should process job successfully", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(mockVideo);
      (prisma.video.update as jest.Mock).mockResolvedValue(mockVideo);
      (processVideoJob as jest.Mock).mockResolvedValue({
        success: true,
        videoUrl: "https://cdn.example.com/video.mp4",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        provider: "geminigen",
      });

      await VideoService.processJob("VID-123");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: { status: "processing", progress: 10 },
      });
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: expect.objectContaining({
          status: "completed",
          progress: 100,
          videoUrl: "https://cdn.example.com/video.mp4",
          thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        }),
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Video job completed"),
      );
    });

    it("should handle job not found", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(null);

      await VideoService.processJob("VID-NONEXISTENT");

      expect(logger.error).toHaveBeenCalledWith(
        "Video job not found: VID-NONEXISTENT",
      );
      expect(prisma.video.update).not.toHaveBeenCalled();
    });

    it("should handle provider failure", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(mockVideo);
      (prisma.video.update as jest.Mock).mockResolvedValue(mockVideo);
      (processVideoJob as jest.Mock).mockResolvedValue({
        success: false,
        error: "Provider API error",
      });

      await VideoService.processJob("VID-123");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: { status: "failed", errorMessage: "Provider API error" },
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Video job failed"),
      );
    });

    it("should handle unexpected errors", async () => {
      (prisma.video.findUnique as jest.Mock).mockResolvedValue(mockVideo);
      (prisma.video.update as jest.Mock).mockResolvedValue(mockVideo);
      (processVideoJob as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await VideoService.processJob("VID-123");

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { jobId: "VID-123" },
        data: { status: "failed", errorMessage: "Unexpected error" },
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Video job error: VID-123",
        expect.any(Error),
      );
    });
  });
});
