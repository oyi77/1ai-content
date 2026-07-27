import { useState, useCallback } from "react";
import { Input, Select, Button, Spinner, Toast } from "../components/UI";
import { processRemeta, type RemetaResponse } from "../api/client";

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
];

export default function RemetaPage() {
  const [overlay, setOverlay] = useState("");
  const [watermark, setWatermark] = useState("");
  const [niche, setNiche] = useState("general");
  const [platform, setPlatform] = useState("tiktok");
  const [source, setSource] = useState("");
  const [colorShift, setColorShift] = useState("true");

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RemetaResponse | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleProcess = async () => {
    if (!source.trim()) { showToast("Enter video file path", "error"); return; }
    if (!overlay.trim()) { showToast("Enter overlay text", "error"); return; }
    setProcessing(true);
    setResult(null);
    try {
      const data = await processRemeta({
        source: source.trim(),
        overlay: overlay.trim(),
        watermark: watermark.trim() || undefined,
        position: "bottom_right",
        color_shift: colorShift === "true",
        niche: niche.trim() || "general",
        platform,
      });
      setResult(data);
      if (data.success) {
        showToast("Video re-rendered with new metadata!");
      } else {
        showToast(data.error || "Failed", "error");
      }
    } catch {
      showToast("Failed to process", "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Re-Metadata Engine</h1>
          <p className="text-sm text-slate-400">Re-render video with new metadata &mdash; anti-copyright</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-slate-900 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-5 gap-3 text-center">
          <div>
            <div className="text-2xl mb-1">\uD83D\uDCF9</div>
            <div className="text-xs text-slate-400">Upload Video</div>
          </div>
          <div>
            <div className="text-2xl mb-1">\uD83C\uDFF7\uFE0F</div>
            <div className="text-xs text-slate-400">Add Overlay</div>
          </div>
          <div>
            <div className="text-2xl mb-1">\uD83C\uDFA8</div>
            <div className="text-xs text-slate-400">Color Shift</div>
          </div>
          <div>
            <div className="text-2xl mb-1">\u26A1</div>
            <div className="text-xs text-slate-400">Speed Tweak</div>
          </div>
          <div>
            <div className="text-2xl mb-1">\uD83D\uDD04</div>
            <div className="text-xs text-slate-400">New Hash</div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Re-Render Video</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Overlay Text</label>
            <Input value={overlay} onChange={setOverlay} placeholder="@brandname" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Watermark (optional)</label>
            <Input value={watermark} onChange={setWatermark} placeholder="@username" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Niche (for SEO metadata)</label>
            <Input value={niche} onChange={setNiche} placeholder="tech tips" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Platform</label>
            <Select value={platform} onChange={setPlatform}>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Video File Path (server-side)</label>
            <Input value={source} onChange={setSource} placeholder="/path/to/video.mp4" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Color Shift</label>
            <Select value={colorShift} onChange={setColorShift}>
              <option value="true">Yes (recommended)</option>
              <option value="false">No</option>
            </Select>
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={handleProcess} disabled={processing}>
            {processing ? "Processing..." : "Re-Render Video"}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-slate-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-100 mb-4">Result</h3>
          {result.success ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Original Hash</div>
                  <div className="font-mono text-xs text-slate-300 mt-1">
                    {(result.original_hash || "").slice(0, 24)}...
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">New Hash</div>
                  <div className="font-mono text-xs text-green-400 mt-1">
                    {(result.new_hash || "").slice(0, 24)}...
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Duration</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">{result.new_duration || "\u2014"}s</div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Encoding</div>
                  <div className="font-mono text-xs text-slate-300 mt-1">{result.encoding || "\u2014"}</div>
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl mb-3">
                <div className="text-xs text-slate-500 uppercase mb-2">Changes Applied</div>
                <div className="text-sm text-slate-200">
                  {(result.changes_applied || []).join(" \u00B7 ") || "none"}
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl">
                <div className="text-xs text-slate-500 uppercase mb-2">New Metadata</div>
                <div className="text-sm font-semibold text-slate-100">{result.metadata?.title || "\u2014"}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {(result.metadata?.hashtags || []).join(" ")}
                </div>
              </div>

              {result.video_path && (
                <div className="mt-3 text-xs text-slate-500">
                  Output: {result.video_path}
                </div>
              )}
            </>
          ) : (
            <div className="text-red-400">{result.error || "Failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
