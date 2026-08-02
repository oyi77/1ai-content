---
scope: src/content-bot
depends_on:
  - src/services/content-pipeline.service.ts
  - src/services/whitelabel.service.ts
  - src/handlers/messages/content-factory
  - src/config (appConfig)
  - src/types (BotContext)
status: complete
---

<!-- Parent: ../AGENTS.md -->

# content-bot

## Tujuan
Pipeline generate konten baru di Telegram — bot Telegraf terpisah dari bot utama (auto-launch via barrel `src/content-bot.ts`). Alur: input URL/audio → analisis → script → generate → publish, plus command whitelabel.

## Ekspor

| File | Ekspor | Detail |
|------|--------|--------|
| `main.ts` | `main()` | Init DB/Redis, `registerHandlers(bot)`, `deleteWebhook`, `bot.launch()`, `setMyCommands` (8 command: create, suno, voice, music, loop, storyboard, analyze, whitelabel), shutdown SIGINT/SIGTERM |
| `setup.ts` | `appConfig`, `bot` | `initConfig()` + `new Telegraf<BotContext>(appConfig.BOT_TOKEN)` (baris 10-11, dievaluasi saat module load); session middleware inline; `getSession` (baris 28) TIDAK dipakai (Map tanpa TTL) |
| `pipeline.ts` | `pipelines`, `getPipeline`, `renderStep` | State machine `Map<number, PipelineState>` (baris 18, tanpa TTL); step: input → analyzing → analysis_done → script_done → generate → done; re-export tipe dari `@/services/content-pipeline.service` (detectInputType, analyzeInput, generateScript, formatAnalysis, formatScript, PipelineState, AnalysisResult, ContentScript) |
| `handlers.ts` | `registerHandlers(bot)` + handler command/callback | 450 baris; `/create`, `/whitelabel register`, callback `pipe_*` |
| `ensure-user.ts` | `ensureUser(ctx)` | `UserService.findByTelegramId(BigInt(from.id))`, create jika belum ada, return boolean |

## Dependensi Internal
- `src/services/content-pipeline.service.ts` — detectInputType / analyzeInput / generateScript / formatAnalysis / formatScript (re-export tipe di pipeline.ts)
- `src/services/whitelabel.service.ts` — `register(bot_token)` dipanggil di handlers.ts:189-215 (cara penyimpanan token belum diverifikasi — lihat Issue #6)
- `src/handlers/messages/content-factory` — `handleVoiceTextWaiting` / `handleLoopAudioWaiting` (dipanggil handlers.ts:429-434)
- `src/config` — `appConfig` (BOT_TOKEN)
- `src/types` — `BotContext`
- `src/services/user.service.ts` — UserService (via ensure-user.ts)

## Issue Spesifik
1. **HIGH — alur pipeline text broken.** `handlers.ts:429-434` (`bot.on("text")`) hanya memanggil `handleVoiceTextWaiting(ctx)` + `handleLoopAudioWaiting(ctx)`; TIDAK ada routing teks ke pipeline. Konsekuensi: `/create` tanpa arg menampilkan step "input" ("Kirim salah satu: URL/...") tapi teks user tidak pernah diproses; `pipe_edit_script` (393-397) set `p.step = "input"` lalu menunggu revisi yang tidak pernah diterima. Trace: `handlers.ts:429` → `pipeline.ts:20-23` (getPipeline) → tidak ada consumer teks.
2. **MEDIUM — `pipe_generate` (398-401) & `pipe_publish` (402-408)** — stub, membalas "fitur dalam pengembangan".
3. **MEDIUM — `pipelines` Map (pipeline.ts:18) tanpa TTL** — leak potensial untuk user yang tidak menyelesaikan pipeline.
4. **LOW — shadowing** — `handlers.ts:197` `const bot = await WhiteLabelService.register(...)` menutupi param `bot` dari scope luar.
5. **LOW — `getSession` (setup.ts:28) tidak dipakai** — Map tanpa TTL yang tidak pernah dibaca.
6. **Catatan** — `/whitelabel register` (189-215) menerima `bot_token` dari user; pastikan tidak disimpan plaintext (verifikasi di `whitelabel.service.ts`).

## Rekomendasi Perbaikan Scoped
1. Tambahkan routing teks: di `bot.on("text")` (handlers.ts:429), jika `getPipeline(chatId)` ada dan step `"input"`/`"analysis_done"`/`"script_done"`, teruskan teks ke pipeline alih-alih hanya memanggil handler content-factory.
2. Tambahkan TTL/cleanup terjadwal untuk Map `pipelines`.
3. Implementasikan `pipe_generate`/`pipe_publish` atau hapus stub-nya.
4. Rename variabel lokal `bot` di handlers.ts:197 → `whitelabelBot`.
5. Verifikasi penyimpanan `bot_token` di whitelabel.service.ts (jangan plaintext).
