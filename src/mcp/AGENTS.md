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

Tool yang terdokumentasi di server.ts: `1ai-content_create_video` (188-233), `1ai-content_get_ebook_status` (287-291), `1ai-content_list_ebooks` (293-297), `1ai-content_ai_chat` (299-304) — daftar penuh 11 tool di konstanta `TOOLS`.

## Dependensi Internal
- `src/config` — `initConfig()`
- `src/services/ebook.service.ts` — `ebookService` (getStatus, listProjects, createProject, healthCheck)
- `src/services/omniroute.service.ts` — `getOmniRouteService().chat(telegramId, message)`
- `src/services/video-generation.service.ts` (dan service lain) — untuk `create_video`

## Issue Spesifik
1. **HIGH — IDOR lintas-user.** `1ai-content_get_ebook_status` (server.ts:287-291) → `ebookService.getStatus(projectId)` dan `1ai-content_list_ebooks` (293-297) → `ebookService.listProjects(limit)` dipanggil TANPA userId/ownership check. `ebook.service.ts:143` & `179` → GET `{EBOOK_API_URL}/text/ebook/projects/{id}/status` / `?limit=` — project milik semua user dapat dibaca/dilist. Trace: `server.ts:293-297` → `ebook.service.ts:179` → HTTP GET `EBOOK_API_URL`.
2. **MEDIUM — `1ai-content_ai_chat` (299-304)** — `chat(telegramId, message)` dipanggil tanpa credit check → pemakaian AI tidak terbatas lewat MCP.
3. **MEDIUM — `1ai-content_create_video` (188-233)** — mengirim `chatId: 0` (baris 226) → hasil video tidak terkirim ke user mana pun.
4. **LOW — health check (baris 173)** — hardcode `services: { video: true, image: true, social: true }` padahal yang benar-benar dicek hanya ebook (`healthCheck`).
5. **Catatan** — `BigInt(telegramId)` akan throw jika string tidak valid; input tool tidak divalidasi.

## Rekomendasi Perbaikan Scoped
1. Tambahkan ownership check: filter project berdasarkan userId (pass userId ke service, atau cek kepemilikan di server sebelum return).
2. Tambahkan credit check sebelum `ai_chat`; gunakan `chatId` nyata di `create_video` alih-alih `0`.
3. Implementasikan health check per-service yang sebenarnya (video/image/social).
4. Validasi & parse `telegramId` dengan try/catch BigInt + pesan error yang jelas.
