<!-- Parent: ../AGENTS.md -->
<!-- Scope: src/pages/tools | Stack: TypeScript / React | Status: partial | depends_on: [src, src/api] -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

# tools

## Purpose
Halaman-halaman tools SPA di bawah route `/tools/*`, dipanggil dari `Tools.tsx` (`/tools`) di direktori induk.

**Status: partial (inferensi struktur)** — yang terverifikasi hanya route path dan ukuran baris. Isi file BELUM dibaca/diaudit detail; deskripsi di bawah hanya berdasarkan nama file. Jangan menganggapnya akurat sebelum dibaca.

## Key Files (7 file, total 969 baris)

| File | Baris | Route |
|------|------:|-------|
| `Fanpage.tsx` | 182 | `/tools/fanpage` |
| `Pinterest.tsx` | 152 | `/tools/pinterest` |
| `Storyboard.tsx` | 144 | `/tools/storyboard` |
| `RenderAd.tsx` | 143 | `/tools/render-ad` |
| `VideoTools.tsx` | 124 | `/tools/video-tools` |
| `Cloak.tsx` | 113 | `/tools/cloak` |
| `Engagement.tsx` | 111 | `/tools/engagement` |

Catatan konteks dari audit `src/api/client.ts` (bukan dari file ini):
- Cloak, Engagement, Video, RenderAd, Storyboard, Pinterest, Fanpage masing-masing punya helper API di `../api/client.ts` (mis. helper fanpage PUT/DELETE di `client.ts:948/958` tanpa `credentials: "include"` eksplisit — non-issue saat ini karena same-origin).

## For AI Agents

### Working In This Directory
- Audit detail file di direktori ini BELUM dilakukan — sebelum mengubah, baca file target terlebih dahulu.
- Route baru di `/tools/*` harus didaftarkan di `../App.tsx` + `../components/Sidebar.tsx`.
- Ikuti pola direktori induk: data via `../api/client.ts`, jangan fetch manual.

<!-- MANUAL: -->
