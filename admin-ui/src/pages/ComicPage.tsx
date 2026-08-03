import { useState, useEffect, useCallback } from "react";
import { Input, Select, Button, Spinner, Toast, Textarea } from "../components/UI";
import {
  fetchComics,
  fetchComicDetail,
  type MediaComic,
} from "../api/client";

const PY_API = "/api/py";

/* ── SSE Comic Generation ── */
interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
  message?: string;
}

async function streamGenerateComic(
  body: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${PY_API}/image/comic`, {
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

/* ── Format options ── */
const FORMAT_OPTIONS = [
  { value: "comic", label: "Comic (Western grid)" },
  { value: "manga", label: "Manga (right-to-left)" },
  { value: "manhwa", label: "Manhwa (vertical scroll)" },
];

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

/* ── Date helper ── */
function dt(s: string | undefined | null): string {
  if (!s) return "\u2014";
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

/* ── Component ── */
export default function ComicPage() {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Generation form
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("comic");
  const [language, setLanguage] = useState("en");
  const [pagesPerEpisode, setPagesPerEpisode] = useState(5);
  const [numEpisodes, setNumEpisodes] = useState(1);
  const [generateImages, setGenerateImages] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Comic list
  const [comics, setComics] = useState<MediaComic[]>([]);
  const [comicsLoading, setComicsLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(0);
  const [comicDetail, setComicDetail] = useState<MediaComic | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    loadComics();
  }, [lastFetch]);

  async function loadComics() {
    setComicsLoading(true);
    try {
      const data = await fetchComics();
      setComics(data);
    } catch (e) {
      showToast(`Failed to load comics: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    } finally {
      setComicsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setGenerating(true);
    setProgress([]);
    const ctrl = new AbortController();
    setAbortController(ctrl);

    try {
      await streamGenerateComic(
        {
          prompt: prompt.trim(),
          format,
          language,
          pages_per_episode: pagesPerEpisode,
          num_episodes: numEpisodes,
          generate_images: generateImages,
        },
        (event: SSEEvent) => {
          const p = { ...(event.payload || {}), ...(event.message ? { message: event.message } : {}) };
          switch (event.type) {
            case "progress":
              setProgress((prev) => [...prev, (p.message as string) || (p.step as string) || ""]);
              break;
            case "complete":
              setProgress((prev) => [...prev, `Done! ${String(p.title || "Comic")} - ${String(p.episodes || 0)} episode(s), ${String(p.pages || 0)} page(s)`]);
              setLastFetch(Date.now());
              break;
            case "error":
              setProgress((prev) => [...prev, `Error: ${String(p.message || "Error")}`]);
              showToast(`Generation error: ${String(p.message || "Unknown")}`, "error");
              break;
          }
        },
        ctrl.signal,
      );
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        showToast(`Generation failed: ${e instanceof Error ? e.message : "Unknown"}`, "error");
        setProgress((prev) => [...prev, `Error: ${e instanceof Error ? e.message : "Unknown"}`]);
      }
    } finally {
      setGenerating(false);
      setAbortController(null);
    }
  }

  function handleCancel() {
    abortController?.abort();
    setGenerating(false);
    setAbortController(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this comic?")) return;
    try {
      const res = await fetch(`/api/comics/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Comic deleted");
      setLastFetch(Date.now());
    } catch (e) {
      showToast(`Delete failed: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  }

  async function openDetail(id: number) {
    try {
      const c = await fetchComicDetail(id);
      setComicDetail(c);
      setModalOpen(true);
    } catch (e) {
      showToast(`Failed to load comic: ${e instanceof Error ? e.message : "Unknown"}`, "error");
    }
  }

  function closeModal() {
    setModalOpen(false);
    setComicDetail(null);
  }

  const progressRef = (el: HTMLDivElement | null) => {
    if (el) el.scrollTop = el.scrollHeight;
  };

  return (
    <div>
      {toast && (
        <div className="mb-4">
          <Toast message={toast.message} type={toast.type} visible={true} />
        </div>
      )}

      {/* Title */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-text-primary mb-1">Comic / Manga / Manhwa Generator</h2>
        <p className="text-sm text-text-muted">Generate AI-powered comic scripts and panel descriptions.</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left Column: Generation Form */}
        <div className="w-96 shrink-0 space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Story Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe your story..."
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Format</label>
              <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full">
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Language</label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full">
                {LANG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-muted mb-1">Pages/Episode</label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={pagesPerEpisode}
                  onChange={(e) => setPagesPerEpisode(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-muted mb-1">Episodes</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={numEpisodes}
                  onChange={(e) => setNumEpisodes(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="mt-0.5 accent-purple-500"
              />
              <div>
                <span className="text-sm text-text-primary">Generate images</span>
                <div className="text-xs text-text-muted">Render panel images (slow)</div>
              </div>
            </label>

            <div className="flex gap-2">
              <Button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="flex-1"
              >
                {generating ? <><Spinner size={16} /> Generating...</> : "Generate Comic"}
              </Button>
              {generating && (
                <Button variant="danger" onClick={handleCancel}>Cancel</Button>
              )}
            </div>

            {/* Progress */}
            {progress.length > 0 && (
              <div
                ref={progressRef}
                className="bg-[var(--bg2)] border border-border rounded-lg p-3 max-h-48 overflow-y-auto text-xs text-text-secondary space-y-1"
              >
                {progress.map((msg, i) => (
                  <div key={i}>{msg}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Comic List */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-text-muted">
              {comics.length > 0 ? `${comics.length} comic(s)` : ""}
            </div>
            <Button variant="secondary" onClick={() => setLastFetch(Date.now())}>
              Refresh
            </Button>
          </div>

          {comicsLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : comics.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No saved comics yet. Generate one on the left.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {comics.map((c) => (
                <div
                  key={c.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors group relative"
                  onClick={() => openDetail(c.id)}
                >
                  {c.coverPath ? (
                    <img
                      src={c.coverPath}
                      alt={c.title}
                      className="w-full h-40 object-cover"
                      loading="lazy"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = "none";
                        if (el.parentElement) {
                          el.parentElement.classList.add("no-thumb");
                          const fallback = document.createElement("div");
                          fallback.className = "w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border";
                          fallback.textContent = "\u{1F4D6} " + (c.format || "COMIC");
                          el.parentElement.prepend(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center bg-[#0d0d14] text-text-muted text-xs border-b border-border">
                      {'\u{1F4D6}'} {c.format || "COMIC"}
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">{c.title}</div>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                        {c.format || "Comic"}
                      </span>
                      {c.numEpisodes && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                          {c.numEpisodes} ep.
                        </span>
                      )}
                      {c.totalPages && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                          {c.totalPages} pg.
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">
                      {c.language ? `${c.language} - ` : ""}{dt(c.createdAt)}
                    </div>
                  </div>
                  {/* Delete overlay on hover */}
                  <div
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  >
                    <button className="bg-red-500/80 hover:bg-red-500 text-white text-xs px-2 py-1 rounded-md">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {modalOpen && comicDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface flex justify-between items-start p-4 border-b border-border z-10">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{comicDetail.title}</h3>
                <div className="text-xs text-text-muted mt-1">
                  {comicDetail.format || "COMIC"} - {comicDetail.language || "en"}
                </div>
              </div>
              <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={closeModal}>X</button>
            </div>
            <div className="p-4">
              {(comicDetail.numEpisodes || comicDetail.totalPages || comicDetail.stats) && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {comicDetail.numEpisodes && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                      Episodes: {comicDetail.numEpisodes}
                    </span>
                  )}
                  {comicDetail.totalPages && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                      Pages: {comicDetail.totalPages}
                    </span>
                  )}
                  {comicDetail.stats?.total_tokens && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                      Tokens: {comicDetail.stats.total_tokens}
                    </span>
                  )}
                  {comicDetail.stats?.total_time && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                      Time: {Number(comicDetail.stats.total_time).toFixed(1)}s
                    </span>
                  )}
                </div>
              )}
              {comicDetail.coverPath && (
                <div className="mb-4">
                  <div className="text-xs text-text-muted mb-1">Cover</div>
                  <img
                    src={comicDetail.coverPath}
                    className="w-full rounded-lg max-h-[400px] object-contain bg-black"
                    loading="lazy"
                    alt={comicDetail.title}
                  />
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
                  <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">
                    Script
                  </summary>
                  <pre className="p-3 text-xs whitespace-pre-wrap text-text-secondary border-t border-border">
                    {typeof comicDetail.script === "string"
                      ? comicDetail.script
                      : JSON.stringify(comicDetail.script, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Escape key handler */}
      {modalOpen && (
        <div
          onKeyDown={(e) => { if (e.key === "Escape") closeModal(); }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
