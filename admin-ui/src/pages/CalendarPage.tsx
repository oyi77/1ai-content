import { useState, useEffect, useCallback } from "react";
import {
  Input, Select, Button, Spinner, Toast,
} from "../components/UI";
import {
  fetchCalendarEntries,
  scheduleCalendarEntry,
  deleteCalendarEntry,
  type CalendarEntry,
} from "../api/client";

const STATUS_CLASS: Record<string, string> = {
  scheduled: "bg-yellow-500/20 text-yellow-400",
  generating: "bg-blue-500/20 text-blue-400",
  published: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
];

const CONTENT_TYPE_OPTIONS = [
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "remeta", label: "Re-Metadata" },
];

const STYLE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "viral", label: "Viral" },
  { value: "storytelling", label: "Storytelling" },
  { value: "minimal", label: "Minimal" },
];

export default function CalendarPage() {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form state
  const [topic, setTopic] = useState("");
  const [datetime, setDatetime] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [contentType, setContentType] = useState("video");
  const [niche, setNiche] = useState("");
  const [style, setStyle] = useState("educational");
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const data = await fetchCalendarEntries();
      setEntries(data.entries || []);
    } catch {
      showToast("Failed to load calendar", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const stats = {
    total: entries.length,
    scheduled: entries.filter((e) => e.status === "scheduled").length,
    published: entries.filter((e) => e.status === "published").length,
    failed: entries.filter((e) => e.status === "failed").length,
  };

  const handleSchedule = async () => {
    if (!topic.trim()) { showToast("Enter a topic", "error"); return; }
    if (!datetime) { showToast("Select date & time", "error"); return; }
    setSubmitting(true);
    try {
      const data = await scheduleCalendarEntry({
        user_id: 0,
        topic: topic.trim(),
        scheduled_at: datetime.replace("T", " "),
        platform,
        content_type: contentType,
        niche: niche.trim(),
        style,
      });
      if (data.id) {
        showToast("Content scheduled!");
        setShowForm(false);
        setTopic("");
        setDatetime("");
        loadEntries();
      } else {
        showToast(data.error || "Failed to schedule", "error");
      }
    } catch {
      showToast("Failed to schedule", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await deleteCalendarEntry(id);
      showToast("Deleted");
      loadEntries();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const typeEmoji = (ct: string) => {
    if (ct === "carousel") return "\uD83D\uDDBC\uFE0F";
    if (ct === "remeta") return "\uD83D\uDD04";
    return "\uD83C\uDFAC";
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Spinner size={32} />
        <div className="mt-2">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div>
      <Toast message={toast?.message ?? null} type={toast?.type} visible={!!toast} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">\uD83D\uDCC5 Content Calendar</h1>
          <p className="text-sm text-slate-400">Schedule and manage content publishing</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(true)}>+ Schedule Content</Button>
          <Button variant="ghost" onClick={loadEntries}>Refresh</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Scheduled</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.scheduled}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Published</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{stats.published}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Failed</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{stats.failed}</div>
        </div>
      </div>

      {/* Schedule Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-6 mb-5">
          <h3 className="text-base font-bold text-slate-100 mb-4">Schedule New Content</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Topic</label>
              <Input value={topic} onChange={setTopic} placeholder="Tips coding untuk pemula" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Date & Time</label>
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Platform</label>
              <Select value={platform} onChange={setPlatform}>
                {PLATFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
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
              <label className="block text-xs text-slate-400 mb-1">Niche</label>
              <Input value={niche} onChange={setNiche} placeholder="tech tips" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Style</label>
              <Select value={style} onChange={setStyle}>
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Button onClick={handleSchedule} disabled={submitting}>
              {submitting ? "Scheduling..." : "Schedule"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Calendar Table */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Topic</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Platform</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Type</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Scheduled</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-slate-500 tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">No scheduled content yet. Click + to add.</td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-700/50">
                  <td className="px-4 py-3 text-sm text-slate-100">{typeEmoji(e.content_type)} {e.topic}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{e.platform}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{e.content_type}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-300">{e.scheduled_at}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[e.status] || "bg-slate-600/20 text-slate-400"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
