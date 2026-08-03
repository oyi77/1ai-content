import { useState, useEffect } from "react";
import { api } from "../api/client";

export default function Billing() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState(50);
  const [payMethod, setPayMethod] = useState<"qris" | "crypto">("qris");

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getBilling().then((d) => {
      setTransactions(d.transactions ?? []);
      setCredits(d.credits ?? 0);
    }).catch((e: any) => {
      setError(e?.message || "Failed to load billing. Please try again.");
    }).finally(() => setLoading(false));
  }, [reload]);

  const handleTopUp = async () => {
    try {
      const result = payMethod === "qris"
        ? await api.createQrisPayment(topUpAmount)
        : await api.createCryptoPayment(topUpAmount);
      if ((result as any).paymentUrl) {
        window.open((result as any).paymentUrl, "_blank");
      } else {
        alert(`Payment initiated for ${topUpAmount} credits`);
      }
    } catch (e: any) {
      setError(e?.message || "Payment initiation failed. Please try again.");
    }
  };

  if (loading) return <div className="loading-spinner">Loading billing...</div>;

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40, borderColor: "#ff5c5c" }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚠️</div>
        <p style={{ color: "#ff8a8a", marginBottom: 16 }}>{error}</p>
        <button className="btn btn-primary" onClick={() => setReload((r) => r + 1)}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Billing</h2>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Current Balance</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#00d9ff" }}>{credits}</div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem" }}>credits</div>
        </div>
        <div className="card">
          <div className="card-title">Top Up Credits</div>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              type="number"
              min={10}
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 10)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className={`btn btn-sm ${payMethod === "qris" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPayMethod("qris")}>QRIS</button>
              <button className={`btn btn-sm ${payMethod === "crypto" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPayMethod("crypto")}>Crypto</button>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleTopUp}>💳 Top Up</button>
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
            <span className="card-title" style={{ margin: 0 }}>Transaction History</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t: any, i: number) => (
                <tr key={t.id || i}>
                  <td style={{ fontSize: "0.8rem", color: "#8888aa" }}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "-"}
                  </td>
                  <td>{t.type || "payment"}</td>
                  <td style={{ fontWeight: 600 }}>{t.amount ?? 0}</td>
                  <td>
                    <span className={`badge ${t.status === "completed" ? "badge-success" : t.status === "pending" ? "badge-warning" : "badge-error"}`}>
                      {t.status || "unknown"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}