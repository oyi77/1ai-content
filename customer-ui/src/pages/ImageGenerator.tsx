import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function ImageGenerator() {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    try {
      const result = await api.generateImage(prompt, style);
      setImageUrl((result as any).url || (result as any).imageUrl || null);
      await refreshUser();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>AI Image Generator</h2>

      <div className="grid-2">
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
              Image Description
            </label>
            <textarea
              className="input"
              rows={5}
              placeholder="Describe the image you want to generate..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ marginBottom: 12, resize: "vertical" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
              Style
            </label>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="realistic">Realistic</option>
              <option value="artistic">Artistic</option>
              <option value="anime">Anime</option>
              <option value="product">Product</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
            {loading ? "Generating..." : "🎨 Generate Image"}
          </button>
        </div>

        <div className="card" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 300, background: "#14142a",
        }}>
          {imageUrl ? (
            <img src={imageUrl} alt="Generated" style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 8 }} />
          ) : (
            <div style={{ color: "#8888aa", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 8 }}>🎨</div>
              <div>Your image will appear here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}