# Quarantine — Dokumen Tidak Terpercaya

Dokumen di folder ini **mengandung data fabrikasi sistematis** (verified di FASE 0 audit, lihat `docs/FASE_*_LAPORAN.md`).

**Masalah yang dikonfirmasi:**
- Inflasi LOC 30–500× (contoh: `image.service.ts` diklaim 22.3K → aktual 612)
- Paradox temporal (verifikasi mendahului audit)
- File hantu (diklaim ada, tidak ditemukan di disk)
- Klaim Math.random — 0 aktual
- Klaim `@ts-ignore` — 0 aktual
- Klaim empty catch — 0 aktual
- Klaim console.log ribuan — aktual 7

**Jangan gunakan data dari file-file ini sebagai referensi.**
Gunakan `docs/` → `FASE_1_LAPORAN.md`, `FASE_2_LAPORAN.md`, `FASE_3_LAPORAN.md` untuk data akurat.

---

*Dipindahkan dari root 2026-07-27 setelah FASE 0 audit mengonfirmasi kontaminasi sistematis.*
