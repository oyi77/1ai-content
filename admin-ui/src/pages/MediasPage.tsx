import { useState, useEffect } from "react";
import {
  fetchVideos,
  fetchBooks,
  fetchBookDetail,
  fetchComics,
  fetchComicDetail,
  fetchMovies,
  fetchMovieDetail,
  type MediaVideo,
  type MediaBook,
  type MediaComic,
  type MediaMovie,
} from "../api/client";
import { Tab, Button, Spinner, Toast } from "../components/UI";

type TabKey = "videos" | "books" | "comics" | "movies";

function dt(s: string | undefined | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-500/20 text-emerald-400",
    processing: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
    pending: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  );
}

function MediaCardThumbnail({ thumbnailUrl, title, status, hasVideo }: { thumbnailUrl?: string; title: string; status?: string; hasVideo?: boolean }) {
  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt={title}
        className="w-full h-40 object-cover"
        loading="lazy"
        onError={(e) => {
          const parent = (e.target as HTMLElement).parentElement;
          if (parent) {
            parent.classList.add("no-thumb");
            (e.target as HTMLElement).style.display = "none";
          }
        }}
      />
    );
  }
  return (
    <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border">
      {hasVideo ? "▶ No thumbnail" : `⏳ ${status || "—"}`}
    </div>
  );
}

