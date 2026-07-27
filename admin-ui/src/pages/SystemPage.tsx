import { useState, useEffect, useCallback } from "react";
import {
  fetchSystemHealth,
  fetchTokenStats,
  type SystemHealthResponse,
  type TokenStatsResponse,
} from "../api/client";
import { Button, Spinner, Tab, Toast } from "../components/UI";

/* ── Helpers ── */

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function statusColor(status: string): string {
  switch (status) {
    case "healthy":
    case "ok":
      return "bg-green-900/40 text-green-400 border-green-800/50";
    case "degraded":
    case "warning":
      return "bg-yellow-900/40 text-yellow-400 border-yellow-800/50";
    case "error":
      return "bg-red-900/40 text-red-400 border-red-800/50";
    default:
      return "bg-gray-800/40 text-gray-400 border-gray-700/50";
  }
}

/* ── Toast state ── */

interface ToastState {
  msg: string;
  type: "success" | "error";
}

/* ── Component ── */

export default function SystemPage() {
  const [tab, setTab] = useState<"health" | "tokens">("health");

  /* Health */
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  /* Token stats */
  const [tokenStats, setTokenStats] = useState<TokenStatsResponse | null>(null);
  const [tokenDays, setTokenDays] = useState(7);
  const [tokenLoading, setTokenLoading] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await fetchSystemHealth();
      setHealth(data);
    } catch (e) {
      showToast("Failed to load system health", "error");
    } finally {
      setHealthLoading(false);
    }
  }, [showToast]);

  const loadTokenStats = useCallback(async (days: number) => {
    setTokenLoading(true);
    try {
      const data = await fetchTokenStats(days);
      setTokenStats(data);
    } catch (e) {
      showToast("Failed to load token stats", "error");
    } finally {
      setTokenLoading(false);
    }
  }, [showToast]);

  const handleDaysChange = (days: number) => {
    setTokenDays(days);
  };

  /* ── Health Tab ── */
  const renderHealth = () => {
    if (!health)
      return <div className="text-text-muted text-center py-8"><Spinner /></div>;

    const label = health.status === "healthy" ? "Healthy" : "Degraded";
    const badgeCls = statusColor(health.status);
    const checkKeys = Object.keys(health.checks);
    const okCount = checkKeys.filter((k) => health.checks[k].status === "ok").length;

    return (
      <div>
        {/* Summary banner */}
        <div className="flex items-center gap-4 mb-6">
          <span
            className={`text-sm font-semibold px-3 py-1 rounded-lg border ${badgeCls}`}
          >
            {label}
          </span>
          <span className="text-xs text-text-muted">
            {okCount}/{checkKeys.length} services healthy
          </span>
          <span className="text-xs text-text-muted">
            Uptime: {formatUptime(health.uptime)}
          </span>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Environment</div>
            <div className="font-mono text-sm text-text-primary">{health.environment}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Version</div>
            <div className="font-mono text-sm text-text-primary">{health.version}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Uptime</div>
            <div className="font-mono text-sm text-text-primary">{formatUptime(health.uptime)}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Status</div>
            <div
              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${badgeCls}`}
            >
              {label}
            </div>
          </div>
        </div>

        {/* Service checks */}
        <h2 className="text-sm font-semibold text-text-primary mb-3">Service Checks</h2>
        <div className="space-y-2">
          {checkKeys.map((name) => {
            const check = health.checks[name];
            const cLabel = name.charAt(0).toUpperCase() + name.slice(1);
            const cBadge = statusColor(check.status);
            return (
              <div
                key={name}
                className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm text-text-primary font-medium">{cLabel}</div>
                  {check.url && (
                    <div className="text-[11px] text-text-muted font-mono mt-0.5">
                      {check.url}
                    </div>
                  )}
                  {check.pendingUpdates !== undefined && (
                    <div className="text-[11px] text-text-muted mt-0.5">
                      Pending updates: {check.pendingUpdates}
                    </div>
                  )}
                  {check.message && (
                    <div className="text-[11px] text-red-400 mt-0.5">{check.message}</div>
                  )}
                  {check.lastError && (
                    <div className="text-[11px] text-red-400 mt-0.5">
                      Last error: {check.lastError}
                    </div>
                  )}
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-medium whitespace-nowrap ${cBadge}`}
                >
                  {check.status}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <Button onClick={loadHealth} disabled={healthLoading}>
            {healthLoading ? "Refreshing..." : "↻ Refresh"}
          </Button>
        </div>
      </div>
    );
  };

  /* ── Token Stats Tab ── */
  const renderTokenStats = () => {
    if (!tokenStats)
      return <div className="text-text-muted text-center py-8"><Spinner /></div>;

    const rows = Array.isArray(tokenStats) ? tokenStats : [tokenStats];

    return (
      <div>
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="text-xs text-text-muted">Period:</span>
          {[1, 7, 14, 30, 90].map((n) => (
            <button
              key={n}
              onClick={() => handleDaysChange(n)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tokenDays === n
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-text-muted hover:bg-surface-hover/50"
              }`}
            >
              {n}d
            </button>
          ))}
          <Button
            onClick={() => loadTokenStats(tokenDays)}
            disabled={tokenLoading}
            className="ml-auto"
          >
            {tokenLoading ? "Loading..." : "↻ Refresh"}
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-lg mb-1">No token stats available</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-hover/30">
                  {Object.keys(rows[0]).map((k) => (
                    <th
                      key={k}
                      className="px-3 py-2 text-left font-semibold text-text-primary uppercase tracking-wider"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-700/30">
                    {Object.values(row).map((v: unknown, j: number) => {
                      const display =
                        v === null
                          ? "—"
                          : typeof v === "object"
                            ? JSON.stringify(v)
                            : String(v);
                      return (
                        <td key={j} className="px-3 py-2 font-mono text-text-primary">
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-text-primary">System Health</h1>
        <p className="text-sm text-text-muted mt-1">
          Service health checks, environment info, and token usage analytics
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        <Tab label="Health Dashboard" active={tab === "health"} onClick={() => setTab("health")} />
        <Tab label="Token Stats" active={tab === "tokens"} onClick={() => setTab("tokens")} />
      </div>

      <div className="min-h-[200px]">
        {tab === "health" && renderHealth()}
        {tab === "tokens" && renderTokenStats()}
      </div>

      {toast && (
        <Toast message={toast.msg} type={toast.type} visible={true} />
      )}
    </div>
  );
}
