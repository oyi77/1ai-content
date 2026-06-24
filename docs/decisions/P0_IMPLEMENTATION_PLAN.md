# Implementation Plan — P0 Gaps

**Date:** 2026-06-24  
**Goal:** Close all P0 gaps to achieve competitive parity with Google Veo 3.1 and Kling AI 3.0

---

## Overview

| Gap | Feature | Effort | Priority |
|-----|---------|--------|----------|
| GAP-001 | 4K Video Generation | L | P0 |
| GAP-002 | 60fps Support | M | P0 |
| GAP-003 | Audio-Video Sync | L | P0 |

---

## GAP-001: 4K Video Generation

### Research

**Industry Standard:** All major competitors (Veo 3.1, Kling 3.0, Runway Gen-4.5) offer 4K.

**State of the Art:** Google Veo 3.1 leads with native 4K + 48kHz audio sync.

**Options Evaluated:**

| Option | Pros | Cons | Complexity |
|--------|------|------|------------|
| A. Add Veo 3.1 API | Best quality, 4K native | Google lock-in, higher cost | M |
| B. Add Kling 3.0 API | Good quality, 60fps | Limited creative control | M |
| C. Upscale existing 1080p | Cheapest, no new API | Quality loss, not true 4K | S |

**Decision:** Option A (Veo 3.1) — best quality, aligns with industry leader.

### Implementation Plan

```
Phase 1: Veo 3.1 Provider Integration (3 days)
├── 1.1 Add Veo 3.1 API client
├── 1.2 Implement video generation endpoint
├── 1.3 Add to provider fallback chain
└── 1.4 Unit tests

Phase 2: 4K Pipeline (2 days)
├── 2.1 Add 4K resolution option to video generation
├── 2.2 Update storyboarding for 4K
└── 2.3 Integration tests

Phase 3: UI Integration (1 day)
├── 3.1 Add 4K option to Telegram bot
└── 3.2 Update pricing for 4K credits
```

### Acceptance Criteria
- [ ] Veo 3.1 provider generates 4K video
- [ ] 4K option available in Telegram bot
- [ ] 4K videos cost 2x credits
- [ ] Provider fallback works if Veo fails

---

## GAP-002: 60fps Support

### Research

**Industry Standard:** Kling AI 3.0 offers 60fps for smooth social content.

**Options Evaluated:**

| Option | Pros | Cons | Complexity |
|--------|------|------|------------|
| A. Add Kling 3.0 API | Native 60fps | New API dependency | M |
| B. Frame interpolation | Works with any provider | Quality varies | L |
| C. Post-processing upscale | No new APIs | Not true 60fps | S |

**Decision:** Option A (Kling 3.0) — native 60fps, best quality.

### Implementation Plan

```
Phase 1: Kling 3.0 Provider Integration (3 days)
├── 1.1 Add Kling 3.0 API client
├── 1.2 Implement 60fps video generation
├── 1.3 Add to provider fallback chain
└── 1.4 Unit tests

Phase 2: FPS Configuration (1 day)
├── 2.1 Add fps option to video generation pipeline
└── 2.2 Update Telegram bot UI

Phase 3: Testing (1 day)
├── 3.1 Integration tests for 60fps
└── 3.2 Performance benchmarks
```

### Acceptance Criteria
- [ ] Kling 3.0 provider generates 60fps video
- [ ] 60fps option available in Telegram bot
- [ ] 60fps videos cost 1.5x credits
- [ ] Fallback to 30fps if provider fails

---

## GAP-003: Audio-Video Sync

### Research

**Industry Standard:** Veo 3.1 has native 48kHz audio-video sync.

**State of the Art:** Most platforms generate video first, then add audio.

**Options Evaluated:**

| Option | Pros | Cons | Complexity |
|--------|------|------|------------|
| A. ElevenLabs integration | Best quality TTS | External dependency | M |
| B. Bark (open source) | Free, self-hosted | Lower quality | L |
| C. Google Cloud TTS | Good quality | Google lock-in | M |

**Decision:** Option A (ElevenLabs) — best quality, widely used.

### Implementation Plan

```
Phase 1: Audio Generation Service (3 days)
├── 1.1 Create audio.service.ts
├── 1.2 Add ElevenLabs API client
├── 1.3 Implement TTS generation
└── 1.4 Unit tests

Phase 2: Audio-Video Merge (2 days)
├── 2.1 Create audio-merge.service.ts
├── 2.2 Implement FFmpeg audio overlay
├── 2.3 Sync audio with video timeline
└── 2.4 Integration tests

Phase 3: Pipeline Integration (2 days)
├── 3.1 Add audio generation to video pipeline
├── 3.2 Add audio options to Telegram bot
└── 3.3 End-to-end tests
```

### Acceptance Criteria
- [ ] Audio generated from script/caption
- [ ] Audio synced with video timeline
- [ ] Audio options in Telegram bot (voice, music, none)
- [ ] Audio generation adds 5s to pipeline

---

## Execution Order

```
Day 1-3: GAP-001 Phase 1 (Veo 3.1 integration)
Day 4-5: GAP-002 Phase 1 (Kling 3.0 integration)
Day 6-8: GAP-003 Phase 1 (Audio service)
Day 9-10: GAP-001 Phase 2 (4K pipeline)
Day 11-12: GAP-002 Phase 2-3 (FPS config + testing)
Day 13-15: GAP-003 Phase 2-3 (Audio merge + integration)
Day 16-17: Integration testing + bug fixes
Day 18-19: UI updates + pricing
Day 20: Documentation + deployment
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Veo 3.1 API unavailable | Fallback to Kling 3.0 |
| ElevenLabs rate limits | Implement retry + caching |
| 4K generation slow | Queue with priority |
| Audio sync issues | FFmpeg timestamp alignment |
