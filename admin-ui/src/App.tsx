import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Content from "./pages/Content";
import Users from "./pages/Users";
import Payments from "./pages/Payments";
import Tools from "./pages/Tools";
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
import MediasPage from "./pages/MediasPage";
import PromptsPage from "./pages/PromptsPage";
import PersonasPage from "./pages/PersonasPage";
import DynamicPricingPage from "./pages/DynamicPricingPage";
import ConfigPage from "./pages/ConfigPage";
import SystemPage from "./pages/SystemPage";
import InterceptionsPage from "./pages/InterceptionsPage";
import AiConfigPage from "./pages/AiConfigPage";
import BookshelfPage from "./pages/BookshelfPage";
import MoviePage from "./pages/MoviePage";
import ProvidersPage from "./pages/ProvidersPage";
/* content audio */
import Tts from "./pages/Tts";
import Music from "./pages/Music";
import Captions from "./pages/Captions";
import Analyze from "./pages/Analyze";
import Looping from "./pages/Looping";
import Autopilot from "./pages/Autopilot";
/* tool subpages */
import Cloak from "./pages/tools/Cloak";
import Engagement from "./pages/tools/Engagement";
import VideoTools from "./pages/tools/VideoTools";
import Storyboard from "./pages/tools/Storyboard";
import RenderAd from "./pages/tools/RenderAd";
import Pinterest from "./pages/tools/Pinterest";
import ComicPage from "./pages/ComicPage";
import Fanpage from "./pages/tools/Fanpage";
export default function App() {
  return (
    <BrowserRouter basename="/admin">
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
          <Route path="/tools" element={<Tools />} />
          <Route path="/tools/cloak" element={<Cloak />} />
          <Route path="/tools/engagement" element={<Engagement />} />
          <Route path="/tools/video-tools" element={<VideoTools />} />
          <Route path="/tools/storyboard" element={<Storyboard />} />
          <Route path="/tools/render-ad" element={<RenderAd />} />
          <Route path="/tools/pinterest" element={<Pinterest />} />
          <Route path="/tools/fanpage" element={<Fanpage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/medias" element={<MediasPage />} />
          <Route path="/ai-config" element={<AiConfigPage />} />
          <Route path="/comic" element={<ComicPage />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/tts" element={<Tts />} />
          <Route path="/music" element={<Music />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/movie" element={<MoviePage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/captions" element={<Captions />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/looping" element={<Looping />} />
          <Route path="/autopilot" element={<Autopilot />} />
          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/dynamic-pricing" element={<DynamicPricingPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="/interceptions" element={<InterceptionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
