import { useState } from "react";
import {
  generateSuno,
  generateMusicGen,
  generateSunoLofi,
  generateSunoBgm,
} from "../api/client";
import type { MusicResponse } from "../api/client";
import { Input, Textarea, Select, Button, Tab } from "../components/UI";

const ENGINES = [
  { value: "auto", label: "🤖 Auto (recommended)" },
  { value: "melody", label: "🎶 Melody" },
  { value: "medium", label: "📐 Medium" },
  { value: "small", label: "📏 Small (fastest)" },
];

export default function Music() {
  const [activeTab, setActiveTab] = useState<"suno" | "musicgen">("suno");

  /* Suno state */
  const [sunoPrompt, setSunoPrompt] = useState("");
  const [sunoStyle, setSunoStyle] = useState("");
  const [sunoLyrics, setSunoLyrics] = useState("");
  const [sunoInstrumental, setSunoInstrumental] = useState(true);
  const [sunoLoading, setSunoLoading] = useState(false);

  /* MusicGen state */
  const [mgPrompt, setMgPrompt] = useState("");
  const [mgDuration, setMgDuration] = useState(60);
  const [mgEngine, setMgEngine] = useState("auto");
  const [mgStyle, setMgStyle] = useState("");
  const [mgLoading, setMgLoading] = useState(false);

  /* Quick presets */
  const [lofiLoading, setLofiLoading] = useState(false);
  const [bgmLoading, setBgmLoading] = useState(false);

  /* Result */
  const [result, setResult] = useState<MusicResponse | null>(null);

  function buildAudioUrl(data: MusicResponse): string | null {
    if (!data.success) return null;
    if (data.filename) return `${window.location.origin}/api/py/audio/speech/media/${data.filename}`;
    if (data.audio_url || data.url) return data.audio_url || data.url || null;
    if (data.file) return `${window.location.origin}/api/py/${data.file.replace(/^\//, "")}`;
    return null;
  }

  async function handleSuno() {
    if (!sunoPrompt.trim()) return;
    setSunoLoading(true);
    setResult(null);
    try {
      const data = await generateSuno({
        prompt: sunoPrompt.trim(),
        style: sunoStyle.trim() || undefined,
        lyrics: sunoLyrics.trim() || undefined,
        instrumental: sunoInstrumental,
      });
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setSunoLoading(false);
    }
  }

  async function handleMusicGen() {
    if (!mgPrompt.trim()) return;
    setMgLoading(true);
    setResult(null);
    try {
      const data = await generateMusicGen({
        prompt: mgPrompt.trim(),
        duration_seconds: mgDuration,
        engine: mgEngine,
        style: mgStyle.trim() || undefined,
      });
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setMgLoading(false);
    }
  }

  async function handleLofi() {
    setLofiLoading(true);
    setResult(null);
    try {
      const data = await generateSunoLofi();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setLofiLoading(false);
    }
  }

  async function handleBgm() {
    setBgmLoading(true);
    setResult(null);
    try {
      const data = await generateSunoBgm();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setBgmLoading(false);
    }
  }

  const audioUrl = result ? buildAudioUrl(result) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text">🎵 Music Generator</h1>
          <p className="text-text-muted mt-1">Generate music with Suno AI or local MusicGen</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleLofi} loading={lofiLoading}>
            🎧 Lo-Fi Beats
          </Button>
          <Button variant="secondary" onClick={handleBgm} loading={bgmLoading}>
            🎼 Corporate BGM
          </Button>
        </div>
      </div>

      <Tab
        tabs={[
          { key: "suno", label: "☀️ Suno AI Music" },
          { key: "musicgen", label: "🎛️ MusicGen (Local)" },
        ]}
        active={activeTab}
        onChange={(k) => setActiveTab(k as "suno" | "musicgen")}
      />

      {activeTab === "suno" && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">☀️ Suno AI Music</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Textarea
                label="Prompt *"
                name="sunoPrompt"
                value={sunoPrompt}
                onChange={(v) => setSunoPrompt(v)}
                placeholder="Describe the music you want... e.g. upbeat electronic dance track with tropical vibes"
                rows={3}
              />
            </div>
            <Input
              label="Style"
              name="sunoStyle"
              value={sunoStyle}
              onChange={(v) => setSunoStyle(v)}
              placeholder="e.g. pop, rock, jazz, electronic"
            />
            <Textarea
              label="Lyrics (optional)"
              name="sunoLyrics"
              value={sunoLyrics}
              onChange={(v) => setSunoLyrics(v)}
              placeholder="Optional lyrics for the song"
              rows={2}
            />
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="sunoInstrumental"
                checked={sunoInstrumental}
                onChange={(e) => setSunoInstrumental(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <label htmlFor="sunoInstrumental" className="text-sm cursor-pointer">
                Instrumental (no vocals)
              </label>
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={handleSuno} loading={sunoLoading} disabled={!sunoPrompt.trim()}>
              🎵 Generate Suno Music
            </Button>
          </div>
        </div>
      )}

      {activeTab === "musicgen" && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">🎛️ MusicGen (Local)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Textarea
                label="Prompt *"
                name="mgPrompt"
                value={mgPrompt}
                onChange={(v) => setMgPrompt(v)}
                placeholder="Describe the music... e.g. calming ambient piano with soft strings"
                rows={3}
              />
            </div>
            <Input
              label="Duration (seconds)"
              name="mgDuration"
              type="number"
              value={String(mgDuration)}
              onChange={(v) => setMgDuration(parseInt(v) || 60)}
            />
            <Select
              label="Model"
              name="mgEngine"
              value={mgEngine}
              onChange={setMgEngine}
              options={ENGINES}
            />
            <div className="md:col-span-2">
              <Input
                label="Style (optional)"
                name="mgStyle"
                value={mgStyle}
                onChange={(v) => setMgStyle(v)}
                placeholder="e.g. cinematic, ambient, orchestral, lofi, jazz"
              />
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={handleMusicGen} loading={mgLoading} disabled={!mgPrompt.trim()}>
              🎵 Generate MusicGen
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">Generated Music</h3>
          {result.success && audioUrl ? (
            <div className="space-y-4">
              <span className="badge badge-green">✅ Generated successfully</span>
              <div className="bg-[var(--bg)] rounded-xl p-5 text-center">
                <audio controls className="w-full max-w-xl mb-4" src={audioUrl} />
                <div className="mt-3">
                  {result.filename ? (
                    <a
                      href={audioUrl}
                      download={result.filename}
                      className="btn btn-primary inline-flex items-center gap-2 no-underline"
                    >
                      ⬇️ Download MP3
                    </a>
                  ) : (
                    <a
                      href={audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary inline-flex items-center gap-2 no-underline"
                    >
                      ⬇️ Download
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-red-400">❌ {result.error || "Generation failed — no audio file returned"}</div>
          )}
        </div>
      )}
    </div>
  );
}
