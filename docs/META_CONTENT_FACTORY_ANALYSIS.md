# Meta Content Factory Analysis & Improvement Plan

## Current State Analysis

### What We Already Have ✅

| Feature | Status | Service |
|---------|--------|---------|
| Video Generation | ✅ Working | `video-generation.service.ts` |
| Multi-platform (TikTok, IG, YT, FB) | ✅ Working | `flows/generate.ts` |
| Post Automation | ✅ Working | `postautomation.service.ts` (PostBridge) |
| Meta CAPI Tracking | ✅ Working | `meta-capi.service.ts` |
| Analytics | ✅ Working | `analytics.service.ts` |
| Content Pipeline | ✅ Working | `content-pipeline.service.ts` |
| Viral Scanner | ✅ Working | `viral-scanner.service.ts` |
| Payment (Midtrans, Tripay, etc.) | ✅ Working | `payment.service.ts` |
| Referral System | ✅ Working | `referral.service.ts` |
| Whitelabel | ✅ Working | `whitelabel.service.ts` |

### What's Missing (Based on Claude Share Analysis)

| Feature | Priority | Impact |
|---------|----------|--------|
| **Meta Graph API Direct Publishing** | 🔴 High | Bypass PostBridge, direct to FB Pages |
| **Bulk Page Management** | 🔴 High | Manage 100+ pages per user |
| **Content Calendar** | 🟡 Medium | Visual scheduling interface |
| **Affiliate Link Injection** | 🟡 Medium | CPA revenue model |
| **Multi-account Scheduler** | 🟡 Medium | Schedule across multiple pages |
| **FB Page Analytics** | 🟢 Low | Track page performance |

---

## Improvement Plan

### Phase 1: Meta Graph API Integration (Priority: 🔴 High)

**Goal:** Direct publishing to Facebook Pages without PostBridge dependency.

#### 1.1 Meta Graph API Service

```typescript
// src/services/meta-graph.service.ts

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
  fan_count: number;
}

interface PublishToPageParams {
  pageId: string;
  accessToken: string;
  message: string;
  mediaUrl?: string;
  scheduledTime?: number; // Unix timestamp
  link?: string;
}

export class MetaGraphService {
  private static readonly API_VERSION = 'v19.0';
  private static readonly BASE_URL = `https://graph.facebook.com/${this.API_VERSION}`;

  /**
   * Get user's Facebook Pages
   */
  static async getUserPages(userAccessToken: string): Promise<FacebookPage[]> {
    const response = await axios.get(`${this.BASE_URL}/me/accounts`, {
      params: {
        access_token: userAccessToken,
        fields: 'id,name,access_token,category,fan_count'
      }
    });
    return response.data.data;
  }

  /**
   * Publish to Facebook Page
   */
  static async publishToPage(params: PublishToPageParams): Promise<{ postId: string; postUrl: string }> {
    const { pageId, accessToken, message, mediaUrl, scheduledTime, link } = params;
    
    let endpoint = `${this.BASE_URL}/${pageId}/feed`;
    let body: any = {
      message,
      access_token: accessToken
    };

    if (link) {
      body.link = link;
    }

    if (scheduledTime) {
      body.published = false;
      body.scheduled_publish_time = scheduledTime;
    }

    if (mediaUrl) {
      // Upload photo first
      const photoResponse = await axios.post(`${this.BASE_URL}/${pageId}/photos`, {
        url: mediaUrl,
        published: false,
        access_token: accessToken
      });
      body.attached_media = [{ media_fbid: photoResponse.data.id }];
    }

    const response = await axios.post(endpoint, body);
    return {
      postId: response.data.id,
      postUrl: `https://facebook.com/${response.data.id}`
    };
  }

  /**
   * Bulk publish to multiple pages
   */
  static async bulkPublish(
    pages: FacebookPage[],
    message: string,
    mediaUrl?: string,
    scheduledTime?: number
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    
    for (const page of pages) {
      try {
        const result = await this.publishToPage({
          pageId: page.id,
          accessToken: page.access_token,
          message,
          mediaUrl,
          scheduledTime
        });
        results.push({ success: true, ...result, pageName: page.name });
      } catch (error) {
        results.push({ 
          success: false, 
          pageName: page.name, 
          error: error.message 
        });
      }
    }
    
    return results;
  }
}
```

#### 1.2 Database Schema

```prisma
// prisma/schema.prisma

model FacebookPage {
  id            String   @id @default(cuid())
  userId        BigInt
  pageId        String
  pageName      String
  accessToken   String
  category      String?
  fanCount      Int?
  isActive      Boolean  @default(true)
  lastUsedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id])
  posts         FacebookPost[]

  @@unique([userId, pageId])
  @@index([userId])
}

