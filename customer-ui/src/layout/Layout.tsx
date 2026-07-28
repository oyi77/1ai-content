import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/create", label: "Create Video", icon: "🎬" },
  { to: "/videos", label: "My Videos", icon: "📹" },
  { to: "/billing", label: "Billing", icon: "💳" },
  { to: "/subscriptions", label: "Subscriptions", icon: "⭐" },
  { to: "/referral", label: "Referral", icon: "🔗" },
  { to: "/send", label: "Send Balance", icon: "💸" },
  { to: "/profile", label: "Profile", icon: "👤" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
  { to: "/image", label: "AI Image", icon: "🎨" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">BerkahKarya</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
          <h1>BerkahKarya</h1>
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
              end={item.to === "/"}
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