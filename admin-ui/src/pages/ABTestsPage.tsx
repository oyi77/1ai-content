import { useState, useEffect, useCallback } from "react";
import { Input, Select, Button, Spinner, Toast } from "../components/UI";
import {
  fetchABTests,
  createABTest,
  startABTest,
  endABTest,
  deleteABTest,
  type ABTest,
} from "../api/client";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-400",
  running: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
};

const CONTENT_TYPE_OPTIONS = [
  { value: "caption", label: "Caption" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
];

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
];

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("caption");
  const [platform, setPlatform] = useState("tiktok");
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadTests = useCallback(async () => {
    try {
      const data = await fetchABTests();
      setTests(data.tests || []);
    } catch {
      showToast("Failed to load tests", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTests(); }, [loadTests]);

  const handleCreate = async () => {
    if (!name.trim()) { showToast("Enter test name", "error"); return; }
    if (!topic.trim()) { showToast("Enter a topic", "error"); return; }
    setSubmitting(true);
    try {
      const data = await createABTest({
        user_id: 0,
        name: name.trim(),
        topic: topic.trim(),
        content_type: contentType,
        platform,
      });
      if (data.id) {
        showToast("A/B test created!");
        setShowForm(false);
        setName("");
        setTopic("");
        loadTests();
      } else {
        showToast(data.error || "Failed to create", "error");
      }
    } catch {
      showToast("Failed to create", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await startABTest(id);
      showToast("Test started!");
      loadTests();
    } catch {
      showToast("Failed to start test", "error");
    }
  };

  const handleEnd = async (id: string) => {
    try {
      const data = await endABTest(id);
      showToast(`Test ended! Winner: ${data.winner || "TBD"}`);
      loadTests();
    } catch {
      showToast("Failed to end test", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this test?")) return;
    try {
      await deleteABTest(id);
      showToast("Deleted");
      loadTests();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const variantDisplay = (v: ABTest["variant_a"]) => {
    return v?.caption || v?.title || JSON.stringify(v).slice(0, 120);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Spinner size={32} />
        <div className="mt-2">Loading tests...</div>
      </div>
    );
  }

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">A/B Testing</h1>
          <p className="text-sm text-slate-400">Test two content variants to find what performs better</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(true)}>+ New Test</Button>
          <Button variant="ghost" onClick={loadTests}>Refresh</Button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Create A/B Test</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Test Name</label>
              <Input value={name} onChange={setName} placeholder="Caption test #1" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Topic</label>
              <Input value={topic} onChange={setTopic} placeholder="Tips hemat belanja" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Content Type</label>
              <Select value={contentType} onChange={setContentType}>
                {CONTENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Platform</label>
              <Select value={platform} onChange={setPlatform}>
                {PLATFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create Test"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Tests List */}
      {tests.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-500">
          No A/B tests yet. Click + to create one.
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map((t) => {
            const varA = t.variant_a || {};
            const varB = t.variant_b || {};
            return (
              <div key={t.id} className="bg-slate-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <div className="text-base font-bold text-slate-100">{t.name}</div>
                    <div className="text-xs text-slate-400">
                      {t.topic} &middot; {t.content_type} &middot; {t.platform}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[t.status] || "bg-slate-600/20 text-slate-400"}`}>
                    {t.status}
                  </span>
                </div>

                {/* Variants */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`bg-slate-900 border rounded-xl p-4 ${t.winner === "A" ? "border-green-500" : "border-slate-700"}`}>
                    <div className="text-xs font-bold text-blue-400 uppercase mb-2">Variant A {t.winner === "A" ? "\uD83C\uDFC6" : ""}</div>
                    <div className="text-sm text-slate-200 mb-3">{variantDisplay(varA)}</div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>{t.metrics_a?.views || 0} views</span>
                      <span>{t.metrics_a?.likes || 0} likes</span>
                      <span>{t.metrics_a?.shares || 0} shares</span>
                      <span>{t.metrics_a?.comments || 0} comments</span>
                    </div>
                  </div>
                  <div className={`bg-slate-900 border rounded-xl p-4 ${t.winner === "B" ? "border-green-500" : "border-slate-700"}`}>
                    <div className="text-xs font-bold text-red-400 uppercase mb-2">Variant B {t.winner === "B" ? "\uD83C\uDFC6" : ""}</div>
                    <div className="text-sm text-slate-200 mb-3">{variantDisplay(varB)}</div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>{t.metrics_b?.views || 0} views</span>
                      <span>{t.metrics_b?.likes || 0} likes</span>
                      <span>{t.metrics_b?.shares || 0} shares</span>
                      <span>{t.metrics_b?.comments || 0} comments</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2 items-center">
                  {t.status === "draft" && (
                    <Button onClick={() => handleStart(t.id)}>Start Test</Button>
                  )}
                  {t.status === "running" && (
                    <Button variant="ghost" onClick={() => handleEnd(t.id)}>End &amp; Pick Winner</Button>
                  )}
                  {t.winner && (
                    <span className="text-sm text-green-400 font-semibold">
                      Winner: Variant {t.winner}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-red-400 hover:text-red-300 text-sm ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
