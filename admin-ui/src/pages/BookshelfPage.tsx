import { useState, useEffect, useRef, useCallback } from "react";
import { fetchBooks, fetchBookDetail } from "../api/client";
import type { MediaBook } from "../api/client";
import { Button, Spinner, Toast, Input, Select, Textarea } from "../components/UI";

const PY_API = "/api/py";

const MODEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "llama", label: "Llama" },
  { value: "gpt4", label: "GPT-4" },
  { value: "claude", label: "Claude" },
];

interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
  step?: string;
  message?: string;
}

async function streamGenerateBook(
  body: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${PY_API}/text/book`, {
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
        // skip unparseable events
      }
    }
  }
  if (buffer.startsWith("data: ")) {
    const jsonStr = buffer.slice(6).trim();
    if (jsonStr) {
      try {
        onEvent(JSON.parse(jsonStr));
      } catch {
        // skip
      }
    }
  }
}

function dt(s: string | undefined | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function fmtStat(v: number | undefined | null, suffix: string): string {
  if (v == null) return "—";
  return `${v}${suffix}`;
}

export default function BookshelfPage() {
  /* ── Generation form ── */
  const [subject, setSubject] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [longMode, setLongMode] = useState(false);
  const [titleModel, setTitleModel] = useState("auto");
  const [structureModel, setStructureModel] = useState("auto");
  const [sectionModel, setSectionModel] = useState("auto");
  const [generating, setGenerating] = useState(false);
  const [progressMsgs, setProgressMsgs] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Book list ── */
  const [books, setBooks] = useState<MediaBook[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<MediaBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  /* ── Detail modal ── */
  const [selectedBook, setSelectedBook] = useState<MediaBook | null>(null);

  /* ── Toast ── */
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  /* ── Load books ── */
  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    try {
      const data = await fetchBooks();
      setBooks(data);
      setFilteredBooks(data);
    } catch (e) {
      setToast({ message: `Failed to load books: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setLoadingBooks(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  /* ── Search/filter ── */
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBooks(books);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredBooks(
      books.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q),
      ),
    );
  }, [searchQuery, books]);

  /* ── Generate book ── */
  const handleGenerate = async () => {
    if (!subject.trim()) {
      setToast({ message: "Subject is required", type: "error" });
      return;
    }
    setGenerating(true);
    setProgressMsgs([]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamGenerateBook(
        {
          subject: subject.trim(),
          additional_instructions: additionalInstructions.trim() || undefined,
          long_mode: longMode,
          title_model: titleModel,
          structure_model: structureModel,
          section_model: sectionModel,
        },
        (event) => {
          const payload = {
            ...(event.payload || {}),
            step: event.payload?.step || event.step,
            message: event.payload?.message || event.message,
          };
          if (event.type === "progress") {
            const msg = (payload.step || payload.message || "") as string;
            if (msg) setProgressMsgs((prev) => [...prev, msg]);
          }
          if (event.type === "complete") {
            const bookTitle = (payload.title || payload.bookId || "Book") as string;
            setToast({ message: `Book generated: ${bookTitle}`, type: "success" });
            loadBooks();
          }
          if (event.type === "error") {
            const errMsg = (payload.message || "Generation failed") as string;
            setToast({ message: errMsg, type: "error" });
          }
        },
        controller.signal,
      );
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setToast({ message: "Generation cancelled", type: "info" });
      } else {
        setToast({ message: `Generation failed: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  /* ── Open detail ── */
  const handleOpenDetail = async (id: number) => {
    try {
      const book = await fetchBookDetail(id);
      setSelectedBook(book);
    } catch (e) {
      setToast({ message: `Failed to load book detail: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  };

  /* ── Delete book ── */
  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/books/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      setToast({ message: `Deleted: ${title}`, type: "success" });
      loadBooks();
      if (selectedBook?.id === id) setSelectedBook(null);
    } catch (e) {
      setToast({ message: `Delete failed: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} visible={true} />}

      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-text-primary mb-1">Bookshelf</h2>
        <p className="text-sm text-text-muted">Generate and manage AI-written books.</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* ── Left: Generation Form ── */}
        <div className="w-96 flex-shrink-0">
          <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Generate Book</h3>

            {/* Subject */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Subject *</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. History of Rome, Quantum Physics..."
              />
            </div>

            {/* Additional instructions */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Additional Instructions</label>
              <Textarea
                value={additionalInstructions}
                onChange={setAdditionalInstructions}
                placeholder="Style, tone, length preferences..."
                rows={3}
              />
            </div>

            {/* Long mode checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={longMode}
                onChange={(e) => setLongMode(e.target.checked)}
                className="accent-purple-500 rounded"
              />
              <span className="text-sm text-text-primary">Long mode (more sections)</span>
            </label>

            {/* Title model */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Title Model</label>
              <Select value={titleModel} onChange={setTitleModel}>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            {/* Structure model */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Structure Model</label>
              <Select value={structureModel} onChange={setStructureModel}>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            {/* Section model */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Section Model</label>
              <Select value={sectionModel} onChange={setSectionModel}>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            {/* Generate / Cancel buttons */}
            <div className="flex gap-2 pt-2">
              {generating ? (
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
              >
                Cancel
              </button>
              ) : (
                <Button onClick={handleGenerate} disabled={!subject.trim()}>
                  Generate Book
                </Button>
              )}
            </div>

            {/* Progress */}
            {generating && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Spinner size={16} />
                  <span className="text-xs text-text-muted">Generating...</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {progressMsgs.map((msg, i) => (
                    <div key={i} className="text-xs text-text-muted leading-relaxed">
                      • {msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Book List ── */}
        <div className="flex-1 min-w-0">
          {/* Search */}
          <div className="mb-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or subject..."
            />
          </div>

          {loadingBooks ? (
            <div className="flex justify-center py-12">
              <Spinner size={32} />
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              {books.length === 0
                ? "No books yet. Generate your first book on the left."
                : "No books match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBooks.map((b) => (
                <div
                  key={b.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-colors group"
                >
                  {/* Clickable body opens detail */}
                  <div onClick={() => handleOpenDetail(b.id)}>
                    <div className="w-full h-36 flex items-center justify-center bg-[#0d0d14] text-5xl border-b border-border">
                      📖
                    </div>
                    <div className="p-3">
                      <div className="font-semibold text-sm text-text-primary mb-1.5 truncate">
                        {b.title}
                      </div>
                      <div className="flex gap-1.5 flex-wrap mb-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                          {b.subject || "Book"}
                        </span>
                        {b.sections && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                            {b.sections.length} ch.
                          </span>
                        )}
                        {b.stats?.total_tokens != null && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                            {fmtStat(b.stats.total_tokens, " tok")}
                          </span>
                        )}
                        {b.stats?.total_cost != null && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                            {fmtStat(b.stats.total_cost, "$")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">
                        {b.stats?.total_time != null && `${fmtStat(b.stats.total_time, "s")} • `}
                        {dt(b.createdAt)}
                      </div>
                    </div>
                  </div>
                  {/* Delete button */}
                  <div className="border-t border-border px-3 py-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(b.id, b.title);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Book Detail Modal ── */}
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedBook(null);
          }}
        >
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-surface flex justify-between items-start p-4 border-b border-border z-10">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{selectedBook.title}</h3>
                {selectedBook.subject && (
                  <div className="text-xs text-text-muted mt-1">{selectedBook.subject}</div>
                )}
              </div>
              <button
                className="text-text-muted hover:text-text-primary text-lg leading-none"
                onClick={() => setSelectedBook(null)}
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {/* Stats badges */}
              {selectedBook.stats && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {Object.entries(selectedBook.stats)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400"
                      >
                        {k.replace(/_/g, " ")}: {String(v)}
                      </span>
                    ))}
                </div>
              )}

              {/* Sections */}
              {selectedBook.sections && selectedBook.sections.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-semibold text-text-primary">Sections</h4>
                  {selectedBook.sections.map((sec: Record<string, unknown>, i: number) => {
                    const title = (sec.title || sec.heading || `Section ${i + 1}`) as string;
                    const content = (sec.content || "") as string;
                    return (
                      <details key={i} className="border border-border rounded-lg overflow-hidden">
                        <summary className="flex justify-between items-center p-3 cursor-pointer bg-[var(--bg)] text-sm font-medium text-text-primary">
                          {title}
                        </summary>
                        <div className="p-3 text-xs text-text-secondary leading-relaxed border-t border-border whitespace-pre-wrap">
                          {content}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}

              {/* Full markdown */}
              {selectedBook.fullMarkdown && (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-text-primary">Full Markdown</span>
                    <button
                      onClick={() => {
                        navigator.clipboard
                          .writeText(selectedBook.fullMarkdown || "")
                          .then(() => setToast({ message: "Copied!", type: "success" }));
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="bg-[var(--bg2)] p-4 rounded-lg text-xs leading-relaxed overflow-x-auto max-h-60 whitespace-pre-wrap text-text-secondary">
                    {selectedBook.fullMarkdown}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}