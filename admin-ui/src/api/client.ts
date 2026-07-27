const API_BASE = ""; // same origin

export interface AnalyticsData {
  todayMetrics: {
    newUsers: number;
    activeUsers: number;
    totalTransactions: number;
    revenue: string;
    creditsUsed: number;
  };
  activeUsersList: Array<{
    id: string;
    username: string;
    tier: string;
    status: string;
    lastActivity: string;
  }>;
  providerHealth: Record<string, "online" | "degraded" | "offline">;
  topNiches: Array<{ name: string; count: number }>;
  recentErrors: Array<{
    id: string;
    message: string;
    source: string;
    timestamp: string;
    severity: "error" | "warning";
  }>;
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const res = await fetch(`${API_BASE}/api/admin/dashboard`);
  if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json();
}

// ── Auth helpers (cookie-based, credentials: include) ──

export async function checkAuth(): Promise<{ authenticated: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/check-auth`, { credentials: "include" });
  return res.json();
}

export async function login(password: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return { success: false };
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" });
}

// ── Pricing API ──

export interface PricingOverview {
  packages: Record<string, { name?: string; price?: number; credits?: number; bonus?: number; popular?: boolean }>;
  subscriptions: Record<string, { name?: string; monthlyIdr?: number; yearlyIdr?: number; monthlyCredits?: number; dailyLimit?: number }>;
  videoCosts: Record<string, number>;
  imageCosts: Record<string, number>;
  providerCosts: Record<string, { costUsd?: number }>;
  global: Record<string, { value?: number } | number>;
  unitCosts: Record<string, number>;
}

export interface PricingRecommendation {
  usdToIdr: number;
  targetMarginPercent: number;
  recommendations: Record<string, {
    current: number;
    apiCostUsd: number;
    apiCostUsdMax: number;
    minUnits: number;
    description: string;
  }>;
}

export async function fetchPricingOverview(): Promise<PricingOverview> {
  const res = await fetch(`${API_BASE}/api/pricing-overview`);
  if (!res.ok) throw new Error(`Pricing overview fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPricingRecommendation(): Promise<PricingRecommendation> {
  const res = await fetch(`${API_BASE}/api/pricing-recommendation`);
  if (!res.ok) throw new Error(`Pricing recommendation fetch failed: ${res.status}`);
  return res.json();
}

export async function savePricingConfig(category: string, key: string, value: unknown): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/pricing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ category, key, value }),
  });
  if (!res.ok) throw new Error(`Save pricing failed: ${res.status}`);
  return res.json();
}

