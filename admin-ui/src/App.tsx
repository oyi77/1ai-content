import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Content from "./pages/Content";
import Users from "./pages/Users";
import Payments from "./pages/Payments";
import Tools, { Cloak, Engagement, VideoTools, RenderAd, Storyboard, Pinterest, Fanpage } from "./pages/Tools";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import Playground from "./pages/Playground";
import CalendarPage from "./pages/CalendarPage";
import TrendingPage from "./pages/TrendingPage";
import ABTestsPage from "./pages/ABTestsPage";
import CarouselPage from "./pages/CarouselPage";
import RemetaPage from "./pages/RemetaPage";
import RepurposePage from "./pages/RepurposePage";
import ResearchPage from "./pages/ResearchPage";
export default function App() {
  return (
    <BrowserRouter basename="/admin/react">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/analytics/calendar" element={<CalendarPage />} />
          <Route path="/analytics/trending" element={<TrendingPage />} />
          <Route path="/analytics/ab-tests" element={<ABTestsPage />} />
          <Route path="/analytics/carousel" element={<CarouselPage />} />
          <Route path="/analytics/remeta" element={<RemetaPage />} />
          <Route path="/analytics/repurpose" element={<RepurposePage />} />
          <Route path="/analytics/research" element={<ResearchPage />} />
          <Route path="/content" element={<Content />} />
          <Route path="/users" element={<Users />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/tools" element={<Tools />}>
            <Route index element={<Navigate to="/tools" replace />} />
            <Route path="cloak" element={<Cloak />} />
            <Route path="engagement" element={<Engagement />} />
            <Route path="video-tools" element={<VideoTools />} />
            <Route path="render-ad" element={<RenderAd />} />
            <Route path="storyboard" element={<Storyboard />} />
            <Route path="pinterest" element={<Pinterest />} />
            <Route path="fanpage" element={<Fanpage />} />
          </Route>
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/playground" element={<Playground />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
