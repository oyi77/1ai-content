<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# services

## Purpose
Business logic layer with 76 top-level `*.service.ts` files covering video generation, payment processing, AI prompt optimization, user management, analytics, and social media posting. Tabel `Key Files` di bawah non-exhaustive (41 dari 76 terdokumentasi).

## Key Files

| File | Description |
|------|-------------|
| `user.service.ts` | User CRUD, credit management, refunds |
| `payment.service.ts` | Payment processing, webhook normalization |
| `payment-settings.service.ts` | Gateway enable/disable, dynamic pricing CRUD (60s cache) |
| `video.service.ts` | Video record management |
| `video-generation.service.ts` | Video generation pipeline orchestration |
| `video-fallback.service.ts` | Provider fallback logic |
| `video-post-processing.service.ts` | Post-processing (watermark, resize) |
| `video-analysis.service.ts` | Video content analysis |
| `image.service.ts` | Image generation across providers |
| `subscription.service.ts` | Subscription plan management |
| `referral.service.ts` | Referral/affiliate tracking and commissions |
| `analytics.service.ts` | Usage analytics and reporting |
| `circuit-breaker.service.ts` | Circuit breaker for provider health |
| `provider-router.service.ts` | 9-tier provider routing with fallback |
| `provider-settings.service.ts` | Provider configuration management |
| `prompt-optimizer.service.ts` | Prompt optimization for video scenes |
| `ai-prompt-optimizer.service.ts` | AI-powered prompt enhancement |
| `audio-vo.service.ts` | Audio voice-over generation |
| `content-analysis.service.ts` | Content moderation and analysis |
| `quality-check.service.ts` | Video quality validation |
| `scene-consistency.service.ts` | Visual consistency across scenes |
| `watermark.service.ts` | Watermark application |
| `omniroute.service.ts` | OmniRoute hybrid routing for chat |
| `grok-api.service.ts` | Grok AI API integration |
| `geminigen.service.ts` | Gemini AI generation |
| `tripay.service.ts` | Tripay payment gateway |
| `duitku.service.ts` | DuitKu payment gateway |
| `nowpayments.service.ts` | NOWPayments crypto gateway |
| `meta-capi.service.ts` | Meta Conversions API tracking |
| `postautomation.service.ts` | Automated social media posting |
| `postbridge.service.ts` | Social media post bridging |
| `campaign.service.ts` | Marketing campaign management |
| `gamification.service.ts` | Achievement and reward system |
| `ads.service.ts` | Advertisement management |
| `saved-prompt.service.ts` | User saved prompt CRUD |
| `avatar.service.ts` | User avatar management |
| `vilona-animation.service.ts` | Vilona animation integration |
| `metrics.service.ts` | Prometheus metrics exposure |
| `token-tracker.service.ts` | AI token usage tracking |
| `admin-alert.service.ts` | Admin notification alerts |
| `p2p.service.ts` | Peer-to-peer service |

> **Catatan SRC (2026-08-02):** Direktori ini berisi **76 file `*.service.ts`** level-atas (104 rekursif — subfolder `video/`, `youtube/`, `audio/`, `image/`, `video-analysis/`, `content-analysis/`), tapi tabel di atas hanya mendokumentasikan 41. Berikut **35 service yang tidak terdaftar** di tabel (diverifikasi ada di disk, urutan alfabetis):
>
> `admin-config`, `ai-config`, `ai-task-settings`, `balance-checker`, `content-factory`, `content-pipeline`, `content-rework`, `content-webhook`, `custom-provider`, `dynamic-pricing`, `ebook`, `exchange-rate`, `intercept`, `money-printer`, `provider-balance`, `provider-cost-tracker`, `shared-ai-pipeline`, `shared-platform-adapters`, `storyboard-image`, `storyboard-visual`, `template-video`, `tiktok-automation`, `tiktok-social`, `user-credits`, `user-crud`, `user-referral`, `user-stats`, `user-telegram`, `video-clipper`, `video-editor`, `video-library`, `video-lifecycle`, `video-storyboard`, `viral-scanner`, `whitelabel`
>
> Sebelum mengubah tabel, jalankan `ls -1 src/services/*.service.ts` untuk daftar lengkap terbaru.

## For AI Agents

### Working In This Directory
- Services are the main business logic layer — handlers call services, not the reverse
- Provider fallback chain: BytePlus > XAI > LaoZhang > EvoLink > Hypereal > SiliconFlow > Fal.ai > Kie.ai > Remotion
- `circuit-breaker.service.ts` manages provider health state
- `payment-settings.service.ts` has 60s cache for dynamic pricing

### Testing Requirements
- Unit tests in `tests/unit/services/`
- Mock external API calls, use fixtures for test data

### Common Patterns
- Services are singleton modules (not classes with `new`)
- Use Prisma client from `@/config/database` for DB access
- External API calls wrapped in try/catch with circuit breaker

## Dependencies

### Internal
- `@/config/database` — Prisma client
- `@/config/redis` — Redis client
- `@/config/queue` — BullMQ queues
- `@/types` — type definitions

### External
- `@prisma/client`, `ioredis`, `bullmq`, `axios`

<!-- MANUAL: -->