export async function deletePricingConfig(category: string, key: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/pricing`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ category, key }),
  });
  if (!res.ok) throw new Error(`Delete pricing failed: ${res.status}`);
  return res.json();
}

// ── Playground API ──

export interface PlaygroundModelsResponse {
  models: string[];
  videoProviders: string[];
  imageProviders: string[];
}

export interface PlaygroundTextResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface PlaygroundImageResponse {
  success: boolean;
  imageUrl?: string;
  provider?: string;
  error?: string;
}

export interface PlaygroundVideoResponse {
  success: boolean;
  videoUrl?: string;
  provider?: string;
  error?: string;
}

export async function fetchPlaygroundModels(): Promise<PlaygroundModelsResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/models`);
  if (!res.ok) throw new Error(`Fetch playground models failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundText(prompt: string, model?: string): Promise<PlaygroundTextResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok) throw new Error(`Playground text failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundImage(prompt: string, provider?: string, aspectRatio?: string): Promise<PlaygroundImageResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, provider, aspectRatio }),
  });
  if (!res.ok) throw new Error(`Playground image failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundVideo(prompt: string, provider?: string, niche?: string, duration?: number): Promise<PlaygroundVideoResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, provider, niche, duration }),
  });
  if (!res.ok) throw new Error(`Playground video failed: ${res.status}`);
  return res.json();
}

// ── Calendar API ──

export interface CalendarEntry {
  id: number;
  topic: string;
  platform: string;
  content_type: string;
  scheduled_at: string;
  status: string;
}

export interface CalendarListResponse {
  entries: CalendarEntry[];
}

export async function fetchCalendarEntries(): Promise<CalendarListResponse> {
  return fetchJson<CalendarListResponse>("/api/py/calendar/list/0");
}

export async function scheduleCalendarEntry(body: {
  user_id: number;
  topic: string;
  scheduled_at: string;
  platform: string;
  content_type: string;
  niche: string;
  style: string;
}): Promise<{ id?: number; error?: string }> {
  return postJson("/api/py/calendar/schedule", body);
}

export async function deleteCalendarEntry(id: number): Promise<void> {
  await fetch(`/api/py/calendar/delete/${id}?user_id=0`, { method: "DELETE", credentials: "include" });
}

// ── Trending API ──

export interface TrendingItem {
  title?: string;
  channel?: string;
  views?: number;
  traffic?: string;
  subreddit?: string;
  score?: number;
  comments?: number;
}

export interface TrendingData {
  youtube: TrendingItem[];
  google: TrendingItem[];
  reddit: TrendingItem[];
  tiktok: TrendingItem[];
  cached_at?: string;
  scanned_at?: string;
  total_topics?: number;
}

export interface TrendingStatus {
  background_active: boolean;
  last_scan: string | null;
  scan_interval_seconds: number;
}

export async function fetchTrendingStatus(): Promise<TrendingStatus> {
  return fetchJson<TrendingStatus>("/api/py/trending/status");
}

export async function fetchTrendingCached(): Promise<TrendingData> {
  return fetchJson<TrendingData>("/api/py/trending/cached");
}

export async function triggerTrendingScan(): Promise<TrendingData> {
  return fetchJson<TrendingData>("/api/py/trending/scan");
}

// ── AB Test API ──

export interface ABTestVariant {
  caption?: string;
  title?: string;
}

export interface ABTestMetrics {
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

export interface ABTest {
  id: string;
  name: string;
  topic?: string;
  content_type?: string;
  platform?: string;
  status: string;
  winner?: string;
  variant_a?: ABTestVariant;
  variant_b?: ABTestVariant;
  metrics_a?: ABTestMetrics;
  metrics_b?: ABTestMetrics;
}

export interface ABTestListResponse {
  tests: ABTest[];
}

export async function fetchABTests(): Promise<ABTestListResponse> {
  return fetchJson<ABTestListResponse>("/api/py/ab-test/list/0");
}

export async function createABTest(body: {
  user_id: number;
  name: string;
  topic: string;
  content_type: string;
  platform: string;
}): Promise<{ id?: string; error?: string }> {
  return postJson("/api/py/ab-test/create", body);
}

export async function startABTest(id: string): Promise<void> {
  await fetch(`/api/py/ab-test/${id}/start?user_id=0`, { method: "POST", credentials: "include" });
}

export async function endABTest(id: string): Promise<{ winner?: string }> {
  const r = await fetch(`/api/py/ab-test/${id}/end?user_id=0`, { method: "POST", credentials: "include" });
  return r.json();
}

export async function deleteABTest(id: string): Promise<void> {
  await fetch(`/api/py/ab-test/${id}/delete?user_id=0`, { method: "DELETE", credentials: "include" });
}

// ── Carousel API ──

export interface CarouselSlide {
  type?: string;
  icon?: string;
  headline?: string;
  body?: string;
}

export interface CarouselContent {
  title?: string;
  slides: CarouselSlide[];
}

export interface CarouselGenerateResponse {
  success: boolean;
  content?: CarouselContent;
  slide_count?: number;
  job_id?: string;
  slides?: string[];
  caption?: string;
  hashtags?: string[];
  error?: string;
}

export interface CarouselTemplatesResponse {
  templates: { name: string; niche: string; slides: number; style: string; success_rate: number }[];
  niches: string[];
}

export async function generateCarousel(body: {
  topic: string;
  num_slides: number;
  style: string;
  platform: string;
  language: string;
}): Promise<CarouselGenerateResponse> {
  return postJson("/api/py/carousel/create", body);
}

export async function fetchCarouselTemplates(): Promise<CarouselTemplatesResponse> {
  return fetchJson<CarouselTemplatesResponse>("/api/py/carousel/templates");
}

// ── Remeta API ──

export interface RemetaResponse {
  success: boolean;
  metadata?: { title?: string; hashtags?: string[] };
  changes_applied?: string[];
  original_hash?: string;
  new_hash?: string;
  new_duration?: number;
  encoding?: string;
  video_path?: string;
  error?: string;
}

export async function processRemeta(body: {
  source: string;
  overlay: string;
  watermark?: string;
  position?: string;
  color_shift: boolean;
  niche: string;
  platform: string;
}): Promise<RemetaResponse> {
  return postJson("/api/py/remeta", body);
}

// ── Repurpose API ──

export interface RepurposeSegment {
  type: string;
  start: number;
  end: number;
  score: number;
  speed: number;
}

export interface RepurposeResponse {
  success: boolean;
  segments_used?: RepurposeSegment[];
  duration?: number;
  platform?: string;
  sources_used?: string[];
  metadata?: { title?: string; caption?: string; hashtags?: string[] };
  video_path?: string;
  error?: string;
}

export async function repurposeContent(body: {
  sources: string[];
  target_duration: number;
  platform: string;
  niche: string;
  style: string;
  color_preset: string;
  transition_style: string;
  watermark_text?: string;
  add_subtitles: boolean;
}): Promise<RepurposeResponse> {
  return postJson("/api/py/repurpose", body);
}

// ── Research API ──

export interface ResearchNiche {
  niche?: string;
  target_audience?: string;
  market_angle?: string;
  competition_level?: string;
  why_now?: string;
  suggested_titles?: string[];
  outline_brief?: string[];
}

export interface ResearchGenre {
  genre?: string;
  name?: string;
  popularity_score?: number;
  growth_trend?: string;
}

export interface ResearchTopicsResponse {
  niches?: { niches: ResearchNiche[]; genres: ResearchGenre[]; summary: string };
}

export interface BookBriefResponse {
  brief?: {
    success?: boolean;
    error?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    primary_genre?: string;
    estimated_length_pages?: number;
    target_audience?: string;
    keywords?: string[];
    outline?: { chapter: string; summary: string }[];
    cover_style?: string;
  };
}

export async function researchTopics(body: {
  language: string;
  region?: string;
  category?: string;
  count: number;
  source_hint?: string;
}): Promise<ResearchTopicsResponse> {
  return postJson("/api/py/research/topics", body);
}

export async function generateBookBrief(body: {
  niche: string;
  language: string;
  region?: string;
  target_market?: string;
}): Promise<BookBriefResponse> {
  return postJson("/api/py/research/book-brief", body);
}

// ── TTS API ──

export interface TTSVoice {
  ShortName?: string;
  short_name?: string;
  name?: string;
  DisplayName?: string;
  display_name?: string;
  Locale?: string;
  locale?: string;
  Gender?: string;
  gender?: string;
}

export interface TTSResponse {
  success: boolean;
  filename?: string;
  file_path?: string;
  error?: string;
}

export async function fetchTTSVoices(language?: string): Promise<TTSVoice[]> {
  const params = language ? `?language=${encodeURIComponent(language)}` : "";
  return fetchJson(`/api/py/tts/voices${params}`);
}

export async function generateTTS(body: {
  text: string;
  language: string;
  voice?: string;
  rate?: string;
  pitch?: string;
}): Promise<TTSResponse> {
  return postJson("/api/py/tts/synthesize", body);
}

// ── Music API ──

export interface MusicResponse {
  success: boolean;
  filename?: string;
  file_path?: string;
  audio_url?: string;
  url?: string;
  file?: string;
  error?: string;
}

export async function generateSuno(body: {
  prompt: string;
  style?: string;
  lyrics?: string;
  instrumental?: boolean;
}): Promise<MusicResponse> {
  return postJson("/api/py/suno/generate", body);
}

export async function generateMusicGen(body: {
  prompt: string;
  duration_seconds: number;
  engine: string;
  style?: string;
}): Promise<MusicResponse> {
  return postJson("/api/py/music/generate", body);
}

export async function generateSunoLofi(): Promise<MusicResponse> {
  return postJson("/api/py/suno/lofi?mood=chill", {});
}

export async function generateSunoBgm(): Promise<MusicResponse> {
  return postJson("/api/py/suno/bgm?theme=corporate", {});
}

// ── Captions API ──

export interface CaptionStylesResponse {
  styles?: Record<string, { name: string; description?: string }>;
}

export interface CaptionPresetsResponse {
  presets?: Record<string, { name: string; description?: string }>;
}

export interface CaptionGenerateResponse {
  success: boolean;
  caption?: string;
  hashtags?: string[];
  style?: string;
  error?: string;
}

export async function fetchCaptionStyles(): Promise<CaptionStylesResponse> {
  return fetchJson("/api/py/captions/styles");
}

export async function fetchCaptionPresets(): Promise<CaptionPresetsResponse> {
  return fetchJson("/api/py/captions/presets");
}

export async function generateCaption(body: {
  topic: string;
  style: string;
  language: string;
  hashtag_count: number;
}): Promise<CaptionGenerateResponse> {
  return postJson("/api/py/captions/generate", body);
}

// ── Analyze API ──

export interface ChannelInfo {
  title?: string;
  name?: string;
  subscriber_count?: number;
  subscribers?: number;
  video_count?: number;
  videos?: number;
  total_views?: number;
  views?: number;
  platform?: string;
  description?: string;
  [key: string]: unknown;
}

export interface VideoInfo {
  title?: string;
  id?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  published_at?: string;
  publish_date?: string;
  date?: string;
}

export interface AnalyzeChannelResponse {
  channel?: ChannelInfo;
  videos?: VideoInfo[];
  avg_engagement?: string;
  avg_views?: number;
  total_views_analyzed?: number;
  top_niche?: string;
  top_count?: number;
  error?: string;
}

export interface CompareChannelResponse {
  channels?: (ChannelInfo & { recent_videos?: VideoInfo[] })[];
  comparison?: {
    winner?: string;
    mapped_metrics?: Record<string, string>;
  };
  error?: string;
}

export async function analyzeChannel(body: {
  channel_url: string;
  niche?: string;
  limit?: number;
}): Promise<AnalyzeChannelResponse> {
  return postJson("/api/py/analyze/channel", body);
}

export async function fetchChannelInfo(channel_url: string): Promise<{ channel?: ChannelInfo; error?: string }> {
  return fetchJson(`/api/py/analyze/info?channel_url=${encodeURIComponent(channel_url)}`);
}

export async function compareChannels(body: {
  channel_urls: string[];
  niche?: string;
}): Promise<CompareChannelResponse> {
  return postJson("/api/py/analyze/compare", body);
}

// ── Loop Video API ──

export interface LoopCreateResponse {
  success: boolean;
  filename?: string;
  file_path?: string;
  file_size?: number;
  error?: string;
}

export async function createLoopVideo(body: {
  audio_path: string;
  duration_minutes: number;
  visual_type: string;
  resolution: string;
  colors?: string;
  image_path?: string;
}): Promise<LoopCreateResponse> {
  return postJson("/api/py/loop/create", body);
}

// ── Autopilot API ──

export interface AutopilotJob {
  name?: string;
  job_id?: string;
  niche?: string;
  platforms?: string[];
  status?: string;
  created_at?: string;
  created?: string;
  createdAt?: string;
}

export interface AutopilotStatusResponse {
  jobs?: AutopilotJob[];
  data?: AutopilotJob[];
  active_jobs?: number;
  total_jobs?: number;
  last_run?: string;
}

export interface AutopilotCreateResponse {
  success: boolean;
  job_id?: string;
  error?: string;
}

export interface AutopilotRunResponse {
  success: boolean;
  jobs_run?: number;
  results?: { name?: string; job_id?: string; status?: string }[];
  message?: string;
  error?: string;
}

export async function fetchAutopilotStatus(): Promise<AutopilotStatusResponse> {
  return fetchJson("/api/py/autopilot/status");
}

export async function createAutopilotJob(body: {
  name: string;
  niche: string;
  platforms: string[];
}): Promise<AutopilotCreateResponse> {
  return postJson("/api/py/autopilot/create", body);
}

export async function runAutopilotJobs(): Promise<AutopilotRunResponse> {
  return postJson("/api/py/autopilot/run", {});
}
// ── Cloak API ──

export interface CloakProfileStatus {
  status?: string;
  state?: string;
  success?: boolean;
  [key: string]: unknown;
}

export interface CloakPostResponse {
  success: boolean;
  error?: string;
}

export async function checkCloakProfile(profileId: string): Promise<CloakProfileStatus> {
  return fetchJson(`/api/py/cloak/profile/${encodeURIComponent(profileId)}/status`);
}

export async function cloakPost(data: {
  profile_id: string;
  platform: string;
  caption: string;
  media_path?: string;
}): Promise<CloakPostResponse> {
  return postJson("/api/py/cloak/post", data);
}

// ── Engagement API ──

export interface EngageReplyResponse {
  reply?: string;
  text?: string;
  error?: string;
}

export async function fetchEngagementStats(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/py/engagement/stats`);
  if (!res.ok) throw new Error(`GET /api/py/engagement/stats failed: ${res.status}`);
  const data = await res.json();
  return data.stats || data;
}

