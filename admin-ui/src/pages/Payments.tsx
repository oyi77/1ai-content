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

  if (loading) return <div className="page-loading">Loading payments…</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!data) return <div className="page-empty">No data</div>;

  return (
    <div className="page">
      <h1>Payments</h1>
      <p className="page-subtitle">
        {data.total} transactions · Total revenue:{" "}
        {new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(Number(data.totalRevenue))}
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Type</th>
            <th>Amount (IDR)</th>
            <th>Status</th>
            <th>Paid At</th>
          </tr>
        </thead>
        <tbody>
          {data.transactions.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-state">No transactions found</td>
            </tr>
          ) : (
            data.transactions.map((t) => (
              <tr key={t.id}>
                <td className="cell-mono">{t.orderId}</td>
                <td>{t.type}</td>
                <td className="cell-mono">
                  {new Intl.NumberFormat("id-ID").format(Number(t.amountIdr))}
                </td>
                <td>
                  <span
                    className={`badge badge-${
                      t.status === "success" || t.status === "PAID"
                        ? "green"
                        : t.status === "pending" || t.status === "PROCESS"
                          ? "blue"
                          : "red"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="cell-mono">
                  {t.paidAt ? new Date(t.paidAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
