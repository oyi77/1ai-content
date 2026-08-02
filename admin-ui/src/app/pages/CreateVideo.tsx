import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

export default function CreateVideo() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [duration, setDuration] = useState("30");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const data = await api.createVideo({ prompt, style, duration: parseInt(duration) });
      setResult(data);
      setStep(3);
      await refreshUser();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Create Video</h2>

      {step === 1 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">Step 1: Describe Your Video</div>
          <p style={{ color: "#8888aa", marginBottom: 16, fontSize: "0.85rem" }}>
            Tell us what kind of video you want to create. Be as specific as possible.
          </p>
          <textarea
            className="input"
            rows={5}
            placeholder="E.g., A product showcase for handmade candles with soft lighting..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ marginBottom: 16, resize: "vertical" }}
          />
          <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!prompt.trim()}>
            Next: Choose Style
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">Step 2: Style & Duration</div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
              Video Style
            </label>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="realistic">Realistic</option>
              <option value="cinematic">Cinematic</option>
              <option value="animated">Animated</option>
              <option value="product">Product Showcase</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
              Duration (seconds)
            </label>
            <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="15">15s</option>
              <option value="30">30s</option>
              <option value="60">60s</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "✨ Generate Video"}
            </button>
          </div>
          <p style={{ color: "#8888aa", fontSize: "0.8rem", marginTop: 12 }}>
            Cost: {duration === "15" ? "5" : duration === "30" ? "10" : "20"} credits
          </p>
        </div>
      )}

      {step === 3 && result && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">✅ Video Created!</div>
          <p style={{ color: "#8888aa", marginBottom: 12 }}>
            Your video is being processed. It will appear in "My Videos" shortly.
          </p>
          <div style={{ background: "#1c1c3a", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <pre style={{ fontSize: "0.8rem", color: "#e0e0f0", margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/app/videos" className="btn btn-primary">View My Videos</a>
            <button className="btn btn-secondary" onClick={() => { setStep(1); setResult(null); setPrompt(""); }}>
              Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}