import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout/Layout";
import Dashboard from "./pages/Dashboard";
import CreateVideo from "./pages/CreateVideo";
import MyVideos from "./pages/MyVideos";
import Billing from "./pages/Billing";
import Subscriptions from "./pages/Subscriptions";
import Referral from "./pages/Referral";
import SendBalance from "./pages/SendBalance";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import ImageGenerator from "./pages/ImageGenerator";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProtectedRoute from "./auth/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      {/* Public routes — no sidebar */}
      <Route path="login" element={<LoginPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes with sidebar */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="create" element={<CreateVideo />} />
          <Route path="videos" element={<MyVideos />} />
          <Route path="billing" element={<Billing />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="referral" element={<Referral />} />
          <Route path="send" element={<SendBalance />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="image" element={<ImageGenerator />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}