import { useState, FormEvent } from "react";
import { Input, Select, Button, Spinner, StatusBadge } from "../../components/UI";
import { createStoryboard, STORYBOARD_IMAGE_BASE } from "../../api/client";
import type { StoryboardScene } from "../../api/client";

export default function Storyboard() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [numScenes, setNumScenes] = useState(6);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [creating, setCreating] = useState(false);
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [info, setInfo] = useState<{ total_scenes?: number; total_duration_seconds?: number; style?: string }>({});
  const [err, setErr] = useState("");
  const [expandedScene, setExpandedScene] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setScenes([]);
    setInfo({});
    setErr("");
    try {
      const res = await createStoryboard({ prompt, style, num_scenes: numScenes, aspect_ratio: aspectRatio });
      if (res.success && res.scenes) {
        setScenes(res.scenes);
        setInfo({ total_scenes: res.total_scenes, total_duration_seconds: res.total_duration_seconds, style: res.style });
      } else {
        setErr(res.error || "Failed to create storyboard");
      }
    } catch (err: unknown) {
      setErr(String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Create Storyboard</h2>
      <form onSubmit={handleSubmit} className="space-y-3 max-w-lg">
        <Input
          label="Prompt"
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          placeholder="Describe the video concept..."
        />
        <Select
          label="Style"
          name="style"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          options={[
            { value: "cinematic", label: "Cinematic" },
            { value: "anime", label: "Anime" },
            { value: "documentary", label: "Documentary" },
            { value: "commercial", label: "Commercial" },
            { value: "vlog", label: "Vlog" },
          ]}
        />
        <Input
          label="Number of Scenes"
          name="numScenes"
          type="number"
          min={2}
          max={6}
          value={String(numScenes)}
          onChange={(e) => setNumScenes(Math.min(6, Math.max(2, Number(e.target.value))))}
          required
        />
        <Select
          label="Aspect Ratio"
          name="aspectRatio"
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          options={[
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "1:1", label: "1:1" },
            { value: "4:3", label: "4:3" },
          ]}
        />
        <Button type="submit" variant="primary" loading={creating}>
          Create Storyboard
        </Button>
      </form>

      {err && <p className="text-red-400 mt-2">{err}</p>}

      {info.total_scenes !== undefined && (
        <div className="mt-4 p-3 bg-gray-800 rounded text-sm text-gray-300 space-y-1">
          <p>Total Scenes: <span className="text-white">{info.total_scenes}</span></p>
          <p>Duration: <span className="text-white">{info.total_duration_seconds ?? "?"}s</span></p>
          {info.style && <p>Style: <span className="text-white">{info.style}</span></p>}
        </div>
      )}

      {scenes.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenes.map((scene) => (
            <div key={scene.scene_number} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedScene(expandedScene === scene.scene_number ? null : scene.scene_number)}
              >
                <h3 className="font-semibold text-purple-400">
                  Scene {scene.scene_number}: {scene.title}
                </h3>
                {scene.duration_seconds && (
                  <span className="text-xs text-gray-400">{scene.duration_seconds}s</span>
                )}
              </div>
              {expandedScene === scene.scene_number && (
                <div className="mt-3 space-y-2 text-sm text-gray-300">
                  {scene.description && <p>{scene.description}</p>}
                  {scene.image_prompt && (
                    <div>
                      <span className="font-semibold text-purple-300">Image Prompt:</span>
                      <p className="italic">{scene.image_prompt}</p>
                    </div>
                  )}
                  {scene.image_path && (
                    <div className="mt-2">
                      <img
                        src={`${STORYBOARD_IMAGE_BASE}${scene.image_path}`}
                        alt={`Scene ${scene.scene_number}`}
                        className="w-full rounded border border-gray-600"
                      />
                    </div>
                  )}
                  {scene.notes && (
                    <div>
                      <span className="font-semibold">Notes:</span> {scene.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