model FacebookPost {
  id            String   @id @default(cuid())
  pageId        String
  facebookPage  FacebookPage @relation(fields: [pageId], references: [id])
  postId        String
  postUrl       String?
  message       String?
  mediaUrl      String?
  status        String   @default("published") // published, scheduled, failed
  scheduledAt   DateTime?
  publishedAt   DateTime?
  createdAt     DateTime @default(now())

  @@index([pageId])
  @@index([status])
}
```

---

### Phase 2: Bulk Page Management (Priority: 🔴 High)

**Goal:** Allow users to manage 100+ Facebook pages.

#### 2.1 Page Manager Service

```typescript
// src/services/page-manager.service.ts

export class PageManagerService {
  /**
   * Sync user's Facebook pages
   */
  static async syncPages(userId: bigint, userAccessToken: string): Promise<FacebookPage[]> {
    const pages = await MetaGraphService.getUserPages(userAccessToken);
    
    for (const page of pages) {
      await prisma.facebookPage.upsert({
        where: {
          userId_pageId: { userId, pageId: page.id }
        },
        update: {
          pageName: page.name,
          accessToken: page.access_token,
          category: page.category,
          fanCount: page.fan_count,
          lastUsedAt: new Date()
        },
        create: {
          userId,
          pageId: page.id,
          pageName: page.name,
          accessToken: page.access_token,
          category: page.category,
          fanCount: page.fan_count
        }
      });
    }
    
    return pages;
  }

  /**
   * Get user's pages with pagination
   */
  static async getUserPages(
    userId: bigint, 
    page: number = 1, 
    limit: number = 20,
    search?: string
  ): Promise<{ pages: FacebookPage[], total: number }> {
    const where: any = { userId, isActive: true };
    if (search) {
      where.pageName = { contains: search, mode: 'insensitive' };
    }
    
    const [pages, total] = await Promise.all([
      prisma.facebookPage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { fanCount: 'desc' }
      }),
      prisma.facebookPage.count({ where })
    ]);
    
    return { pages, total };
  }

  /**
   * Bulk select pages for publishing
   */
  static async selectPagesForPublishing(
    userId: bigint,
    pageIds: string[]
  ): Promise<FacebookPage[]> {
    return prisma.facebookPage.findMany({
      where: {
        userId,
        pageId: { in: pageIds },
        isActive: true
      }
    });
  }
}
```

---

### Phase 3: Content Calendar (Priority: 🟡 Medium)

**Goal:** Visual scheduling interface for content planning.

#### 3.1 Calendar Service

```typescript
// src/services/content-calendar.service.ts

export class ContentCalendarService {
  /**
   * Get scheduled posts for date range
   */
  static async getScheduledPosts(
    userId: bigint,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const posts = await prisma.facebookPost.findMany({
      where: {
        facebookPage: { userId },
        scheduledAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'scheduled'
      },
      include: { facebookPage: true },
      orderBy: { scheduledAt: 'asc' }
    });

    return posts.map(post => ({
      id: post.id,
      title: post.message?.substring(0, 50) + '...',
      start: post.scheduledAt!,
      end: new Date(post.scheduledAt!.getTime() + 30 * 60 * 1000), // 30 min duration
      pageName: post.facebookPage.pageName,
      status: post.status,
      mediaUrl: post.mediaUrl
    }));
  }

  /**
   * Schedule post for specific time
   */
  static async schedulePost(
    userId: bigint,
    pageIds: string[],
    message: string,
    mediaUrl: string | undefined,
    scheduledAt: Date
  ): Promise<ScheduledPost[]> {
    const pages = await PageManagerService.selectPagesForPublishing(userId, pageIds);
    const results: ScheduledPost[] = [];

    for (const page of pages) {
      try {
        const result = await MetaGraphService.publishToPage({
          pageId: page.pageId,
          accessToken: page.accessToken,
          message,
          mediaUrl,
          scheduledTime: Math.floor(scheduledAt.getTime() / 1000)
        });

        const post = await prisma.facebookPost.create({
          data: {
            pageId: page.id,
            postId: result.postId,
            postUrl: result.postUrl,
            message,
            mediaUrl,
            status: 'scheduled',
            scheduledAt
          }
        });

        results.push({ success: true, postId: post.id, pageName: page.pageName });
      } catch (error) {
        results.push({ success: false, pageName: page.pageName, error: error.message });
      }
    }

    return results;
  }
}
```

---

### Phase 4: Affiliate Link Injection (Priority: 🟡 Medium)

**Goal:** Inject tracking links for CPA revenue model.

#### 4.1 Affiliate Service

```typescript
// src/services/affiliate.service.ts

