import { useState, FormEvent } from "react";
import { Input, Select, Button, Spinner } from "../../components/UI";
import { renderAd } from "../../api/client";
import type { RenderAdResponse } from "../../api/client";

export default function RenderAd() {
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("beauty");
  const [brandName, setBrandName] = useState("Shopee Affiliate");
  const [affiliateLink, setAffiliateLink] = useState("");
  const [adCopy, setAdCopy] = useState("");
  const [hookText, setHookText] = useState("");
  const [ctaText, setCtaText] = useState("Link di Bio! 🔗");
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState<RenderAdResponse | null>(null);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRendering(true);
    setResult(null);
    setErr("");
    try {
      const res = await renderAd({
        title,
        image_url: imageUrl || undefined,
        category,
        brand_name: brandName || undefined,
        affiliate_link: affiliateLink || undefined,
        ad_copy: adCopy || undefined,
        hook_text: hookText || undefined,
        cta_text: ctaText || undefined,
      });
      setResult(res);
    } catch (err: unknown) {
      setErr(String(err));
    } finally {
      setRendering(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Render Product Ad Video</h2>
      <p className="text-sm text-gray-400 mb-4">
        Generate a 15-second product showcase video with AI-generated ad copy,
        animations, and branding.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Product Title</label>
          <Input
            value={title}
            onChange={setTitle}
            placeholder="e.g. Serum Vitamin C"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Product Image URL</label>
          <Input
            value={imageUrl}
            onChange={setImageUrl}
            placeholder="https://example.com/product.jpg"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category</label>
          <Select value={category} onChange={setCategory}>
            <option value="beauty">Beauty</option>
            <option value="fashion">Fashion</option>
            <option value="hobi">Hobi</option>
            <option value="kesehatan">Kesehatan</option>
            <option value="homeliving">Home & Living</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Brand Name</label>
          <Input
            value={brandName}
            onChange={setBrandName}
            placeholder="Shopee Affiliate"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Affiliate Link</label>
          <Input
            value={affiliateLink}
            onChange={setAffiliateLink}
            placeholder="https://shopee.co.id/..."
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Ad Copy (optional)</label>
          <Input
            value={adCopy}
            onChange={setAdCopy}
            placeholder="Leave blank for AI-generated"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Hook Text (optional)</label>
          <Input
            value={hookText}
            onChange={setHookText}
            placeholder="Leave blank for AI-generated"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">CTA Text</label>
          <Input
            value={ctaText}
            onChange={setCtaText}
            placeholder="Link di Bio! 🔗"
          />
        </div>
        <Button type="submit" variant="primary">
          {rendering ? "Rendering..." : "Render Ad Video"}
        </Button>
      </form>
      {rendering && <Spinner size={32} />}
      {err && <p className="text-red-400 mt-2">{err}</p>}
      {result?.data?.video_url && (
        <div className="mt-4">
          <p className="text-sm font-semibold mb-1">Result Video:</p>
          <video
            src={result.data.video_url}
            controls
            className="max-w-md rounded border border-gray-700"
            style={{ maxHeight: 480 }}
          />
        </div>
      )}
      {result && !result.data?.video_url && (
        <div className="mt-4">
          <pre className="p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