export async function generateReply(data: {
  comment_text: string;
  platform: string;
  tone?: string;
}): Promise<EngageReplyResponse> {
  return postJson("/api/py/engagement/reply", data);
}

// ── Video Tools API ──

export interface VideoSearchResponse {
  success: boolean;
  [key: string]: unknown;
}

export interface VideoRefreshResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function searchVideo(url: string): Promise<VideoSearchResponse> {
  return postJson("/api/py/video/search", { url });
}

export async function refreshVideoCookies(): Promise<VideoRefreshResponse> {
  return postJson("/api/py/video/refresh-cookies", {});
}

export async function regenerateVideo(url: string): Promise<VideoSearchResponse> {
  return postJson("/api/py/video/regenerate", { url });
}

// ── Render Ad API ──

export interface RenderAdResponse {
  success?: boolean;
  url?: string;
  error?: string;
  [key: string]: unknown;
}

export async function renderAd(data: {
  title: string;
  format: string;
  style: string;
  background_color: string;
  text_color: string;
  image_url?: string;
  tagline?: string;
}): Promise<RenderAdResponse> {
  return postJson("/api/py/content/render-ad", data);
}

// ── Storyboard API ──

export interface StoryboardScene {
  scene_number: number;
  title: string;
  description?: string;
  duration_seconds?: number;
  image_path?: string;
  camera?: string;
  transition?: string;
  narration?: string;
  notes?: string;
  image_prompt?: string;
}

