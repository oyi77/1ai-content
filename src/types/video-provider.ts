/**
 * Shared types for the video provider abstraction layer.
 *
 * The VideoProvider interface is the contract every provider implements.
 * VideoProviderConfig holds static metadata about a provider.
 * GenerateVideoRequest / GenerateVideoResult are the normalized in/out shapes.
 */

export interface VideoProviderConfig {
  key: string;
  name: string;
  priority: number;
  supportsReferenceImage: boolean;
  maxPollAttempts: number;
  pollIntervalMs: number;
}

export interface GenerateVideoRequest {
  prompt: string;
  durationSeconds: number;
  referenceImageUrl?: string;
  aspectRatio?: string;
}

export interface GenerateVideoResult {
  videoUrl: string;
  provider: string;
  generationTimeMs: number;
}

export interface PollResult {
  status: "pending" | "completed" | "failed";
  videoUrl?: string;
}

export interface VideoProvider {
  config: VideoProviderConfig;
  generate(request: GenerateVideoRequest): Promise<string>; // returns task/job ID
  poll(taskId: string): Promise<PollResult>;
  generateAndWait(request: GenerateVideoRequest): Promise<GenerateVideoResult>;
}
