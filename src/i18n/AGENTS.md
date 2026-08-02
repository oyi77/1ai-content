---
scope: src/i18n
depends_on:
  - src/i18n/locales (en/id/ru/zh.json)
status: complete
---

<!-- Parent: ../AGENTS.md -->

# i18n

## Tujuan
Internasionalisasi: terjemahan JSON (4 bahasa) + helper `t()` untuk lookup & interpolasi, dengan fallback bahasa → en → key.

## Ekspor

| File | Ekspor | Detail |
|------|--------|--------|
| `translations.ts` | `t(key, lang?, params?)`, `getAvailableLanguages()`, `hasTranslation()` | Reverse index dari 4 JSON; interpolasi `{key}` via split/join (bukan regex); `lang` untyped (string) |
| `locales/en.json` | Terjemahan Inggris | Source of truth (fallback utama) |
| `locales/id.json`, `locales/ru.json`, `locales/zh.json` | Terjemahan per bahasa | |

Perilaku `translations.ts`:
- Fallback: bahasa tidak ditemukan / key tidak ada → `en`, lalu → key itu sendiri (baris 64).
- `lang` tidak divalidasi — typo diam-diam fallback ke `en`.
- `getAvailableLanguages()` — daftar bahasa dari 4 file locale.
- `hasTranslation()` — cek keberadaan key tanpa fallback.

## Dependensi Internal
- `src/i18n/locales/*.json` — data terjemahan
- Tidak ada dependensi ke modul `src` lain.

## Issue Spesifik
1. **LOW — `lang` untyped** — parameter typo (mis. `"in"` bukan `"id"`) fallback diam-diam ke `en` tanpa error.
2. **LOW — interpolasi manual** — split/join tidak menangani placeholder bersarang atau escaping; cukup untuk kasus sederhana, rapuh jika format berkembang.

## Rekomendasi Perbaikan Scoped
1. Ketik `lang` sebagai union `"en" | "id" | "ru" | "zh"` dan log warning saat fallback terjadi.
2. Jika kebutuhan interpolasi berkembang, ganti ke regex `/\{(\w+)\}/g`; saat ini implementasi split/join sudah cukup.
