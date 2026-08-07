import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { markdownToHtml } from "./markdown";
import { formatDate } from "./List";
import "./articles.css";

export interface ArticleRecord {
  id: number;
  slug: string;
  title: string;
  content: string;
  meta_description: string;
  language: string;
  format: string;
  word_count: number;
  llm: string | null;
  created_at: string;
}

const HEADER_STYLE: React.CSSProperties = {
  background: "rgba(10,10,26,0.9)",
  backdropFilter: "blur(12px)",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

export default function ArticleDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setArticle(null);
    setError(null);
    fetch(`/api/py/text/articles/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("Artikel tidak ditemukan.");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setArticle(data?.article ?? null);
        if (!data?.article) setError("Artikel tidak ditemukan.");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="article-page">
      <header className="fixed top-0 left-0 right-0 z-50" style={HEADER_STYLE}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
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
            to="/articles"
            className="no-underline text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
          >
            ← Semua Artikel
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-28 pb-20">
        {error && (
          <div className="text-center py-16">
            <p className="text-lg mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
              {error}
            </p>
            <Link
              to="/articles"
              className="no-underline text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              ← Kembali ke daftar artikel
            </Link>
          </div>
        )}

        {!article && !error && (
          <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.4)" }}>
            Memuat artikel…
          </div>
        )}

        {article && (
          <article>
            <div
              className="flex flex-wrap items-center gap-3 mb-3 text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <span className="uppercase tracking-wider font-semibold" style={{ color: "#c084fc" }}>
                {article.language || "en"}
              </span>
              <span>·</span>
              <span>{formatDate(article.created_at)}</span>
              {typeof article.word_count === "number" && article.word_count > 0 && (
                <>
                  <span>·</span>
                  <span>{article.word_count.toLocaleString("id-ID")} kata</span>
                </>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold mb-4" style={{ color: "#f1f5f9" }}>
              {article.title}
            </h1>

            {article.format === "html" ? (
              <div
                className="article-prose"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            ) : (
              <div
                className="article-prose"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }}
              />
            )}
          </article>
        )}
      </main>
    </div>
  );
}