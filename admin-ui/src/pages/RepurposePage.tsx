import { useState, useCallback } from "react";
import { Input, Select, Button, Spinner, Toast } from "../components/UI";
import { repurposeContent, type RepurposeResponse } from "../api/client";

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok (9:16)" },
  { value: "instagram_reels", label: "IG Reels (9:16)" },
  { value: "youtube_shorts", label: "YouTube Shorts (9:16)" },
  { value: "youtube", label: "YouTube (16:9)" },
];

const STYLE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "viral", label: "Viral" },
  { value: "storytelling", label: "Storytelling" },
  { value: "minimal", label: "Minimal" },
];

const COLOR_OPTIONS = [
  { value: "cinematic", label: "Cinematic" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "vibrant", label: "Vibrant" },
  { value: "vintage", label: "Vintage" },
  { value: "none", label: "None" },
];

const TRANSITION_OPTIONS = [
  { value: "crossfade", label: "Crossfade" },
  { value: "fade_black", label: "Fade Black" },
  { value: "wipe_left", label: "Wipe Left" },
  { value: "none", label: "None" },
];

export default function RepurposePage() {
  const [urls, setUrls] = useState("");
  const [duration, setDuration] = useState("120");
  const [platform, setPlatform] = useState("tiktok");
  const [niche, setNiche] = useState("general");
  const [style, setStyle] = useState("educational");
  const [color, setColor] = useState("cinematic");
  const [transition, setTransition] = useState("crossfade");
  const [watermark, setWatermark] = useState("");
  const [subtitles, setSubtitles] = useState("true");

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RepurposeResponse | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleRepurpose = async () => {
    const sourceList = urls.trim().split("\n").filter((u) => u.trim());
    if (sourceList.length < 2) { showToast("Minimum 2 source URLs", "error"); return; }
    setProcessing(true);
    setResult(null);
    try {
      const data = await repurposeContent({
        sources: sourceList,
        target_duration: parseInt(duration) || 120,
        platform,
        niche: niche.trim() || "general",
        style,
        color_preset: color,
        transition_style: transition,
        watermark_text: watermark.trim() || undefined,
        add_subtitles: subtitles === "true",
      });
      setResult(data);
      if (data.success) {
        showToast(`${data.segments_used?.length || 0} segments remixed into new video!`);
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
          <h1 className="text-xl font-bold text-slate-100">Content Repurpose</h1>
          <p className="text-sm text-slate-400">Multi-source remix &mdash; download N videos, split, combine into new content</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-slate-900 rounded-xl p-4 mb-5">
        <div className="grid grid-cols-6 gap-2 text-center">
          <div>
            <div className="text-xl mb-1">\uD83D\uDCE5</div>
            <div className="text-[10px] text-slate-400">Download Sources</div>
          </div>
          <div>
            <div className="text-xl mb-1">\u2702\uFE0F</div>
            <div className="text-[10px] text-slate-400">Scene Detect</div>
          </div>
          <div>
            <div className="text-xl mb-1">\uD83D\uDCCA</div>
            <div className="text-[10px] text-slate-400">Score Segments</div>
          </div>
          <div>
            <div className="text-xl mb-1">\uD83D\uDD17</div>
            <div className="text-[10px] text-slate-400">Assemble</div>
          </div>
          <div>
            <div className="text-xl mb-1">\uD83C\uDFA8</div>
            <div className="text-[10px] text-slate-400">Color Grade</div>
          </div>
          <div>
            <div className="text-xl mb-1">\uD83D\uDCDD</div>
            <div className="text-[10px] text-slate-400">New Metadata</div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-slate-800 rounded-xl p-6 mb-5">
        <h3 className="text-base font-bold text-slate-100 mb-4">Repurpose Content</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Source URLs (one per line, minimum 2)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={4}
              placeholder="https://tiktok.com/video1\nhttps://tiktok.com/video2"
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Duration (seconds)</label>
            <Input value={duration} onChange={setDuration} type="number" />
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
            <label className="block text-xs text-slate-400 mb-1">Niche</label>
            <Input value={niche} onChange={setNiche} placeholder="tech tips" />
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
            <label className="block text-xs text-slate-400 mb-1">Color Preset</label>
            <Select value={color} onChange={setColor}>
              {COLOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Transition Style</label>
            <Select value={transition} onChange={setTransition}>
              {TRANSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Watermark</label>
            <Input value={watermark} onChange={setWatermark} placeholder="@brandname" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Subtitles</label>
            <Select value={subtitles} onChange={setSubtitles}>
              <option value="true">Yes (karaoke style)</option>
              <option value="false">No</option>
            </Select>
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={handleRepurpose} disabled={processing}>
            {processing ? "Processing (2-5 min)..." : "Start Repurpose"}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-slate-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-100 mb-4">Result</h3>
          {result.success ? (
            <>
              <div className="grid grid-cols-4 gap-3 mb-5">
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Segments</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">{(result.segments_used || []).length}</div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Duration</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">{result.duration || "\u2014"}s</div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Platform</div>
                  <div className="text-base font-bold text-slate-100 mt-1">{result.platform || "\u2014"}</div>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Sources</div>
                  <div className="text-lg font-bold text-slate-100 mt-1">
                    {result.sources_used?.length || urls.trim().split("\n").filter((u) => u.trim()).length}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl mb-3">
                <div className="text-xs text-slate-500 uppercase mb-2">Segments Used</div>
                {(result.segments_used || []).map((s, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-slate-700/50 text-sm text-slate-300">
                    <span className="text-slate-500 w-5">{i + 1}</span>
                    <span>{s.type || "content"}</span>
                    <span className="text-slate-500">{s.start?.toFixed(1) || 0}s &ndash; {s.end?.toFixed(1) || 0}s</span>
                    <span className="text-slate-500">score: {s.score || 0}</span>
                    <span className="text-slate-500">speed: {s.speed || 1}x</span>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-900 rounded-xl">
                <div className="text-xs text-slate-500 uppercase mb-2">New Metadata</div>
                <div className="text-base font-bold text-slate-100">{result.metadata?.title || "\u2014"}</div>
                <div className="text-sm text-slate-400 mt-2">
                  {(result.metadata?.caption || "").slice(0, 200)}
                </div>
                <div className="text-sm text-purple-400 mt-2">
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
