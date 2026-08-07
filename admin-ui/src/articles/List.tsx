import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./articles.css";

export interface ArticleMeta {
  slug: string;
  title: string;
  meta_description: string;
  language: string;
  format: string;
  word_count: number;
  created_at: string;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const HEADER_STYLE: React.CSSProperties = {
  background: "rgba(10,10,26,0.9)",
  backdropFilter: "blur(12px)",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

export default function ArticleList() {
  const [articles, setArticles] = useState<ArticleMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/py/text/articles")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setArticles(Array.isArray(data?.articles) ? data.articles : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="article-page">
      <header className="fixed top-0 left-0 right-0 z-50" style={HEADER_STYLE}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}
            >
              1
            </div>
            <span className="font-bold text-lg" style={{ color: "#f1f5f9" }}>
              1AI Content
            </span>
          </Link>
          <Link
            to="/"
            className="no-underline text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
          >
            ← Beranda
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-28 pb-20">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">
          <span className="article-gradient-text">Artikel</span>
        </h1>
        <p className="text-lg mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
          Konten mendalam tentang AI, konten kreator, dan strategi digital.
        </p>

        {error && (
          <div
            className="rounded-xl p-5 mb-8 text-sm"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#fca5a5",
            }}
          >
            Gagal memuat artikel: {error}
          </div>
        )}

        {!articles && !error && (
          <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.4)" }}>
            Memuat artikel…
          </div>
        )}

        {articles && articles.length === 0 && (
          <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.4)" }}>
            Belum ada artikel. Kembali lagi nanti.
          </div>
        )}

        <div className="space-y-5">
          {articles?.map((a) => (
            <Link
              key={a.slug}
              to={`/articles/${a.slug}`}
              className="article-card block no-underline rounded-xl p-6"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                className="flex flex-wrap items-center gap-3 mb-2 text-xs"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <span className="uppercase tracking-wider font-semibold" style={{ color: "#c084fc" }}>
                  {a.language || "en"}
                </span>
                <span>·</span>
                <span>{formatDate(a.created_at)}</span>
                {typeof a.word_count === "number" && a.word_count > 0 && (
                  <>
                    <span>·</span>
                    <span>{a.word_count.toLocaleString("id-ID")} kata</span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#f1f5f9" }}>
                {a.title}
              </h2>
              {a.meta_description && (
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {a.meta_description}
                </p>
              )}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}