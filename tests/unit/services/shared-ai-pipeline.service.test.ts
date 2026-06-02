import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { resetSharedAIPipeline, pipelineGenerate } from '@/services/shared-ai-pipeline.service';

const mockGenerate = jest.fn<any>();

jest.mock('@1ai/ai-pipeline', () => ({
  AIPipeline: jest.fn(() => ({
    generate: mockGenerate,
  }) as any),
}));

jest.mock('@/config/env', () => ({
  getConfig: jest.fn(() => ({
    OMNIROUTE_URL: 'http://localhost:20128/v1',
    OMNIROUTE_API_KEY: 'test-key',
  })),
}));

describe('shared-ai-pipeline.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSharedAIPipeline();
  });

  it('pipelineGenerate returns null when no config available', async () => {
    const { getConfig } = require('@/config/env');
    getConfig.mockReturnValue({ OMNIROUTE_URL: '', OMNIROUTE_API_KEY: '' });
    const result = await pipelineGenerate('hello');
    expect(result).toBeNull();
  });

  it('pipelineGenerate returns result on success', async () => {
    mockGenerate.mockResolvedValueOnce({
      content: 'response text',
      model: 'auto/pro-fast',
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    const result = await pipelineGenerate('hello');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('response text');
    expect(result!.model).toBe('auto/pro-fast');
  });

  it('pipelineGenerate returns null on failure', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('network error'));
    const result = await pipelineGenerate('hello');
    expect(result).toBeNull();
  });

  it('pipelineGenerate passes options to the pipeline', async () => {
    mockGenerate.mockResolvedValueOnce({
      content: 'ok',
      model: 'auto/pro-fast',
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    await pipelineGenerate('prompt', { model: 'openai/gpt-4o', temperature: 0.5, maxTokens: 256 });
    expect(mockGenerate).toHaveBeenCalledWith('prompt', {
      model: 'openai/gpt-4o',
      temperature: 0.5,
      maxTokens: 256,
      systemPrompt: undefined,
    });
  });

  it('resetSharedAIPipeline clears internal state', () => {
    const { getSharedAIPipeline } = require('@/services/shared-ai-pipeline.service');
    const first = getSharedAIPipeline();
    resetSharedAIPipeline();
    const second = getSharedAIPipeline();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });
});
