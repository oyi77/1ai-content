import { useState } from "react";
import {
  analyzeChannel,
  fetchChannelInfo,
  compareChannels,
} from "../api/client";
import type { AnalyzeChannelResponse, CompareChannelResponse, ChannelInfo, VideoInfo } from "../api/client";
import { Input, Textarea, Select, Button, Spinner } from "../components/UI";

function formatNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ChannelInfoCard({ channel }: { channel: ChannelInfo }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 p-4 bg-[var(--bg)] rounded-xl">
      <div>
        <div className="text-xs text-text-muted uppercase mb-1">Channel</div>
        <div className="font-bold">{channel.title || channel.name || "Unknown"}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase mb-1">Subscribers</div>
        <div className="text-xl font-bold text-[var(--accent)]">{formatNumber(channel.subscriber_count || channel.subscribers || 0)}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase mb-1">Total Videos</div>
        <div className="text-xl font-bold">{formatNumber(channel.video_count || channel.videos || 0)}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase mb-1">Total Views</div>
        <div className="text-xl font-bold">{formatNumber(channel.total_views || channel.views || 0)}</div>
      </div>
      {channel.platform && (
        <div>
          <div className="text-xs text-text-muted uppercase mb-1">Platform</div>
          <span className="badge badge-blue">{channel.platform}</span>
        </div>
      )}
      {channel.description && (
        <div className="col-span-full mt-1">
          <div className="text-xs text-text-muted uppercase mb-1">Description</div>
          <div className="text-sm text-text-muted">{channel.description}</div>
        </div>
      )}
    </div>
  );
}

