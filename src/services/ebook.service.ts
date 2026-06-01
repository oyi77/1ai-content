/**
 * Ebook Service — Integration with 1ai-ebook API
 *
 * Provides ebook generation capabilities via the 1ai-ebook FastAPI backend.
 * Supports creating, monitoring, and downloading ebooks.
 */

import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";

export interface EbookProject {
  id: number;
  title: string;
  idea: string;
  product_mode: string;
  target_language: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EbookStatus {
  project_id: number;
  db_status: string;
  status: string;
  progress: number;
  message: string;
}

export interface CreateEbookRequest {
  idea: string;
  title?: string;
  chapter_count: number;
  target_language: string;
  product_mode?: string;
  quality_level?: string;
}

export interface EbookExport {
  strategy: Record<string, unknown>;
  outline: Record<string, unknown>;
  chapters: Array<{
    number: number;
    title: string;
    content: string;
    word_count: number;
  }>;
  metadata: {
    title: string;
    total_word_count: number;
    chapter_count: number;
  };
}

export class EbookService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    const config = getConfig();
    const baseUrl = process.env.EBOOK_API_URL || "http://localhost:8765";
    this.apiKey = process.env.EBOOK_API_KEY || "";

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
    });

    logger.info(`EbookService initialized: ${baseUrl}`);
  }

  /**
   * Health check for ebook API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const resp = await this.client.get("/health");
      return resp.data.status === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Create a new ebook project
   */
  async createProject(req: CreateEbookRequest): Promise<EbookProject> {
    try {
      const resp = await this.client.post("/api/projects", {
        idea: req.idea,
        title: req.title || null,
        chapter_count: req.chapter_count,
        target_language: req.target_language,
        product_mode: req.product_mode || "paid_ebook",
        quality_level: req.quality_level || "standard",
      });
      logger.info(`Ebook project created: ${resp.data.id}`);
      return resp.data;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("Failed to create ebook project:", error);
      throw new Error(`Ebook creation failed: ${error.message}`);
    }
  }

  /**
   * Get project details
   */
  async getProject(projectId: number): Promise<EbookProject> {
    try {
      const resp = await this.client.get(`/api/projects/${projectId}`);
      return resp.data;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`Failed to get ebook project ${projectId}:`, error);
      throw new Error(`Ebook fetch failed: ${error.message}`);
    }
  }

  /**
   * Start ebook generation
   */
  async generate(projectId: number): Promise<void> {
    try {
      await this.client.post(`/api/projects/${projectId}/generate`);
      logger.info(`Ebook generation started: ${projectId}`);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`Failed to start ebook generation ${projectId}:`, error);
      throw new Error(`Ebook generation failed: ${error.message}`);
    }
  }

  /**
   * Get generation status
   */
  async getStatus(projectId: number): Promise<EbookStatus> {
    try {
      const resp = await this.client.get(`/api/projects/${projectId}/status`);
      return resp.data;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`Failed to get ebook status ${projectId}:`, error);
      throw new Error(`Ebook status failed: ${error.message}`);
    }
  }

  /**
   * Get exported ebook content
   */
  async getExport(projectId: number): Promise<EbookExport> {
    try {
      const resp = await this.client.get(`/api/projects/${projectId}/export`);
      return resp.data;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`Failed to get ebook export ${projectId}:`, error);
      throw new Error(`Ebook export failed: ${error.message}`);
    }
  }

  /**
   * Get download URL for ebook file
   */
  getDownloadUrl(projectId: number, format: "pdf" | "docx" | "epub"): string {
    const baseUrl = process.env.EBOOK_API_URL || "http://localhost:8765";
    return `${baseUrl}/api/projects/${projectId}/download/${format}?key=${this.apiKey}`;
  }

  /**
   * List all projects
   */
  async listProjects(limit: number = 10): Promise<EbookProject[]> {
    try {
      const resp = await this.client.get(`/api/projects?limit=${limit}`);
      return resp.data;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("Failed to list ebook projects:", error);
      throw new Error(`Ebook list failed: ${error.message}`);
    }
  }

  /**
   * Poll for generation completion
   */
  async waitForCompletion(
    projectId: number,
    maxWaitMs: number = 600000,
    pollIntervalMs: number = 5000
  ): Promise<EbookStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getStatus(projectId);

      if (status.status === "completed" || status.db_status === "completed") {
        return status;
      }

      if (status.status === "failed") {
        throw new Error(`Ebook generation failed: ${status.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("Ebook generation timed out");
  }
}

export const ebookService = new EbookService();
