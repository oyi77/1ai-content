/**
 * Grok-Api Service — HTTP client for Grok-Api Python server.
 * Grok-Api server must be running at GROK_API_URL (default: http://localhost:6969)
 * Auto-starts the server if autoStart is enabled and server is not running.
 * Models: grok-3-auto, grok-3-fast, grok-4, grok-4-mini-thinking-tahoe
 */

import axios, { AxiosInstance } from 'axios';
import { trackTokens } from '@/services/token-tracker.service';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';

export interface GrokAskRequest {
  proxy?: string;
  message: string;
  model?: string;
  extra_data?: Record<string, unknown> | null;
}

export interface GrokAskResponse {
  status: 'success' | 'error';
  response?: string;
  stream_response?: string[];
  images?: unknown[] | null;
  extra_data?: Record<string, unknown>;
  error?: string;
}

export interface GrokConversationContext {
  anon_user: string;
  cookies: Record<string, string>;
  actions: string[];
  xsid_script: unknown[];
  baggage: string;
  sentry_trace: string;
  conversationId: string;
  parentResponseId: string;
  privateKey: string;
}

export class GrokApiService {
  private client: AxiosInstance;
  private context: GrokConversationContext | null = null;

  constructor(
    private baseUrl: string = getConfig().GROK_API_URL || 'http://localhost:6969',
    private defaultModel: string = 'grok-3-fast',
    private proxy: string = '',
    private autoStart: boolean = true,
  ) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async ensureServer(): Promise<boolean> {
    try {
      await this.client.get('/docs', { timeout: 3000 });
      return true;
    } catch {
      if (this.autoStart) {
        return this.startServer();
      }
      return false;
    }
  }

  async startServer(
    port: number = 6969,
    workers: number = 1,
  ): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const GROK_REPO = getConfig().GROK_API_REPO ||
        '/home/openclaw/.openclaw/workspace/projects/grok-api';

      const child = spawn('/usr/bin/python3', [
        '-m', 'uvicorn',
        'api_server:app',
        '--host', '0.0.0.0',
        '--port', String(port),
        '--workers', String(workers),
      ], {
        cwd: GROK_REPO,
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await this.client.get('/docs', { timeout: 2000 });
          return true;
        } catch {
          // still starting
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.client.get('/docs', { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async startConversation(message: string, model?: string): Promise<GrokAskResponse> {
    const alive = await this.ensureServer();
    if (!alive) {
      return {
        status: 'error',
        error: 'Grok-Api server not available. Start with: /usr/bin/python3 -m uvicorn api_server:app --host 0.0.0.0 --port 6969',
      };
    }

    try {
      const body: Record<string, unknown> = {
        proxy: this.proxy || 'none',
        message,
        model: model || this.defaultModel,
      };

      const resp = await this.client.post<GrokAskResponse>('/ask', body);

      if (resp.data.status === 'success') {
        if (resp.data.extra_data) {
          this.context = resp.data.extra_data as unknown as GrokConversationContext;
        }
      }

      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: GrokAskResponse }; message?: string };
      if (axiosErr.response?.data) {
        return axiosErr.response.data;
      }
      return { status: 'error', error: axiosErr.message || String(err) };
    }
  }

  async continueConversation(message: string, model?: string): Promise<GrokAskResponse> {
    if (!this.context) {
      return this.startConversation(message, model);
    }

    const alive = await this.ensureServer();
    if (!alive) {
      return { status: 'error', error: 'Server not available' };
    }

    try {
      const resp = await this.client.post<GrokAskResponse>('/ask', {
        proxy: this.proxy || 'none',
        message,
        model: model || this.defaultModel,
        extra_data: this.context,
      });

      if (resp.data.status === 'success' && resp.data.extra_data) {
        this.context = resp.data.extra_data as unknown as GrokConversationContext;
      }

      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: GrokAskResponse }; message?: string };
      if (axiosErr.response?.data) {
        return axiosErr.response.data;
      }
      return { status: 'error', error: axiosErr.message || String(err) };
    }
  }

  async ask(message: string, model?: string): Promise<GrokAskResponse> {
    if (this.context) {
      return this.continueConversation(message, model);
    }
    return this.startConversation(message, model);
  }

  async askMetaClaw(message: string): Promise<GrokAskResponse> {
    try {
      const resp = await axios.post<{
        choices: Array<{ message: { content: string } }>;
      }>(
        'http://localhost:30000/v1/chat/completions',
        {
          model: 'meta/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: message }],
          temperature: 0.7,
          max_tokens: 4096,
        },
        { timeout: 120_000, headers: { 'Content-Type': 'application/json' } },
      );

      const content = resp.data.choices?.[0]?.message?.content;
      if (content) {
        const usage = (resp.data as Record<string, unknown>)?.usage as Record<string, number> | undefined;
        if (usage) {
          trackTokens({ provider: 'metaclaw', model: 'meta/llama-3.3-70b-instruct', service: 'grok_chat', promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 }).catch(err => logger.warn('Token tracking failed', { error: err.message }));
        }
        return { status: 'success', response: content };
      }
      return { status: 'error', error: 'MetaClaw returned empty response' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: `MetaClaw fallback failed: ${msg}` };
    }
  }

  clearContext(): void {
    this.context = null;
  }

  getAvailableModels(): string[] {
    return ['grok-3-auto', 'grok-3-fast', 'grok-4', 'grok-4-mini-thinking-tahoe'];
  }
}

let _instance: GrokApiService | null = null;

export function getGrokApiService(): GrokApiService {
  if (!_instance) {
    _instance = new GrokApiService();
  }
  return _instance;
}
