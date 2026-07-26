import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

interface NavCategory {
  icon: string;
  label: string;
  items: { path: string; icon: string; label: string }[];
}

const categories: NavCategory[] = [
  {
    icon: "📊",
    label: "Business",
    items: [
      { path: "/dashboard", icon: "📊", label: "Overview" },
      { path: "/users", icon: "👥", label: "Users" },
      { path: "/analytics", icon: "📈", label: "Analytics" },
      { path: "/revenue", icon: "💹", label: "Revenue" },
    ],
  },
  {
    icon: "💰",
    label: "Monetization",
    items: [
      { path: "/pricing", icon: "💰", label: "Pricing" },
      { path: "/dynamic-pricing", icon: "💵", label: "Dynamic Pricing" },
    ],
  },
  {
    icon: "🎬",
    label: "Content",
    items: [
      { path: "/medias", icon: "🎬", label: "Medias" },
      { path: "/prompts", icon: "🤖", label: "Prompts" },
      { path: "/trending", icon: "🔥", label: "Trending" },
    ],
  },
  {
    icon: "⚙️",
    label: "Settings",
    items: [
      { path: "/settings", icon: "⚙️", label: "Settings" },
      { path: "/providers", icon: "🔌", label: "Providers" },
      { path: "/system", icon: "🖥️", label: "System" },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const cat = categories.find((c) =>
      c.items.some((i) => location.pathname.startsWith(i.path)),
    );
    return cat ? { [cat.label]: true } : {};
  });

  function toggle(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  function handleNav(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <>
      {open && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--accent)",
              }}
            >
              ⚡ Vilona Content
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--muted)",
                marginTop: "2px",
              }}
            >
              Admin Dashboard
            </div>
          </div>

          {categories.map((cat) => (
            <div key={cat.label}>
              <div
                className="nav-category"
                onClick={() => toggle(cat.label)}
              >
                <span className="nav-category-icon">{cat.icon}</span>
                <span className="nav-category-label">{cat.label}</span>
                <span
                  className="nav-category-arrow"
                  style={{
                    transform: expanded[cat.label]
                      ? "rotate(90deg)"
                      : "rotate(0deg)",
                  }}
                >
                  ▶
                </span>
              </div>
              {expanded[cat.label] && (
                <div className="nav-category-items">
                  {cat.items.map((item) => (
                    <div
                      key={item.path}
                      className={
                        isActive(item.path) ? "nav-item active" : "nav-item"
                      }
                      onClick={() => handleNav(item.path)}
                    >
                      {item.icon} {item.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
