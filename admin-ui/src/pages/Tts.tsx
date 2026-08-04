import { useState, useEffect, useCallback } from "react";
import {
  fetchTTSVoices,
  generateTTS,
} from "../api/client";
import type { TTSVoice, TTSResponse } from "../api/client";
import { Input, Textarea, Select, Button } from "../components/UI";

const LANGUAGES = [
  { value: "id", label: "🇮🇩 Indonesia" },
  { value: "en", label: "🇬🇧 English" },
  { value: "zh-CN", label: "🇨🇳 Chinese" },
  { value: "ja", label: "🇯🇵 Japanese" },
  { value: "ko", label: "🇰🇷 Korean" },
  { value: "ms", label: "🇲🇾 Malay" },
];

export default function Tts() {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("id");
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TTSResponse | null>(null);

  const loadVoices = useCallback(async (lang: string) => {
    setVoicesLoading(true);
    try {
      const data = await fetchTTSVoices(lang);
      setVoices(Array.isArray(data) ? data : []);
    } catch {
      setVoices([]);
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVoices("id");
  }, [loadVoices]);

  const handleLanguageChange = (v: string) => {
    setLanguage(v);
    setVoice("");
    loadVoices(v);
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const data = await generateTTS({
        text: text.trim(),
        language,
        voice: voice || undefined,
        rate,
        pitch,
      });
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  const audioUrl = result?.success && result.filename
    ? `${window.location.origin}/api/py/audio/speech/media/${encodeURIComponent(result.filename)}`
    : null;

  const voiceOptions = voices.map((v) => {
    const shortName = v.ShortName || v.short_name || v.name || "";
    const displayName = v.DisplayName || v.display_name || v.Name || shortName;
    const locale = v.Locale || v.locale || language;
    const gender = v.Gender || v.gender || "";
    const label = displayName + (locale ? ` (${locale})` : "") + (gender ? ` - ${gender}` : "");
    return { value: shortName, label };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">🔊 Text-to-Speech Generator</h1>
        <p className="text-text-muted mt-1">Convert text to natural speech using Edge TTS voices</p>
      </div>

      <div className="card">
        <h3 className="text-base font-bold mb-4">Generate Speech</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Textarea
              label="Text to Speak"
              name="text"
              value={text}
              onChange={(v) => setText(v)}
              placeholder="Enter the text you want to convert to speech..."
            />
          </div>
          <Select
            label="Language"
            name="language"
            value={language}
            onChange={handleLanguageChange}
            options={LANGUAGES}
          />
          <Select
            label="Voice"
            name="voice"
            value={voice}
            onChange={setVoice}
            options={voiceOptions}
          />
          <Input
            label="Rate"
            name="rate"
            value={rate}
            onChange={(v) => setRate(v)}
            placeholder="e.g. +0%, -50%, +50%"
          />
          <Input
            label="Pitch"
            name="pitch"
            value={pitch}
            onChange={(v) => setPitch(v)}
            placeholder="e.g. +0Hz, -20Hz, +20Hz"
          />
        </div>
        <div className="mt-5">
          <Button onClick={handleGenerate} loading={generating} disabled={!text.trim()}>
            🔊 Generate Speech
          </Button>
        </div>
      </div>

      {voicesLoading && (
        <div className="text-text-muted text-sm">Loading voices...</div>
      )}

      {result && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">Generated Audio</h3>
          {result.success && audioUrl ? (
            <div className="space-y-4">
              <div className="flex gap-2 items-center">
                <span className="badge badge-green">✅ Speech generated</span>
                {result.file_path && (
                  <span className="text-xs text-text-muted font-mono">{result.file_path}</span>
                )}
              </div>
              <audio controls className="w-full max-w-xl" src={audioUrl} />
              <a
                href={audioUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost inline-flex items-center gap-2"
              >
                ⬇️ Download Audio
              </a>
            </div>
          ) : (
            <div className="text-red-400">❌ {result.error || "Generation failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
