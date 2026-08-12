/**
 * SavedPrompt Service — User's personal prompt library
 */
import { prisma } from "@/config/database";

export interface SavedPromptData {
  title: string;
  prompt: string;
  niche: string;
  source?: "custom" | "library" | "daily";
  sourceId?: string;
}

export class SavedPromptService {
  /** Save a prompt to user's personal library */
  static async save(userId: bigint, data: SavedPromptData) {
    return prisma.savedPrompt.create({
      data: {
        userId,
        title: data.title.slice(0, 100),
        prompt: data.prompt,
        niche: data.niche,
        source: data.source || "custom",
        sourceId: data.sourceId,
      },
    });
  }

  /** Get user's saved prompts, optionally filtered by niche */
  static async getByUser(userId: bigint, niche?: string) {
    return prisma.savedPrompt.findMany({
      where: {
        userId,
        ...(niche ? { niche } : {}),
      },
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
      take: 10,
    });
  }

  /** Increment usage count */
  static async incrementUsage(id: number) {
    return prisma.savedPrompt.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  /** Delete a saved prompt */
  static async delete(id: number, userId: bigint) {
    return prisma.savedPrompt.deleteMany({
      where: { id, userId },
    });
  }

  /** Count user's saved prompts */
  static async count(userId: bigint) {
    return prisma.savedPrompt.count({ where: { userId } });
  }
}
