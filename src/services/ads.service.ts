import path from 'path';

export interface FunnelData {
  date: string;
  spend: number;
  fbClicks: number;
  shopeeClicks: number;
  orders: number;
  revenue: number;
  roas: number;
  profit: number;
}

export class AdsService {
  private static DATA_DIR = path.join(process.cwd(), 'data', 'ads');

  /**
   * Process and get funnel analytics
   */
  static async getDailyFunnel(_userId: string): Promise<FunnelData[]> {
    // Mocking based on the provided sample data
    return [
      {
        date: '2026-03-12',
        spend: 124087,
        fbClicks: 1492,
        shopeeClicks: 0,
        orders: 1,
        revenue: 32775,
        roas: 0.26,
        profit: -91312
      },
      {
        date: '2026-03-13',
        spend: 0,
        fbClicks: 0,
        shopeeClicks: 249,
        orders: 2,
        revenue: 136559,
        roas: Infinity,
        profit: 136559
      },
      {
        date: '2026-03-14',
        spend: 0,
        fbClicks: 0,
        shopeeClicks: 446,
        orders: 23,
        revenue: 7379800,
        roas: Infinity,
        profit: 7379800
      }
    ];
  }

  /**
   * Generate creative ideas
   */
  static async generateIdeas(count: number = 20): Promise<Array<{ topic: string; hook: string }>> {
    const hooks = [
      "Rahasia {topic} yang tidak pernah dibahas",
      "Cara hemat {topic} tanpa ribet",
      "Kenapa 90% orang gagal di {topic}?",
      "Fakta {topic} yang bikin mindblown",
      "#1 kesalahan saat {topic}"
    ];
    const topics = ["Tas Wanita", "Smartwatch", "Parfum Anak", "Gorden Minimalis"];

    const ideas = [];
    for (let i = 0; i < count; i++) {
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const hook = hooks[Math.floor(Math.random() * hooks.length)].replace("{topic}", topic);
      ideas.push({ topic, hook });
    }
    return ideas;
  }
}
