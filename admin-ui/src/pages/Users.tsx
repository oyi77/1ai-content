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

  if (loading) return <div className="page-loading">Loading users…</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!data) return <div className="page-empty">No data</div>;

  return (
    <div className="page">
      <h1>Users</h1>
      <p className="page-subtitle">{data.total} total users</p>

      <div className="table-toolbar">
        <input
          type="text"
          placeholder="Search users…"
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Email</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {(filtered ?? data.users).length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">No users found</td>
            </tr>
          ) : (
            (filtered ?? data.users).map((u) => (
              <tr key={u.id}>
                <td className="cell-mono">{u.id.slice(0, 8)}</td>
                <td>{u.username || "—"}</td>
                <td>{u.email || "—"}</td>
                <td>
                  <span className={`badge badge-${u.tier === "premium" ? "green" : "blue"}`}>
                    {u.tier}
                  </span>
                </td>
                <td>
                  {u.isBanned ? (
                    <span className="badge badge-red">Banned</span>
                  ) : (
                    <span className="badge badge-green">Active</span>
                  )}
                </td>
                <td className="cell-mono">
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
  );
}