export interface StoryboardCreateResponse {
  success: boolean;
  scenes?: StoryboardScene[];
  total_scenes?: number;
  total_duration_seconds?: number;
  style?: string;
  aspect_ratio?: string;
  error?: string;
}

export async function createStoryboard(data: {
  prompt: string;
  style: string;
  num_scenes: number;
  aspect_ratio: string;
}): Promise<StoryboardCreateResponse> {
  return postJson("/api/py/storyboard/create", data);
}

export const STORYBOARD_IMAGE_BASE = "/api/py/storyboard/image/";

// ── Pinterest API ──

export interface PinterestResult {
  image?: string;
  title?: string;
  description?: string;
  images?: { orig?: { url: string } };
}

export interface PinterestSearchResponse {
  results?: PinterestResult[];
  [key: string]: unknown;
}

export interface PublishToFacebookResponse {
  success: boolean;
  detail?: string;
}

export async function searchPinterest(query: string, limit: number): Promise<PinterestSearchResponse> {
  return postJson("/api/py/pinterest/search", { query, limit });
}

export async function publishToFacebook(data: {
  image_url: string;
  page_id: string;
  message: string;
  affiliate_link?: string;
}): Promise<PublishToFacebookResponse> {
  return postJson("/api/py/publish-to-facebook", data);
}

// ── Fanpage API ──

export interface Fanpage {
  id: number;
  pageName: string;
  pageId: string;
  userId: string;
  accessToken: string;
  category?: string;
  fanCount?: number;
  isActive: boolean;
  lastUsedAt?: string;
}

export interface FanpageInput {
  userId: string;
  pageId: string;
  pageName: string;
  accessToken: string;
  category?: string;
  fanCount?: number;
  isActive: boolean;
}

export async function fetchFanpages(): Promise<Fanpage[]> {
  return fetchJson("/api/fanpages");
}

export async function getFanpage(id: number): Promise<Fanpage> {
  return fetchJson(`/api/fanpages/${id}`);
}

export async function createFanpage(data: FanpageInput): Promise<Fanpage> {
  return postJson("/api/fanpages", data);
}

export async function updateFanpage(id: number, data: FanpageInput): Promise<Fanpage> {
  const res = await fetch(`${API_BASE}/api/fanpages/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /api/fanpages/${id} failed: ${res.status}`);
  return res.json();
}

export async function deleteFanpage(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/fanpages/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/fanpages/${id} failed: ${res.status}`);
}
