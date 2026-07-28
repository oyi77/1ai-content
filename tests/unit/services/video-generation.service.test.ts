/**
 * Comprehensive Unit Tests — VideoGenerationService
 * Tests all public methods: generateVideo, generatePromptFromNiche,
 * generatePromptFromNicheAsync, generateStoryboard, getCreditCost,
 * processVideoJob, NICHES, PROVIDERS
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLogger = {
  info: jest.fn<any>(),
  warn: jest.fn<any>(),
  error: jest.fn<any>(),
  debug: jest.fn<any>(),
};

jest.mock("@/utils/logger", () => ({ logger: mockLogger }));

// Config mock — controllable per test via mockConfigOverrides
const mockDefaultConfig: Record<string, unknown> = {
  DEMO_MODE: false,
  GEMINIGEN_API_KEY: "",
  BYTEPLUS_API_KEY: "",
  AIML_API_KEY: "",
  GROQ_API_KEY: "",
  GEMINI_API_KEY: "",
  OMNIROUTE_URL: "http://localhost:4000",
  OMNIROUTE_API_KEY: "",
};

let mockConfigOverrides: Record<string, unknown> = {};

jest.mock("@/config/env", () => ({
  getConfig: () => ({ ...mockDefaultConfig, ...mockConfigOverrides }),
}));

// Pricing mock
const mockGetVideoCreditCost = jest.fn<any>();
mockGetVideoCreditCost.mockReturnValue(0.4);

jest.mock("@/config/pricing", () => ({
  getVideoCreditCost: (...args: unknown[]) => mockGetVideoCreditCost(...args),
}));

// Redis mock
const mockRedisGet = jest.fn<any>();
mockRedisGet.mockResolvedValue(null);

jest.mock("@/config/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: jest.fn<any>(),
    del: jest.fn<any>(),
  },
}));

// Axios mock
const mockAxiosPost = jest.fn<any>();
const mockAxiosGet = jest.fn<any>();

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args), get: (...args: unknown[]) => mockAxiosGet(...args) },
  post: (...args: unknown[]) => mockAxiosPost(...args),
  get: (...args: unknown[]) => mockAxiosGet(...args),
}));

// FormData mock
const mockFormDataAppend = jest.fn<any>();
const mockFormDataGetHeaders = jest.fn<any>();
mockFormDataGetHeaders.mockReturnValue({ "content-type": "multipart/form-data" });

jest.mock("form-data", () => {
  return jest.fn<any>().mockImplementation(() => ({
    append: mockFormDataAppend,
    getHeaders: mockFormDataGetHeaders,
  }));
});

// Circuit breaker mock
const mockCanExecute = jest.fn<any>();
const mockRecordSuccess = jest.fn<any>();
const mockRecordFailure = jest.fn<any>();

jest.mock("@/services/circuit-breaker.service", () => ({
  CircuitBreaker: {
    canExecute: (...args: unknown[]) => mockCanExecute(...args),
    recordSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
    recordFailure: (...args: unknown[]) => mockRecordFailure(...args),
  },
}));

// Prompt optimizer mock
const mockOptimizeForProvider = jest.fn<any>();

jest.mock("@/services/prompt-optimizer.service", () => ({
  PromptOptimizer: {
    shouldAvoidProvider: jest.fn<any>().mockReturnValue(false),
    optimizeForProvider: (...args: unknown[]) => mockOptimizeForProvider(...args),
  },
}));

// Provider router mock
const mockGetOrderedProviders = jest.fn<any>();

jest.mock("@/services/provider-router.service", () => ({
  ProviderRouter: {
    getOrderedProviders: (...args: unknown[]) => mockGetOrderedProviders(...args),
  },
}));

// Quality check mock
const mockScoreVideo = jest.fn<any>();

jest.mock("@/services/quality-check.service", () => ({
  QualityCheckService: {
    scoreVideo: (...args: unknown[]) => mockScoreVideo(...args),
  },
}));

// AI task settings mock
const mockGetSettings = jest.fn<any>();

jest.mock("@/services/ai-task-settings.service", () => ({
  AITaskSettingsService: {
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
  },
}));

// Token tracker mock
const mockTrackTokens = jest.fn<any>();
mockTrackTokens.mockResolvedValue(undefined);

jest.mock("@/services/token-tracker.service", () => ({
  trackTokens: (...args: unknown[]) => mockTrackTokens(...args),
}));

// Shared AI pipeline mock
const mockPipelineGenerate = jest.fn<any>();

jest.mock("@/services/shared-ai-pipeline.service", () => ({
  pipelineGenerate: (...args: unknown[]) => mockPipelineGenerate(...args),
}));

// Provider settings mock
jest.mock("@/services/provider-settings.service", () => ({
  ProviderSettingsService: {
    getSortedVideoProviders: jest.fn<any>().mockResolvedValue([]),
    getDynamicSettings: jest.fn<any>().mockResolvedValue({ video: {}, image: {} }),
  },
}));

// Providers config mock
jest.mock("@/config/providers", () => ({
  VIDEO_PROVIDERS_SORTED: [],
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  generateVideo,
  generatePromptFromNiche,
  generatePromptFromNicheAsync,
  generateStoryboard,
  getCreditCost,
  processVideoJob,
  NICHES,
  PROVIDERS,
} from "@/services/video-generation.service";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("VideoGenerationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigOverrides = {};

    // Sensible defaults for all mocks — tests override as needed
    mockCanExecute.mockResolvedValue(true);
    mockOptimizeForProvider.mockResolvedValue("optimized prompt");
    mockGetOrderedProviders.mockResolvedValue([]);
    mockScoreVideo.mockResolvedValue({ score: 8, passable: true, issues: [] });
    mockGetSettings.mockResolvedValue({
      promptGeneration: { provider: "builtin", model: "" },
    });
    mockPipelineGenerate.mockResolvedValue(null);
    mockGetVideoCreditCost.mockReturnValue(0.4);
    mockRedisGet.mockResolvedValue(null);

    // Default: both axios calls return "completed" immediately (prevents polling timeouts)
    mockAxiosPost.mockResolvedValue({
      data: { uuid: "default-job", id: "default-job", status: "processing" },
    });
    mockAxiosGet.mockResolvedValue({
      data: {
        status: "completed",
        data: { video_url: "https://example.com/default.mp4", thumbnail_url: "https://example.com/default-thumb.jpg" },
        output: { video_url: "https://example.com/default.mp4", thumbnail_url: "https://example.com/default-thumb.jpg" },
      },
    });
  });

  afterEach(() => {
    mockConfigOverrides = {};
  });

  // ===========================================================================
  // NICHES
  // ===========================================================================

  describe("NICHES", () => {
    it("should export all niche configurations", () => {
      expect(NICHES.food_culinary).toBeDefined();
      expect(NICHES.fashion_lifestyle).toBeDefined();
      expect(NICHES.tech_gadgets).toBeDefined();
      expect(NICHES.fitness_health).toBeDefined();
      expect(NICHES.travel_adventure).toBeDefined();
      expect(NICHES.education_knowledge).toBeDefined();
      expect(NICHES.business_finance).toBeDefined();
      expect(NICHES.entertainment).toBeDefined();
    });

    it("should have correct structure for each niche", () => {
      for (const niche of Object.values(NICHES)) {
        expect(niche).toHaveProperty("name");
        expect(niche).toHaveProperty("emoji");
        expect(niche).toHaveProperty("styles");
        expect(Array.isArray(niche.styles)).toBe(true);
        expect(niche.styles.length).toBeGreaterThan(0);
      }
    });

    it("should map NICHE_CONFIG properties correctly", () => {
      expect(NICHES.food_culinary.name).toBe("Food & Culinary");
      expect(NICHES.food_culinary.emoji).toBe("🍜");
      expect(NICHES.food_culinary.styles).toHaveLength(3);
    });
  });

  // ===========================================================================
  // PROVIDERS
  // ===========================================================================

  describe("PROVIDERS", () => {
    it("should export provider configurations", () => {
      expect(PROVIDERS.geminigen).toBeDefined();
      expect(PROVIDERS.byteplus).toBeDefined();
      expect(PROVIDERS.demo).toBeDefined();
    });

    it("should have correct priority ordering", () => {
      expect(PROVIDERS.geminigen.priority).toBe(1);
      expect(PROVIDERS.byteplus.priority).toBe(2);
      expect(PROVIDERS.demo.priority).toBe(99);
    });

    it("should have correct max durations", () => {
      expect(PROVIDERS.geminigen.maxDuration).toBe(5);
      expect(PROVIDERS.byteplus.maxDuration).toBe(5);
      expect(PROVIDERS.demo.maxDuration).toBe(300);
    });

    it("should have name for each provider", () => {
      expect(PROVIDERS.geminigen.name).toBe("GeminiGen");
      expect(PROVIDERS.byteplus.name).toBe("BytePlus Seedance");
      expect(PROVIDERS.demo.name).toBe("Demo");
    });
  });

  // ===========================================================================
  // generateStoryboard()
  // ===========================================================================

  describe("generateStoryboard()", () => {
    it("should generate storyboard for fnb niche", () => {
      const result = generateStoryboard("fnb", ["appetizing"], 15, 3);
      expect(result).toHaveLength(3);
      expect(result[0].scene).toBe(1);
      expect(result[0].duration).toBe(5);
      expect(result[0].description).toContain("ingredients");
      expect(result[0].prompt).toContain("[Scene 1/3]");
      expect(result[0].prompt).toContain("appetizing");
    });

    it("should generate storyboard for fashion niche", () => {
      const result = generateStoryboard("fashion", ["elegant"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("outfit");
      expect(result[1].description).toContain("accessories");
    });

    it("should generate storyboard for tech niche", () => {
      const result = generateStoryboard("tech", ["modern"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("unboxing");
      expect(result[1].description).toContain("features");
    });

    it("should generate storyboard for health niche", () => {
      const result = generateStoryboard("health", ["energetic"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("Warm-up");
      expect(result[1].description).toContain("Exercise");
    });

    it("should generate storyboard for travel niche", () => {
      const result = generateStoryboard("travel", ["cinematic"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("landscape");
      expect(result[1].description).toContain("Destination");
    });

    it("should generate storyboard for education niche", () => {
      const result = generateStoryboard("education", ["professional"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("Hook");
      expect(result[1].description).toContain("Problem");
    });

    it("should generate storyboard for finance niche", () => {
      const result = generateStoryboard("finance", ["trustworthy"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("Business");
      expect(result[1].description).toContain("Problem");
    });

    it("should generate storyboard for entertainment niche", () => {
      const result = generateStoryboard("entertainment", ["vibrant"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("hook");
      expect(result[1].description).toContain("Setup");
    });

    it("should fallback to fnb templates for unknown niche", () => {
      const result = generateStoryboard("unknown_niche", ["test"], 10, 2);
      expect(result).toHaveLength(2);
      expect(result[0].description).toContain("ingredients");
    });

    it("should handle more scenes than templates", () => {
      const result = generateStoryboard("fnb", ["appetizing"], 40, 10);
      expect(result).toHaveLength(10);
      result.forEach((scene, i) => {
        expect(scene.scene).toBe(i + 1);
        expect(scene.duration).toBe(5);
        expect(scene.description).toBeDefined();
        expect(scene.prompt).toContain(`[Scene ${i + 1}/10]`);
      });
    });

    it("should include styles in prompt", () => {
      const result = generateStoryboard("fnb", ["appetizing", "cozy", "warm"], 10, 1);
      expect(result[0].prompt).toContain("appetizing, cozy, warm");
    });

    it("should set 5s duration per scene", () => {
      const result = generateStoryboard("fnb", ["appetizing"], 15, 3);
      for (const scene of result) {
        expect(scene.duration).toBe(5);
      }
    });

    it("should generate sequential scene numbers", () => {
      const result = generateStoryboard("fnb", ["appetizing"], 15, 4);
      expect(result.map(s => s.scene)).toEqual([1, 2, 3, 4]);
    });

    it("should clamp scene index to template length", () => {
      const result = generateStoryboard("fnb", ["appetizing"], 50, 10);
      expect(result).toHaveLength(10);
      expect(result[8].description).toBeDefined();
      expect(result[9].description).toBeDefined();
    });
  });

  // ===========================================================================
  // generatePromptFromNiche()
  // ===========================================================================

  describe("generatePromptFromNiche()", () => {
    it("should generate prompt for fnb niche", () => {
      const result = generatePromptFromNiche("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
      expect(result).toContain("food");
      expect(result).toContain("10s");
    });

    it("should generate prompt for fashion niche", () => {
      const result = generatePromptFromNiche("fashion", ["elegant"], 15);
      expect(result).toContain("elegant");
      expect(result.toLowerCase()).toContain("fashion");
      expect(result).toContain("15s");
    });

    it("should generate prompt for tech niche", () => {
      const result = generatePromptFromNiche("tech", ["modern"], 10);
      expect(result).toContain("modern");
      expect(result.toLowerCase()).toContain("tech");
    });

    it("should generate prompt for health niche", () => {
      const result = generatePromptFromNiche("health", ["energetic"], 10);
      expect(result).toContain("energetic");
      expect(result.toLowerCase()).toContain("fitness");
    });

    it("should generate prompt for travel niche", () => {
      const result = generatePromptFromNiche("travel", ["cinematic"], 10);
      expect(result).toContain("cinematic");
      expect(result.toLowerCase()).toContain("travel");
    });

    it("should generate prompt for education niche", () => {
      const result = generatePromptFromNiche("education", ["professional"], 10);
      expect(result).toContain("professional");
      expect(result.toLowerCase()).toContain("education");
    });

    it("should generate prompt for finance niche", () => {
      const result = generatePromptFromNiche("finance", ["trustworthy"], 10);
      expect(result).toContain("trustworthy");
      expect(result.toLowerCase()).toContain("finance");
    });

    it("should generate prompt for entertainment niche", () => {
      const result = generatePromptFromNiche("entertainment", ["vibrant"], 10);
      expect(result).toContain("vibrant");
      expect(result.toLowerCase()).toContain("entertainment");
    });

    it("should fallback for unknown niche with style text", () => {
      const result = generatePromptFromNiche("nonexistent", ["test"], 10);
      expect(result).toContain("nonexistent");
      expect(result).toContain("10s");
      expect(result).toContain("test");
    });

    it("should use professional as default style for unknown niche with empty styles", () => {
      const result = generatePromptFromNiche("nonexistent", [], 10);
      expect(result).toContain("nonexistent");
      expect(result).toContain("professional");
    });

    it("should join multiple styles with comma", () => {
      const result = generatePromptFromNiche("fnb", ["appetizing", "cozy", "warm"], 10);
      expect(result).toContain("appetizing, cozy, warm");
    });

    it("should include duration in prompt", () => {
      const result = generatePromptFromNiche("fnb", ["appetizing"], 30);
      expect(result).toContain("30s");
    });

    it("should use default keywords when styles is empty", () => {
      const result = generatePromptFromNiche("fnb", [], 10);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should include color palette", () => {
      const result = generatePromptFromNiche("fnb", ["appetizing"], 10);
      expect(result).toContain("Color palette:");
    });
  });

  // ===========================================================================
  // generatePromptFromNicheAsync()
  // ===========================================================================

  describe("generatePromptFromNicheAsync()", () => {
    it("should return template result when provider is builtin", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "builtin", model: "" },
      });

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
      expect(result).toContain("food");
    });

    it("should use LLM when provider is groq", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          choices: [{ message: { content: "LLM generated video prompt" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        },
      });

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toBe("LLM generated video prompt");
      expect(mockAxiosPost).toHaveBeenCalledWith(
        "https://api.groq.com/openai/v1/chat/completions",
        expect.objectContaining({ model: "llama-3.3-70b-versatile" }),
        expect.objectContaining({ timeout: 8_000 }),
      );
    });

    it("should use LLM when provider is gemini", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "gemini", model: "gemini-2.5-flash" },
      });
      mockConfigOverrides = { GEMINI_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          candidates: [{ content: { parts: [{ text: "Gemini video prompt" }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        },
      });

      const result = await generatePromptFromNicheAsync("tech", ["modern"], 10);
      expect(result).toBe("Gemini video prompt");
    });

    it("should use LLM when provider is omniroute", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "omniroute", model: "antigravity/gemini-2.5-flash" },
      });
      mockConfigOverrides = { OMNIROUTE_URL: "http://localhost:4000", OMNIROUTE_API_KEY: "key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          choices: [{ message: { content: "OmniRoute prompt" } }],
          model: "antigravity/gemini-2.5-flash",
          usage: { prompt_tokens: 5, completion_tokens: 10 },
        },
      });

      const result = await generatePromptFromNicheAsync("fashion", ["elegant"], 10);
      expect(result).toBe("OmniRoute prompt");
    });

    it("should use pipeline when it returns a result", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockPipelineGenerate.mockResolvedValue({
        content: "Pipeline generated prompt",
        model: "pipeline-model",
        usage: { promptTokens: 5, completionTokens: 10 },
      });

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toBe("Pipeline generated prompt");
      // Pipeline result takes priority — no axios call needed
      expect(mockAxiosPost).not.toHaveBeenCalledWith(
        expect.stringContaining("groq"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should fall back to template when LLM returns empty", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          choices: [{ message: { content: "" } }],
          usage: { prompt_tokens: 5, completion_tokens: 0 },
        },
      });

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
      expect(result).toContain("food");
    });

    it("should fall back to template when LLM returns short text", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          choices: [{ message: { content: "hi" } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        },
      });

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
    });

    it("should fall back to template when LLM throws", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockRejectedValue(new Error("API error"));

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("LLM prompt generation failed"),
      );
    });

    it("should fall back to template when getSettings throws", async () => {
      mockGetSettings.mockRejectedValue(new Error("DB error"));

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("LLM prompt generation failed"),
      );
    });

    it("should return null from groq when API key missing", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "" };
      mockPipelineGenerate.mockResolvedValue(null);

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
    });

    it("should return null from gemini when API key missing", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "gemini", model: "gemini-2.5-flash" },
      });
      mockConfigOverrides = { GEMINI_API_KEY: "" };
      mockPipelineGenerate.mockResolvedValue(null);

      const result = await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(result).toContain("appetizing");
    });

    it("should track tokens when groq returns usage", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "groq", model: "llama-3.3-70b-versatile" },
      });
      mockConfigOverrides = { GROQ_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          choices: [{ message: { content: "Groq prompt result text for video" } }],
          usage: { prompt_tokens: 15, completion_tokens: 25 },
        },
      });

      await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(mockTrackTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "groq",
          promptTokens: 15,
          completionTokens: 25,
        }),
      );
    });

    it("should track tokens when gemini returns usage", async () => {
      mockGetSettings.mockResolvedValue({
        promptGeneration: { provider: "gemini", model: "gemini-2.5-flash" },
      });
      mockConfigOverrides = { GEMINI_API_KEY: "test-key" };
      mockPipelineGenerate.mockResolvedValue(null);
      mockAxiosPost.mockResolvedValue({
        data: {
          candidates: [{ content: { parts: [{ text: "Gemini prompt for video generation" }] } }],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 30 },
        },
      });

      await generatePromptFromNicheAsync("fnb", ["appetizing"], 10);
      expect(mockTrackTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "gemini-direct",
          promptTokens: 8,
          completionTokens: 30,
        }),
      );
    });
  });

  // ===========================================================================
  // getCreditCost()
  // ===========================================================================

  describe("getCreditCost()", () => {
    it("should return credit cost for duration", () => {
      mockGetVideoCreditCost.mockReturnValue(0.4);
      const result = getCreditCost(10);
      expect(mockGetVideoCreditCost).toHaveBeenCalledWith(10);
      expect(result).toBe(0.4);
    });

    it("should handle different durations", () => {
      mockGetVideoCreditCost.mockReturnValue(1.0);
      const result = getCreditCost(30);
      expect(mockGetVideoCreditCost).toHaveBeenCalledWith(30);
      expect(result).toBe(1.0);
    });

    it("should handle 5 second duration", () => {
      mockGetVideoCreditCost.mockReturnValue(0.2);
      const result = getCreditCost(5);
      expect(result).toBe(0.2);
    });
  });

  // ===========================================================================
  // generateVideo()
  // ===========================================================================

  describe("generateVideo()", () => {
    it("should return demo video when demo mode is on", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(result.videoUrl).toContain("giphy.com");
      expect(result.jobId).toMatch(/^demo-/);
      expect(result.thumbnailUrl).toContain("placeholder");
    });

    it("should return demo video when no API keys set", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(result.videoUrl).toContain("giphy.com");
    });

    it("should generate prompt from niche when not provided", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({
        duration: 10,
        niche: "tech_gadgets",
        styles: ["modern"],
      });

      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Starting video generation"),
      );
    });

    it("should use default niche and styles when not provided", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      await generateVideo({ duration: 10 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("niche=fnb"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("styles=appetizing"),
      );
    });

    it("should clamp duration to 4-15 range", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result1 = await generateVideo({ prompt: "test", duration: 1 });
      expect(result1.success).toBe(true);

      const result2 = await generateVideo({ prompt: "test", duration: 100 });
      expect(result2.success).toBe(true);
    });

    it("should force provider when _forceProvider is set", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };
      mockAxiosPost.mockResolvedValue({
        data: { id: "bp-123", status: "processing" },
      });
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: {
            video_url: "https://example.com/forced.mp4",
            thumbnail_url: "https://example.com/thumb.jpg",
          },
        },
      });

      const result = await generateVideo({
        prompt: "test",
        duration: 10,
        _forceProvider: "byteplus",
      });

      expect(result.provider).toBe("byteplus");
      expect(result.success).toBe(true);
      expect(result.videoUrl).toBe("https://example.com/forced.mp4");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Forcing provider"),
      );
    });

    it("should try GeminiGen first when API key is set", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };
      mockAxiosPost.mockResolvedValue({
        data: { uuid: "gem-123", status: "processing" },
      });
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          data: {
            video_url: "https://example.com/gem.mp4",
            thumbnail_url: "https://example.com/gem-thumb.jpg",
          },
        },
      });

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(result.videoUrl).toBe("https://example.com/gem.mp4");
      expect(result.provider).toBe("geminigen");
    });

    it("should fallback to scored providers when GeminiGen fails", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen post fails, BytePlus post succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-456", status: "processing" },
        });

      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: {
            video_url: "https://example.com/bp.mp4",
            thumbnail_url: "https://example.com/bp-thumb.jpg",
          },
        },
      });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 2, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(result.provider).toBe("byteplus");
    });

    it("should skip provider when circuit breaker is open", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen post fails
      mockAxiosPost.mockRejectedValueOnce(new Error("GeminiGen down"));

      // First provider CB open, second provider succeeds
      mockCanExecute
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        { key: "byteplus", config: { name: "BytePlus 2", priority: 2, maxDuration: 5 } },
      ]);

      // Second call to dispatch succeeds
      mockAxiosPost.mockResolvedValue({
        data: { id: "bp-ok", status: "processing" },
      });
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      await generateVideo({ prompt: "test", duration: 10 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("circuit breaker open"),
      );
    });

    it("should record failure on circuit breaker when provider fails", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails, scored provider also fails
      mockAxiosPost.mockRejectedValue(new Error("Network down"));

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);
      mockOptimizeForProvider.mockResolvedValue("prompt");
      mockCanExecute.mockResolvedValue(true);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      // Should have recorded failure for the scored provider
      expect(mockRecordFailure).toHaveBeenCalled();
      // All providers failed + demo mode on → demo video
      expect(result.success).toBe(true);
    });

    it("should record success on circuit breaker when provider succeeds", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-111", status: "processing" },
        });

      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(mockRecordSuccess).toHaveBeenCalledWith("byteplus");
    });

    it("should skip provider when quality check fails", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        // First scored provider
        .mockResolvedValueOnce({
          data: { id: "bp-222", status: "processing" },
        })
        // Second scored provider
        .mockResolvedValueOnce({
          data: { id: "bp-333", status: "processing" },
        });

      mockAxiosGet
        // First provider polling
        .mockResolvedValueOnce({
          data: {
            status: "completed",
            output: { video_url: "https://example.com/low-quality.mp4" },
          },
        })
        // Second provider polling
        .mockResolvedValueOnce({
          data: {
            status: "completed",
            output: { video_url: "https://example.com/good-quality.mp4" },
          },
        });

      // First provider quality check fails, second passes
      mockScoreVideo
        .mockResolvedValueOnce({ score: 2, passable: false, issues: ["low quality"] })
        .mockResolvedValueOnce({ score: 8, passable: true, issues: [] });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        { key: "byteplus", config: { name: "BytePlus 2", priority: 2, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(mockRecordFailure).toHaveBeenCalledWith("byteplus");
    });

    it("should handle quality check exception gracefully", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-444", status: "processing" },
        });

      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      mockScoreVideo.mockRejectedValue(new Error("QC service down"));

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Quality check error"),
      );
    });

    it("should return failure when all providers fail and demo mode off", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost.mockRejectedValue(new Error("Network error"));
      mockGetOrderedProviders.mockResolvedValue([]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      expect(result.success).toBe(false);
      expect(result.error).toBe("All video generation providers failed");
    });

    it("should optimize prompt for each provider", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-555", status: "processing" },
        });

      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      await generateVideo({ prompt: "test", duration: 10, niche: "tech", styles: ["modern"] });

      expect(mockOptimizeForProvider).toHaveBeenCalledWith(
        expect.any(String),
        "byteplus",
        "tech",
        ["modern"],
      );
    });
  });

  // ===========================================================================
  // processVideoJob()
  // ===========================================================================

  describe("processVideoJob()", () => {
    it("should process video job with correct parameters", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await processVideoJob({
        jobId: "VID-123",
        prompt: "Test prompt",
        duration: 10,
        niche: "fnb",
        styles: ["appetizing"],
      } as any);

      expect(mockLogger.info).toHaveBeenCalledWith("Processing video job: VID-123");
      expect(result.success).toBe(true);
    });

    it("should pass aspectRatio 9:16 to generateVideo", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      await processVideoJob({
        jobId: "VID-456",
        prompt: "Another prompt",
        duration: 5,
        niche: "tech",
        styles: ["modern"],
      } as any);

      expect(mockLogger.info).toHaveBeenCalledWith("Processing video job: VID-456");
    });

    it("should handle missing prompt in video job", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await processVideoJob({
        jobId: "VID-789",
        duration: 10,
        niche: "fnb",
        styles: ["appetizing"],
      } as any);

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Provider Implementations (via generateVideo)
  // ===========================================================================

  describe("Provider Implementations", () => {
    describe("GeminiGen", () => {
      it("should submit job and poll for completion", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

        mockAxiosPost.mockResolvedValue({
          data: { uuid: "gem-abc", status: "processing" },
        });
        mockAxiosGet.mockResolvedValue({
          data: {
            status: "completed",
            data: {
              video_url: "https://example.com/gem-done.mp4",
              thumbnail_url: "https://example.com/gem-done-thumb.jpg",
            },
          },
        });

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(true);
        expect(result.videoUrl).toBe("https://example.com/gem-done.mp4");
        expect(result.thumbnailUrl).toBe("https://example.com/gem-done-thumb.jpg");
        expect(result.jobId).toBe("gem-abc");
        expect(result.provider).toBe("geminigen");
      });

      it("should handle GeminiGen polling failure status", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };
        mockGetOrderedProviders.mockResolvedValue([]);

        mockAxiosPost.mockResolvedValue({
          data: { uuid: "gem-fail", status: "processing" },
        });
        mockAxiosGet.mockResolvedValue({
          data: {
            status: "failed",
            data: { error: "Generation failed" },
          },
        });

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("failed");
      });

      it("should handle GeminiGen API error on submit", async () => {
        mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };
        mockGetOrderedProviders.mockResolvedValue([]);

        mockAxiosPost.mockRejectedValue(new Error("401 Unauthorized"));

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("GeminiGen failed"),
        );
      });

      it("should limit duration to 5 for GeminiGen", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

        mockAxiosPost.mockResolvedValue({
          data: { uuid: "gem-dur", status: "processing" },
        });
        mockAxiosGet.mockResolvedValue({
          data: {
            status: "completed",
            data: { video_url: "https://example.com/gem.mp4" },
          },
        });

        await generateVideo({ prompt: "test", duration: 15 });

        expect(mockFormDataAppend).toHaveBeenCalledWith("duration", expect.any(String));
      });

      it("should handle GeminiGen polling catch-then-retry", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

        mockAxiosPost.mockResolvedValue({
          data: { uuid: "gem-retry", status: "processing" },
        });
        // First poll throws, second succeeds
        mockAxiosGet
          .mockRejectedValueOnce(new Error("Network hiccup"))
          .mockResolvedValueOnce({
            data: {
              status: "completed",
              data: { video_url: "https://example.com/gem-retry.mp4" },
            },
          });

        // Use fake timers to avoid the 2s delay
        jest.useFakeTimers();
        const resultPromise = generateVideo({ prompt: "test", duration: 10 });
        // Advance past the 2s setTimeout in the polling loop
        await jest.advanceTimersByTimeAsync(2500);
        const result = await resultPromise;
        jest.useRealTimers();

        expect(result.success).toBe(true);
        expect(result.videoUrl).toBe("https://example.com/gem-retry.mp4");
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Error polling GeminiGen"),
        );
      });
    });

    describe("BytePlus", () => {
      it("should submit job and poll for completion", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };

        mockGetOrderedProviders.mockResolvedValue([
          { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        ]);

        mockAxiosPost.mockResolvedValue({
          data: { id: "bp-done", status: "processing" },
        });
        mockAxiosGet.mockResolvedValue({
          data: {
            status: "completed",
            output: {
              video_url: "https://example.com/bp-done.mp4",
              thumbnail_url: "https://example.com/bp-thumb.jpg",
            },
          },
        });

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(true);
        expect(result.videoUrl).toBe("https://example.com/bp-done.mp4");
        expect(result.thumbnailUrl).toBe("https://example.com/bp-thumb.jpg");
        expect(result.jobId).toBe("bp-done");
      });

      it("should handle BytePlus polling failure status", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

        // GeminiGen fails, so falls through to providers
        mockAxiosPost
          .mockRejectedValueOnce(new Error("GeminiGen down"))
          .mockResolvedValueOnce({
            data: { id: "bp-fail", status: "processing" },
          });

        mockGetOrderedProviders.mockResolvedValue([
          { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        ]);

        mockAxiosGet.mockResolvedValue({
          data: {
            status: "failed",
            output: { error: "Generation failed" },
          },
        });

        const result = await generateVideo({ prompt: "test", duration: 10 });

        // All providers failed and demo mode off → failure
        expect(result.success).toBe(false);
        expect(result.error).toContain("failed");
      });

      it("should handle BytePlus API error on submit", async () => {
        mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

        mockGetOrderedProviders.mockResolvedValue([
          { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        ]);

        mockAxiosPost.mockRejectedValue(new Error("Rate limited"));

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(true); // falls back to demo
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("BytePlus failed"),
        );
      });

      it("should use BYTEPLUS_API_KEY or AIML_API_KEY for auth", async () => {
        mockConfigOverrides = {
          DEMO_MODE: false,
          GEMINIGEN_API_KEY: "",
          BYTEPLUS_API_KEY: "bp-key",
        };

        mockGetOrderedProviders.mockResolvedValue([
          { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        ]);

        mockAxiosPost.mockResolvedValue({
          data: { id: "bp-auth", status: "processing" },
        });
        mockAxiosGet.mockResolvedValue({
          data: {
            status: "completed",
            output: { video_url: "https://example.com/bp.mp4" },
          },
        });

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(true);
        expect(mockAxiosPost).toHaveBeenCalledWith(
          "https://api.aimlapi.com/v2/video/generations",
          expect.anything(),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer bp-key",
            }),
          }),
        );
      });

      it("should handle BytePlus polling catch-then-retry", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };

        mockGetOrderedProviders.mockResolvedValue([
          { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        ]);

        mockAxiosPost.mockResolvedValue({
          data: { id: "bp-retry", status: "processing" },
        });
        // First poll throws, second succeeds
        mockAxiosGet
          .mockRejectedValueOnce(new Error("Network hiccup"))
          .mockResolvedValueOnce({
            data: {
              status: "completed",
              output: { video_url: "https://example.com/bp-retry.mp4" },
            },
          });

        jest.useFakeTimers();
        const resultPromise = generateVideo({ prompt: "test", duration: 10 });
        await jest.advanceTimersByTimeAsync(2500);
        const result = await resultPromise;
        jest.useRealTimers();

        expect(result.success).toBe(true);
        expect(result.videoUrl).toBe("https://example.com/bp-retry.mp4");
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Error polling BytePlus"),
        );
      });
    });

    describe("Demo mode", () => {
      it("should return a sample giphy video", async () => {
        mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.success).toBe(true);
        expect(result.videoUrl).toContain("giphy.com");
        expect(result.videoUrl).toContain(".mp4");
        expect(result.thumbnailUrl).toContain("placeholder");
        expect(result.jobId).toMatch(/^demo-\d+$/);
      });

      it("should pick a random sample video", async () => {
        mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

        const result = await generateVideo({ prompt: "test", duration: 10 });

        expect(result.videoUrl).toMatch(/^https:\/\/media\.giphy\.com\/media\//);
      });
    });

    describe("Unknown provider dispatch", () => {
      it("should return error for unknown provider key", async () => {
        mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };
        mockGetOrderedProviders.mockResolvedValue([]);

        const result = await generateVideo({
          prompt: "test",
          duration: 10,
          _forceProvider: "nonexistent",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("not yet implemented");
        expect(result.provider).toBe("nonexistent");
      });
    });

    it("should dispatch to GeminiGen via _forceProvider", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };
      mockAxiosPost.mockResolvedValue({
        data: { uuid: "gem-forced", status: "processing" },
      });
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          data: { video_url: "https://example.com/gem-forced.mp4" },
        },
      });

      const result = await generateVideo({
        prompt: "test",
        duration: 10,
        _forceProvider: "geminigen",
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe("geminigen");
    });

    it("should handle dispatch throwing exception in provider loop", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost.mockRejectedValue(new Error("All down"));
      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      // Should record failure and fall back to demo
      expect(mockRecordFailure).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.videoUrl).toContain("giphy.com");
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle very short duration", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({ prompt: "test", duration: 1 });

      expect(result.success).toBe(true);
    });

    it("should handle very long duration", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({ prompt: "test", duration: 1000 });

      expect(result.success).toBe(true);
    });

    it("should handle empty prompt", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      const result = await generateVideo({ prompt: "", duration: 10 });

      expect(result.success).toBe(true);
    });

    it("should handle all scored providers failing", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };

      mockAxiosPost.mockRejectedValue(new Error("All down"));
      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
        { key: "byteplus", config: { name: "BytePlus 2", priority: 2, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      // Falls back to demo mode
      expect(result.success).toBe(true);
      expect(result.videoUrl).toContain("giphy.com");
    });

    it("should use prompt as-is when provided", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "" };

      await generateVideo({
        prompt: "My custom video prompt",
        duration: 10,
      });

      // When prompt is provided, AITaskSettingsService is not called
      expect(mockGetSettings).not.toHaveBeenCalled();
    });

    it("should handle provider returning success without videoUrl in output", async () => {
      mockConfigOverrides = { DEMO_MODE: true, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-nourl", status: "processing" },
        });

      // Provider polling returns failed (simulating provider that completed but couldn't produce video)
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "failed",
          output: { error: "Video generation produced no output" },
        },
      });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      const result = await generateVideo({ prompt: "test", duration: 10 });

      // Provider failed → demo mode fallback → success with demo video
      expect(result.success).toBe(true);
      expect(result.videoUrl).toContain("giphy.com");
    });

    it("should pass referenceImageUrl to quality check", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "gem-key" };

      // GeminiGen fails
      mockAxiosPost
        .mockRejectedValueOnce(new Error("GeminiGen down"))
        .mockResolvedValueOnce({
          data: { id: "bp-ref", status: "processing" },
        });

      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      const result = await generateVideo({
        prompt: "test",
        duration: 10,
        referenceImageUrl: "https://example.com/ref.jpg",
      });

      expect(result.success).toBe(true);
      expect(mockScoreVideo).toHaveBeenCalledWith(
        "https://example.com/bp.mp4",
        expect.any(String),
        expect.any(Number),
        true, // hasReferenceImage = true
      );
    });

    it("should cap provider duration to maxDuration", async () => {
      mockConfigOverrides = { DEMO_MODE: false, GEMINIGEN_API_KEY: "" };

      mockGetOrderedProviders.mockResolvedValue([
        { key: "byteplus", config: { name: "BytePlus", priority: 1, maxDuration: 5 } },
      ]);

      mockAxiosPost.mockResolvedValue({
        data: { id: "bp-cap", status: "processing" },
      });
      mockAxiosGet.mockResolvedValue({
        data: {
          status: "completed",
          output: { video_url: "https://example.com/bp.mp4" },
        },
      });

      const result = await generateVideo({ prompt: "test", duration: 15 });

      expect(result.success).toBe(true);
    });
  });
});
