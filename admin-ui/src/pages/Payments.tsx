import { useState, useEffect } from "react";
import { fetchJson } from "../api/client";

interface TransactionItem {
  id: string;
  orderId: string;
  userId: string;
  type: string;
  amountIdr: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

interface PaymentsData {
  transactions: TransactionItem[];
  total: number;
  totalRevenue: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400",
    PAID: "bg-emerald-500/15 text-emerald-400",
    pending: "bg-blue-500/15 text-blue-400",
    PROCESS: "bg-blue-500/15 text-blue-400",
  };
  const cls = colors[status] || "bg-red-500/15 text-red-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {status}
    </span>
  );
}

export default function Payments() {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<PaymentsData>("/api/admin/payments")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="text-text-muted text-center py-12">Loading payments…</div>;
  if (error)
    return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;
  if (!data)
    return <div className="text-text-muted text-center py-12">No data</div>;

  return (
    <div>
      <p className="text-text-muted text-sm mb-4">
        {data.total} transactions · Total revenue:{" "}
        {new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(Number(data.totalRevenue))}
      </p>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border bg-surface-hover">
              <th className="text-left py-3 px-4 font-medium">Order ID</th>
              <th className="text-left py-3 px-4 font-medium">Type</th>
              <th className="text-right py-3 px-4 font-medium">Amount (IDR)</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Paid At</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-text-muted text-sm text-center py-8"
                >
                  No transactions found
                </td>
              </tr>
            ) : (
              data.transactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/50 text-text-secondary hover:bg-surface-hover/50"
                >
                  <td className="py-3 px-4 font-mono text-xs">{t.orderId}</td>
                  <td className="py-3 px-4">{t.type}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    {new Intl.NumberFormat("id-ID").format(
                      Number(t.amountIdr),
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-text-muted">
                    {t.paidAt
                      ? new Date(t.paidAt).toLocaleDateString()
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
