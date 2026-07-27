import { useState, useRef, useCallback } from "react";
import { Input, Select, Button, Toast } from "../components/UI";
import { researchTopics, generateBookBrief, type ResearchTopicsResponse, type BookBriefResponse } from "../api/client";

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesia" },
  { value: "ms", label: "Melayu" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
];

const PY_API = "/api/py";

/* ── SSE Book Generation ── */
interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
}

async function streamGenerateBook(
  body: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${PY_API}/research/generate-book`, {
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

function escapeHtml(str: string): string {
  if (!str) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ── Book Section type ── */
interface BookSection {
  chapter?: string;
  title?: string;
  content?: string;
  text?: string;
}

/* ── Component ── */
export default function ResearchPage() {
  // Research
  const [researchLang, setResearchLang] = useState("id");
  const [researchRegion, setResearchRegion] = useState("");
  const [researchCategory, setResearchCategory] = useState("");
  const [researchCount, setResearchCount] = useState("8");
  const [researchSourceHint, setResearchSourceHint] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchTopicsResponse | null>(null);

  // Brief
  const [briefNiche, setBriefNiche] = useState("");
  const [briefLang, setBriefLang] = useState("en");
  const [briefRegion, setBriefRegion] = useState("");
  const [briefTarget, setBriefTarget] = useState("");
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefResult, setBriefResult] = useState<BookBriefResponse | null>(null);

  // Full book generation (SSE)
  const [genSubject, setGenSubject] = useState("");
  const [genLang, setGenLang] = useState("en");
  const [genRegion, setGenRegion] = useState("");
  const [genInstructions, setGenInstructions] = useState("");
  const [genRunning, setGenRunning] = useState(false);
  const [genProgress, setGenProgress] = useState<string[]>([]);
  const [genSections, setGenSections] = useState<BookSection[]>([]);
  const [genComplete, setGenComplete] = useState<{ sections?: BookSection[]; content?: string; word_count?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Section 1: Research Niches ── */
  const handleResearch = async () => {
    setResearching(true);
    setResearchResult(null);
    try {
      const data = await researchTopics({
        language: researchLang,
        region: researchRegion.trim() || undefined,
        category: researchCategory.trim() || undefined,
        count: parseInt(researchCount) || 8,
        source_hint: researchSourceHint.trim() || undefined,
      });
      setResearchResult(data);
      const niches = data.niches?.niches || [];
      showToast(`Found ${niches.length} niches`);
    } catch {
      showToast("Research failed", "error");
    } finally {
      setResearching(false);
    }
  };

  /* ── Section 2: Book Brief ── */
  const handleBrief = async () => {
    if (!briefNiche.trim()) { showToast("Enter a niche/topic", "error"); return; }
    setBriefGenerating(true);
    setBriefResult(null);
    try {
      const data = await generateBookBrief({
        niche: briefNiche.trim(),
        language: briefLang,
        region: briefRegion.trim() || undefined,
        target_market: briefTarget.trim() || undefined,
      });
      setBriefResult(data);
      showToast(`Brief generated: ${data.brief?.title || ""}`);
    } catch {
      showToast("Brief generation failed", "error");
    } finally {
      setBriefGenerating(false);
    }
  };

  /* ── Section 3: Full Book Generation (SSE) ── */
  const handleGenerateBook = async () => {
    if (!genSubject.trim()) { showToast("Enter a subject", "error"); return; }

    // Abort any in-flight
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setGenRunning(true);
    setGenProgress(["Initializing..."]);
    setGenSections([]);
    setGenComplete(null);

    const ac = new AbortController();
    abortRef.current = ac;

    const sections: BookSection[] = [];

    const onEvent = (event: SSEEvent) => {
      const payload = event.payload || {};
      switch (event.type) {
        case "brief":
          setGenProgress((p) => [...p, `Brief generated: ${(payload.title as string) || ""}`]);
          break;
        case "section_content":
          sections.push(payload as BookSection);
          setGenSections([...sections]);
          setGenProgress((p) => [...p, `Writing: ${(payload.chapter || payload.title || "") as string} ${(payload.progress as string) || ""}`]);
          break;
        case "progress":
          setGenProgress((p) => [...p, (payload.message as string) || ""]);
          break;
        case "complete":
          setGenComplete(payload as { sections?: BookSection[]; content?: string; word_count?: number });
          setGenProgress((p) => [...p, `Complete${payload.word_count ? ` ~${payload.word_count} words` : ""}`]);
          if (payload.sections) {
            setGenSections(payload.sections as BookSection[]);
          }
          break;
        case "error":
          setGenProgress((p) => [...p, `Error: ${(payload.message as string) || ""}`]);
          break;
        default:
          setGenProgress((p) => [...p, (payload.message as string) || (event.type) || ""]);
      }
    };

    try {
      await streamGenerateBook(
        {
          subject: genSubject.trim(),
          language: genLang,
          region: genRegion.trim() || undefined,
          additional_instructions: genInstructions.trim() || undefined,
        },
        onEvent,
        ac.signal,
      );
      showToast(`Book generation complete: ${sections.length} sections`);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        showToast("Generation cancelled", "error");
      } else {
        showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`, "error");
      }
    } finally {
      setGenRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancelBook = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  /* ── Render ── */
  const brief = briefResult?.brief;

  /* Research niches display */
  const market = researchResult?.niches;
  const niches = market?.niches || [];
  const genres = market?.genres || [];
  const summary = market?.summary || "";
  const genSectionsList = genComplete?.sections as BookSection[] | undefined;

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Book Research</h1>
          <p className="text-sm text-slate-400">Research trending niches, generate book briefs, and create full books</p>
        </div>
      </div>

      {/* ── Section 1: Trending Niches ── */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Trending Niches</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Language</label>
            <Select value={researchLang} onChange={setResearchLang}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Region (optional)</label>
            <Input value={researchRegion} onChange={setResearchRegion} placeholder="e.g. US, UK, Indonesia" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Category (optional)</label>
            <Input value={researchCategory} onChange={setResearchCategory} placeholder="e.g. self-help, fiction" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Count</label>
            <Input value={researchCount} onChange={setResearchCount} type="number" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Source Hint (optional)</label>
            <Input value={researchSourceHint} onChange={setResearchSourceHint} placeholder="e.g. Amazon bestsellers, Google Books" />
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={handleResearch} disabled={researching}>
            {researching ? "Researching..." : "Research Niches"}
          </Button>
        </div>
      </div>

      {/* Research Results */}
      {researchResult && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Trending Niches</h3>
          {summary && (
            <div className="p-4 bg-slate-900 rounded-xl mb-4">
              <div className="text-sm text-slate-400">{summary}</div>
            </div>
          )}
          {genres.length > 0 && (
            <>
              <div className="text-xs text-slate-500 uppercase mb-2">Genres</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {genres.map((g, i) => {
                  const scoreColor = (g.popularity_score || 0) >= 80 ? "bg-green-500/20 text-green-400" : (g.popularity_score || 0) <= 30 ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400";
                  const trendIcon = g.growth_trend === "rising" ? "\uD83D\uDCC8" : g.growth_trend === "declining" ? "\uD83D\uDCC9" : "\u27A1\uFE0F";
                  return (
                    <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${scoreColor}`}>
                      {trendIcon} {g.genre || g.name || ""} <span className="opacity-70">({g.popularity_score || 0})</span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
          {niches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {niches.map((n, i) => {
                const compColor = n.competition_level === "high" ? "bg-orange-500/20 text-orange-400" : n.competition_level === "medium" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400";
                return (
                  <div key={i} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    <div className="text-sm font-bold text-slate-100 mb-2">{n.niche || ""}</div>
                    {n.target_audience && <div className="text-xs text-slate-400 mb-1">{n.target_audience}</div>}
                    {n.market_angle && <div className="text-xs text-slate-400 mb-2">{n.market_angle}</div>}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${compColor}`}>{n.competition_level || "medium"} competition</span>
                      {n.why_now && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">{n.why_now}</span>}
                    </div>
                    {n.suggested_titles && n.suggested_titles.length > 0 && (
                      <>
                        <div className="text-xs text-slate-500 mb-1">Suggested titles:</div>
                        <ul className="text-xs text-purple-400 list-disc pl-4 mb-2">
                          {n.suggested_titles.map((t, ti) => (
                            <li key={ti}>{t}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {n.outline_brief && n.outline_brief.length > 0 && (
                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-purple-400">Outline preview</summary>
                        <ul className="pl-4 mt-2 space-y-1 text-slate-300">
                          {n.outline_brief.map((o, oi) => (
                            <li key={oi}>{o}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">No niches found. Try different parameters.</div>
          )}
        </div>
      )}

      {/* ── Section 2: Book Brief ── */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Book Brief Generator</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Niche / Topic *</label>
            <Input value={briefNiche} onChange={setBriefNiche} placeholder="e.g. Mindfulness for busy professionals" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Language</label>
            <Select value={briefLang} onChange={setBriefLang}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Region (optional)</label>
            <Input value={briefRegion} onChange={setBriefRegion} placeholder="e.g. US, UK" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Target Market (optional)</label>
            <Input value={briefTarget} onChange={setBriefTarget} placeholder="e.g. Beginners, parents, entrepreneurs" />
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={handleBrief} disabled={briefGenerating}>
            {briefGenerating ? "Generating..." : "Generate Book Brief"}
          </Button>
        </div>
      </div>

      {/* Brief Results */}
      {brief && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Book Brief</h3>
          {brief.success === false ? (
            <div className="text-red-400">{brief.error || "Brief generation failed"}</div>
          ) : (
            <>
              <div className="mb-4">
                {brief.title && <div className="text-lg font-bold text-slate-100">{brief.title}</div>}
                {brief.subtitle && <div className="text-sm text-slate-400 mt-1">{brief.subtitle}</div>}
              </div>

              {brief.description && (
                <div className="p-4 bg-slate-900 rounded-xl mb-4">
                  <div className="text-xs text-slate-500 uppercase mb-2">Description</div>
                  <div className="text-sm text-slate-200 leading-relaxed">{brief.description}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {brief.primary_genre && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{brief.primary_genre}</span>}
                {brief.estimated_length_pages && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">~{brief.estimated_length_pages} pages</span>}
                {brief.target_audience && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">{brief.target_audience}</span>}
              </div>

              {brief.keywords && brief.keywords.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-slate-500 uppercase mb-1.5">Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {brief.keywords.map((k, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-600 text-white">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {brief.outline && brief.outline.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-slate-500 uppercase mb-2">Outline ({brief.outline.length} chapters)</div>
                  <div className="space-y-2">
                    {brief.outline.map((ch, i) => (
                      <div key={i} className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                        <div className="text-sm font-semibold text-slate-100">Chapter {i + 1}: {ch.chapter || ""}</div>
                        <div className="text-xs text-slate-400 mt-1">{ch.summary || ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.cover_style && (
                <div className="p-3 bg-slate-900 rounded-xl">
                  <div className="text-xs text-slate-500 uppercase mb-1">Cover Style</div>
                  <div className="text-sm text-slate-200">{brief.cover_style}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Section 3: Full Book Generation ── */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Full Book Generation</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Subject / Topic *</label>
            <Input value={genSubject} onChange={setGenSubject} placeholder="e.g. The Art of Minimalism" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Language</label>
            <Select value={genLang} onChange={setGenLang}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Region (optional)</label>
            <Input value={genRegion} onChange={setGenRegion} placeholder="e.g. US, UK" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Additional Instructions (optional)</label>
            <textarea
              value={genInstructions}
              onChange={(e) => setGenInstructions(e.target.value)}
              placeholder="Any specific requirements for the book..."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-y"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={handleGenerateBook} disabled={genRunning}>
            {genRunning ? "Generating..." : "Generate Full Book"}
          </Button>
          {genRunning && (
            <Button variant="secondary" onClick={handleCancelBook}>Cancel</Button>
          )}
        </div>
      </div>

      {/* Book Generation Progress */}
      {genProgress.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Progress</h3>
          <div className="max-h-60 overflow-y-auto bg-slate-900 rounded-xl p-4 space-y-1">
            {genProgress.map((msg, i) => (
              <div key={i} className="text-xs text-slate-400">{msg}</div>
            ))}
          </div>
        </div>
      )}

      {/* Book Generation Results */}
      {genComplete && (
        <div className="bg-slate-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-100 mb-4">Generated Book</h3>
          {genComplete.word_count && (
            <div className="mb-4 text-sm text-green-400">~{genComplete.word_count} words total</div>
          )}
          {(genSectionsList || genSections).length > 0 ? (
            <div className="space-y-4">
              {(genSectionsList || genSections).map((s, i) => {
                const chTitle = s.chapter || s.title || `Section ${i + 1}`;
                const contentText = s.content || s.text || "";
                return (
                  <div key={i} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    <div className="text-sm font-bold text-slate-100 mb-2">{chTitle}</div>
                    {contentText && (
                      <div
                        className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: escapeHtml(contentText) }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : genComplete.content ? (
            <div
              className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: escapeHtml(genComplete.content as string) }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
