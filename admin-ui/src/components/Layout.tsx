import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { logout } from "../api/client";

/* ---------- Breadcrumb mapping ---------- */

const breadcrumbName: Record<string, string> = {
  "": "Dashboard",
  dashboard: "Dashboard",
  analytics: "Analytics",
  content: "Content",
  users: "Users",
  payments: "Payments",
  tools: "Tools",
  settings: "Settings",
};

function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const parts = location.pathname.split("/").filter((p: string) => p && p !== "admin");

  if (parts.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs text-text-muted">
      <button
        onClick={() => navigate("/admin/dashboard")}
        className="hover:text-text-primary transition-colors cursor-pointer"
      >
        Admin
      </button>
      {parts.map((part, i) => {
        const name = breadcrumbName[part] || part.replace(/-/g, " ");
        const isLast = i === parts.length - 1;
        const display =
          name.charAt(0).toUpperCase() + name.slice(1);

        return (
          <span key={part} className="flex items-center gap-1.5">
            <svg className="w-3 h-3 opacity-40" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {isLast ? (
              <span className="text-text-secondary font-medium">{display}</span>
            ) : (
              <span className="text-text-muted">{display}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/* ---------- Layout ---------- */

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#050505] text-text-primary overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="glass-strong border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              {/* Hamburger (mobile only) */}
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>

              {/* Breadcrumbs */}
              <Breadcrumbs />
            </div>

            {/* Right area */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Live
              </span>
              <button
                onClick={() => {
                  void logout().finally(() => {
                    window.location.href = "/admin/login";
                  });
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                title="Logout"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
