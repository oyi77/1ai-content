import { useState } from "react";
import { createLoopVideo } from "../api/client";
import type { LoopCreateResponse } from "../api/client";
import { Input, Select, Button } from "../components/UI";

const RESOLUTIONS = [
  { value: "1920x1080", label: "📺 1920x1080 (Full HD)" },
  { value: "1080x1920", label: "📱 1080x1920 (Portrait)" },
  { value: "1280x720", label: "💻 1280x720 (HD)" },
  { value: "720x1280", label: "📱 720x1280 (Portrait HD)" },
];

const VISUAL_TYPES = [
  { value: "gradient", label: "🌈 Gradient" },
  { value: "waves", label: "🌊 Waves" },
  { value: "particles", label: "✨ Particles" },
  { value: "image", label: "🖼️ Image" },
];

export default function Looping() {
  const [audioPath, setAudioPath] = useState("");
  const [duration, setDuration] = useState(60);
  const [visualType, setVisualType] = useState("gradient");
  const [resolution, setResolution] = useState("1920x1080");
  const [colors, setColors] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<LoopCreateResponse | null>(null);

  const showImagePath = visualType === "image";

  async function handleGenerate() {
    if (!audioPath.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const body: Parameters<typeof createLoopVideo>[0] = {
        audio_path: audioPath.trim(),
        duration_minutes: duration,
        visual_type: visualType,
        resolution,
      };
      if (colors.trim()) body.colors = colors.trim();
      if (showImagePath && imagePath.trim()) body.image_path = imagePath.trim();

      const data = await createLoopVideo(body);
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  const videoUrl =
    result?.success && result.filename
      ? `${window.location.origin}/api/py/loop/video/${result.filename}`
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">🔄 Loop Video Generator</h1>
        <p className="text-text-muted mt-1">Create looping videos from audio files with visual effects</p>
      </div>

      <div className="card">
        <h3 className="text-base font-bold mb-4">Generate Loop Video</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Audio File Path *"
              name="audioPath"
              value={audioPath}
              onChange={(v) => setAudioPath(v)}
              placeholder="/path/to/audio.mp3"
            />
            <div className="text-xs text-text-muted mt-1 font-mono">
              Path to an audio file on the server (MP3, WAV, M4A)
            </div>
          </div>
          <Input
            label="Duration (minutes)"
            name="duration"
            type="number"
            value={String(duration)}
            onChange={(v) => setDuration(parseInt(v) || 60)}
          />
          <Select
            label="Resolution"
            name="resolution"
            value={resolution}
            onChange={setResolution}
            options={RESOLUTIONS}
          />
          <Select
            label="Visual Type"
            name="visualType"
            value={visualType}
            onChange={(v) => {
              setVisualType(v);
            }}
            options={VISUAL_TYPES}
          />
          <Input
            label="Colors"
            name="colors"
            value={colors}
            onChange={(v) => setColors(v)}
            placeholder="#ff0000,#00ff00,#0000ff"
          />
          {showImagePath && (
            <Input
              label="Image Path"
              name="imagePath"
              value={imagePath}
              onChange={(v) => setImagePath(v)}
              placeholder="/path/to/background.png"
            />
          )}
        </div>
        <div className="mt-5">
          <Button onClick={handleGenerate} loading={generating} disabled={!audioPath.trim()}>
            🎬 Generate Loop Video
          </Button>
        </div>
      </div>

      {result && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">Generated Video</h3>
          {result.success && videoUrl ? (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <span className="badge badge-blue">📐 {resolution}</span>
                <span className="badge badge-green">⏱️ {duration} min</span>
                <span className="badge badge-purple">🎨 {visualType}</span>
                {result.file_size != null && (
                  <span className="badge badge-orange">
                    💾 {(result.file_size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
              </div>
              <video
                controls
                className="w-full max-w-2xl rounded-xl bg-black"
                src={videoUrl}
              />
              <div>
                <a
                  href={videoUrl}
                  download
                  className="btn btn-primary inline-flex items-center gap-2 no-underline"
                >
                  ⬇️ Download Video
                </a>
              </div>
              {result.file_path && (
                <div className="text-xs text-text-muted font-mono">📁 {result.file_path}</div>
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
