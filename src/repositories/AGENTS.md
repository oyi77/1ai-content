---
scope: src/repositories
depends_on:
  - prisma (schema)
  - src/config/database (Prisma client — import perlu diverifikasi)
status: complete
---

<!-- Parent: ../AGENTS.md -->

# repositories

## Tujuan
Layer akses data berbasis Prisma. **Komentar di kedua file menyatakan "proof-of-concept" dan grep lintas-repo tidak menemukan consumer → saat ini dead code (belum terpakai).**

## Ekspor

| File | Ekspor | Detail |
|------|--------|--------|
| `user.repository.ts` | `UserRepository` (106 baris) | findByTelegramId, findByUuid, findByReferralCode, create, update, updateActivity, addCredits, deductCredits (updateMany conditional, return count), ban, unban, findWithExpiringCredits, countReferrals |
| `video.repository.ts` | `VideoRepository` (166 baris) | create, findByJobId, updateProgress, setOutput, updateStatus, softDelete, restore, permanentlyDelete, toggleFavorite, findUserFavorites, findUserTrash, findUserVideos, countDailyGenerations, upsertForInterception |

## Dependensi Internal
- Prisma client — import di kedua file perlu diverifikasi (diperkirakan via `@/config/database`).
- Tidak ada module `src` lain yang mengimpor repository ini (dead code).

## Issue Spesifik
1. **MEDIUM — dead code**: `UserRepository` & `VideoRepository` tidak diimpor modul mana pun. Risiko: drift dengan schema Prisma dan duplikasi logika dengan service layer (`UserService`/`VideoService`) yang dipakai aktif.
2. **Catatan** — `deductCredits` memakai `updateMany` conditional (return count, bukan record) — perilaku berbeda dari service layer; jika diintegrasikan, samakan semantiknya.

## Rekomendasi Perbaikan Scoped
1. Integrasikan ke service layer (pindahkan akses data dari `UserService`/`VideoService` ke repository ini) atau hapus file-nya.
2. Jika dipertahankan, tambahkan unit test + catat penggunaannya di AGENTS.md ini.
