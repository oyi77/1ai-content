import { useState, useEffect, useRef, useCallback } from "react";
import { fetchMovies, fetchMovieDetail } from "../api/client";
import type { MediaMovie } from "../api/client";
import { Input, Textarea, Select, Button, Spinner, Toast } from "../components/UI";

const PY_API = "/api/py";

const GENRES = [
  { value: "general", label: "General" },
  { value: "action", label: "Action" },
  { value: "drama", label: "Drama" },
  { value: "comedy", label: "Comedy" },
  { value: "scifi", label: "Sci-Fi" },
  { value: "fantasy", label: "Fantasy" },
  { value: "horror", label: "Horror" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesia" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

const STYLES = [
  { value: "slideshow", label: "Slideshow — images + audio" },
  { value: "full", label: "Full — images + audio + video" },
  { value: "script_only", label: "Script Only — no images / audio" },
];

/* ── SSE Event types ── */
interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
  message?: string;
}

async function streamGenerateMovie(
  body: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${PY_API}/video/movie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      try {
        onEvent(JSON.parse(jsonStr));
      } catch {
        // skip unparsable SSE lines
      }
    }
  }

  // remaining buffer
  if (buffer.startsWith("data: ")) {
    try {
      onEvent(JSON.parse(buffer.slice(6).trim()));
    } catch {
      // skip
    }
  }
}

/* ── Date helper ── */
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

