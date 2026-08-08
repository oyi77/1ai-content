import "./index.css";
import { useEffect, useState } from "react";

/* ---- Types ---- */
interface Pricing {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
  popular?: boolean;
}

const FALLBACK_PRICING: Pricing[] = [
  { id: "free", name: "Free", price: 0, credits: 3, features: ["3 video gratis", "Durasi 15 detik", "Watermark", "Akses dasar"] },
  { id: "pro", name: "Pro", price: 50000, credits: 30, features: ["30 kredit/bulan", "Durasi 60 detik", "Tanpa watermark", "Semua niche", "AI image generator"], popular: true },
  { id: "agency", name: "Agency", price: 100000, credits: 100, features: ["100 kredit/bulan", "Durasi 120 detik", "Tanpa watermark", "Semua niche", "AI image + video", "API key + prioritas"], popular: false },
];

const FAQS = [
  { q: "Apa itu 1AI Content?", a: "1AI Content adalah platform AI yang mengubah ide dan foto produk menjadi video iklan viral, konten media sosial, dan materi pemasaran. Cukup dari Telegram atau web." },
  { q: "Bagaimana cara memulainya?", a: "Buka halaman Login, daftar dengan email atau Telegram, dan langsung dapatkan 3 kredit gratis untuk mencoba. Tidak perlu kartu kredit." },
  { q: "Apa itu kredit?", a: "Setiap pembuatan video atau gambar menggunakan 1 kredit. Kredit bisa diisi ulang melalui QRIS (GoPay/OVO), transfer bank, atau crypto." },
  { q: "Berapa durasi video maksimal?", a: "Paket Free: 15 detik. Pro: 60 detik. Agency: 120 detik dengan kualitas tertinggi." },
  { q: "Bisa digunakan untuk bisnis apa saja?", a: "Ya! Platform kami mendukung 7+ niche: F&B, properti, produk kecantikan, otomotif, jasa, fashion, dan lainnya." },
  { q: "Apakah ada garansi uang kembali?", a: "Ya, kami memberikan garansi 7 hari untuk semua paket berbayar. Jika tidak puas, kredit bisa dikembalikan." },
];

const FEATURES = [
  { icon: "🎬", title: "Foto → Video Viral", desc: "Ubah 1 foto produk jadi video iklan berkualitas HPAS dalam hitungan detik. Cocok untuk TikTok & Instagram Reels." },
  { icon: "🤖", title: "AI Multi-Niche", desc: "7+ niche siap pakai: F&B, properti, beauty, otomotif, jasa, dan lainnya. Optimasi khusus tiap industri." },
  { icon: "⚡", title: "Langsung dari Telegram", desc: "Buat video tanpa buka browser. Cukup kirim foto ke bot Telegram, dapatkan video dalam 2-3 menit." },
  { icon: "🎨", title: "AI Image Generator", desc: "Buat gambar produk, banner, dan materi promosi dengan AI. Style realistis, artistik, anime, atau produk." },
  { icon: "📊", title: "A/B Testing", desc: "Uji beberapa versi video untuk cari performa terbaik. Optimasi CTR, retensi, dan konversi." },
  { icon: "🔗", title: "API Key + Integrasi", desc: "Paket Agency: dapatkan API key untuk integrasi dengan sistem Anda. Dukungan prioritas." },
];

const STEPS = [
  { num: "01", title: "Upload Foto", desc: "Pilih foto produk atau konten yang ingin diubah jadi video." },
  { num: "02", title: "Pilih Gaya", desc: "Tentukan niche, durasi, dan gaya visual yang sesuai brand Anda." },
  { num: "03", title: "Dapatkan Video", desc: "AI memproses dan menghasilkan video siap posting dalam hitungan menit." },
];

const HERO_STATS = [
  { value: "7+", label: "Niche Siap Pakai" },
  { value: "2-3", label: "Menit Proses" },
  { value: "1M+", label: "Video Dibuat" },
];

