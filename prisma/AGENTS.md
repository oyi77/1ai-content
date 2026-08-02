---
scope: prisma
depends_on: [../config]
status: complete
---

> Last updated: 2026-08-02 — onboarding: template baru + cakupan file lengkap + temuan secret

# AGENTS.md — prisma

## Tujuan Folder Ini

Sumber kebenaran skema database (Prisma + PostgreSQL) beserta seed, migrasi, dan dokumentasi model. Workflow standar: setelah ubah `schema.prisma` jalankan `npm run db:generate` lalu `npm run migrate:dev`; gunakan `npm run db:studio` untuk inspeksi; **jangan edit file SQL migrasi Prisma secara manual — biarkan Prisma yang generate** (pengecualian: `ecosystem_tracking.sql` — lihat Issue).

## Ekspor / Interface Utama

| File | Isi |
|---|---|
| `schema.prisma` (1276 baris) | 7 enum: `UserTier` (free/basic/lite/pro/agency), `VideoStatus`, `TransactionStatus`, `Platform`, `Niche`, `TransactionType` (topup/welcome_bonus/refund/subscription), `PaymentGateway` (tripay/duitku/nowpayments/stars/midtrans/system). ±50 model. Field kunci: `User.tier` **String** (bukan enum), creditBalance Decimal, referralTier Int, utmSource/utmMedium/utmCampaign/utmContent/lpVariant, fbc/fbp/ttclid, fraudScore, isBanned, lastActivityAt; `Transaction` status String + expiredAt default NOW()+30min + statusHistory Json; `Video` creditsUsed, styles String[], providerChain, favorited, expiresAt 30 hari; `Commission.tier` Int |
| `seed.ts` | Upsert user idempotent: telegramId `BigInt(228956686)`, username Oyi77, firstName WhoMe, creditBalance 100.0, tier `'premium'` |
| `migrations/` | 6 folder: `20240319_enhanced_video_system`, `20260315194752_init`, `20260401_add_subscription_credits`, `20260401_add_template_videos`, `20260401_add_video_favorited`, `20260406000000_add_user_mode` |
| `migrations/ecosystem_tracking.sql` | SQL **manual** (bukan migrasi Prisma) — lihat Issue #3 |
| `migration_lock.toml` | `provider = "postgresql"` |
| `README.md` | Model utama: User, Transaction, Video, Commission, Subscription, AuditLog; commands `db:generate`, `migrate:dev`, `migrate:prod`, `migrate:status`, `db:studio`, `db:seed` |

Model utama (grup): User, ApiKey, Transaction, Video, Commission, Subscription, AuditLog; akun/platform: SocialAccount (PostBridge `pbAccountId`), Fanpage, YtChannel, YtPublishedVideo, YtIdea, YtVideoMetrics, YtQuarantineLog, YtNicheCpmResearch, YtBreakoutCluster, YtAgentTaskLog, Carousel, ContentCalendar, ABTest, Book, Comic, Movie; ebook: EbookProject, EbookJob, EbookProjectMetadata, EbookIntegrationLog; lainnya: PaymentSettings, ProviderHealth, PromptCache, UserAvatar, PricingConfig, SavedPrompt, GenerationAnalytics, TokenUsage, UserStreak, UserBadge, RetentionLog, ChatEvent, TemplateVideo, VideoClip, VideoRework, ViralScan, WhiteLabelBot (commissionRate default 0.30), ProcessedVideo.

## Dependensi Internal

- `../config/database.yml`: arah koneksi dev/staging/prod & backup (schema dipakai oleh DB yang sama).
- PrismaClient dikonsumsi `src/` dan `scripts/daily-report.ts`.
- `seed.ts` bergantung pada kolom String tier — aman selama kolom tetap String (lihat Issue #1).

## Issue Spesifik

- **[Medium] Debt — enum tak terpakai** (`schema.prisma:14-16`): komentar "replace 22+ string columns. Migration pending" — tapi model tetap pakai String (`User.tier`, `Video.status`, `Transaction.status`, dll). Enum dideklarasikan tapi tidak dipakai; migrasi belum dibuat.
- **[Medium] Token plaintext — `Fanpage.accessToken` (`schema.prisma:1117`) `@db.Text`**: disimpan plaintext. Bandingkan `YtChannel.ytOauthToken` (baris 810) yang berkomentar "encrypted at app layer" → [INFERENSI] inkonsistensi pola penyimpanan token (risk Medium).
- **[Medium] `ecosystem_tracking.sql` (94 baris) — SQL manual di luar Prisma**: komentar "Run this migration on the shared database"; membuat 4 tabel: `tracking_links`, `conversions`, `published_posts`, `facebook_pages` (komentar "1ai-affiliate"/"1ai-social") yang **tidak ada di schema.prisma** → Prisma Client tak bisa query (wajib raw SQL), `migrate status` tak tahu tabel ini. `facebook_pages` di sini vs model `Fanpage` (map `facebook_pages`) di schema → [INFERENSI] potensi collision nama tabel / duplikasi definisi — perlu verifikasi manual.
- **[Low] `seed.ts:16`**: tier `'premium'` bukan anggota enum `UserTier` — valid karena kolom String, tapi menyimpang dari enum yang dideklarasikan.

## Rekomendasi Perbaikan Scoped

- **Enum migration**: jalankan migrasi untuk mengubah kolom String → enum (UserTier, VideoStatus, TransactionStatus, Platform, Niche), lalu hapus komentar pending.
- **`Fanpage.accessToken`**: enkripsi di app layer (pola sama seperti `YtChannel.ytOauthToken`); untuk data lama, buat backfill + rotate.
- **`ecosystem_tracking.sql`**: dua opsi — (a) pindahkan ke migrasi Prisma jika tabel ini dipakai aplikasi, atau (b) dokumentasikan eksplisit sebagai migrasi shared-DB manual (di luar `migrate` lifecycle) dan selesaikan potensi collision `facebook_pages` vs model `Fanpage`.
- **`seed.ts`**: ganti tier `'premium'` ke nilai enum valid (`'pro'`/`'agency'`) atau dokumentasikan alasan memakai nilai non-enum.
