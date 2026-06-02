import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AITaskSettingsService } from '@/services/ai-task-settings.service';

const mockRedisGet = jest.fn<any>();
const mockRedisSet = jest.fn<any>();
const mockFindUnique = jest.fn<any>();
const mockUpsert = jest.fn<any>();

jest.mock('@/config/redis', () => ({
  redis: {
    get: (k: string) => mockRedisGet(k),
    set: (k: string, v: string) => mockRedisSet(k, v),
  },
}));

jest.mock('@/config/database', () => ({
  prisma: {
    pricingConfig: {
      findUnique: (args: any) => mockFindUnique(args),
      upsert: (args: any) => mockUpsert(args),
    },
  },
}));

describe('AITaskSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSettings returns defaults when Redis and DB are empty', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    const settings = await AITaskSettingsService.getSettings();
    expect(settings.storyboard).toEqual({ provider: 'builtin', model: '' });
    expect(settings.transcript.provider).toBe('gemini');
  });

  it('getSettings returns parsed Redis cache merged with defaults', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({
      storyboard: { provider: 'groq', model: 'gpt-4' },
    }));
    const settings = await AITaskSettingsService.getSettings();
    expect(settings.storyboard).toEqual({ provider: 'groq', model: 'gpt-4' });
    expect(settings.transcript.provider).toBe('gemini');
  });

  it('getSettings falls back to DB when Redis returns invalid JSON', async () => {
    mockRedisGet.mockResolvedValue('not-json');
    mockFindUnique.mockResolvedValue(null);
    const settings = await AITaskSettingsService.getSettings();
    expect(settings.storyboard.provider).toBe('builtin');
  });

  it('getSettings returns DB settings when Redis is empty', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({
      value: { promptGeneration: { provider: 'omniroute', model: 'm-1' } },
    });
    const settings = await AITaskSettingsService.getSettings();
    expect(settings.promptGeneration).toEqual({ provider: 'omniroute', model: 'm-1' });
    expect(settings.storyboard.provider).toBe('builtin');
  });

  it('updateSettings merges with current settings and persists', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockUpsert.mockResolvedValue(undefined);
    await AITaskSettingsService.updateSettings({ storyboard: { provider: 'groq', model: 'x' } });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { category_key: { category: 'ai_tasks', key: 'settings' } },
    }));
    expect(mockRedisSet).toHaveBeenCalled();
  });
});
