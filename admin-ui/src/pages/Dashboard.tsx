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
    return (
      <div className="text-text-muted text-center py-12">
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 text-red-400 rounded-xl p-4">
        Failed to load: {error}
      </div>
    );
  }

  if (!data) return null;

  const { todayMetrics, activeUsersList, providerHealth, topNiches } = data;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">
            {todayMetrics.newUsers}
          </div>
          <div className="text-sm text-text-muted mt-1">New Users</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">
            {todayMetrics.activeUsers}
          </div>
          <div className="text-sm text-text-muted mt-1">Active Users</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">
            {todayMetrics.totalTransactions}
          </div>
          <div className="text-sm text-text-muted mt-1">Transactions</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">
            ${todayMetrics.revenue}
          </div>
          <div className="text-sm text-text-muted mt-1">Revenue</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Active Users */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Active Users
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs border-b border-border">
                <th className="text-left py-2 pr-2 font-medium">User</th>
                <th className="text-left py-2 pr-2 font-medium">Tier</th>
                <th className="text-left py-2 pr-2 font-medium">Status</th>
                <th className="text-right py-2 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {activeUsersList.map((u) => (
                <tr key={u.id} className="border-b border-border/50 text-text-secondary">
                  <td className="py-2 pr-2">{u.username || u.id}</td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400">
                      {u.tier}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${u.status === "online" ? "bg-emerald-500" : "bg-text-muted"}`} />
                      {u.status}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs font-mono text-text-muted">
                    {new Date(u.lastActivity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Provider Health */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Provider Health
          </h3>
          <div className="space-y-1">
            {Object.entries(providerHealth).map(([name, status]) => (
              <div
                key={name}
                className="flex items-center justify-between py-1.5 text-sm text-text-secondary"
              >
                <span>{name}</span>
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
            ))}
          </div>
        </div>

        {/* Top Niches */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">
            Top Niches
          </h3>
          <div className="space-y-1">
            {topNiches.map((n) => (
              <div
                key={n.name}
                className="flex items-center justify-between py-1.5 text-sm text-text-secondary"
              >
                <span>{n.name}</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-accent/10 text-accent">
                  {n.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
