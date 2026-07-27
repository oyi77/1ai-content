import { useState, useEffect } from "react";
import {
  fetchCaptionStyles,
  fetchCaptionPresets,
  generateCaption,
} from "../api/client";
import type { CaptionGenerateResponse } from "../api/client";
import { Input, Select, Button, Spinner } from "../components/UI";

const STYLE_OPTIONS = [
  { value: "educational", label: "🎓 Educational" },
  { value: "storytelling", label: "📖 Storytelling" },
  { value: "promotional", label: "📣 Promotional" },
  { value: "humor", label: "😄 Humor" },
  { value: "controversial", label: "🔥 Controversial" },
  { value: "emotional", label: "💖 Emotional" },
];

const LANGUAGE_OPTIONS = [
  { value: "id", label: "🇮🇩 Indonesia" },
  { value: "en", label: "🇬🇧 English" },
];

export default function Captions() {
  const [styles, setStyles] = useState<Record<string, { name: string; description?: string }> | null>(null);
  const [presets, setPresets] = useState<Record<string, { name: string; description?: string }> | null>(null);
  const [loadingStyles, setLoadingStyles] = useState(true);

  /* Generate form */
  const [topic, setTopic] = useState("");
  const [capStyle, setCapStyle] = useState("educational");
  const [language, setLanguage] = useState("id");
  const [hashtagCount, setHashtagCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CaptionGenerateResponse | null>(null);

  async function loadAll() {
    setLoadingStyles(true);
    try {
      const [s, p] = await Promise.all([fetchCaptionStyles(), fetchCaptionPresets()]);
      setStyles(s.styles || null);
      setPresets(p.presets || null);
    } catch {
      setStyles(null);
      setPresets(null);
    } finally {
      setLoadingStyles(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const data = await generateCaption({
        topic: topic.trim(),
        style: capStyle,
        language,
        hashtag_count: hashtagCount,
      });
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  function renderEntries(
    entries: [string, { name: string; description?: string }][] | null,
  ) {
    if (!entries || entries.length === 0) {
      return <div className="text-text-muted text-sm py-4">No items available</div>;
    }
    return (
      <div className="divide-y divide-[var(--border)]">
        {entries.map(([k, v]) => (
          <div key={k} className="py-2">
            <div className="font-semibold text-sm">{v.name || k}</div>
            {v.description && (
              <div className="text-xs text-text-muted">{v.description}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  const stylesEntries = styles ? Object.entries(styles) : null;
  const presetsEntries = presets ? Object.entries(presets) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text">✍️ Captions Manager</h1>
          <p className="text-text-muted mt-1">Browse caption styles & presets, generate AI captions for content</p>
        </div>
        <Button variant="secondary" onClick={loadAll} loading={loadingStyles}>
          🔄 Refresh Styles
        </Button>
      </div>

      {/* Styles & Presets overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-bold mb-3">🎨 Available Styles</h3>
          {loadingStyles ? (
            <Spinner />
          ) : (
            renderEntries(stylesEntries)
          )}
        </div>
        <div className="card">
          <h3 className="text-sm font-bold mb-3">📋 Available Presets</h3>
          {loadingStyles ? (
            <Spinner />
          ) : (
            renderEntries(presetsEntries)
          )}
        </div>
      </div>

      {/* Generate form */}
      <div className="card">
        <h3 className="text-base font-bold mb-4">Generate Caption</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Topic / Content Description"
              name="topic"
              value={topic}
              onChange={(v) => setTopic(v)}
              placeholder="Product launch, tips & tricks, storytelling..."
            />
          </div>
          <Select
            label="Style"
            name="capStyle"
            value={capStyle}
            onChange={setCapStyle}
            options={STYLE_OPTIONS}
          />
          <Select
            label="Language"
            name="language"
            value={language}
            onChange={setLanguage}
            options={LANGUAGE_OPTIONS}
          />
          <Input
            label="Hashtag Count"
            name="hashtagCount"
            type="number"
            value={String(hashtagCount)}
            onChange={(v) => setHashtagCount(parseInt(v) || 10)}
          />
        </div>
        <div className="mt-5">
          <Button onClick={handleGenerate} loading={generating} disabled={!topic.trim()}>
            ✍️ Generate Caption
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">Generated Caption</h3>
          {result.success ? (
            <div>
              <div className="p-4 bg-[var(--bg)] rounded-xl mb-3">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.caption || "—"}</div>
              </div>
              {result.hashtags && result.hashtags.length > 0 && (
                <div className="text-sm text-[var(--accent)] mb-2">
                  {result.hashtags.join(" ")}
                </div>
              )}
              {result.style && (
                <div>
                  <span className="badge badge-blue">{result.style}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-red-400">❌ {result.error || "Generation failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
