import { fetchJson } from "../api/client";
import { useState, useEffect } from "react";

interface DashboardData {
  todayMetrics: { errorCount: number };
  providerHealth: Array<{ provider: string; status: string }>;
}

export default function Settings() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<DashboardData>("/api/admin/dashboard")
      .then((d) => {
        setDashboard(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="page-subtitle">System configuration and information</p>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>System Health</h2>
        {loading ? (
          <div className="page-loading">Loading…</div>
        ) : error ? (
          <p className="empty-state">{error}</p>
        ) : (
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
            <div className="card">
              <h4>Provider Count</h4>
              <p className="stat-value">{dashboard?.providerHealth?.length ?? 0}</p>
            </div>
            <div className="card">
              <h4>Today's Errors</h4>
              <p className="stat-value">{dashboard?.todayMetrics?.errorCount ?? 0}</p>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Environment</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Platform</td>
              <td>{typeof navigator !== "undefined" ? navigator.platform : "—"}</td>
            </tr>
            <tr>
              <td>User Agent</td>
              <td className="cell-mono" style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
                {typeof navigator !== "undefined" ? navigator.userAgent : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Links</h2>
        <ul>
          <li><a href="/admin">Back to Admin Home</a></li>
          <li><a href="/admin/pricing">Pricing Page</a></li>
          <li><a href="/admin/login">Login</a></li>
        </ul>
      </section>
    </div>
  );
}
