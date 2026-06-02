import { describe, it, expect, jest } from '@jest/globals';
import { SavedPromptService } from '@/services/saved-prompt.service';

const mockCreate = jest.fn<any>();
const mockFindMany = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockDeleteMany = jest.fn<any>();
const mockCount = jest.fn<any>();

jest.mock('@/config/database', () => ({
  prisma: {
    savedPrompt: {
      create: (args: any) => mockCreate(args),
      findMany: (args: any) => mockFindMany(args),
      update: (args: any) => mockUpdate(args),
      deleteMany: (args: any) => mockDeleteMany(args),
      count: (args: any) => mockCount(args),
    },
  },
}));

describe('SavedPromptService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a prompt and truncates title to 100 chars', async () => {
    mockCreate.mockResolvedValue({ id: 1 });
    await SavedPromptService.save(1n, {
      title: 'a'.repeat(200),
      prompt: 'test prompt',
      niche: 'fnb',
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 1n,
        title: 'a'.repeat(100),
        prompt: 'test prompt',
        niche: 'fnb',
        source: 'custom',
        sourceId: undefined,
      },
    });
  });

  it('gets prompts filtered by niche', async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }]);
    const result = await SavedPromptService.getByUser(1n, 'fnb');
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 1n, niche: 'fnb' },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it('increments usage count', async () => {
    await SavedPromptService.incrementUsage(42);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { usageCount: { increment: 1 } },
    });
  });

  it('deletes a prompt scoped to user', async () => {
    await SavedPromptService.delete(42, 99n);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 42, userId: 99n },
    });
  });

  it('counts user prompts', async () => {
    mockCount.mockResolvedValue(7);
    const n = await SavedPromptService.count(1n);
    expect(n).toBe(7);
    expect(mockCount).toHaveBeenCalledWith({ where: { userId: 1n } });
  });
});
