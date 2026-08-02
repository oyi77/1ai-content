import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import "./styles/admin-skin.css";

const AdminApp = lazy(() => import("./App"));
const CustomerApp = lazy(() => import("./app/App"));
const Landing = lazy(() => import("./landing/App"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/app/*" element={<CustomerApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
