import { Component, StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import "./styles/admin-skin.css";

const AdminApp = lazy(() => import("./App"));
const CustomerApp = lazy(() => import("./app/App"));
const Landing = lazy(() => import("./landing/App"));
const ArticleList = lazy(() => import("./articles/List"));
const ArticleDetail = lazy(() => import("./articles/Detail"));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] text-white">
          <div className="text-lg font-semibold">Terjadi kesalahan</div>
          <p className="text-sm text-gray-400">Coba muat ulang halaman untuk melanjutkan.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center text-white">
              Loading…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/articles" element={<ArticleList />} />
            <Route path="/articles/:slug" element={<ArticleDetail />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="/app/*" element={<CustomerApp />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
