import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/app", label: "Dashboard", icon: "📊" },
  { to: "/app/create", label: "Create Video", icon: "🎬" },
  { to: "/app/videos", label: "My Videos", icon: "📹" },
  { to: "/app/billing", label: "Billing", icon: "💳" },
  { to: "/app/subscriptions", label: "Subscriptions", icon: "⭐" },
  { to: "/app/referral", label: "Referral", icon: "🔗" },
  { to: "/app/send", label: "Send Balance", icon: "💸" },
  { to: "/app/profile", label: "Profile", icon: "👤" },
  { to: "/app/settings", label: "Settings", icon: "⚙️" },
  { to: "/app/image", label: "AI Image", icon: "🎨" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">1AI Content</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-credits">
          Credits: <strong>{user?.credits ?? 0}</strong>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        <header className="page-header">
          <h1>1AI Content</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="credits-badge">
              <span>⚡</span>
              <span>{user?.credits ?? 0} credits</span>
            </span>
            {user && (
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Logout
              </button>
            )}
          </div>
        </header>
        <div className="page-body">
          <Outlet />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        <div className="mobile-nav-items">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) => `mobile-nav-link${isActive ? " active" : ""}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
