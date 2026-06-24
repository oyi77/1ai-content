# Ecosystem Architecture — 1AI Platform

## Three-Project Split

```
┌─────────────────────────────────────────────────────────────────────┐
│                        1AI ECOSYSTEM                                │
├─────────────────┬─────────────────┬─────────────────┤               │
│   1ai-content   │   1ai-social    │  1ai-affiliate  │               │
│   (Generator)   │  (Distributor)  │  (Monetizer)    │               │
├─────────────────┼─────────────────┼─────────────────┤               │
│ Telegram Bot    │ Multi-platform  │ CPA Tracking    │               │
│ Video/Image Gen │ Bulk Publishing │ Smartlinks      │               │
│ Content Pipeline│ Scheduling      │ Commission      │               │
│ Payment (IDR)   │ Analytics       │ Attribution     │               │
└────────┬────────┴────────┬────────┴────────┬────────┘               │
         │                 │                 │                         │
         └─────────────────┼─────────────────┘                         │
                           │                                           │
                    ┌──────▼──────┐                                    │
                    │  PostgreSQL │                                    │
                    │   (shared)  │                                    │
                    └─────────────┘                                    │
```

---

## Feature Distribution

### 1ai-content (Content Generator)
**Role:** Generate content, handle payments, Telegram bot interface

| Feature | Status | Description |
|---------|--------|-------------|
| Video Generation | ✅ | Multi-platform (TikTok, IG, YT, FB) |
| Content Pipeline | ✅ | Script → Storyboard → Video |
| Image Generation | ✅ | Gemini, Flux, SDXL |
| Telegram Bot | ✅ | User interface |
| Payment | ✅ | Midtrans, Tripay, DuitKu |
| Meta CAPI | ✅ | Conversion tracking |
| Whitelabel | ✅ | Multi-brand support |
| Admin Dashboard | ✅ | Content management |

**DOES NOT HANDLE:**
- ❌ Social media publishing (→ 1ai-social)
- ❌ Affiliate tracking (→ 1ai-affiliate)
- ❌ Bulk scheduling (→ 1ai-social)

---

### 1ai-social (Content Distributor)
**Role:** Publish content to social media platforms at scale

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-platform Publishing | ✅ | X, IG, TikTok, LinkedIn, FB, YT |
| Bulk Scheduling | ✅ | Schedule across multiple accounts |
| Content Calendar | ✅ | Visual scheduling interface |
| Engagement Automation | ✅ | Auto-like, comment, follow |
| Analytics | ✅ | Cross-platform metrics |
| API Keys | ✅ | Multi-tenant isolation |
| Billing | ✅ | LemonSqueezy integration |

**NEW FEATURES TO ADD:**

| Feature | Priority | Description |
|---------|----------|-------------|
| FB Page Management | 🔴 High | Manage 100+ Facebook pages |
| Meta Graph API | 🔴 High | Direct publishing to FB/IG |
| Bulk Page Scheduler | 🔴 High | Schedule posts across pages |
| Content Calendar UI | 🟡 Medium | Drag-and-drop scheduling |
| Cross-platform Analytics | 🟡 Medium | Unified metrics dashboard |

---

### 1ai-affiliate (Revenue Monetizer)
**Role:** Track clicks, manage affiliates, handle CPA commissions

| Feature | Status | Description |
|---------|--------|-------------|
| Click Tracking | ✅ | Sub-ms edge redirect |
| Smartlinks | ✅ | Multi-offer routing |
| Commission Management | ✅ | Payout ledger |
| Attribution | ✅ | First/last/linear touch |
| Fraud Detection | ✅ | 40+ bot signatures |
| Analytics | ✅ | ClickHouse OLAP |
| AI Creative Tools | ✅ | Banner, carousel, captions |

**NEW FEATURES TO ADD:**

| Feature | Priority | Description |
|---------|----------|-------------|
| Content Affiliate Links | 🔴 High | Auto-inject tracking links |
| CPA Campaign Builder | 🔴 High | Create CPA campaigns |
| Revenue Dashboard | 🟡 Medium | Subscription + CPA revenue |
| Payout Automation | 🟡 Medium | Auto-commission payout |

---

## Data Flow

### Content Creation → Publishing → Monetization

