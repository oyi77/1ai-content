/**
 * Cross-user owner-scoping regression test for the content-api ebook routes.
 *
 * Every ebook route in src/routes/content-api.ts MUST forward the JWT user's
 * Telegram id (bigint → Number) as the `owner` argument to EbookService, so the
 * Python backend can enforce per-tenant project isolation (IDOR protection:
 * a user may never list/read/generate/download another user's project).
 *
 * Uses a real Fastify + inject() harness so getUser()'s JWT branch and the
 * Number(bigint) conversion actually execute.
 */
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

// ---- module-level mocks for every import-time dependency of content-api.ts ----

const mockPrisma = {};
const mockFindByUuid = jest.fn();
const mockTryApiKeyAuth = jest.fn();
const mockGetConfig = jest.fn();
const mockGetOmniRouteService = jest.fn();
const mockEnqueueVideoGeneration = jest.fn();
const mockGenerateStoryboard = jest.fn();
const mockGetVideoCreditCostAsync = jest.fn();
const mockGetImageCreditCostAsync = jest.fn();

const mockEbookHealthCheck = jest.fn();
const mockEbookListProjects = jest.fn();
const mockEbookCreateProject = jest.fn();
const mockEbookGenerate = jest.fn();
const mockEbookGetStatus = jest.fn();
const mockEbookDownload = jest.fn();

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/config/database", () => ({
  prisma: mockPrisma,
}));

jest.mock("@/config/env", () => ({
  getConfig: mockGetConfig,
}));

jest.mock("@/services/user.service", () => ({
  UserService: {
    findByUuid: mockFindByUuid,
    findByTelegramId: jest.fn(),
  },
}));

jest.mock("@/services/image.service", () => ({
  ImageGenerationService: {
    generateImage: jest.fn(),
  },
}));

jest.mock("@/services/ebook.service", () => ({
  ebookService: {
    healthCheck: mockEbookHealthCheck,
    listProjects: mockEbookListProjects,
    createProject: mockEbookCreateProject,
    generate: mockEbookGenerate,
    getStatus: mockEbookGetStatus,
    download: mockEbookDownload,
    getProject: jest.fn(),
    getExport: jest.fn(),
    getDownloadUrl: jest.fn(),
    waitForCompletion: jest.fn(),
  },
}));

jest.mock("@/services/omniroute.service", () => ({
  getOmniRouteService: mockGetOmniRouteService,
}));

jest.mock("@/config/queue", () => ({
  enqueueVideoGeneration: mockEnqueueVideoGeneration,
}));

jest.mock("@/services/video-generation.service", () => ({
  generateStoryboard: mockGenerateStoryboard,
  NICHES: [],
}));

jest.mock("@/config/pricing", () => ({
  getVideoCreditCostAsync: mockGetVideoCreditCostAsync,
  getImageCreditCostAsync: mockGetImageCreditCostAsync,
}));

jest.mock("@/middleware/api-auth", () => ({
  tryApiKeyAuth: mockTryApiKeyAuth,
}));

import { contentApiRoutes } from "@/routes/content-api";

const OWNER = 999999; // Number(user.telegramId) where telegramId === 999999n
const JWT_SECRET = process.env.JWT_SECRET!;

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function buildApp() {
  const app = Fastify();
  await app.register(contentApiRoutes);
  return app;
}

describe("content-api ebook routes — owner scoping", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockGetConfig.mockReturnValue({ JWT_SECRET, EBOOK_API_URL: "http://localhost:8767", EBOOK_API_KEY: "" });
    (mockTryApiKeyAuth as any).mockResolvedValue(false);
    (mockFindByUuid as any).mockResolvedValue({
      telegramId: 999999n,
      tier: "standard",
      isBanned: false,
    });
    app = await buildApp();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it("GET /api/content/ebooks lists only the caller's projects (owner forwarded)", async () => {
    (mockEbookListProjects as any).mockResolvedValue([{ id: 1, title: "Mine" }]);

    const res = await app.inject({
      method: "GET",
      url: "/api/content/ebooks",
      headers: { authorization: `Bearer ${signToken("uuid-1")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEbookListProjects).toHaveBeenCalledWith(20, OWNER);
    expect(res.json()).toEqual({ ebooks: [{ id: 1, title: "Mine" }] });
  });

  it("POST /api/content/ebook/create scopes creation + generation to the caller", async () => {
    (mockEbookCreateProject as any).mockResolvedValue({ id: 42, title: "Test" });
    (mockEbookGenerate as any).mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/api/content/ebook/create",
      headers: { authorization: `Bearer ${signToken("uuid-1")}` },
      payload: { idea: "A story about scoping", title: "Scoped" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEbookCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ idea: "A story about scoping", title: "Scoped" }),
      OWNER
    );
    expect(mockEbookGenerate).toHaveBeenCalledWith(42, OWNER);
    expect(res.json()).toEqual(
      expect.objectContaining({ projectId: 42, status: "generating" })
    );
  });

  it("GET /api/content/ebook/:id/status scopes the status lookup to the caller", async () => {
    (mockEbookGetStatus as any).mockResolvedValue({ id: 7, status: "completed", db_status: "completed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/content/ebook/7/status",
      headers: { authorization: `Bearer ${signToken("uuid-1")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEbookGetStatus).toHaveBeenCalledWith(7, OWNER);
    expect(res.json()).toEqual({ id: 7, status: "completed", db_status: "completed" });
  });

  it("GET /api/content/ebook/:id/download/:format scopes the download to the caller", async () => {
    (mockEbookDownload as any).mockResolvedValue({
      buffer: Buffer.from("PDF-BYTES"),
      contentType: "application/pdf",
      filename: "ebook-7.pdf",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/content/ebook/7/download/pdf",
      headers: { authorization: `Bearer ${signToken("uuid-1")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEbookDownload).toHaveBeenCalledWith(7, "pdf", OWNER);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain('filename="ebook-7.pdf"');
  });

  it("rejects unauthenticated requests without touching any ebook service call", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/content/ebooks",
    });

    expect(res.statusCode).toBe(401);
    expect(mockEbookListProjects).not.toHaveBeenCalled();
    expect(mockEbookCreateProject).not.toHaveBeenCalled();
    expect(mockEbookGetStatus).not.toHaveBeenCalled();
    expect(mockEbookDownload).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens (401) and does not leak a scoped call", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/content/ebook/7/status",
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(res.statusCode).toBe(401);
    expect(mockEbookGetStatus).not.toHaveBeenCalled();
  });
});