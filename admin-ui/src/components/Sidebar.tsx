import { useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";

/* ---------- Minimal inline SVG icons ---------- */

const icons: Record<string, string> = {
  grid: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 1.5h6l4 4v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/>
    <path d="M9 1.5v4h4" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  video: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
    <path d="M11 7l3.5-2.5v7L11 9" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  dollar: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 4.5v7M5.5 6.5h4a1.5 1.5 0 0 1 0 3h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  tool: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 11a3 3 0 1 1 4-4l4.5 4.5a1.5 1.5 0 0 1-2 2L8 9" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 1v2M8 13v2M2.5 8h-1.5M15 8h-1.5M4 4l1 1M11 11l1 1M4 12l1-2M11 5l1-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  users: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M1 14c0-3 2-5.5 5-5.5S11 11 11 14" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="11.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.5"/>
    <path d="M15 13c0-2-1.5-3.5-3.5-3.5" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
};

/* ---------- Route definitions ---------- */

interface SidebarItem {
  label: string;
  path: string;
  type: "react" | "ejs";
}

interface SidebarCategory {
  label: string;
  iconKey: string;
  items: SidebarItem[];
}

const categories: SidebarCategory[] = [
  {
    label: "Overview",
    iconKey: "grid",
    items: [
      { label: "Dashboard", path: "/dashboard", type: "react" },
      { label: "Analytics", path: "/analytics", type: "react" },
    ],
  },
  {
    label: "Content",
    iconKey: "file",
    items: [
      { label: "Content Library", path: "/content", type: "react" },
      { label: "Bookshelf", path: "/bookshelf", type: "ejs" },
      { label: "Comics", path: "/comic", type: "ejs" },
      { label: "Media Gallery", path: "/medias", type: "ejs" },
      { label: "Prompts", path: "/prompts", type: "ejs" },
      { label: "A/B Tests", path: "/ab-tests", type: "ejs" },
      { label: "Trending Scanner", path: "/trending", type: "ejs" },
      { label: "Content Calendar", path: "/calendar", type: "ejs" },
    ],
  },
  {
    label: "Video",
    iconKey: "video",
    items: [
      { label: "Captions", path: "/captions", type: "ejs" },
      { label: "Video Tools", path: "/video-tools", type: "ejs" },
      { label: "Storyboard", path: "/storyboard", type: "ejs" },
      { label: "Ad Renderer", path: "/render-ad", type: "ejs" },
      { label: "Carousel", path: "/carousel", type: "ejs" },
      { label: "Looping Video", path: "/looping", type: "ejs" },
      { label: "Re-Metadata", path: "/remeta", type: "ejs" },
      { label: "Repurpose", path: "/repurpose", type: "ejs" },
    ],
  },
  {
    label: "Research & AI",
    iconKey: "search",
    items: [
      { label: "Book Research", path: "/research", type: "ejs" },
      { label: "AI Config", path: "/ai-config", type: "ejs" },
      { label: "Pinterest Scan", path: "/pinterest", type: "ejs" },
      { label: "Playground", path: "/playground", type: "react" },
    ],
  },
  {
    label: "Monetization",
    iconKey: "dollar",
    items: [
      { label: "Payments", path: "/payments", type: "react" },
      { label: "Pricing", path: "/pricing", type: "react" },
      { label: "Dynamic Pricing", path: "/dynamic-pricing", type: "ejs" },
      { label: "Broadcast", path: "/broadcast", type: "ejs" },
    ],
  },
  {
    label: "Tools",
    iconKey: "tool",
    items: [
      { label: "Tool Hub", path: "/tools", type: "react" },
      { label: "TTS Voice", path: "/tts", type: "ejs" },
      { label: "Music Generator", path: "/music", type: "ejs" },
      { label: "Autopilot", path: "/autopilot", type: "ejs" },
      { label: "Channel Analysis", path: "/analyze", type: "ejs" },
    ],
  },
  {
    label: "System",
    iconKey: "settings",
    items: [
      { label: "Settings", path: "/settings", type: "react" },
      { label: "Providers", path: "/providers", type: "ejs" },
      { label: "CloakBrowser", path: "/cloak", type: "ejs" },
      { label: "Engagement", path: "/engagement", type: "ejs" },
      { label: "Interceptions", path: "/interceptions", type: "ejs" },
      { label: "Fanpage Manager", path: "/fanpage", type: "ejs" },
    ],
  },
  {
    label: "Users",
    iconKey: "users",
    items: [
      { label: "Users", path: "/users", type: "react" },
    ],
  },
];

/* ---------- Props ---------- */

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/* ---------- Inline SVG helper ---------- */

function SvgIcon({ svg, className }: { svg: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ---------- Component ---------- */

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  /* Expand all categories by default on desktop */
  const defaultExpanded = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const cat of categories) {
      map[cat.label] = true;
    }
    return map;
  }, []);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);

  function toggle(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function handleNav(item: SidebarItem) {
    if (item.type === "react") {
      navigate(item.path);
    } else {
      window.location.href = `/admin${item.path}`;
    }
    onClose();
  }

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64
          glass-strong
          border-r border-border/50
          flex flex-col
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent text-sm font-bold">
            V
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">Vilona</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Content Admin</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {categories.map((cat) => {
            const isExpanded = expanded[cat.label] ?? true;

            const catActive = cat.items.some((item) =>
              item.type === "react"
                ? location.pathname.startsWith(item.path)
                : location.pathname === `/admin${item.path}` ||
                  location.pathname.startsWith(`/admin${item.path}/`)
            );

            return (
              <div key={cat.label}>
                {/* Category header */}
                <button
                  onClick={() => toggle(cat.label)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium
                    transition-all duration-150 cursor-pointer
                    ${catActive
                      ? "text-accent bg-accent-subtle"
                      : "text-text-muted hover:text-text-secondary hover:bg-surface-hover"
                    }
                  `}
                >
                  <SvgIcon
                    svg={icons[cat.iconKey] || icons.grid}
                    className="w-4 h-4 shrink-0 opacity-70"
                  />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>

                {/* Sub-items */}
                {isExpanded && (
                  <div className="mt-0.5 ml-2 space-y-0.5">
                    {cat.items.map((item) => {
                      const itemActive =
                        item.type === "react"
                          ? location.pathname.startsWith(item.path)
                          : location.pathname === `/admin${item.path}`;

                      return (
                        <button
                          key={item.path}
                          onClick={() => handleNav(item)}
                          className={`
                            w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm
                            transition-all duration-150 cursor-pointer text-left
                            ${itemActive
                              ? "text-accent bg-accent-light font-medium"
                              : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                            }
                          `}
                        >
                          <span
                            className={`w-1 h-1 rounded-full shrink-0 transition-colors duration-150 ${
                              itemActive ? "bg-accent" : "bg-transparent"
                            }`}
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.type === "ejs" && (
                            <svg className="w-3 h-3 text-text-muted shrink-0" viewBox="0 0 16 16" fill="none">
                              <path d="M11 3L5 9M7 3h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 shrink-0">
          <div className="text-[10px] text-text-muted">Vilona Content Factory v1.0</div>
        </div>
      </aside>
    </>
  );
}
