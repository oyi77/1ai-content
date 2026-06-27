# Research: TikTok Creator API Integration
## Date: 2026-06-26

## Industry Standard
Most content tools use TikTok's unofficial APIs or browser automation (CDP) for posting. Official TikTok API access is limited to approved Marketing Partners.

## State of the Art
- **TikTok Content Posting API** (v2): Official API for business accounts. Requires app review + approval.
- **TikTok Login Kit**: OAuth2 for user authentication.
- **TikTok Display API**: Read-only access to public content.
- **Symphony Creative Studio**: ByteDance's native AI creative tool (not available as API).

## Current Status (2026)
- TikTok Content Posting API is available but requires:
  1. TikTok for Developers account
  2. App review (2-4 weeks)
  3. Business verification
  4. Content compliance review
- API supports: video upload, caption, hashtags, privacy settings
- API does NOT support: carousel posting (images only via web), DM management, comment management

## Options Evaluated
| Option | Pros | Cons | Complexity |
|--------|------|------|------------|
| A: Official API | Reliable, compliant, no ban risk | Long approval process, limited features | M |
| B: CDP (current) | Full control, all features, stealth | Ban risk, maintenance, fragile | L |
| C: Hybrid (API + CDP) | Best of both, fallback | Complex routing, two codepaths | XL |
| D: Third-party (Upload-Post.com) | Quick setup, multi-platform | Cost, dependency, limited control | S |

## Decision
**Option C: Hybrid approach** — Apply for official API, use CDP as fallback until approved.

### Implementation Plan
1. **Phase 1** (Now): Continue with CloakBrowser CDP (current)
2. **Phase 2** (Week 2-4): Apply for TikTok Content Posting API
3. **Phase 3** (Week 6+): Implement hybrid router — try API first, fallback to CDP
4. **Phase 4** (Week 8+): Migrate fully to API for video posting, keep CDP for comments/DMs

### API Endpoints to Implement
- `POST /api/tiktok/upload` — Upload video via official API
- `POST /api/tiktok/post` — Publish with caption + hashtags
- `GET /api/tiktok/status` — Check API availability
- `POST /api/tiktok/carousel` — Upload carousel (when API supports it)

## Reference Implementations
- TikTok for Developers: https://developers.tiktok.com/
- Content Posting API docs: https://developers.tiktok.com/doc/content-posting-api
- Upload-Post.com: https://upload-post.com (third-party alternative)

## Risk Assessment
- **API approval may take 2-4 weeks** — keep CDP as primary
- **API may not support carousels** — keep CDP for carousel posting
- **API rate limits** — implement queue-based throttling
- **Content compliance** — API has stricter content review than CDP
