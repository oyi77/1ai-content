import { prisma } from '@/config/database';

// TemplateVideo model available after prisma generate with updated schema
const tv = () => prisma.templateVideo;

export class TemplateVideoService {
  static async getByNiche(niche: string) {
    return tv().findMany({
      where: { niche, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async getRandom(niche: string): Promise<any | null> {
    const templates = await this.getByNiche(niche);
    if (templates.length === 0) {
      const generalTemplates = await this.getByNiche('general');
      if (generalTemplates.length === 0) return null;
      return generalTemplates[Math.floor(Math.random() * generalTemplates.length)];
    }
    return templates[Math.floor(Math.random() * templates.length)];
  }

  static async getAll() {
    return tv().findMany({
      orderBy: [{ niche: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  static async create(data: {
    niche: string;
    title: string;
    description?: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration?: number;
    platform?: string;
  }) {
    return tv().create({ data });
  }

  static async update(id: bigint, data: Record<string, any>) {
    return tv().update({ where: { id }, data });
  }

  static async delete(id: bigint) {
    await tv().delete({ where: { id } });
  }

  /**
   * Auto-generate and cache a template video for a niche.
   * Called when no template exists and a free trial user triggers generation.
   * Stores the generated video as a reusable template for future users.
   */
  static async cacheGeneratedVideo(niche: string, videoUrl: string, thumbnailUrl?: string, duration = 15) {
    return tv().create({
      data: {
        niche,
        title: `Auto-generated ${niche} demo`,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        duration,
        platform: 'tiktok',
        isActive: true,
        sortOrder: 0,
      },
    });
  }
}
