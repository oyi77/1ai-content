import { useState, useCallback } from "react";
import { Input, Select, Button, Spinner, Toast } from "../components/UI";
import {
  generateCarousel,
  fetchCarouselTemplates,
  type CarouselGenerateResponse,
  type CarouselTemplatesResponse,
} from "../api/client";

const STYLE_OPTIONS = [
  { value: "outline", label: "Outline / Bullet" },
  { value: "educational", label: "Educational" },
  { value: "storytelling", label: "Storytelling" },
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold & Vibrant" },
  { value: "dark", label: "Dark Mode" },
];

const SLIDE_OPTIONS = [
  { value: "5", label: "5 slides" },
  { value: "7", label: "7 slides (recommended)" },
  { value: "10", label: "10 slides" },
];

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok (9:16)" },
  { value: "instagram", label: "Instagram (4:5)" },
  { value: "square", label: "Square (1:1)" },
];

const LANG_OPTIONS = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "English" },
];

export default function CarouselPage() {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("outline");
  const [slides, setSlides] = useState("7");
  const [platform, setPlatform] = useState("tiktok");
  const [lang, setLang] = useState("id");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CarouselGenerateResponse | null>(null);

  const [templatesData, setTemplatesData] = useState<CarouselTemplatesResponse | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) { showToast("Enter a topic", "error"); return; }
    setGenerating(true);
    setResult(null);
    try {
      const data = await generateCarousel({
        topic: topic.trim(),
        num_slides: parseInt(slides),
        style,
        platform,
        language: lang,
      });
      setResult(data);
      if (data.success) {
        showToast(`${data.slide_count || data.slides?.length || 0} slides generated!`);
      } else {
        showToast(data.error || "Generation failed", "error");
      }
    } catch {
      showToast("Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleTemplates = async () => {
    if (showTemplates) { setShowTemplates(false); return; }
    setShowTemplates(true);
    if (!templatesData) {
      setLoadingTemplates(true);
      try {
        const data = await fetchCarouselTemplates();
        setTemplatesData(data);
      } catch {
        showToast("Failed to load templates", "error");
      } finally {
        setLoadingTemplates(false);
      }
    }
  };

  const slideBg = (type?: string) => {
    if (type === "cover") return "#1a2a4a";
    if (type === "closing") return "#2a1a4a";
    return "#1a1a24";
  };

  const contentSlides = result?.slides || result?.content?.slides || [];

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Carousel Generator</h1>
          <p className="text-sm text-slate-400">Create TikTok/Instagram carousels with AI-generated content</p>
        </div>
        <Button variant="ghost" onClick={handleToggleTemplates}>Templates</Button>
      </div>

      {/* Generate Form */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Generate Carousel</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Topic</label>
            <Input value={topic} onChange={setTopic} placeholder="Tips hemat belanja online untuk pemula" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Style</label>
            <Select value={style} onChange={setStyle}>
              {STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Slides</label>
            <Select value={slides} onChange={setSlides}>
              {SLIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Platform</label>
            <Select value={platform} onChange={setPlatform}>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Language</label>
            <Select value={lang} onChange={setLang}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating..." : "Generate Carousel"}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Generated Carousel</h3>
          {result.success ? (
            <>
              <div className="mb-4">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                  {result.slide_count || contentSlides.length} slides generated
                </span>
              </div>

              {(result.title || result.content?.title) && (
                <div className="text-lg font-bold text-slate-100 mb-3">{result.title || result.content.title}</div>
              )}

              {contentSlides.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                  {contentSlides.map((s, i) => (
                    <div
                      key={i}
                      className="border border-slate-700 rounded-xl p-4"
                      style={{ background: slideBg(s.type) }}
                    >
                      <div className="text-xs text-slate-500 uppercase mb-1">{s.type || "content"} {i + 1}</div>
                      <div className="text-sm font-semibold text-slate-100 mb-1">{s.icon || ""} {s.headline || ""}</div>
                      <div className="text-xs text-slate-400">{s.body || ""}</div>
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(result.slides) && result.slides.length > 0 && typeof result.slides[0] === "string" && (
                <div className="text-xs text-slate-500 mt-3">
                  Files: {result.slides.length} PNG files saved
                </div>
              )}

              {result.caption && (
                <div className="mt-4 p-4 bg-slate-900 rounded-xl">
                  <div className="text-xs text-slate-500 uppercase mb-2">Caption</div>
                  <div className="text-sm text-slate-200 whitespace-pre-wrap">{result.caption}</div>
                </div>
              )}

              {Array.isArray(result.hashtags) && result.hashtags.length > 0 && (
                <div className="mt-2 text-sm text-purple-400">
                  {result.hashtags.join(" ")}
                </div>
              )}
            </>
          ) : (
            <div className="text-red-400">{result.error || "Generation failed"}</div>
          )}
        </div>
      )}

      {/* Templates */}
      {showTemplates && (
        <div className="bg-slate-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-100 mb-4">Available Templates</h3>
          {loadingTemplates ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Spinner size={16} /> Loading...
            </div>
          ) : templatesData ? (
            <>
              <div className="mb-4 flex flex-wrap gap-1">
                {templatesData.niches.map((n, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{n}</span>
                ))}
              </div>
              {templatesData.templates.map((t, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-slate-700/50">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{t.name}</div>
                    <div className="text-xs text-slate-400">
                      {t.niche} &middot; {t.slides} slides &middot; {t.style}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    {t.success_rate || 0}%
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="text-red-400">Failed to load templates</div>
          )}
        </div>
      )}
    </div>
  );
}
