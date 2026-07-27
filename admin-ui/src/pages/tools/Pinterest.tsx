import { useState, useEffect, FormEvent } from "react";
import { Input, Button, Spinner, Select, Toast } from "../../components/UI";
import { searchPinterest, publishToFacebook, fetchFanpages } from "../../api/client";
import type { Fanpage, PinterestResult } from "../../api/client";

export default function Pinterest() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState<PinterestResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [fanpages, setFanpages] = useState<Fanpage[]>([]);
  const [selectedPage, setSelectedPage] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const [affiliateLink, setAffiliateLink] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [publishErr, setPublishErr] = useState("");

  useEffect(() => {
    fetchFanpages()
      .then((pages) => {
        setFanpages(pages);
        if (pages.length > 0) setSelectedPage(String(pages[0].id));
      })
      .catch(() => {});
  }, []);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setResults([]);
    setSearchErr("");
    try {
      const res = await searchPinterest(query, limit);
      setResults(res.results || []);
    } catch (err: unknown) {
      setSearchErr(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handlePublish = async (imageUrl: string) => {
    if (!selectedPage) return;
    setPublishing(true);
    setPublishMsg("");
    setPublishErr("");
    try {
      const res = await publishToFacebook({
        image_url: imageUrl,
        page_id: selectedPage,
        message: fbMessage || "Check this out!",
        affiliate_link: affiliateLink || undefined,
      });
      if (res.success) setPublishMsg("Published to Facebook!");
      else setPublishErr(res.detail || "Publish failed");
    } catch (err: unknown) {
      setPublishErr(String(err));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Pinterest Search &amp; Post</h2>

      <form onSubmit={handleSearch} className="space-y-3 max-w-md mb-6">
        <Input label="Search Query" name="query" value={query} onChange={(e) => setQuery(e.target.value)} required />
        <Input
          label="Limit"
          name="limit"
          type="number"
          value={String(limit)}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <Button type="submit" variant="primary" loading={searching}>
          Search Pinterest
        </Button>
      </form>

      {searchErr && <p className="text-red-400 mb-4">{searchErr}</p>}

      {results.length === 0 && !searching && !searchErr && (
        <p className="text-gray-400">No results. Try a search query.</p>
      )}

      {results.length > 0 && (
        <>
          <div className="mb-4 p-4 bg-gray-800 rounded space-y-3">
            <h3 className="font-semibold">Publish to Facebook</h3>
            <Select
              label="Facebook Page"
              name="selectedPage"
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              options={
                fanpages.length > 0
                  ? fanpages.map((p) => ({ value: String(p.id), label: p.pageName }))
                  : [{ value: "", label: "No pages loaded" }]
              }
            />
            <Input
              label="Message"
              name="fbMessage"
              value={fbMessage}
              onChange={(e) => setFbMessage(e.target.value)}
              placeholder="Check this out!"
            />
            <Input
              label="Affiliate Link (optional)"
              name="affiliateLink"
              value={affiliateLink}
              onChange={(e) => setAffiliateLink(e.target.value)}
              placeholder="https://example.com/ref"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((pin, i) => {
              const imgUrl = pin.images?.orig?.url || pin.image || "";
              return (
                <div key={i} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                  {imgUrl && (
                    <img src={imgUrl} alt={pin.title || "Pin"} className="w-full h-40 object-cover" />
                  )}
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{pin.title || "Untitled"}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{pin.description || ""}</p>
                    <Button
                      onClick={() => handlePublish(imgUrl)}
                      loading={publishing}
                      variant="secondary"
                      className="mt-2 w-full text-xs"
                      disabled={!selectedPage || !imgUrl}
                    >
                      Post to FB
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {publishMsg && <Toast message={publishMsg} type="success" onClose={() => setPublishMsg("")} />}
          {publishErr && <Toast message={publishErr} type="error" onClose={() => setPublishErr("")} />}
        </>
      )}
    </div>
  );
}