export class AffiliateService {
  /**
   * Generate tracking link
   */
  static async generateTrackingLink(
    userId: bigint,
    destinationUrl: string,
    campaignId?: string
  ): Promise<string> {
    const trackingId = crypto.randomUUID();
    
    await prisma.affiliateLink.create({
      data: {
        userId,
        trackingId,
        destinationUrl,
        campaignId
      }
    });

    return `https://track.berkahkarya.org/${trackingId}`;
  }

  /**
   * Inject affiliate link into content
   */
  static injectAffiliateLink(
    caption: string,
    trackingUrl: string,
    position: 'top' | 'bottom' | 'middle' = 'bottom'
  ): string {
    const linkText = `\n🔗 ${trackingUrl}`;
    
    switch (position) {
      case 'top':
        return linkText + '\n\n' + caption;
      case 'middle':
        const middle = Math.floor(caption.length / 2);
        const nextNewline = caption.indexOf('\n', middle);
        const insertAt = nextNewline !== -1 ? nextNewline : middle;
        return caption.substring(0, insertAt) + linkText + caption.substring(insertAt);
      case 'bottom':
      default:
        return caption + linkText;
    }
  }

  /**
   * Track click
   */
  static async trackClick(trackingId: string, metadata: any): Promise<void> {
    const link = await prisma.affiliateLink.findUnique({
      where: { trackingId }
    });

    if (link) {
      await prisma.$transaction([
        prisma.affiliateClick.create({
          data: {
            linkId: link.id,
            ip: metadata.ip,
            userAgent: metadata.userAgent,
            referer: metadata.referer
          }
        }),
        prisma.affiliateLink.update({
          where: { id: link.id },
          data: { clickCount: { increment: 1 } }
        })
      ]);
    }
  }
}
```

---

### Phase 5: Admin Dashboard Enhancements

#### 5.1 New Admin Routes

```typescript
// src/routes/admin/meta-pages.ts

export async function registerMetaPageRoutes(server: FastifyInstance) {
  /**
   * GET /api/admin/meta-pages — List all users' Facebook pages
   */
  server.get('/api/admin/meta-pages', async (request, reply) => {
    const { page = 1, limit = 50, userId } = request.query as any;
    
    const where: any = { isActive: true };
    if (userId) where.userId = BigInt(userId);
    
    const [pages, total] = await Promise.all([
      prisma.facebookPage.findMany({
        where,
        include: { user: { select: { id: true, telegramId: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { fanCount: 'desc' }
      }),
      prisma.facebookPage.count({ where })
    ]);
    
    return { pages, total, page, limit };
  });

  /**
   * GET /api/admin/meta-pages/stats — Page statistics
   */
  server.get('/api/admin/meta-pages/stats', async () => {
    const [totalPages, activePages, totalPosts, scheduledPosts] = await Promise.all([
      prisma.facebookPage.count(),
      prisma.facebookPage.count({ where: { isActive: true } }),
      prisma.facebookPost.count(),
      prisma.facebookPost.count({ where: { status: 'scheduled' } })
    ]);
    
    return { totalPages, activePages, totalPosts, scheduledPosts };
  });
}
```

---

## Implementation Priority

```
Week 1-2: Meta Graph API Integration
  └── Direct publishing to FB Pages
  └── Bypass PostBridge dependency

Week 3-4: Bulk Page Management
  └── Sync 100+ pages per user
  └── Page selection UI

Week 5-6: Content Calendar
  └── Visual scheduling interface
  └── Drag-and-drop rescheduling

Week 7-8: Affiliate System
  └── Tracking links
  └── Click analytics
  └── CPA model integration
```

---

## Revenue Model Integration

### Current: SaaS Subscription
- User pays monthly for video generation
- Credits-based system

### New: CPA Hybrid Model
```
User generates content
        ↓
Affiliate link injected
        ↓
Published to FB Pages
        ↓
Clicks tracked
        ↓
Revenue = Subscription + CPA commissions
```

### Pricing Tiers

| Tier | Pages | Posts/Month | Price |
|------|-------|-------------|-------|
| Starter | 5 | 50 | $9.99 |
| Growth | 25 | 200 | $29.99 |
| Business | 100 | 1000 | $79.99 |
| Enterprise | Unlimited | Unlimited | $199.99 |

---

## Technical Notes

### Meta Graph API Requirements
- Facebook App with `pages_manage_posts` permission
- User access token with `pages_read_engagement` scope
- Page access token for each page

### Rate Limits
- 200 calls per hour per user
- 4800 calls per day per app

### Security Considerations
- Encrypt page access tokens at rest
- Rotate tokens every 60 days
- Validate webhook signatures
- Rate limit API endpoints
