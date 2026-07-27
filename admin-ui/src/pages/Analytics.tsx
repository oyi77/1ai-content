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

  if (loading)
    return (
      <div className="text-text-muted text-center py-12">
        Loading analytics…
      </div>
    );
  if (error)
    return (
      <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>
    );
  if (!data)
    return (
      <div className="text-text-muted text-center py-12">No data</div>
    );

  return (
    <div>
      {/* Today's Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
            New Users
          </div>
          <div className="text-xl font-bold text-text-primary">
            {data.todayMetrics.newUsers}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
            Active Users
          </div>
          <div className="text-xl font-bold text-text-primary">
            {data.todayMetrics.activeUsers}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
            Transactions
          </div>
          <div className="text-xl font-bold text-text-primary">
            {data.todayMetrics.totalTransactions}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
            Revenue
          </div>
          <div className="text-xl font-bold text-text-primary">
            ${data.todayMetrics.revenue}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">
            Credits Used
          </div>
          <div className="text-xl font-bold text-text-primary">
            {data.todayMetrics.creditsUsed}
          </div>
        </div>
      </div>

      {/* Top Niches & Provider Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top Niches */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Top Niches
          </h3>
          {data.topNiches.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">
              No niche data
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs border-b border-border">
                  <th className="text-left py-2 font-medium">Niche</th>
                  <th className="text-right py-2 font-medium">Videos</th>
                </tr>
              </thead>
              <tbody>
                {data.topNiches.map((n) => (
                  <tr
                    key={n.name}
                    className="border-b border-border/50 text-text-secondary"
                  >
                    <td className="py-2">{n.name}</td>
                    <td className="py-2 text-right font-mono text-xs">
                      {n.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Provider Health */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Provider Health
          </h3>
          {Object.keys(data.providerHealth).length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">
              No providers
            </p>
          ) : (
            <div className="space-y-1">
              {Object.entries(data.providerHealth).map(
                ([provider, status]) => (
                  <div
                    key={provider}
                    className="flex items-center justify-between py-1.5 text-sm text-text-secondary"
                  >
                    <span>{provider}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          status === "online"
                            ? "bg-emerald-500"
                            : status === "degraded"
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                      />
                      {status}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Errors */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
          Recent Errors
        </h3>
        {data.recentErrors.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">
            No recent errors
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs border-b border-border">
                <th className="text-left py-2 pr-2 font-medium">ID</th>
                <th className="text-left py-2 pr-2 font-medium">Message</th>
                <th className="text-left py-2 pr-2 font-medium">Source</th>
                <th className="text-left py-2 pr-2 font-medium">Time</th>
                <th className="text-right py-2 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.recentErrors.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 text-text-secondary"
                >
                  <td className="py-2 pr-2 font-mono text-xs">
                    {e.id.slice(0, 12)}
                  </td>
                  <td className="py-2 pr-2">{e.message}</td>
                  <td className="py-2 pr-2 text-text-muted">{e.source}</td>
                  <td className="py-2 pr-2 text-xs text-text-muted">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        e.severity === "error"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-yellow-500/15 text-yellow-400"
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
