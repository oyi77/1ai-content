import { useState, useEffect, useCallback } from "react";
import { Button, Spinner, Toast } from "../components/UI";
import {
  fetchTrendingStatus,
  fetchTrendingCached,
  triggerTrendingScan,
  type TrendingData,
  type TrendingStatus,
} from "../api/client";

export default function TrendingPage() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [status, setStatus] = useState<TrendingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [cached, st] = await Promise.all([
        fetchTrendingCached(),
        fetchTrendingStatus(),
      ]);
      setData(cached);
      setStatus(st);
    } catch (e) {
      showToast("Failed to load trending data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleForceScan = async () => {
    setScanning(true);
    try {
      const result = await triggerTrendingScan();
      setData(result);
      showToast(`${result.total_topics || 0} topics found`);
      const st = await fetchTrendingStatus();
      setStatus(st);
    } catch {
      showToast("Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const formatViews = (v?: number) => {
    if (!v) return "\u2014";
    return `${(v / 1000).toFixed(0)}K`;
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Spinner size={32} />
        <div className="mt-2">Loading cached data...</div>
      </div>
    );
  }

  const yt = data?.youtube || [];
  const google = data?.google || [];
  const reddit = data?.reddit || [];
  const tiktok = data?.tiktok || [];

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Trending Scanner</h1>
          <p className="text-sm text-slate-400">Auto-scanned every 10 min &middot; Cached data served instantly</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleForceScan} disabled={scanning}>
            {scanning ? "Scanning..." : "Scan Now"}
          </Button>
          <Button variant="ghost" onClick={loadData}>Refresh Cache</Button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-slate-800 rounded-xl px-5 py-3 mb-5">
        <div className="flex gap-6 text-sm text-slate-300">
          <span>
            Background:{" "}
            <span className={status?.background_active ? "text-green-400" : "text-red-400"}>
              {status?.background_active ? "Running" : "Stopped"}
            </span>
          </span>
          <span>Last scan: <span className="text-slate-400">{status?.last_scan || "\u2014"}</span></span>
          <span>
            Interval:{" "}
            <span className="text-slate-400">
              {status?.scan_interval_seconds ? `${status.scan_interval_seconds / 60} min` : "\u2014"}
            </span>
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">YouTube</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{yt.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Google</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{google.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Reddit</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{reddit.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">TikTok</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{tiktok.length}</div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-slate-800 rounded-xl p-5">
        {data?.cached_at && (
          <div className="text-xs text-slate-500 mb-4">
            Cached: {data.cached_at}
            {data.scanned_at ? ` \u00B7 Scanned: ${data.scanned_at}` : ""}
          </div>
        )}

        {yt.length > 0 && (
          <>
            <h3 className="text-base font-bold text-slate-100 mb-3 mt-4 first:mt-0">YouTube Trending</h3>
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs text-slate-500">#</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">TITLE</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">CHANNEL</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500">VIEWS</th>
                </tr>
              </thead>
              <tbody>
                {yt.slice(0, 15).map((v, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="px-3 py-2.5 text-sm font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-100">{v.title || "Untitled"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-400">{v.channel || "\u2014"}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-slate-300">{formatViews(v.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {google.length > 0 && (
          <>
            <h3 className="text-base font-bold text-slate-100 mb-3 mt-4">Google Trends</h3>
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs text-slate-500">#</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">TOPIC</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500">TRAFFIC</th>
                </tr>
              </thead>
              <tbody>
                {google.slice(0, 15).map((t, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="px-3 py-2.5 text-sm font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-100">{t.title || ""}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-slate-300">{t.traffic || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {reddit.length > 0 && (
          <>
            <h3 className="text-base font-bold text-slate-100 mb-3 mt-4">Reddit Hot</h3>
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs text-slate-500">#</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">TITLE</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">SUB</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {reddit.slice(0, 15).map((p, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="px-3 py-2.5 text-sm font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-100">{p.title || ""}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-400">r/{p.subreddit || ""}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-slate-300">{p.score || 0} &uarr; {p.comments || 0} &hairsp;&#x1F4AC;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tiktok.length > 0 && (
          <>
            <h3 className="text-base font-bold text-slate-100 mb-3 mt-4">TikTok Trending</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs text-slate-500">#</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500">HASHTAG</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500">VIEWS</th>
                </tr>
              </thead>
              <tbody>
                {tiktok.slice(0, 15).map((t, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="px-3 py-2.5 text-sm font-bold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-100">{t.title || ""}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-slate-300">{formatViews(t.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!yt.length && !google.length && !reddit.length && !tiktok.length && (
          <div className="text-center py-8 text-slate-500">
            No cached data. Background scan runs every 10 min, or click Scan Now.
          </div>
        )}
      </div>
    </div>
  );
}
