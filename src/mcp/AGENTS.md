---
scope: src/mcp
depends_on:
  - src/config (initConfig)
  - src/services/ebook.service.ts
  - src/services (omniroute, video generation)
status: complete
---

<!-- Parent: ../AGENTS.md -->

# mcp

## Tujuan
MCP (Model Context Protocol) server bernama `1ai-content` v3.0.0 — mengekspos tool AI generation ke agent eksternal melalui transport stdio.

## Ekspor

| File | Ekspor | Detail |
|------|--------|--------|
| `stdio.ts` | — (entry node MCP) | initConfig, initializeDatabase/Redis, `createMcpServer()`, `StdioServerTransport` |
| `server.ts` | `createMcpServer(): Server` | 335 baris; array `TOOLS` berisi 11 tool ber-prefix `1ai-content_*`; handler `ListToolsRequestSchema` + `CallToolRequestSchema` |

Tool yang terdokumentasi di server.ts: `1ai-content_create_video` (192-237), `1ai-content_get_ebook_status` (291-295), `1ai-content_list_ebooks` (297-301), `1ai-content_ai_chat` (303-325) — daftar penuh 11 tool di konstanta `TOOLS`.

## Dependensi Internal
- `src/config` — `initConfig()`
- `src/services/ebook.service.ts` — `ebookService` (getStatus, listProjects, createProject, healthCheck)
- `src/services/omniroute.service.ts` — `getOmniRouteService().chat(telegramId, message)`
- `src/services/video-generation.service.ts` (dan service lain) — untuk `create_video`

## Issue Spesifik
1. ~~**HIGH — IDOR lintas-user.** get_ebook_status/list_ebooks dipanggil TANPA userId/ownership check~~ RESOLVED 2026-08-03: ownership check diterapkan (`project.userId === caller.telegramId` di `mcp/server.ts` db path + `ebook.service.ts:143,179`); mismatch → 404 `{"error":"Project not found"}`.
2. ~~**MEDIUM — `1ai-content_ai_chat`** tanpa credit check~~ RESOLVED 2026-08-09: `server.ts:311-322` — `cost = 0.2`, balance check (`getCreditBalanceAsync`), `deductCredits`.
3. ~~**MEDIUM — `1ai-content_create_video` kirim `chatId: 0`**~~ RESOLVED 2026-08-09: `server.ts:230` kini `chatId: Number(telegramId)`; user wajib ada (`findByTelegramId`, else error tool), credit gate (`getVideoCreditCostAsync`, balance check, `deductCredits`).
4. **LOW — health check (baris 174-179)** — hardcode `services: { video: true, image: true, social: true }` padahal yang benar-benar dicek hanya ebook (`healthCheck`).
5. **Catatan** — `BigInt(telegramId)` akan throw jika string tidak valid; input tool tidak divalidasi.

## Rekomendasi Perbaikan Scoped
1. ~~Tambahkan ownership check~~ DONE 2026-08-03 (lihat #1).
2. ~~Tambahkan credit check sebelum `ai_chat`; gunakan `chatId` nyata di `create_video`~~ DONE 2026-08-09 (lihat #2, #3).
3. Implementasikan health check per-service yang sebenarnya (video/image/social).
4. Validasi & parse `telegramId` dengan try/catch BigInt + pesan error yang jelas.
