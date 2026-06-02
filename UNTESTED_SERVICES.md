# Untested Services Inventory

**Date:** 2026-06-02
**Phase:** 1.3 of REFACTORING_AUDIT.md
**Total services:** 60
**Services with tests:** 21
**Untested services:** 39

This document tracks services lacking unit test coverage. Prioritized by risk and coupling radius per REFACTORING_AUDIT.md §1.

## P0 — Critical (large size + high coupling)

| # | Service | Lines | Risk | Notes |
|---|---------|-------|------|-------|
| 1 | `image.service.ts` | 22.3K | 🔴 | 17 providers, circuit breaker, public API |
| 2 | `video-fallback.service.ts` | 14.5K | 🔴 | 17 providers, orchestrator |
| 3 | `video-generation.service.ts` | 23.3K | 🔴 | Pipeline orchestration |
| 4 | `video-post-processing.service.ts` | 19.3K | 🔴 | FFmpeg pipeline |
| 5 | `content-analysis.service.ts` | 31.7K | 🔴 | Largest file, AI integration |
| 6 | `balance-checker.service.ts` | 22.5K | 🟠 | Credit logic |
| 7 | `video-analysis.service.ts` | 24.4K | 🟠 | AI integration |
| 8 | `video.service.ts` | 26.1K | 🟠 | CRUD + business logic |
| 9 | `user.service.ts` | 16.9K | 🟠 | Core domain |
| 10 | `payment.service.ts` | 14.2K | 🟠 | Multi-gateway |
| 11 | `gaminification.service.ts` | 14.6K | 🟠 | Reward system |
| 12 | `omniroute.service.ts` | 15.3K | 🟠 | Routing |
| 13 | `audio-vo.service.ts` | 13.5K | 🟠 | Audio processing |
| 14 | `ai-prompt-optimizer.service.ts` | 12.7K | 🟠 | AI integration |
| 15 | `watermark.service.ts` | 12.3K | 🟡 | Media processing |
| 16 | `duitku.service.ts` | 11.8K | 🟡 | Payment gateway |
| 17 | `tripay.service.ts` | 10.9K | 🟡 | Payment gateway |
| 18 | `geminigen.service.ts` | 10.6K | 🟡 | AI integration |
| 19 | `meta-capi.service.ts` | 10.4K | 🟡 | Tracking |
| 20 | `nowpayments.service.ts` | 10.4K | 🟡 | Crypto payment |
| 21 | `subscription.service.ts` | 11.3K | 🟡 | Subscription |
| 22 | `analytics.service.ts` | 11.3K | 🟡 | Reporting |
| 23 | `admin-config.service.ts` | 11.0K | 🟡 | Config storage |
| 24 | `provider-cost-tracker.service.ts` | 11.0K | 🟡 | Cost tracking |
| 25 | `ai-config.service.ts` | 9.0K | 🟡 | Config |
| 26 | `scene-consistency.service.ts` | 9.0K | 🟡 | Video consistency |
| 27 | `content-rework.service.ts` | 9.2K | 🟡 | Content pipeline |
| 28 | `custom-provider.service.ts` | 9.1K | 🟡 | Provider mgmt |
| 29 | `payment-settings.service.ts` | 11.2K | 🟡 | Config |
| 30 | `postautomation.service.ts` | 8.0K | 🟡 | Posting |
| 31 | `dynamic-pricing.service.ts` | 7.9K | 🟡 | Pricing |
| 32 | `provider-balance.service.ts` | 7.9K | 🟡 | Balance |
| 33 | `quality-check.service.ts` | 7.9K | 🟡 | AI check |
| 34 | `campaign.service.ts` | 7.7K | 🟡 | Marketing |
| 35 | `video-clipper.service.ts` | 7.0K | 🟡 | Media |
| 36 | `grok-api.service.ts` | 7.1K | 🟡 | AI |
| 37 | `avatar.service.ts` | 6.6K | 🟢 | Avatar |
| 38 | `token-tracker.service.ts` | 6.1K | 🟢 | Tracking |
| 39 | `ebook.service.ts` | 5.7K | 🟢 | Ebook |
| 40 | `referral.service.ts` | 3.9K | 🟢 | Referral |
| 41 | `metrics.service.ts` | 3.9K | 🟢 | Prometheus |
| 42 | `shared-ai-pipeline.service.ts` | 3.6K | 🟢 | Shared |
| 43 | `content-webhook.service.ts` | 3.7K | 🟢 | Webhook |
| 44 | `circuit-breaker.service.ts` | 3.7K | 🟢 | ⚠️ HAS partial test |
| 45 | `ai-task-settings.service.ts` | 2.3K | 🟢 | Settings |
| 46 | `ads.service.ts` | 1.8K | 🟢 | Ads |
| 47 | `admin-alert.service.ts` | 1.7K | 🟢 | Alerts |
| 48 | `saved-prompt.service.ts` | 1.5K | 🟢 | CRUD |
| 49 | `shared-platform-adapters.service.ts` | 1.5K | 🟢 | Adapters |
| 50 | `intercept.service.ts` | 3.1K | 🟢 | ⚠️ HAS test |
| 51 | `vilona-animation.service.ts` | 3.0K | 🟢 | Animation |
| 52 | `prompt-optimizer.service.ts` | 4.4K | 🟢 | Prompts |
| 53 | `template-video.service.ts` | 1.9K | 🟢 | Templates |
| 54 | `provider-settings.service.ts` | 4.3K | 🟢 | ⚠️ HAS test |
| 55 | `provider-router.service.ts` | 5.0K | 🟢 | ⚠️ HAS test |
| 56 | `postbridge.service.ts` | 2.2K | 🟢 | Social |
| 57 | `p2p.service.ts` | 4.9K | 🟢 | P2P |
| 58 | `exchange-rate.service.ts` | 3.2K | 🟢 | FX |
| 59 | `video-editor.service.ts` | 12.0K | 🟡 | FFmpeg |
| 60 | `viral-scanner.service.ts` | 13.7K | 🟡 | AI |

## Strategy

**Phase 6.1 (next)** will add unit tests for the top 16 P0 services first. The list above will be re-prioritized based on real risk once coverage data is available.
