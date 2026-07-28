import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function SendBalance() {
  const { user, refreshUser } = useAuth();
  const [telegramId, setTelegramId] = useState("");
  const [amount, setAmount] = useState(10);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!telegramId.trim() || amount <= 0) return;
    if (amount > (user?.credits ?? 0)) {
      alert("Insufficient credits");
      return;
    }
    setSending(true);
    try {
      await api.sendBalance(telegramId.trim(), amount);
      alert(`Sent ${amount} credits to ${telegramId}!`);
      await refreshUser();
      setTelegramId("");
      setAmount(10);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Send Balance</h2>

      <div className="card" style={{ maxWidth: 500 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Recipient Telegram ID
          </label>
          <input
            className="input"
            placeholder="e.g. 123456789"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Amount (credits)
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={user?.credits ?? 0}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
          />
          <div style={{ color: "#8888aa", fontSize: "0.8rem", marginTop: 4 }}>
            Your balance: {user?.credits ?? 0} credits
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSend} disabled={sending || !telegramId.trim() || amount <= 0}>
          {sending ? "Sending..." : "💸 Send Credits"}
        </button>
      </div>
    </div>
  );
}