export default function MoviePage() {
  /* ── Form state ── */
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("general");
  const [language, setLanguage] = useState("en");
  const [numScenes, setNumScenes] = useState(8);
  const [format, setFormat] = useState("slideshow");

  /* ── SSE generation state ── */
  const [generating, setGenerating] = useState(false);
  const [progressMsgs, setProgressMsgs] = useState<string[]>([]);
  const [generatedSceneTitles, setGeneratedSceneTitles] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Movie list state ── */
  const [movies, setMovies] = useState<MediaMovie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);

  /* ── Detail modal state ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [movieDetail, setMovieDetail] = useState<MediaMovie | null>(null);

  /* ── Toast ── */
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  function closeModal() {
    setModalOpen(false);
    setMovieDetail(null);
  }

  /* ── Load movies on mount ── */
  useEffect(() => {
    loadMovies();
  }, []);

  async function loadMovies() {
    setMoviesLoading(true);
    try {
      const data = await fetchMovies();
      setMovies(data);
    } catch (e) {
      showToast(`Failed to load movies: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    } finally {
      setMoviesLoading(false);
    }
  }

  async function loadMovieDetail(id: number) {
    try {
      const m = await fetchMovieDetail(id);
      setMovieDetail(m);
      setModalOpen(true);
    } catch (e) {
      showToast(`Failed to load movie detail: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  }

  async function deleteMovie(id: number) {
    if (!confirm("Delete this movie?")) return;
    try {
      const res = await fetch(`/api/movies/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Movie deleted");
      setMovies((prev) => prev.filter((m) => m.id !== id));
      if (modalOpen && movieDetail?.id === id) {
        closeModal();
      }
    } catch (e) {
      showToast(`Delete failed: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  }

  /* ── Generate movie ── */
  async function handleGenerate() {
    if (!prompt.trim()) {
      showToast("Enter a movie description", "error");
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setGenerating(true);
    setProgressMsgs(["Initializing..."]);
    setGeneratedSceneTitles([]);

    const ac = new AbortController();
    abortRef.current = ac;

    const onEvent = (event: SSEEvent) => {
      const payload = { ...(event.payload || {}), ...(event.message ? { message: event.message } : {}) };
      switch (event.type) {
        case "progress":
          setProgressMsgs((p) => [...p, (payload.message as string) || ""]);
          break;
        case "scene":
          setProgressMsgs((p) => [...p, `Scene ${payload.sceneNumber as string}: ${(payload.title as string) || ""}`]);
          setGeneratedSceneTitles((t) => [...t, (payload.title as string) || `Scene ${payload.sceneNumber as string}`]);
          break;
        case "complete":
          setProgressMsgs((p) => [...p, `Complete — ${(payload.title as string) || ""}`]);
          break;
        case "error":
          setProgressMsgs((p) => [...p, `Error: ${(payload.message as string) || ""}`]);
          showToast((payload.message as string) || "Generation error", "error");
          break;
        default:
          setProgressMsgs((p) => [...p, (payload.message as string) || event.type]);
      }
    };

    try {
      await streamGenerateMovie(
        {
          prompt: prompt.trim(),
          genre: genre !== "general" ? genre : undefined,
          language,
          num_scenes: numScenes,
          style: format,
        },
        onEvent,
        ac.signal,
      );
      showToast("Movie generation complete");
      loadMovies();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        showToast("Generation cancelled", "info");
      } else {
        showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`, "error");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }

  return (
    <div>
      <Toast message={toast?.message || null} type={toast?.type} visible={!!toast} />

      <div className="mb-5">
        <h2 className="text-lg font-bold text-text-primary mb-1">AI Short Film Generator</h2>
        <p className="text-sm text-text-muted">Generate short films, slideshows, or scripts from a text prompt.</p>
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* ── Left column: generation form ── */}
        <div className="w-96 shrink-0 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Prompt / Description</label>
            <Textarea
              value={prompt}
              onChange={setPrompt}
              placeholder="Describe your short film..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Genre</label>
            <Select value={genre} onChange={setGenre}>
              {GENRES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Language</label>
            <Select value={language} onChange={setLanguage}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Number of Scenes <span className="text-text-muted">(3–30)</span>
            </label>
            <Input
              type="number"
              value={String(numScenes)}
              onChange={(v) => setNumScenes(Math.max(3, Math.min(30, parseInt(v) || 8)))}
              min={3}
              max={30}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Format</label>
            <Select value={format} onChange={setFormat}>
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {generating ? (
              <>
                <Button variant="danger" onClick={handleCancel}>Cancel</Button>
                <Spinner size={20} />
              </>
            ) : (
              <Button onClick={handleGenerate} disabled={!prompt.trim()}>
                Generate Movie
              </Button>
            )}
          </div>

          {/* ── Progress display ── */}
          {generating && progressMsgs.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-xs font-semibold text-text-primary mb-2">Progress</div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {progressMsgs.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-xs ${
                      msg.startsWith("Error") ? "text-red-400" :
                      msg.startsWith("Complete") ? "text-emerald-400" :
                      "text-text-muted"
                    }`}
                  >
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Generated scene titles (visible after generation) ── */}
          {!generating && generatedSceneTitles.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-xs font-semibold text-text-primary mb-2">
                Scenes ({generatedSceneTitles.length})
              </div>
              <ul className="space-y-1">
                {generatedSceneTitles.map((title, i) => (
                  <li key={i} className="text-xs text-text-muted">
                    <span className="text-purple-400 font-medium">{i + 1}.</span> {title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right column: movie list ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Saved Movies</h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="small" onClick={loadMovies} disabled={moviesLoading}>
                Refresh
              </Button>
            </div>
          </div>

          {moviesLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : movies.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm">No movies yet. Generate one!</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {movies.map((m) => (
                <div
                  key={m.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors group relative"
                  onClick={() => loadMovieDetail(m.id)}
                >
                  {m.coverPath ? (
                    <img
                      src={m.coverPath}
                      alt={m.title}
                      className="w-full h-40 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border">
                      🎬 {m.genre || "MOVIE"}
                    </div>
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
                  {/* Hover delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMovie(m.id); }}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Movie Detail Modal ── */}
      {modalOpen && movieDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
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
                  <div className="font-semibold text-text-primary mb-1.5">Output Directory</div>
                  <div className="text-text-muted">{movieDetail.outputDir}</div>
                </div>
              )}
              {movieDetail.script && (
                <details className="border border-border rounded-lg overflow-hidden mb-4">
                  <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">Script</summary>
                  <pre className="p-3 text-xs whitespace-pre-wrap text-text-secondary border-t border-border">
                    {typeof movieDetail.script === "string" ? movieDetail.script : JSON.stringify(movieDetail.script, null, 2)}
                  </pre>
                </details>
              )}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="danger" onClick={() => deleteMovie(movieDetail.id)}>Delete Movie</Button>
                <Button variant="secondary" onClick={closeModal}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Escape key listener */}
      {modalOpen && (
        <div
          onKeyDown={(e) => { if (e.key === "Escape") closeModal(); }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
