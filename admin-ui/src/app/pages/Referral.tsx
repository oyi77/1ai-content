import { useState, useEffect } from "react";
import { api } from "../api/client";

export default function Referral() {
  const [referral, setReferral] = useState<{ code: string; earnings: number; count: number; link?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getReferral().then(setReferral).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    if (referral?.code) {
      navigator.clipboard.writeText(referral.code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const referralLink = referral?.code
    ? `https://t.me/vilona_content_bot?start=${referral.code}`
    : "";

  if (loading) return <div className="loading-spinner">Loading referral info...</div>;

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Referral Program</h2>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Your Code</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#00d9ff", marginBottom: 8 }}>
            {referral?.code || "-"}
          </div>
          <button className="btn btn-primary btn-sm" onClick={copyCode}>
            {copied ? "✓ Copied!" : "📋 Copy Code"}
          </button>
        </div>
        <div className="card">
          <div className="card-title">Earnings</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "white" }}>
            {referral?.earnings ?? 0}
          </div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem" }}>credits earned</div>
        </div>
        <div className="card">
          <div className="card-title">Referrals</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "white" }}>
            {referral?.count ?? 0}
          </div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem" }}>people joined</div>
        </div>
      </div>

      {referralLink && (
        <div className="card">
          <div className="card-title">Share Your Link</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={referralLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn btn-primary" onClick={() => {
              navigator.clipboard.writeText(referralLink).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}>
              {copied ? "✓ Copied" : "Copy Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}