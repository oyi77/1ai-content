<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# flows

## Purpose
Video generation orchestration. Bridges the user's completed create form to the BullMQ job queue.

## Key Files

| File | Description |
|------|-------------|
| `generate.types.ts` | Shared types (`GenerateMode`, `GenerateAction`, `Platform`) and helpers (`clearGenerateSession`, `getStepIndicator`, `downloadToLocal`) |
| `generate.ui.ts` | All `show*` UI/presentation functions — inline keyboards and message rendering (~600 lines) |
| `generate.input.ts` | Input handlers (`handleProductInput`, `requestProductInput`, `handleMultiImageUpload`, etc.) and routing logic |
| `generate.execution.ts` | `executeGeneration()` — the core execution pipeline: credit checks, free trial, scene gen, queuing, fallback (~570 lines) |
| `generate.callback.ts` | `handleGenerateCallback()` — callback data router for V3 generation flow |
| `generate.ts` | Barrel re-export (backward compat) — was previously a 1565-line god object, now aggregates 5 focused modules |

## For AI Agents

### Working In This Directory
- `executeGeneration()` in `generate.execution.ts` is the critical path between user input and video pipeline
- `generate.ui.ts` handles all keyboard/message rendering — keep it pure presentation
- `generate.input.ts` routes user input to the right next step based on mode/action
- Changes to execution logic go in `generate.execution.ts` — test thoroughly, failures mean lost credits and bad UX
- Import from sub-modules directly when you only need one piece:
  `import { executeGeneration } from '@/flows/generate.execution'`
- The barrel `generate.ts` is for backward compatibility only

### Common Patterns
- Reads from `ctx.session.videoCreation` accumulator
- Enqueues jobs to BullMQ `video-generation` queue

## Dependencies

### Internal
- `@/services/video-generation.service`, `@/services/image.service`
- `@/config/queue`, `@/config/hpas-engine`

### External
- `bullmq`

<!-- MANUAL: -->
