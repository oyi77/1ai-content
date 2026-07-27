import { useState, useEffect } from "react";
import { fetchJson } from "../api/client";

interface UserItem {
  id: string;
  uuid: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  username: string | null;
  tier: string;
  isBanned: boolean;
  lastActivityAt: string | null;
  createdAt: string;
}

interface UsersData {
  users: UserItem[];
  total: number;
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    premium: "bg-emerald-500/15 text-emerald-400",
    pro: "bg-blue-500/15 text-blue-400",
  };
  const cls = colors[tier] || "bg-accent/10 text-accent";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {tier}
    </span>
  );
}

export default function Users() {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchJson<UsersData>("/api/admin/users")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.users.filter(
    (u) =>
      !search ||
      (u.username?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (u.email?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      u.id.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading)
    return <div className="text-text-muted text-center py-12">Loading users…</div>;
  if (error)
    return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;
  if (!data)
    return <div className="text-text-muted text-center py-12">No data</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-text-muted text-sm">{data.total} total users</p>
        <input
          type="text"
          placeholder="Search users…"
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border bg-surface-hover">
              <th className="text-left py-3 px-4 font-medium">ID</th>
              <th className="text-left py-3 px-4 font-medium">Username</th>
              <th className="text-left py-3 px-4 font-medium">Email</th>
              <th className="text-left py-3 px-4 font-medium">Tier</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">
                Last Activity
              </th>
            </tr>
          </thead>
          <tbody>
            {(filtered ?? data.users).length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-text-muted text-sm text-center py-8"
                >
                  No users found
                </td>
              </tr>
            ) : (
              (filtered ?? data.users).map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border/50 text-text-secondary hover:bg-surface-hover/50"
                >
                  <td className="py-3 px-4 font-mono text-xs">
                    {u.id.slice(0, 8)}
                  </td>
                  <td className="py-3 px-4">{u.username || "—"}</td>
                  <td className="py-3 px-4 text-text-muted">
                    {u.email || "—"}
                  </td>
                  <td className="py-3 px-4">
                    <TierBadge tier={u.tier} />
                  </td>
                  <td className="py-3 px-4">
                    {u.isBanned ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/15 text-red-400">
                        Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-text-muted">
                    {u.lastActivityAt
                      ? new Date(u.lastActivityAt).toLocaleDateString()
                      : "—"}
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
