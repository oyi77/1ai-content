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
    <div>
      <p className="text-text-muted text-sm mb-6">
        System configuration and information
      </p>

      {/* System Health */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          System Health
        </h2>
        {loading ? (
          <div className="text-text-muted text-center py-8">Loading…</div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-surface-hover/50 border border-border/50 rounded-lg p-4">
              <div className="text-xs text-text-muted mb-1">Provider Count</div>
              <div className="text-xl font-bold text-text-primary">
                {dashboard?.providerHealth?.length ?? 0}
              </div>
            </div>
            <div className="bg-surface-hover/50 border border-border/50 rounded-lg p-4">
              <div className="text-xs text-text-muted mb-1">
                Today's Errors
              </div>
              <div className="text-xl font-bold text-text-primary">
                {dashboard?.todayMetrics?.errorCount ?? 0}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Environment */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          Environment
        </h2>
        <div className="bg-surface-hover/50 border border-border/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-text-muted w-32">Platform</td>
                <td className="py-3 px-4 text-text-secondary">
                  {typeof navigator !== "undefined" ? navigator.platform : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-text-muted w-32">User Agent</td>
                <td className="py-3 px-4 text-text-secondary font-mono text-xs max-w-[400px] truncate">
                  {typeof navigator !== "undefined"
                    ? navigator.userAgent
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Links */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          Links
        </h2>
        <ul className="space-y-2">
          <li>
            <a
              href="/admin"
              className="text-accent hover:text-accent-light text-sm transition-colors"
            >
              Back to Admin Home
            </a>
          </li>
          <li>
            <a
              href="/admin/pricing"
              className="text-accent hover:text-accent-light text-sm transition-colors"
            >
              Pricing Page
            </a>
          </li>
          <li>
            <a
              href="/admin/login"
              className="text-accent hover:text-accent-light text-sm transition-colors"
            >
              Login
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