interface ArticleMeta {
  slug: string;
  title: string;
  meta_description?: string;
  language?: string;
  format?: string;
  word_count?: number;
  created_at?: string;
}

export default function Landing() {
  const [pricing, setPricing] = useState<Pricing[]>(FALLBACK_PRICING);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.packages || []).map((p: Record<string, unknown>, i: number) => {
          const fb = FALLBACK_PRICING.find((f) => f.id === p.id) ?? FALLBACK_PRICING[i];
          return {
            id: p.id as string,
            name: p.name as string,
            price: (p as { priceIdr?: number }).priceIdr ?? 0,
            credits: (p.credits as number) ?? 0,
            features: (fb?.features ?? []) as string[],
            popular: !!(p as { isPopular?: boolean }).isPopular,
          };
        });
        if (list.length >= 3) setPricing(list);
      })
      .catch(() => { /* use fallback */ });
  }, []);

  useEffect(() => {
    fetch("/api/py/text/articles?limit=3")
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.articles || []) as ArticleMeta[];
        setArticles(list.slice(0, 3));
      })
      .catch(() => { /* leave section hidden */ });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-surface text-slate-100">
      {/* ---- Nav ---- */}
      <nav
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(10,10,26,0.9)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 no-underline">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: "var(--grad)" }}
            >
              1
            </div>
            <span className="text-lg font-bold" style={{ color: "#f1f5f9" }}>1AI Content</span>
          </a>
          <div className="hidden items-center gap-6 sm:flex">
            <a href="#features" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Fitur</a>
            <a href="#pricing" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Harga</a>
            <a href="#faq" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>FAQ</a>
            <a href="/articles" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Artikel</a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/app/login"
              className="no-underline rounded-lg px-4 py-2 text-sm font-semibold transition-all"
              style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              Masuk
            </a>
            <a
              href="/app/login?register=1"
              className="pulse-glow no-underline rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all"
              style={{ background: "var(--grad)" }}
            >
              Daftar Gratis
            </a>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="hero-gradient relative flex min-h-[92vh] items-center overflow-hidden pt-20 pb-16 sm:pt-24">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold"
              style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}
            >
              🔥 AI Content Creation Platform
            </div>
            <h1 className="hero-title mb-6 font-extrabold">
              Ubah Ide Jadi{" "}
              <span className="gradient-text">Konten Viral</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-base sm:text-lg lg:mx-0" style={{ color: "rgba(255,255,255,0.55)" }}>
              Platform AI yang mengubah foto produk jadi video iklan profesional, konten media sosial,
              dan materi pemasaran. Langsung dari Telegram atau web. Mulai gratis.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              <a
                href="/app/login?register=1"
                className="pulse-glow no-underline rounded-xl px-8 py-3.5 text-lg font-bold text-white transition-all"
                style={{ background: "var(--grad)" }}
              >
                Mulai Gratis →
              </a>
              <a
                href="#features"
                className="no-underline rounded-xl px-8 py-3.5 text-lg font-semibold transition-all"
                style={{ color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                Lihat Fitur
              </a>
            </div>
            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-4 border-t border-white/5 pt-8">
              {HERO_STATS.map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <div className="gradient-text text-2xl font-extrabold sm:text-3xl">{s.value}</div>
                  <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual — simulated video player */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div aria-hidden className="absolute -inset-6 rounded-[2rem] blur-3xl" style={{ background: "rgba(168,85,247,0.18)" }} />
            <div className="gradient-border relative overflow-hidden rounded-2xl shadow-2xl" style={{ background: "#0d0d20" }}>
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                <span className="ml-3 text-[11px] font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                  1ai-content — preview
                </span>
              </div>
              {/* Player stage */}
              <div
                className="relative flex aspect-video items-center justify-center overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(17,17,39,0.9) 55%, rgba(124,58,237,0.25))" }}
              >
                <div aria-hidden className="absolute inset-6 rounded-full border border-white/10" />
                <div aria-hidden className="absolute inset-16 rounded-full border border-white/5" />
                <div className="relative flex flex-col items-center gap-4">
                  <button
                    type="button"
                    aria-label="Putar video"
                    className="pulse-glow flex h-16 w-16 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
                    style={{ background: "var(--grad)" }}
                  >
                    <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current" aria-hidden="true">
                      <path d="M8 5.14v13.72L19 12 8 5.14z" />
                    </svg>
                  </button>
                  <span
                    className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold backdrop-blur"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    F&B · 15 detik · TikTok 9:16
                  </span>
                </div>
              </div>
              {/* Player bar */}
              <div className="border-t border-white/5 px-4 py-3">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-2/3 rounded-full" style={{ background: "var(--grad)" }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
                  <span>01:12</span>
                  <span>01:45</span>
                </div>
              </div>
            </div>
            {/* Floating chips */}
            <div
              className="absolute -left-3 top-[22%] hidden rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur sm:block"
              style={{ background: "rgba(10,10,26,0.9)", color: "rgba(255,255,255,0.8)" }}
            >
              🎬 Video siap diposting
            </div>
            <div
              className="absolute -right-2 bottom-[26%] hidden rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur sm:block"
              style={{ background: "rgba(10,10,26,0.9)", color: "rgba(255,255,255,0.8)" }}
            >
              ⚡ Selesai dalam 2 menit
            </div>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="features" className="bg-surface-2 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-14 text-center sm:mb-16">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Semua yang Anda Butuhkan</h2>
            <p className="mx-auto max-w-xl text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
              Dari pembuatan video hingga analisis performa — lengkap dalam satu platform.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="glow-card rounded-xl p-6"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section className="bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-14 text-center sm:mb-16">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Cara Kerja</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
              3 langkah sederhana untuk hasil profesional
            </p>
          </div>
          <div className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            <div aria-hidden className="absolute left-[16%] right-[16%] top-7 hidden h-px md:block"
              style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent)" }} />
            {STEPS.map((s, i) => (
              <div key={i} className="relative text-center">
                <div
                  className="relative z-10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold"
                  style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }}
                >
                  {s.num}
                </div>
                <h3 className="mb-2 text-lg font-bold">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="pricing" className="bg-surface-2 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-14 text-center sm:mb-16">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Pilihan Paket</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
              Mulai gratis. Upgrade kapan saja.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {pricing.map((pkg, i) => {
              const isPopular = pkg.popular || pkg.name.toLowerCase() === "pro";
              return (
                <div
                  key={i}
                  className="glow-card relative overflow-hidden rounded-2xl transition-all md:-translate-y-0"
                  style={{
                    background: isPopular ? "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(124,58,237,0.04))" : "rgba(255,255,255,0.04)",
                    border: isPopular ? "1px solid rgba(168,85,247,0.35)" : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: isPopular ? "0 20px 60px -20px rgba(168,85,247,0.35)" : "none",
                  }}
                >
                  {isPopular && (
                    <div
                      className="py-2 text-center text-xs font-bold uppercase tracking-wider"
                      style={{ background: "var(--grad)", color: "#fff" }}
                    >
                      Paling Populer
                    </div>
                  )}
                  <div className="p-6 sm:p-7">
                    <h3 className="mb-2 text-xl font-bold">{pkg.name}</h3>
                    <div className="mb-6">
                      <span className="text-4xl font-extrabold">
                        {pkg.price === 0 ? "Gratis" : `Rp${pkg.price.toLocaleString("id-ID")}`}
                      </span>
                      {pkg.price > 0 && <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>/bln</span>}
                    </div>
                    <div className="mb-6 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {pkg.credits} kredit
                    </div>
                    <ul className="mb-8 space-y-3">
                      {pkg.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <span style={{ color: "#22c55e" }}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href={pkg.price === 0 ? "/app/login?register=1" : "/app/login"}
                      className="block rounded-xl py-3 text-center font-bold no-underline transition-all"
                      style={{
                        background: isPopular ? "var(--grad)" : "rgba(255,255,255,0.06)",
                        color: isPopular ? "#fff" : "#f1f5f9",
                        border: isPopular ? "none" : "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {pkg.price === 0 ? "Daftar Gratis" : "Langganan"}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section id="faq" className="bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Pertanyaan Umum</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl transition-all"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between p-5 text-left text-sm font-semibold"
                    style={{ background: "transparent", color: "#f1f5f9", border: "none" }}
                  >
                    {faq.q}
                    <span className="text-xl transition-transform" style={{ transform: isOpen ? "rotate(45deg)" : "none", color: "var(--accent)" }}>
                      +
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Artikel Terbaru ---- */}
      {articles.length > 0 && (
        <section id="artikel" className="bg-surface-2 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-14 text-center sm:mb-16">
              <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
                <span className="gradient-text">Artikel Terbaru</span>
              </h2>
              <p className="mx-auto max-w-xl text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
                Wawasan, tips, dan panduan konten dari 1AI Content.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {articles.map((a) => (
                <a
                  key={a.slug}
                  href={`/articles/${encodeURIComponent(a.slug)}`}
                  className="glow-card block rounded-xl p-6 no-underline transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="mb-3 text-xs" style={{ color: "rgba(168,85,247,0.8)" }}>
                    {a.language ? a.language.toUpperCase() : "ID"}
                    {a.word_count ? ` · ${a.word_count} kata` : ""}
                  </div>
                  <h3 className="mb-2 text-lg font-bold" style={{ color: "#f1f5f9" }}>{a.title}</h3>
                  {a.meta_description && (
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {a.meta_description}
                    </p>
                  )}
                  {a.created_at && (
                    <div className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                </a>
              ))}
            </div>
            <div className="mt-10 text-center">
              <a
                href="/articles"
                className="inline-block rounded-lg px-6 py-3 text-sm font-semibold no-underline transition-all"
                style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                Lihat Semua Artikel →
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ---- CTA ---- */}
      <section className="py-16 sm:py-24" style={{ background: "var(--grad)" }}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl" style={{ color: "#0a0a1a" }}>
            Siap Membuat Konten Viral?
          </h2>
          <p className="mb-8 text-lg" style={{ color: "rgba(0,0,0,0.6)" }}>
            Daftar gratis, dapatkan 3 kredit untuk mencoba. Tidak perlu kartu kredit.
          </p>
          <a
            href="/app/login?register=1"
            className="inline-block rounded-xl px-10 py-4 font-bold no-underline transition-all"
            style={{ background: "#0a0a1a", color: "#fff" }}
          >
            Mulai Sekarang →
          </a>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer style={{ background: "#050510", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: "var(--grad)" }}>1</div>
                <span className="font-bold">1AI Content</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                AI-powered content creation platform. Ubah ide jadi konten viral.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Produk</h4>
              <div className="flex flex-col gap-2">
                <a href="#features" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>Fitur</a>
                <a href="#pricing" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>Harga</a>
                <a href="#faq" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>FAQ</a>
                <a href="/articles" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>Artikel</a>
              </div>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Hukum</h4>
              <div className="flex flex-col gap-2">
                <a href="/terms" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>Syarat & Ketentuan</a>
                <a href="/privacy" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>Kebijakan Privasi</a>
              </div>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Kontak</h4>
              <div className="flex flex-col gap-2">
                <a href="https://t.me/vilona_content_bot" target="_blank" rel="noopener noreferrer" className="nav-link text-xs no-underline" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Telegram Bot
                </a>
              </div>
            </div>
          </div>
          <div className="pt-6 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)" }}>
            © {new Date().getFullYear()} 1AI Content. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
