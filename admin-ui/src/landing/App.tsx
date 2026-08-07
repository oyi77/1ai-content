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
    <div className="min-h-screen" style={{ background: "#0a0a1a" }}>
      {/* ---- Nav ---- */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(10,10,26,0.9)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: "var(--grad)" }}
            >
              1
            </div>
            <span className="font-bold text-lg" style={{ color: "#f1f5f9" }}>1AI Content</span>
          </a>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#features" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Fitur</a>
            <a href="#pricing" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Harga</a>
            <a href="#faq" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>FAQ</a>
            <a href="/articles" className="nav-link no-underline text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Artikel</a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/app/login"
              className="no-underline text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              Masuk
            </a>
            <a
              href="/app/login?register=1"
              className="no-underline text-sm font-semibold px-5 py-2 rounded-lg text-white transition-all pulse-glow"
              style={{ background: "var(--grad)" }}
            >
              Daftar Gratis
            </a>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="hero-gradient min-h-[85vh] flex items-center pt-16">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}
          >
            🔥 AI Content Creation Platform
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-tight mb-6 tracking-tight">
            Ubah Ide Jadi{" "}
            <span className="gradient-text">Konten Viral</span>
          </h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
            Platform AI yang mengubah foto produk jadi video iklan profesional, konten media sosial, 
            dan materi pemasaran. Langsung dari Telegram atau web. Mulai gratis.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/app/login?register=1"
              className="no-underline text-lg font-bold px-8 py-3.5 rounded-xl text-white transition-all pulse-glow"
              style={{ background: "var(--grad)" }}
            >
              Mulai Gratis →
            </a>
            <a
              href="#features"
              className="no-underline text-lg font-semibold px-8 py-3.5 rounded-xl transition-all"
              style={{ color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Lihat Fitur
            </a>
          </div>
          <div className="mt-12 flex items-center justify-center gap-6 sm:gap-10 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>🎯 7+ Niche Siap Pakai</span>
            <span>⚡ Proses 2-3 Menit</span>
            <span>📱 Bisa dari Telegram</span>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="features" className="py-24" style={{ background: "var(--bg2, #111127)" }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Semua yang Anda Butuhkan</h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
              Dari pembuatan video hingga analisis performa — lengkap dalam satu platform.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="glow-card rounded-xl p-6"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section className="py-24" style={{ background: "#0a0a1a" }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Cara Kerja</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
              3 langkah sederhana untuk hasil profesional
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <div key={i} className="text-center">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold mx-auto mb-5"
                  style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc" }}
                >
                  {s.num}
                </div>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="pricing" className="py-24" style={{ background: "var(--bg2, #111127)" }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Pilihan Paket</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
              Mulai gratis. Upgrade kapan saja.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricing.map((pkg, i) => {
              const isPopular = pkg.popular || pkg.name.toLowerCase() === "pro";
              return (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden transition-all glow-card"
                  style={{
                    background: isPopular ? "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(124,58,237,0.04))" : "rgba(255,255,255,0.04)",
                    border: isPopular ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    position: "relative",
                  }}
                >
                  {isPopular && (
                    <div
                      className="text-center text-xs font-bold py-2 uppercase tracking-wider"
                      style={{ background: "var(--grad)", color: "#fff" }}
                    >
                      Paling Populer
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2">{pkg.name}</h3>
                    <div className="mb-6">
                      <span className="text-4xl font-extrabold">
                        {pkg.price === 0 ? "Gratis" : `Rp${pkg.price.toLocaleString("id-ID")}`}
                      </span>
                      {pkg.price > 0 && <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>/bln</span>}
                    </div>
                    <div className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {pkg.credits} kredit
                    </div>
                    <ul className="space-y-3 mb-8">
                      {pkg.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <span style={{ color: "#22c55e" }}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href={pkg.price === 0 ? "/app/login?register=1" : "/app/login"}
                      className="block text-center font-bold py-3 rounded-xl no-underline transition-all"
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
      <section id="faq" className="py-24" style={{ background: "#0a0a1a" }}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Pertanyaan Umum</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left font-semibold text-sm cursor-pointer"
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
        <section id="artikel" className="py-24" style={{ background: "#111127" }}>
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                <span className="gradient-text">Artikel Terbaru</span>
              </h2>
              <p className="text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
                Wawasan, tips, dan panduan konten dari 1AI Content.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {articles.map((a) => (
                <a
                  key={a.slug}
                  href={`/articles/${encodeURIComponent(a.slug)}`}
                  className="glow-card block rounded-xl p-6 no-underline transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="text-xs mb-3" style={{ color: "rgba(168,85,247,0.8)" }}>
                    {a.language ? a.language.toUpperCase() : "ID"}
                    {a.word_count ? ` · ${a.word_count} kata` : ""}
                  </div>
                  <h3 className="text-lg font-bold mb-2" style={{ color: "#f1f5f9" }}>{a.title}</h3>
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
            <div className="text-center mt-10">
              <a
                href="/articles"
                className="inline-block no-underline text-sm font-semibold px-6 py-3 rounded-lg transition-all"
                style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                Lihat Semua Artikel →
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ---- CTA ---- */}
      <section className="py-24" style={{ background: "var(--grad)" }}>
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "#0a0a1a" }}>
            Siap Membuat Konten Viral?
          </h2>
          <p className="text-lg mb-8" style={{ color: "rgba(0,0,0,0.6)" }}>
            Daftar gratis, dapatkan 3 kredit untuk mencoba. Tidak perlu kartu kredit.
          </p>
          <a
            href="/app/login?register=1"
            className="inline-block font-bold px-10 py-4 rounded-xl no-underline transition-all"
            style={{ background: "#0a0a1a", color: "#fff" }}
          >
            Mulai Sekarang →
          </a>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer style={{ background: "#050510", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: "var(--grad)" }}>1</div>
                <span className="font-bold">1AI Content</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                AI-powered content creation platform. Ubah ide jadi konten viral.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Produk</h4>
              <div className="flex flex-col gap-2">
                <a href="#features" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>Fitur</a>
                <a href="#pricing" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>Harga</a>
                <a href="#faq" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>FAQ</a>
                <a href="/articles" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>Artikel</a>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Hukum</h4>
              <div className="flex flex-col gap-2">
                <a href="/terms" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>Syarat & Ketentuan</a>
                <a href="/privacy" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>Kebijakan Privasi</a>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Kontak</h4>
              <div className="flex flex-col gap-2">
                <a href="https://t.me/vilona_content_bot" target="_blank" rel="noopener noreferrer" className="text-xs no-underline nav-link" style={{ color: "rgba(255,255,255,0.5)" }}>
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
