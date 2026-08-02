<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-08-02 -->

# unit

## Purpose
Unit tests using Jest with ts-jest. Mock external dependencies. Follow patterns in `tests/setup-mocks.ts`.

## Key Files

| File | Description |
|------|-------------|
| `example.test.ts` | Example test template (placeholder — tidak ada assertion bermakna) |
| `comprehensive.test.ts` | Comprehensive cross-cutting tests (40KB, integrasi antar-domain) |
| `content-rework.test.ts` | `ContentReworkService.getOutputPath` |
| `video-clipper.test.ts` | `VideoClipperService.getFormatString` / `buildSearchUrl` |
| `video-editor.test.ts` | `VideoEditorService.getOutputPath` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `commands/` | Command handler tests (see `commands/AGENTS.md`) |
| `services/` | Service layer tests (see `services/AGENTS.md`) |
| `routes/` | Route handler tests (see `routes/AGENTS.md`) |
| `config/` | Config module tests (see `config/AGENTS.md`) |
| `repositories/` | Repository layer tests (`repositories.test.ts` — UserRepository, VideoRepository) |
| `utils/` | Helper tests (`prisma-helpers.test.ts` — toUserCreditBalance, toTelegramId, toDecimal, dst.) |
| `workers/` | Worker tests (`video-generation.worker.intercept.test.ts` — interception branch, refund path) |

## For AI Agents

### Working In This Directory
- Run with `npm test` or `npx jest tests/unit/<file>`
- Use `tests/setup-mocks.ts` for consistent mock patterns
- Mock Prisma, Redis, BullMQ, and external APIs
- Repositori/service yang punya test di `repositories/` / `services/` — cek AGENTS.md subfolder sebelum menambah

<!-- MANUAL: -->
> Last updated: 2026-08-02 — audit forensik ulang: tambah subdir repositories/, utils/, workers/; tambah key files content-rework/video-clipper/video-editor; catat example.test.ts sebagai placeholder.
