<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# workers

## Purpose
BullMQ worker processes for async job processing. The video generation worker is the core pipeline with 9-tier provider fallback.

## Key Files

| File | Description |
|------|-------------|
| `video-generation.worker.ts` | Main video pipeline — 9-tier provider fallback via circuit breaker. On success: upload to S3/R2, notify user. On failure: refund credits, notify user. |
| `retention.worker.ts` | Sends re-engagement messages to inactive users |
| `cleanup.worker.ts` | Cleans up expired/orphaned resources |
| `weekly-leaderboard.worker.ts` | Computes and publishes weekly leaderboards |

## For AI Agents

### Working In This Directory
- Workers run in the same process, registered in `src/index.ts`
- `video-generation.worker.ts` is heavily modified — test changes carefully
- Provider chain: BytePlus > XAI > LaoZhang > EvoLink > Hypereal > SiliconFlow > Fal.ai > Kie.ai > Remotion
- Failed jobs trigger `UserService.refundCredits()`

### Testing Requirements
- Test with mocked BullMQ job objects
- Verify error handling and refund paths

## Dependencies

### Internal
- `@/services/*` — business logic
- `@/config/queue` — queue definitions
- `@/config/providers` — provider configs

### External
- `bullmq` — job processing framework

<!-- MANUAL: -->
