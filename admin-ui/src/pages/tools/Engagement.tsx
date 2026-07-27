import { useState, FormEvent } from "react";
import { Input, Select, Button, Spinner } from "../../components/UI";
import { fetchEngagementStats, generateReply } from "../../api/client";

export default function Engagement() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsErr, setStatsErr] = useState("");

  const [commentText, setCommentText] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("friendly");
  const [reply, setReply] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState("");

  const handleFetchStats = async () => {
    setLoadingStats(true);
    setStatsErr("");
    try {
      const data = await fetchEngagementStats();
      setStats(data);
    } catch (err: unknown) {
      setStatsErr(String(err));
    } finally {
      setLoadingStats(false);
    }
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setReply("");
    setGenErr("");
    try {
      const res = await generateReply({ comment_text: commentText, platform, tone });
      setReply(res.reply || res.text || "");
    } catch (err: unknown) {
      setGenErr(String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4">Engagement Stats</h2>
        <Button onClick={handleFetchStats} loading={loadingStats}>
          Fetch Stats
        </Button>
        {statsErr && <p className="text-red-400 mt-2">{statsErr}</p>}
        {stats && (
          <pre className="mt-2 p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {JSON.stringify(stats, null, 2)}
          </pre>
        )}
      </div>

      <hr className="border-gray-700" />

      <div>
        <h2 className="text-xl font-bold mb-4">Generate Reply</h2>
        <form onSubmit={handleGenerate} className="space-y-3 max-w-lg">
          <Input
            label="Comment Text"
            name="commentText"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            required
          />
          <Select
            label="Platform"
            name="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={[
              { value: "instagram", label: "Instagram" },
              { value: "tiktok", label: "TikTok" },
              { value: "youtube", label: "YouTube" },
              { value: "facebook", label: "Facebook" },
            ]}
          />
          <Select
            label="Tone"
            name="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            options={[
              { value: "friendly", label: "Friendly" },
              { value: "professional", label: "Professional" },
              { value: "witty", label: "Witty" },
              { value: "empathetic", label: "Empathetic" },
              { value: "enthusiastic", label: "Enthusiastic" },
            ]}
          />
          <Button type="submit" variant="primary" loading={generating}>
            Generate Reply
          </Button>
        </form>
        {reply && (
          <div className="mt-3 p-3 bg-gray-800 rounded">
            <p className="text-sm font-semibold mb-1">Generated Reply:</p>
            <p className="text-gray-200">{reply}</p>
          </div>
        )}
        {genErr && <p className="text-red-400 mt-2">{genErr}</p>}
      </div>
    </div>
  );
}
