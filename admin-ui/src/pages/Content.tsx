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

  if (loading) return <div className="page-loading">Loading content…</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!data) return <div className="page-empty">No data</div>;

  return (
    <div className="page">
      <h1>Content Management</h1>
      <p className="page-subtitle">{data.total} total videos</p>

      <div className="table-toolbar">
        <input type="text" placeholder="Search content…" className="search-input" />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Niche</th>
            <th>Status</th>
            <th>Credits</th>
            <th>Errors</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.videos.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">No content found</td>
            </tr>
          ) : (
            data.videos.map((v) => (
              <tr key={v.id}>
                <td className="cell-mono">{v.id.slice(0, 12)}</td>
                <td>{v.niche || "—"}</td>
                <td>
                  <span className={`badge badge-${v.status === "completed" ? "green" : v.status === "processing" || v.status === "queued" ? "blue" : "yellow"}`}>
                    {v.status}
                  </span>
                </td>
                <td>{v.creditsUsed ?? "—"}</td>
                <td className="cell-error">{v.errorMessage || "—"}</td>
                <td>{new Date(v.createdAt).toLocaleDateString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
