import { useState, useEffect } from "react";
import { fetchJson, type AnalyticsData } from "../api/client";

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<AnalyticsData>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading analytics…</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!data) return <div className="page-empty">No data</div>;

  return (
    <div className="page">
      <h1>Analytics</h1>

      <section className="card-grid">
        <div className="card">
          <h3>Today's Metrics</h3>
          <dl className="metrics-list">
            <dt>New Users</dt>
            <dd>{data.todayMetrics.newUsers}</dd>
            <dt>Active Users (24h)</dt>
            <dd>{data.todayMetrics.activeUsers}</dd>
            <dt>Transactions</dt>
            <dd>{data.todayMetrics.totalTransactions}</dd>
            <dt>Revenue</dt>
            <dd>${data.todayMetrics.revenue}</dd>
            <dt>Credits Used</dt>
            <dd>{data.todayMetrics.creditsUsed}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Top Niches</h3>
          {data.topNiches.length === 0 ? (
            <p className="empty-state">No niche data</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Niche</th>
                  <th>Videos</th>
                </tr>
              </thead>
              <tbody>
                {data.topNiches.map((n) => (
                  <tr key={n.name}>
                    <td>{n.name}</td>
                    <td>{n.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Provider Health</h3>
          {Object.keys(data.providerHealth).length === 0 ? (
            <p className="empty-state">No providers</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.providerHealth).map(([provider, status]) => (
                  <tr key={provider}>
                    <td>{provider}</td>
                    <td>
                      <span className={`badge badge-${status === "online" ? "green" : status === "degraded" ? "yellow" : "red"}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card">
        <h3>Recent Errors</h3>
        {data.recentErrors.length === 0 ? (
          <p className="empty-state">No recent errors</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Message</th>
                <th>Source</th>
                <th>Time</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.recentErrors.map((e) => (
                <tr key={e.id}>
                  <td className="cell-mono">{e.id.slice(0, 12)}</td>
                  <td>{e.message}</td>
                  <td>{e.source}</td>
                  <td>{new Date(e.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${e.severity === "error" ? "red" : "yellow"}`}>
                      {e.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
