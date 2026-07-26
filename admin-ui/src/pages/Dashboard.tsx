import { useEffect, useState } from "react";
import type { AnalyticsData } from "../api/client";
import { fetchAnalytics } from "../api/client";

export default function Dashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnalytics()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error-box">Failed to load: {error}</div>;
  }

  if (!data) return null;

  const { todayMetrics, activeUsersList, providerHealth, topNiches } = data;

  return (
    <div>
      <h2>Dashboard</h2>

      {/* Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{todayMetrics.newUsers}</div>
          <div className="metric-label">New Users</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{todayMetrics.activeUsers}</div>
          <div className="metric-label">Active Users</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{todayMetrics.totalTransactions}</div>
          <div className="metric-label">Transactions</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">${todayMetrics.revenue}</div>
          <div className="metric-label">Revenue</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Active Users */}
        <div className="card">
          <h3>Active Users</h3>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {activeUsersList.map((u) => (
                <tr key={u.id}>
                  <td>{u.username || u.id}</td>
                  <td>
                    <span className={`badge badge-${u.tier}`}>{u.tier}</span>
                  </td>
                  <td>
                    <span
                      className={`status-dot ${u.status === "online" ? "online" : "offline"}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td>{new Date(u.lastActivity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Provider Health */}
        <div className="card">
          <h3>Provider Health</h3>
          <div className="provider-list">
            {Object.entries(providerHealth).map(([name, status]) => (
              <div key={name} className="provider-row">
                <span>{name}</span>
                <span
                  className={`status-dot ${status === "online" ? "online" : status === "degraded" ? "degraded" : "offline"}`}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Niches */}
        <div className="card">
          <h3>Top Niches</h3>
          <div className="niche-list">
            {topNiches.map((n) => (
              <div key={n.name} className="niche-row">
                <span>{n.name}</span>
                <span className="badge">{n.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
