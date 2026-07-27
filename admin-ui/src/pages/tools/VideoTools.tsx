import { useState } from "react";
import { Input, Button, Spinner } from "../components/UI";
import { searchVideo, refreshVideoCookies, regenerateVideo } from "../api/client";

export default function VideoTools() {
  const [searchUrl, setSearchUrl] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [cookiesResult, setCookiesResult] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [cookiesErr, setCookiesErr] = useState("");

  const [regenerateUrl, setRegenerateUrl] = useState("");
  const [regenerateResult, setRegenerateResult] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateErr, setRegenerateErr] = useState("");

  const handleSearch = async () => {
    setSearching(true);
    setSearchResult("");
    setSearchErr("");
    try {
      const res = await searchVideo(searchUrl);
      setSearchResult(JSON.stringify(res, null, 2));
    } catch (err: unknown) {
      setSearchErr(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleRefreshCookies = async () => {
    setRefreshing(true);
    setCookiesResult("");
    setCookiesErr("");
    try {
      const res = await refreshVideoCookies();
      setCookiesResult(res.message || "Cookies refreshed");
    } catch (err: unknown) {
      setCookiesErr(String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenerateResult("");
    setRegenerateErr("");
    try {
      const res = await regenerateVideo(regenerateUrl);
      setRegenerateResult(JSON.stringify(res, null, 2));
    } catch (err: unknown) {
      setRegenerateErr(String(err));
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4">Video Tools — Search</h2>
        <div className="space-y-3 max-w-md">
          <Input
            label="Video URL"
            name="searchUrl"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            placeholder="https://tiktok.com/@user/video/123"
            required
          />
          <Button onClick={handleSearch} loading={searching}>
            Search
          </Button>
        </div>
        {searchErr && <p className="text-red-400 mt-2">{searchErr}</p>}
        {searchResult && (
          <pre className="mt-2 p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {searchResult}
          </pre>
        )}
      </div>

      <hr className="border-gray-700" />

      <div>
        <h2 className="text-xl font-bold mb-4">Refresh Video Cookies</h2>
        <Button onClick={handleRefreshCookies} loading={refreshing} variant="secondary">
          Refresh Cookies
        </Button>
        {cookiesResult && <p className="text-green-400 mt-2">{cookiesResult}</p>}
        {cookiesErr && <p className="text-red-400 mt-2">{cookiesErr}</p>}
      </div>

      <hr className="border-gray-700" />

      <div>
        <h2 className="text-xl font-bold mb-4">Video Tools — Regenerate</h2>
        <div className="space-y-3 max-w-md">
          <Input
            label="Video URL"
            name="regenerateUrl"
            value={regenerateUrl}
            onChange={(e) => setRegenerateUrl(e.target.value)}
            placeholder="https://tiktok.com/@user/video/123"
            required
          />
          <Button onClick={handleRegenerate} loading={regenerating}>
            Regenerate
          </Button>
        </div>
        {regenerateErr && <p className="text-red-400 mt-2">{regenerateErr}</p>}
        {regenerateResult && (
          <pre className="mt-2 p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {regenerateResult}
          </pre>
        )}
      </div>
    </div>
  );
}