function VideoTable({ videos, topCount }: { videos: VideoInfo[]; topCount?: number }) {
  if (!videos.length) {
    return <div className="text-text-muted text-sm">No videos found.</div>;
  }

  const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
  const topSet = new Set(sorted.slice(0, topCount || 5).map((v) => v.title || v.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-[var(--border)]">
            <th className="p-2 text-left text-text-muted font-semibold">#</th>
            <th className="p-2 text-left text-text-muted font-semibold">Title</th>
            <th className="p-2 text-right text-text-muted font-semibold">Views</th>
            <th className="p-2 text-right text-text-muted font-semibold">Likes</th>
            <th className="p-2 text-right text-text-muted font-semibold">Comments</th>
            <th className="p-2 text-right text-text-muted font-semibold">Engagement</th>
            <th className="p-2 text-right text-text-muted font-semibold">Published</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v, i) => {
            const isTop = topSet.has(v.title || v.id);
            const engagement =
              v.views && v.views > 0
                ? (((v.likes || 0) + (v.comments || 0) + (v.shares || 0)) / v.views * 100).toFixed(2) + "%"
                : "—";
            return (
              <tr
                key={v.id || i}
                className={`border-b border-[var(--border)] ${isTop ? "bg-indigo-500/10" : ""}`}
              >
                <td className="p-2 text-text-muted">{i + 1}</td>
                <td className="p-2 max-w-[300px] truncate">
                  {isTop && <span title="Top performer">⭐ </span>}
                  {v.title || "Untitled"}
                </td>
                <td className="p-2 text-right font-semibold">{formatNumber(v.views || 0)}</td>
                <td className="p-2 text-right">{formatNumber(v.likes || 0)}</td>
                <td className="p-2 text-right">{formatNumber(v.comments || 0)}</td>
                <td className={`p-2 text-right font-semibold ${parseFloat(engagement) > 5 ? "text-green-400" : ""}`}>
                  {engagement}
                </td>
                <td className="p-2 text-right text-text-muted text-xs">{formatDate(v.published_at || v.publish_date || v.date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Analyze() {
  /* Single channel */
  const [channelUrl, setChannelUrl] = useState("");
  const [niche, setNiche] = useState("");
  const [limit, setLimit] = useState(50);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeChannelResponse | null>(null);

  /* Compare */
  const [compareUrls, setCompareUrls] = useState("");
  const [compareNiche, setCompareNiche] = useState("");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareChannelResponse | null>(null);

  async function handleAnalyze() {
    if (!channelUrl.trim()) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const data = await analyzeChannel({
        channel_url: channelUrl.trim(),
        niche: niche.trim() || undefined,
        limit,
      });
      setAnalyzeResult(data);
    } catch (e) {
      setAnalyzeResult({ error: (e as Error).message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGetInfo() {
    if (!channelUrl.trim()) return;
    setLoadingInfo(true);
    setAnalyzeResult(null);
    try {
      const data = await fetchChannelInfo(channelUrl.trim());
      setAnalyzeResult(data);
    } catch (e) {
      setAnalyzeResult({ error: (e as Error).message });
    } finally {
      setLoadingInfo(false);
    }
  }

  async function handleCompare() {
    const urls = compareUrls.split("\n").map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const data = await compareChannels({
        channel_urls: urls,
        niche: compareNiche.trim() || undefined,
      });
      setCompareResult(data);
    } catch (e) {
      setCompareResult({ error: (e as Error).message });
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">📊 Channel Analysis</h1>
        <p className="text-text-muted mt-1">Analyze YouTube/TikTok channels — metrics, videos, and competitive comparison</p>
      </div>

      {/* Single Channel Analysis */}
      <div className="card">
        <h3 className="text-base font-bold mb-4">🔍 Single Channel Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Channel URL *"
              name="channelUrl"
              value={channelUrl}
              onChange={(v) => setChannelUrl(v)}
              placeholder="https://youtube.com/@channel or https://tiktok.com/@user"
            />
          </div>
          <Input
            label="Niche (optional)"
            name="niche"
            value={niche}
            onChange={(v) => setNiche(v)}
            placeholder="e.g. tech, food, gaming"
          />
          <Input
            label="Videos to analyze"
            name="limit"
            type="number"
            value={String(limit)}
            onChange={(v) => setLimit(parseInt(v) || 50)}
          />
        </div>
        <div className="flex gap-2 mt-5">
          <Button onClick={handleAnalyze} loading={analyzing}>
            🔍 Analyze Channel
          </Button>
          <Button variant="secondary" onClick={handleGetInfo} loading={loadingInfo}>
            ℹ️ Get Channel Info
          </Button>
        </div>
      </div>

      {/* Analyze Results */}
      {analyzeResult && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">📈 Analysis Results</h3>
          {analyzeResult.error ? (
            <div className="text-red-400 p-4 bg-red-500/10 rounded-xl">❌ {analyzeResult.error}</div>
          ) : (
            <>
              {/* Badges */}
              <div className="flex gap-2 flex-wrap mb-4">
                <span className="badge badge-green">✅ {analyzeResult.videos?.length || 0} videos analyzed</span>
                <span className="badge badge-blue">⭐ Top {analyzeResult.top_count || 5} highlighted</span>
                {analyzeResult.avg_engagement && (
                  <span className="badge badge-purple">📈 Avg engagement: {analyzeResult.avg_engagement}</span>
                )}
                {analyzeResult.avg_views != null && (
                  <span className="badge">👁️ Avg views: {formatNumber(analyzeResult.avg_views)}</span>
                )}
              </div>

              {analyzeResult.channel && Object.keys(analyzeResult.channel).length > 0 && (
                <ChannelInfoCard channel={analyzeResult.channel} />
              )}

              {analyzeResult.videos && analyzeResult.videos.length > 0 && (
                <VideoTable videos={analyzeResult.videos} topCount={analyzeResult.top_count} />
              )}

              <div className="flex gap-4 mt-4 p-3 bg-[var(--bg)] rounded-xl text-sm">
                {analyzeResult.total_views_analyzed != null && (
                  <span>📊 <strong>Total views:</strong> {formatNumber(analyzeResult.total_views_analyzed)}</span>
                )}
                {analyzeResult.avg_views != null && (
                  <span>📈 <strong>Avg views:</strong> {formatNumber(analyzeResult.avg_views)}</span>
                )}
                {analyzeResult.avg_engagement && (
                  <span>💬 <strong>Avg engagement:</strong> {analyzeResult.avg_engagement}</span>
                )}
                {analyzeResult.top_niche && (
                  <span>🏷️ <strong>Top niche:</strong> {analyzeResult.top_niche}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Compare Channels */}
      <div className="card">
        <h3 className="text-base font-bold mb-4">⚖️ Compare Channels</h3>
        <div className="space-y-4">
          <Textarea
            label="Channel URLs *"
            name="compareUrls"
            value={compareUrls}
            onChange={(v) => setCompareUrls(v)}
            placeholder="https://youtube.com/@channel1&#10;https://youtube.com/@channel2"
            rows={4}
          />
          <div className="text-xs text-text-muted">One URL per line — YouTube or TikTok channels</div>
          <Input
            label="Niche (optional)"
            name="compareNiche"
            value={compareNiche}
            onChange={(v) => setCompareNiche(v)}
            placeholder="e.g. tech, food"
          />
          <Button onClick={handleCompare} loading={comparing}>
            ⚖️ Compare Channels
          </Button>
        </div>
      </div>

      {/* Compare Results */}
      {compareResult && (
        <div className="card">
          <h3 className="text-base font-bold mb-4">📊 Comparison Results</h3>
          {compareResult.error ? (
            <div className="text-red-400 p-4 bg-red-500/10 rounded-xl">❌ {compareResult.error}</div>
          ) : (
            <>
              {(() => {
                const channels = compareResult.channels || [];
                const comparison = compareResult.comparison || {};
                if (!channels.length) {
                  return <div className="text-text-muted">No channel data returned.</div>;
                }

                const metrics = [
                  { key: "subscribers", label: "Subscribers", fmt: formatNumber },
                  { key: "total_views", label: "Total Views", fmt: formatNumber },
                  { key: "video_count", label: "Videos", fmt: formatNumber },
                  { key: "avg_views", label: "Avg Views", fmt: formatNumber },
                  { key: "avg_engagement", label: "Engagement", fmt: (v: unknown) => (v != null ? String(v) : "—") },
                  { key: "growth_rate", label: "Growth Rate", fmt: (v: unknown) => (v != null ? String(v) : "—") },
                  { key: "platform", label: "Platform", fmt: (v: unknown) => (v as string) || "—" },
                  { key: "niche", label: "Niche", fmt: (v: unknown) => (v as string) || "—" },
                ];

                function findWinner(metricKey: string): number {
                  let bestIdx = -1;
                  let bestVal = -Infinity;
                  channels.forEach((ch, i) => {
                    const val = ch[metricKey];
                    if (typeof val === "number" && val > bestVal) {
                      bestVal = val;
                      bestIdx = i;
                    }
                  });
                  return bestIdx;
                }

                const subWinner = findWinner("subscribers");

                return (
                  <>
                    <div className="flex gap-2 mb-4">
                      <span className="badge badge-green">✅ {channels.length} channels compared</span>
                      {comparison.winner && (
                        <span className="badge badge-purple">🏆 Winner: {comparison.winner}</span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-[var(--border)]">
                            <th className="p-3 text-left text-text-muted font-semibold">Metric</th>
                            {channels.map((ch, i) => (
                              <th
                                key={i}
                                className={`p-3 text-center text-text-muted font-semibold ${
                                  i === subWinner ? "bg-indigo-500/10 rounded-t-lg" : ""
                                }`}
                              >
                                {ch.title || ch.name || `Channel ${i + 1}`}
                                {i === subWinner && (
                                  <><br /><span className="text-xs text-[var(--accent)]">🏆 Best</span></>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map((m) => {
                            const winnerIdx = findWinner(m.key);
                            return (
                              <tr key={m.key} className="border-b border-[var(--border)]">
                                <td className="p-3 font-semibold">{m.label}</td>
                                {channels.map((ch, i) => {
                                  const val = ch[m.key] ?? comparison.mapped_metrics?.[m.key] ?? "—";
                                  return (
                                    <td
                                      key={i}
                                      className={`p-3 text-center ${
                                        i === winnerIdx ? "font-bold text-green-400" : ""
                                      }`}
                                    >
                                      {m.fmt(val)}
                                      {i === winnerIdx && " 👑"}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6">
                      <h4 className="text-sm font-semibold mb-3">📋 Per-Channel Breakdown</h4>
                      {channels.map((ch, i) => {
                        const videos = ch.recent_videos || [];
                        return (
                          <div key={i} className="mb-5 p-4 bg-[var(--bg)] rounded-xl">
                            <div className="font-bold mb-2">
                              {i + 1}. {ch.title || ch.name || `Channel ${i + 1}`}
                            </div>
                            <div className="flex gap-4 flex-wrap text-sm text-text-muted mb-2">
                              <span>👥 {formatNumber(ch.subscribers || ch.subscriber_count || 0)} subscribers</span>
                              <span>🎬 {formatNumber(ch.video_count || 0)} videos</span>
                              <span>👁️ {formatNumber(ch.total_views || 0)} views</span>
                            </div>
                            {videos.length > 0 && (
                              <>
                                <div className="mt-2 text-xs text-text-muted uppercase">Recent Videos</div>
                                <ul className="mt-1 pl-5 text-sm">
                                  {videos.slice(0, 5).map((v, vi) => (
                                    <li key={vi} className="mb-1">
                                      {v.title || "Untitled"} — {formatNumber(v.views || 0)} views
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
