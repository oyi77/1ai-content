import { useState, useEffect } from "react";
import { api } from "../api/client";

export default function MyVideos() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getVideos().then((d) => {
      setVideos(d.videos ?? []);
    }).catch((e: any) => {
      setError(e?.message || "Failed to load videos. Please try again.");
    }).finally(() => setLoading(false));
  }, [reload]);

  if (loading) return <div className="loading-spinner">Loading videos...</div>;

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>My Videos</h2>

      {error ? (
        <div className="card" style={{ textAlign: "center", padding: 40, borderColor: "#ff5c5c" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#ff8a8a", marginBottom: 16 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => setReload((r) => r + 1)}>Retry</button>
        </div>
      ) : videos.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📹</div>
          <p style={{ color: "#8888aa", marginBottom: 16 }}>No videos yet. Create your first one!</p>
          <a href="/app/create" className="btn btn-primary">Create Video</a>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Description</th>
                <th>Status</th>
                <th>Style</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v: any) => (
                <tr key={v.id}>
                  <td>#{v.id}</td>
                  <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.description || "-"}
                  </td>
                  <td>
                    <span className={`badge ${v.status === "completed" ? "badge-success" : v.status === "processing" ? "badge-warning" : "badge-info"}`}>
                      {v.status || "pending"}
                    </span>
                  </td>
                  <td>{v.styles?.[0] || "-"}</td>
                  <td style={{ fontSize: "0.8rem", color: "#8888aa" }}>
                    {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}