import { useState, useEffect } from "react";
import { fetchJson } from "../api/client";

interface VideoItem {
  id: string;
  niche: string;
  creditsUsed?: string | number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

interface ContentData {
  videos: VideoItem[];
  total: number;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-400",
    processing: "bg-blue-500/15 text-blue-400",
    queued: "bg-blue-500/15 text-blue-400",
  };
  const cls = colors[status] || "bg-yellow-500/15 text-yellow-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {status}
    </span>
  );
}

export default function Content() {
  const [data, setData] = useState<ContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<ContentData>("/api/admin/content")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="text-text-muted text-center py-12">Loading content…</div>;
  if (error)
    return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;
  if (!data)
    return <div className="text-text-muted text-center py-12">No data</div>;

  return (
    <div>
      <p className="text-text-muted text-sm mb-4">{data.total} total videos</p>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border bg-surface-hover">
              <th className="text-left py-3 px-4 font-medium">ID</th>
              <th className="text-left py-3 px-4 font-medium">Niche</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Credits</th>
              <th className="text-left py-3 px-4 font-medium">Errors</th>
              <th className="text-right py-3 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.videos.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-text-muted text-sm text-center py-8"
                >
                  No content found
                </td>
              </tr>
            ) : (
              data.videos.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-border/50 text-text-secondary hover:bg-surface-hover/50"
                >
                  <td className="py-3 px-4 font-mono text-xs">{v.id.slice(0, 12)}</td>
                  <td className="py-3 px-4">{v.niche || "—"}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    {v.creditsUsed ?? "—"}
                  </td>
                  <td className="py-3 px-4 text-red-400/80 text-xs max-w-[200px] truncate">
                    {v.errorMessage || "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-text-muted">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