export default function MediasPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("videos");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Videos
  const [videos, setVideos] = useState<MediaVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videoFilterStatus, setVideoFilterStatus] = useState("");
  const [videoFilterNiche, setVideoFilterNiche] = useState("");
  const [videoLimit, setVideoLimit] = useState(50);

  // Books
  const [books, setBooks] = useState<MediaBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [bookDetail, setBookDetail] = useState<MediaBook | null>(null);

  // Comics
  const [comics, setComics] = useState<MediaComic[]>([]);
  const [comicsLoading, setComicsLoading] = useState(true);
  const [comicDetail, setComicDetail] = useState<MediaComic | null>(null);

  // Movies
  const [movies, setMovies] = useState<MediaMovie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [movieDetail, setMovieDetail] = useState<MediaMovie | null>(null);

  const [modalType, setModalType] = useState<"video" | "book" | "comic" | "movie" | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<MediaVideo | null>(null);

  useEffect(() => {
    loadVideos();
  }, [videoFilterStatus, videoLimit]);

  async function loadVideos() {
    setVideosLoading(true);
    try {
      const data = await fetchVideos({ limit: videoLimit, status: videoFilterStatus || undefined });
      setVideos(data);
    } catch (e) {
      setToast({ message: `Failed to load videos: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setVideosLoading(false);
    }
  }

  async function loadBooks() {
    setBooksLoading(true);
    try {
      const data = await fetchBooks();
      setBooks(data);
    } catch (e) {
      setToast({ message: `Failed to load books: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setBooksLoading(false);
    }
  }

  async function loadComics() {
    setComicsLoading(true);
    try {
      const data = await fetchComics();
      setComics(data);
    } catch (e) {
      setToast({ message: `Failed to load comics: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setComicsLoading(false);
    }
  }

  async function loadMovies() {
    setMoviesLoading(true);
    try {
      const data = await fetchMovies();
      setMovies(data);
    } catch (e) {
      setToast({ message: `Failed to load movies: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setMoviesLoading(false);
    }
  }

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    if (tab === "books" && books.length === 0 && !booksLoading) loadBooks();
    if (tab === "comics" && comics.length === 0 && !comicsLoading) loadComics();
    if (tab === "movies" && movies.length === 0 && !moviesLoading) loadMovies();
  }

  async function openVideo(v: MediaVideo) {
    setSelectedVideo(v);
    setModalType("video");
  }

  async function openBook(id: number) {
    try {
      const b = await fetchBookDetail(id);
      setBookDetail(b);
      setModalType("book");
    } catch (e) {
      setToast({ message: `Failed to load book: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  }

  async function openComic(id: number) {
    try {
      const c = await fetchComicDetail(id);
      setComicDetail(c);
      setModalType("comic");
    } catch (e) {
      setToast({ message: `Failed to load comic: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  }

  async function openMovie(id: number) {
    try {
      const m = await fetchMovieDetail(id);
      setMovieDetail(m);
      setModalType("movie");
    } catch (e) {
      setToast({ message: `Failed to load movie: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  }

  function closeModal() {
    setModalType(null);
    setSelectedVideo(null);
    setBookDetail(null);
    setComicDetail(null);
    setMovieDetail(null);
  }

  function formatVideoDuration(s?: number): string {
    if (s == null) return "—";
    return `${s}s`;
  }

  const filteredVideos = videoFilterNiche
    ? videos.filter((v) => v.niche === videoFilterNiche)
    : videos;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "videos", label: "Videos" },
    { key: "books", label: "Books" },
    { key: "comics", label: "Comics" },
    { key: "movies", label: "Movies" },
  ];

  return (
    <div>
      {toast && (
        <div className="mb-4">
          <Toast message={toast.message} type={toast.type} visible={true} />
        </div>
      )}

      {/* Title */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-text-primary mb-1">Media Gallery</h2>
        <p className="text-sm text-text-muted">All generated media — videos, books, comics, movies.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} active={activeTab === t.key} onClick={() => switchTab(t.key)} />
        ))}
      </div>

      {/* ── Videos Tab ── */}
      {activeTab === "videos" && (
        <div>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center mb-4">
            <select
              value={videoFilterStatus}
              onChange={(e) => { setVideoFilterStatus(e.target.value); }}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary w-36"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={videoFilterNiche}
              onChange={(e) => setVideoFilterNiche(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary w-36"
            >
              <option value="">All Niches</option>
              <option value="fnb">Food & Beverage</option>
              <option value="fashion">Fashion</option>
              <option value="tech">Tech</option>
              <option value="travel">Travel</option>
              <option value="health">Health</option>
              <option value="education">Education</option>
              <option value="finance">Finance</option>
              <option value="entertainment">Entertainment</option>
            </select>
            <select
              value={videoLimit}
              onChange={(e) => setVideoLimit(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary w-28"
            >
              <option value={50}>50 items</option>
              <option value={100}>100 items</option>
              <option value={200}>200 items</option>
            </select>
            <Button variant="ghost" onClick={loadVideos}>Refresh</Button>
            <span className="text-xs text-text-muted ml-auto">{filteredVideos.length} items</span>
          </div>

          {/* Video Grid */}
          {videosLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : filteredVideos.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No videos found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredVideos.map((v) => (
                <div
                  key={v.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors"
                  onClick={() => openVideo(v)}
                >
                  <MediaCardThumbnail thumbnailUrl={v.thumbnailUrl} title={v.title || v.niche} status={v.status} hasVideo={!!v.videoUrl} />
                  <div className="p-3">
                    <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">{v.title || `${v.niche} • ${v.platform}`}</div>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      <StatusBadge status={v.status} />
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{v.niche}</span>
                      {v.finalProvider && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{v.finalProvider}</span>}
                    </div>
                    <div className="text-xs text-text-muted">
                      {formatVideoDuration(v.duration)}{v.creditsUsed ? ` • ${v.creditsUsed} credits` : ""} • {dt(v.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Books Tab ── */}
      {activeTab === "books" && (
        <div>
          {booksLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : books.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No saved books yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {books.map((b) => (
                <div
                  key={b.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors"
                  onClick={() => openBook(b.id)}
                >
                  <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-4xl border-b border-border">📖</div>
                  <div className="p-3">
                    <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">{b.title}</div>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{b.subject || "Book"}</span>
                      {b.sections && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{b.sections.length} ch.</span>}
                      {b.stats?.total_tokens && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{b.stats.total_tokens} tok.</span>}
                    </div>
                    <div className="text-xs text-text-muted">
                      {b.fullMarkdown ? `${b.fullMarkdown.length} chars • ` : ""}{dt(b.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Comics Tab ── */}
      {activeTab === "comics" && (
        <div>
          {comicsLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : comics.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No saved comics yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {comics.map((c) => (
                <div
                  key={c.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors"
                  onClick={() => openComic(c.id)}
                >
                  {c.coverPath ? (
                    <img src={c.coverPath} alt={c.title} className="w-full h-40 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border">📖 {c.format || "COMIC"}</div>
                  )}
                  <div className="p-3">
                    <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">{c.title}</div>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{c.format || "Comic"}</span>
                      {c.numEpisodes && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{c.numEpisodes} ep.</span>}
                      {c.totalPages && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{c.totalPages} pg.</span>}
                    </div>
                    <div className="text-xs text-text-muted">{c.language ? `${c.language} • ` : ""}{dt(c.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Movies Tab ── */}
      {activeTab === "movies" && (
        <div>
          {moviesLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : movies.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No saved movies yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {movies.map((m) => (
                <div
                  key={m.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors"
                  onClick={() => openMovie(m.id)}
                >
                  {m.coverPath ? (
                    <img src={m.coverPath} alt={m.title} className="w-full h-40 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border">🎬 {m.genre || "MOVIE"}</div>
                  )}
                  <div className="p-3">
                    <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">{m.title}</div>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">{m.genre || "Movie"}</span>
                      {m.numScenes && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{m.numScenes} sc.</span>}
                      {m.duration && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{m.duration}s</span>}
                    </div>
                    <div className="text-xs text-text-muted">{dt(m.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Video Preview Modal ── */}
      {modalType === "video" && selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h3 className="text-base font-semibold text-text-primary">{selectedVideo.title || selectedVideo.jobId || "Video Preview"}</h3>
              <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={closeModal}>✕</button>
            </div>
            <div className="p-4">
              <div className="bg-black rounded-lg mb-4 min-h-[200px] flex items-center justify-center">
                {selectedVideo.videoUrl ? (
                  <video src={selectedVideo.videoUrl} controls className="w-full rounded-lg max-h-[400px]" />
                ) : (
                  <span className="text-text-muted text-sm">
                    {selectedVideo.status === "processing" ? "⏳ Video is still processing..." : "❌ No video URL available"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-xs text-text-muted block mb-0.5">STATUS</span><StatusBadge status={selectedVideo.status} /></div>
                <div><span className="text-xs text-text-muted block mb-0.5">PROVIDER</span><span className="text-text-secondary">{selectedVideo.finalProvider || "—"}</span></div>
                <div><span className="text-xs text-text-muted block mb-0.5">CREDITS</span><span className="text-text-secondary">{selectedVideo.creditsUsed ?? "—"}</span></div>
                <div><span className="text-xs text-text-muted block mb-0.5">NICHE</span><span className="text-text-secondary">{selectedVideo.niche}</span></div>
                <div><span className="text-xs text-text-muted block mb-0.5">DURATION</span><span className="text-text-secondary">{formatVideoDuration(selectedVideo.duration)}</span></div>
                <div><span className="text-xs text-text-muted block mb-0.5">CREATED</span><span className="text-text-secondary">{dt(selectedVideo.createdAt)}</span></div>
              </div>
              {selectedVideo.downloadUrl && (
                <div className="mt-3">
                  <a href={selectedVideo.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="primary">Download</Button>
                  </a>
                </div>
              )}
              {selectedVideo.errorMessage && (
                <div className="mt-3 p-3 bg-red-500/10 rounded-lg text-red-400 text-xs">{selectedVideo.errorMessage}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Book Detail Modal ── */}
      {modalType === "book" && bookDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface flex justify-between items-start p-4 border-b border-border z-10">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{bookDetail.title}</h3>
                {bookDetail.subject && <div className="text-xs text-text-muted mt-1">{bookDetail.subject}</div>}
              </div>
              <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={closeModal}>✕</button>
            </div>
            <div className="p-4">
              {bookDetail.stats && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {Object.entries(bookDetail.stats).filter(([, v]) => v != null).map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                      {k.replace(/_/g, " ")}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {(bookDetail.sections || []).map((sec: Record<string, unknown>, i: number) => {
                  const title = (sec.title || sec.heading || `Section ${i + 1}`) as string;
                  const content = (sec.content || "") as string;
                  return (
                    <details key={i} className="border border-border rounded-lg overflow-hidden">
                      <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">
                        {title}
                      </summary>
                      <div className="p-3 text-xs text-text-secondary leading-relaxed border-t border-border whitespace-pre-wrap">{content}</div>
                    </details>
                  );
                })}
              </div>
              {bookDetail.fullMarkdown && (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-text-primary">Full Markdown</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(bookDetail.fullMarkdown || "").then(() => setToast({ message: "Copied!", type: "success" })); }}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="bg-[var(--bg2)] p-4 rounded-lg text-xs leading-relaxed overflow-x-auto max-h-60 whitespace-pre-wrap text-text-secondary">{bookDetail.fullMarkdown}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Comic Detail Modal ── */}
      {modalType === "comic" && comicDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface flex justify-between items-start p-4 border-b border-border z-10">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{comicDetail.title}</h3>
                <div className="text-xs text-text-muted mt-1">{comicDetail.format || "COMIC"} • {comicDetail.language || "en"}</div>
              </div>
              <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={closeModal}>✕</button>
            </div>
            <div className="p-4">
              {(comicDetail.numEpisodes || comicDetail.totalPages || comicDetail.stats) && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {comicDetail.numEpisodes && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Episodes: {comicDetail.numEpisodes}</span>}
                  {comicDetail.totalPages && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Pages: {comicDetail.totalPages}</span>}
                  {comicDetail.stats?.total_tokens && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Tokens: {comicDetail.stats.total_tokens}</span>}
                  {comicDetail.stats?.total_time && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Time: {Number(comicDetail.stats.total_time).toFixed(1)}s</span>}
                </div>
              )}
              {comicDetail.coverPath && (
                <div className="mb-4">
                  <div className="text-xs text-text-muted mb-1">Cover</div>
                  <img src={comicDetail.coverPath} className="w-full rounded-lg max-h-[400px] object-contain bg-black" loading="lazy" alt={comicDetail.title} />
                </div>
              )}
              {comicDetail.outputDir && (
                <div className="p-3 bg-[var(--bg2)] rounded-lg text-xs mb-4">
                  <div className="font-semibold text-text-primary mb-1.5">Output</div>
                  <div className="text-text-muted">{comicDetail.outputDir}</div>
                </div>
              )}
              {comicDetail.script && (
                <details className="border border-border rounded-lg overflow-hidden">
                  <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">Script</summary>
                  <pre className="p-3 text-xs whitespace-pre-wrap text-text-secondary border-t border-border">
                    {typeof comicDetail.script === "string" ? comicDetail.script : JSON.stringify(comicDetail.script, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Movie Detail Modal ── */}
      {modalType === "movie" && movieDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface flex justify-between items-start p-4 border-b border-border z-10">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{movieDetail.title}</h3>
                <div className="text-xs text-text-muted mt-1">{movieDetail.genre || "General"} • {movieDetail.numScenes || "?"} scenes</div>
              </div>
              <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={closeModal}>✕</button>
            </div>
            <div className="p-4">
              {(movieDetail.duration || movieDetail.numScenes || movieDetail.stats) && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {movieDetail.duration && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Duration: {movieDetail.duration}s</span>}
                  {movieDetail.numScenes && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Scenes: {movieDetail.numScenes}</span>}
                  {movieDetail.stats?.total_tokens && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Tokens: {movieDetail.stats.total_tokens}</span>}
                  {movieDetail.stats?.total_time && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">Time: {Number(movieDetail.stats.total_time).toFixed(1)}s</span>}
                </div>
              )}
              {movieDetail.coverPath && (
                <div className="mb-4">
                  <div className="text-xs text-text-muted mb-1">Cover</div>
                  <img src={movieDetail.coverPath} className="w-full rounded-lg max-h-[400px] object-contain bg-black" loading="lazy" alt={movieDetail.title} />
                </div>
              )}
              {movieDetail.videoPath && (
                <div className="mb-4">
                  <div className="text-xs text-text-muted mb-1">Video</div>
                  <video src={movieDetail.videoPath} controls className="w-full rounded-lg max-h-[400px]" />
                </div>
              )}
              {movieDetail.outputDir && (
                <div className="p-3 bg-[var(--bg2)] rounded-lg text-xs mb-4">
                  <div className="font-semibold text-text-primary mb-1.5">Output</div>
                  <div className="text-text-muted">{movieDetail.outputDir}</div>
                </div>
              )}
              {movieDetail.script && (
                <details className="border border-border rounded-lg overflow-hidden">
                  <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">Script</summary>
                  <pre className="p-3 text-xs whitespace-pre-wrap text-text-secondary border-t border-border">
                    {typeof movieDetail.script === "string" ? movieDetail.script : JSON.stringify(movieDetail.script, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Escape key */}
      {modalType && (
        <div
          onKeyDown={(e) => { if (e.key === "Escape") closeModal(); }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
