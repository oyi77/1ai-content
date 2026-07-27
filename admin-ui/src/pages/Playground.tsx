import { useState, useEffect } from "react";
import {
  fetchPlaygroundModels,
  runPlaygroundText,
  runPlaygroundImage,
  runPlaygroundVideo,
} from "../api/client";
import { Input, Textarea, Select, Button, Tab, Spinner } from "../components/UI";

const NICHES = [
  "business", "education", "entertainment", "finance", "health",
  "lifestyle", "marketing", "technology", "travel", "food",
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

export default function Playground() {
  const [activeTab, setActiveTab] = useState<"text" | "image" | "video">("text");
  const [models, setModels] = useState<string[]>([]);
  const [videoProviders, setVideoProviders] = useState<string[]>([]);
  const [imageProviders, setImageProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Text state */
  const [textModel, setTextModel] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [textOutput, setTextOutput] = useState("");
  const [textLoading, setTextLoading] = useState(false);

  /* Image state */
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageProvider, setImageProvider] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState("16:9");
  const [imageOutput, setImageOutput] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  /* Video state */
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoProvider, setVideoProvider] = useState("");
  const [videoNiche, setVideoNiche] = useState("");
  const [videoDuration, setVideoDuration] = useState(15);
  const [videoOutput, setVideoOutput] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  async function loadModels() {
    try {
      const data = await fetchPlaygroundModels();
      setModels(data.models || []);
      setVideoProviders(data.videoProviders || []);
      setImageProviders(data.imageProviders || []);
      if (data.models?.length) setTextModel(data.models[0]);
      if (data.videoProviders?.length) setVideoProvider(data.videoProviders[0]);
      if (data.imageProviders?.length) setImageProvider(data.imageProviders[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadModels(); }, []);

  if (loading) {
    return (
      <div className="text-slate-400 text-center py-12">
        <Spinner size={32} />
        <p className="mt-2">Loading playground...</p>
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;
  }

  /* ── Text tab ── */
  async function handleTextSubmit() {
    if (!textPrompt.trim()) return;
    setTextLoading(true);
    setTextOutput("");
    try {
      const res = await runPlaygroundText(textPrompt, textModel || undefined);
      setTextOutput(res.success && res.content ? res.content : `Error: ${res.error || "Unknown"}`);
    } catch (err) {
      setTextOutput(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setTextLoading(false);
    }
  }

  /* ── Image tab ── */
  async function handleImageSubmit() {
    if (!imagePrompt.trim()) return;
    setImageLoading(true);
    setImageOutput(null);
    try {
      const res = await runPlaygroundImage(imagePrompt, imageProvider || undefined, imageAspectRatio);
      if (res.success && res.imageUrl) setImageOutput(res.imageUrl);
      else alert(`Error: ${res.error || "Unknown"}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setImageLoading(false);
    }
  }

  /* ── Video tab ── */
  async function handleVideoSubmit() {
    if (!videoPrompt.trim()) return;
    setVideoLoading(true);
    setVideoOutput(null);
    try {
      const res = await runPlaygroundVideo(videoPrompt, videoProvider || undefined, videoNiche || undefined, videoDuration);
      if (res.success && res.videoUrl) setVideoOutput(res.videoUrl);
      else alert(`Error: ${res.error || "Unknown"}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setVideoLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Model Playground</h1>
        <p className="text-slate-400 mt-1">Test AI models and providers directly from the admin panel.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        <Tab label="💬 Text/Chat" active={activeTab === "text"} onClick={() => setActiveTab("text")} />
        <Tab label="🖼️ Image Gen" active={activeTab === "image"} onClick={() => setActiveTab("image")} />
        <Tab label="🎬 Video Gen" active={activeTab === "video"} onClick={() => setActiveTab("video")} />
      </div>

      {/* ═══ Text Tab ═══ */}
      {activeTab === "text" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Input</h3>
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-2">Model</label>
                <Select value={textModel} onChange={setTextModel}>
                  {models.map((m) => (<option key={m} value={m}>{m}</option>))}
                </Select>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-2">Prompt</label>
                <Textarea value={textPrompt} onChange={setTextPrompt} placeholder="Ask something..." />
              </div>
              <Button onClick={handleTextSubmit} disabled={textLoading || !textPrompt.trim()} className="w-full justify-center">
                {textLoading && <Spinner size={20} />}
                {textLoading ? "Generating..." : "Send Message"}
              </Button>
            </div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Output</h3>
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 min-h-[200px] font-mono text-sm text-slate-300 whitespace-pre-wrap">
                {textOutput || "Result will appear here..."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Image Tab ═══ */}
      {activeTab === "image" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Input</h3>
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-2">Prompt</label>
                <Textarea value={imagePrompt} onChange={setImagePrompt} placeholder="Describe the image you want..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Provider</label>
                  <Select value={imageProvider} onChange={setImageProvider}>
                    {imageProviders.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Aspect Ratio</label>
                  <Select value={imageAspectRatio} onChange={setImageAspectRatio}>
                    {ASPECT_RATIOS.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </Select>
                </div>
              </div>
              <Button onClick={handleImageSubmit} disabled={imageLoading || !imagePrompt.trim()} className="w-full justify-center">
                {imageLoading && <Spinner size={20} />}
                {imageLoading ? "Generating..." : "Generate Image"}
              </Button>
            </div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Output</h3>
              {imageOutput ? (
                <img src={imageOutput} alt="Generated" className="max-w-full max-h-96 rounded-lg" />
              ) : (
                <p className="text-slate-500">Generated image will appear here...</p>
              )}
              {imageOutput && (
                <div className="mt-4">
                  <a href={imageOutput} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="w-full justify-center">Open in New Tab</Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Video Tab ═══ */}
      {activeTab === "video" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Input</h3>
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-2">Prompt</label>
                <Textarea value={videoPrompt} onChange={setVideoPrompt} placeholder="Describe the video..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Video Provider</label>
                  <Select value={videoProvider} onChange={setVideoProvider}>
                    {videoProviders.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Niche</label>
                  <Select value={videoNiche} onChange={setVideoNiche}>
                    <option value="">Auto</option>
                    {NICHES.map((n) => (<option key={n} value={n}>{n}</option>))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Duration (seconds)</label>
                  <Input type="number" value={videoDuration} onChange={(v) => setVideoDuration(parseInt(v) || 15)} min={5} max={60} step={5} />
                </div>
              </div>
              <Button onClick={handleVideoSubmit} disabled={videoLoading || !videoPrompt.trim()} className="w-full justify-center">
                {videoLoading && <Spinner size={20} />}
                {videoLoading ? "Generating..." : "Generate Video"}
              </Button>
            </div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Output</h3>
              {videoOutput ? (
                <video src={videoOutput} controls className="max-w-full max-h-96 rounded-lg" />
              ) : (
                <p className="text-slate-500">Generated video will appear here...</p>
              )}
              {videoOutput && (
                <div className="mt-4">
                  <a href={videoOutput} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="w-full justify-center">Open in New Tab</Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
