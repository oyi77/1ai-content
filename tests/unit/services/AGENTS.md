<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 -->

# Service Unit Tests

Jest tests for business logic services. Test data access, transformations, and integrations with mocked dependencies.

## Purpose

Verify service layer behavior: user management, payment processing, video generation, subscriptions, gamification, and third-party integrations.

## Key Files

| File | Purpose |
|---|---|
| `user.service.test.ts` | User CRUD, credit mutations, language/timezone, referral tracking |
| `payment.service.test.ts` | Payment processing, status checking, credit allocation |
| `payment-settings.service.test.ts` | Payment gateway enable/disable, pricing CRUD, configuration |
| `subscription.service.test.ts` | Subscription creation, renewal, cancellation, plan enforcement |
| `referral.service.test.ts` | Referral link generation, reward calculation, claim processing |
| `video.service.test.ts` | Video CRUD, metadata storage, gallery queries, sharing |
| `video-generation.service.test.ts` | Job enqueuing, provider selection, retry logic, credit refunds |
| `circuit-breaker.service.test.ts` | Circuit breaker state machine, failure thresholds, recovery |
| `provider-router.service.test.ts` | 9-tier provider fallback, load balancing, error handling |
| `hpas-engine.test.ts` | HPAS preset building, custom configuration, scene generation |
| `prompt-engine.test.ts` | Prompt template rendering, variable substitution, validation |
| `scene-consistency.test.ts` | Visual consistency checks, image reference quality, aspect ratio handling |
| `audio-vo.test.ts` | Voice-over generation, language support, audio mixing |
| `gamification.service.test.ts` | Points, badges, leaderboards, milestone tracking |
| `campaign.service.test.ts` | Campaign creation, targeting, analytics, performance tracking |
| `tripay.service.test.ts` | Tripay payment gateway integration, webhook validation |
| `duitku.service.test.ts` | DuitKu payment gateway integration, balance checking |
| `nowpayments.service.test.ts` | NOWPayments crypto integration, invoice generation |
| `admin-alert.service.test.ts` | Admin alert service unit test |
| `ai-task-settings.service.test.ts` | AI task settings service unit test |
| `exchange-rate.service.test.ts` | Exchange rate service unit test |
| `intercept.service.test.ts` | Intercept service unit test |
| `payment-gateway.base.test.ts` | Payment gateway base class unit test |
| `provider-settings.service.test.ts` | Provider settings service unit test |
| `saved-prompt.service.test.ts` | Saved prompt service unit test |
| `shared-ai-pipeline.service.test.ts` | Shared AI pipeline service unit test |
| `template-video.service.test.ts` | Template video service unit test |
| `tiktok-social.service.test.ts` | TikTok social service unit test |
| `token-tracker.service.test.ts` | Token tracker service unit test |
| `user-split.test.ts` | User split logic unit test |
| `video-split.test.ts` | Video split logic unit test |
| `whitelabel.service.test.ts` | Whitelabel service unit test |

> Catatan: 14 file di atas ditambahkan dari listing disk (32 file test total); deskripsi detail per-file belum diaudit pada 2026-08-02.

<!-- MANUAL: -->
> Last updated: 2026-08-02 — audit forensik ulang: tambah 14 file yang ada di disk namun tidak tercantum; daftar sekarang lengkap 32 file.