```
┌──────────────────┐
│   1ai-content    │
│  (Telegram Bot)  │
│                  │
│  User uploads    │
│  photo/video     │
│       ↓          │
│  AI generates    │
│  content         │
└────────┬─────────┘
         │ API call
         ↓
┌──────────────────┐
│   1ai-social     │
│  (Publisher)     │
│                  │
│  Receives media  │
│       ↓          │
│  Injects aff.    │──────────────────────┐
│  link            │                      │
│       ↓          │                      │
│  Publishes to    │                      │
│  FB/IG/TikTok    │                      │
└────────┬─────────┘                      │
         │                                │
         ↓                                ↓
┌──────────────────┐            ┌──────────────────┐
│  Social Media    │            │  1ai-affiliate   │
│  Platforms       │            │  (Tracker)       │
│                  │            │                  │
│  Posts live      │            │  Tracks clicks   │
│       ↓          │            │       ↓          │
│  Users click     │───────────→│  Attributes      │
│  affiliate link  │            │  conversions     │
│                  │            │       ↓          │
│                  │            │  Calculates      │
│                  │            │  commission      │
└──────────────────┘            └────────┬─────────┘
                                         │
                                         ↓
                                ┌──────────────────┐
                                │  Payout System   │
                                │  (1ai-affiliate) │
                                └──────────────────┘
```

---

## API Integration Points

### 1ai-content → 1ai-social

```typescript
// POST /api/social/publish
{
  "mediaUrl": "https://cdn.berkahkarya.org/video/abc123.mp4",
  "caption": "Check out this amazing product! 🔥",
  "platforms": ["facebook", "instagram", "tiktok"],
  "scheduledAt": "2026-06-24T10:00:00Z",
  "pageIds": ["page_123", "page_456"],
  "affiliateLink": true  // Auto-inject tracking link
}
```

### 1ai-social → 1ai-affiliate

```typescript
// POST /api/affiliate/generate-link
{
  "destinationUrl": "https://berkahkarya.org/product/xyz",
  "campaignId": "camp_abc",
  "userId": "user_123"
}
// Response: { "trackingUrl": "https://track.berkahkarya.org/uuid-123" }
```

### 1ai-affiliate → 1ai-content (Webhook)

```typescript
// POST /webhook/conversion
{
  "clickId": "click_abc",
  "conversionType": "purchase",
  "revenue": 50000,
  "currency": "IDR",
  "userId": "user_123"
}
```

---

## Database Schema (Shared)

### Shared Tables (PostgreSQL)

```sql
-- Users table (shared across all services)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  email VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free',
  credits INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content table (1ai-content)
CREATE TABLE content (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  type VARCHAR(50), -- video, image, carousel
  media_url TEXT,
  caption TEXT,
  platform VARCHAR(50),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Social posts table (1ai-social)
CREATE TABLE social_posts (
  id BIGSERIAL PRIMARY KEY,
  content_id BIGINT REFERENCES content(id),
  platform VARCHAR(50),
  platform_post_id VARCHAR(255),
  page_id VARCHAR(255),
  status VARCHAR(50),
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Affiliate links table (1ai-affiliate)
CREATE TABLE affiliate_links (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  tracking_id VARCHAR(255) UNIQUE,
  destination_url TEXT,
  campaign_id VARCHAR(255),
  click_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                             │
│                    *.aitradepulse.com                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ↓                   ↓                   ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  content.       │ │  social.        │ │  affiliate.     │
│  aitradepulse   │ │  aitradepulse   │ │  aitradepulse   │
│  :3000          │ │  :8200/:8201    │ │  :3001          │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ↓                   ↓                   ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  1ai-content    │ │  1ai-social     │ │  1ai-affiliate  │
│  (Node.js)      │ │  (FastAPI)      │ │  (Node+Go+PHP)  │
│  PM2 cluster    │ │  uvicorn        │ │  Express+Edge   │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (berkahkarya) │
                    └─────────────────┘
```

---

## Next Steps

### Phase 1: Integration (Week 1-2)
- [ ] Create API contracts between services
- [ ] Set up shared database schema
- [ ] Implement 1ai-content → 1ai-social publish endpoint
- [ ] Implement 1ai-social → 1ai-affiliate link injection

### Phase 2: Meta Graph API (Week 3-4)
- [ ] Add Meta Graph API to 1ai-social
- [ ] Implement bulk page management
- [ ] Add content calendar UI

### Phase 3: CPA Model (Week 5-6)
- [ ] Add CPA campaign builder to 1ai-affiliate
- [ ] Implement auto-link injection in 1ai-social
- [ ] Create unified revenue dashboard

### Phase 4: Scale (Week 7-8)
- [ ] Optimize bulk scheduling (100+ pages)
- [ ] Add cross-platform analytics
- [ ] Implement payout automation
