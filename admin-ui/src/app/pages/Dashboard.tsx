import { useAuth } from "../auth/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "white", marginBottom: 8 }}>
        Welcome{user?.name ? `, ${user.name}` : ""}!
      </h2>
      <p style={{ color: "#8888aa", marginBottom: 24 }}>
        Create amazing content with AI-powered tools.
      </p>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">Credits</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#00d9ff" }}>
            {user?.credits ?? 0}
          </div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem", marginTop: 4 }}>Available balance</div>
        </div>
        <div className="card">
          <div className="card-title">Plan</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "white" }}>
            {user?.isPremium ? "Premium" : "Free"}
          </div>
          <div style={{ color: "#8888aa", fontSize: "0.85rem", marginTop: 4 }}>Current subscription</div>
        </div>
        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a href="/app/create" className="btn btn-primary" style={{ justifyContent: "center" }}>
              🎬 Create Video
            </a>
            <a href="/app/image" className="btn btn-secondary" style={{ justifyContent: "center" }}>
              🎨 Generate Image
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}