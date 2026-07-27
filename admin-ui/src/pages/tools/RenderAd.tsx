import { useState, FormEvent } from "react";
import { Input, Select, Button } from "../../components/UI";
import { renderAd } from "../../api/client";
import type { RenderAdResponse } from "../../api/client";

export default function RenderAd() {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("square");
  const [style, setStyle] = useState("modern");
  const [bgColor, setBgColor] = useState("#1f2937");
  const [textColor, setTextColor] = useState("#ffffff");
  const [imageUrl, setImageUrl] = useState("");
  const [tagline, setTagline] = useState("");
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
        format,
        style,
        background_color: bgColor,
        text_color: textColor,
        image_url: imageUrl || undefined,
        tagline: tagline || undefined,
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
      <h2 className="text-xl font-bold mb-4">Render Ad</h2>
      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        <Input label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Select
          label="Format"
          name="format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          options={[
            { value: "square", label: "Square (1:1)" },
            { value: "landscape", label: "Landscape (16:9)" },
            { value: "portrait", label: "Portrait (9:16)" },
            { value: "story", label: "Story (9:16)" },
          ]}
        />
        <Select
          label="Style"
          name="style"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          options={[
            { value: "modern", label: "Modern" },
            { value: "classic", label: "Classic" },
            { value: "bold", label: "Bold" },
            { value: "minimal", label: "Minimal" },
          ]}
        />
        <Input label="Background Color" name="bgColor" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
        <Input label="Text Color" name="textColor" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
        <Input label="Image URL (optional)" name="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <Input label="Tagline (optional)" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <Button type="submit" variant="primary" loading={rendering}>
          Render Ad
        </Button>
      </form>
      {err && <p className="text-red-400 mt-2">{err}</p>}
      {result && (
        <div className="mt-4">
          <pre className="p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {JSON.stringify(result, null, 2)}
          </pre>
          {result.url && (
            <div className="mt-3">
              <p className="text-sm font-semibold mb-1">Result Image:</p>
              <img src={result.url} alt="Rendered ad" className="max-w-md rounded border border-gray-700" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
