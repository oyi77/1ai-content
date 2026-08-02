import { useState, useEffect } from "react";
import { api } from "../api/client";

export default function Subscriptions() {
  const [plans, setPlans] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSubscriptions().then((d) => {
      setPlans(d.plans ?? []);
      setCurrent(d.current ?? null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId: string) => {
    try {
      await api.subscribe(planId);
      alert("Subscribed successfully!");
      const d = await api.getSubscriptions();
      setPlans(d.plans ?? []);
      setCurrent(d.current ?? null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="loading-spinner">Loading plans...</div>;

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Subscriptions</h2>

      {current && (
        <div className="card" style={{ marginBottom: 24, borderColor: "#00d9ff" }}>
          <div className="card-title">Current Plan</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#00d9ff", marginBottom: 4 }}>
            {current.name || "Active Plan"}
          </div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem" }}>
            {current.status} · {current.creditsPerMonth || 0} credits/month
          </div>
        </div>
      )}

      <div className="grid-3">
        {plans.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 40, gridColumn: "1 / -1" }}>
            <p style={{ color: "#8888aa" }}>No plans available at this time.</p>
          </div>
        ) : plans.map((plan: any) => (
          <div className="card" key={plan.id} style={{
            display: "flex", flexDirection: "column",
            borderColor: plan.isPopular ? "#00d9ff" : undefined,
          }}>
            <div className="card-title">{plan.name || "Plan"}</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "white", marginBottom: 4 }}>
              {plan.price ? `$${plan.price}` : "Free"}
            </div>
            <div style={{ color: "#8888aa", fontSize: "0.85rem", marginBottom: 16 }}>
              {plan.creditsPerMonth || 0} credits/month
            </div>
            <ul style={{
              listStyle: "none", padding: 0, margin: "0 0 20px",
              color: "#e0e0f0", fontSize: "0.85rem",
            }}>
              {(plan.features || []).map((f: string, i: number) => (
                <li key={i} style={{ padding: "4px 0" }}>✓ {f}</li>
              ))}
            </ul>
            <div style={{ marginTop: "auto" }}>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => handleSubscribe(plan.id)} disabled={current?.planId === plan.id}>
                {current?.planId === plan.id ? "Current" : "Subscribe"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}