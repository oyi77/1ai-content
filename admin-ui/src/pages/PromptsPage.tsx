import { useState, useEffect } from "react";
import {
  fetchAdminPrompts,
  createAdminPrompt,
  updateAdminPrompt,
  deleteAdminPrompt,
  type AdminPromptItem,
} from "../api/client";
import { Input, Select, Button, Textarea, Tab, Spinner, Toast } from "../components/UI";

const NICHE_OPTIONS = [
  "fnb", "fashion", "tech", "health", "travel",
  "education", "finance", "entertainment",
] as const;

const NICHE_EMOJI: Record<string, string> = {
  fnb: "🍔", fashion: "👗", tech: "📱", health: "💪",
  travel: "✈️", education: "📚", finance: "💰", entertainment: "🎭",
};

const NICHE_LABEL: Record<string, string> = {
  fnb: "F&B", fashion: "Fashion", tech: "Tech", health: "Health",
  travel: "Travel", education: "Education", finance: "Finance", entertainment: "Entertainment",
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<AdminPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [niche, setNiche] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdminPromptItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Add form
  const [addNiche, setAddNiche] = useState("fnb");
  const [addTitle, setAddTitle] = useState("");
  const [addPrompt, setAddPrompt] = useState("");

  // Edit form
  const [editNiche, setEditNiche] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async (nicheFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPrompts(nicheFilter === "all" ? undefined : nicheFilter);
      setPrompts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prompts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(niche); }, [niche]);

  const handleAdd = async () => {
    if (!addTitle.trim() || !addPrompt.trim()) {
      showToast("Title and prompt are required", "error");
      return;
    }
    try {
      await createAdminPrompt({ niche: addNiche, title: addTitle.trim(), prompt: addPrompt.trim() });
      showToast("Prompt saved to bot", "success");
      setAddTitle("");
      setAddPrompt("");
      setShowAdd(false);
      load(niche);
    } catch (e) {
      showToast(`Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    }
  };

  const openEdit = (p: AdminPromptItem) => {
    setEditing(p);
    setEditNiche(p.niche);
    setEditTitle(p.title);
    setEditPrompt(p.prompt);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (!editTitle.trim() || !editPrompt.trim()) {
      showToast("Title and prompt are required", "error");
      return;
    }
    try {
      await updateAdminPrompt(editing.id, {
        niche: editNiche,
        title: editTitle.trim(),
        prompt: editPrompt.trim(),
      });
      showToast("Prompt updated", "success");
      setEditing(null);
      load(niche);
    } catch (e) {
      showToast(`Failed to update: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    }
  };

  const handleDelete = async (p: AdminPromptItem) => {
    if (!confirm(`Delete prompt "${p.title}"?`)) return;
    try {
      await deleteAdminPrompt(p.id);
      showToast("Prompt deleted", "success");
      load(niche);
    } catch (e) {
      showToast(`Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    }
  };

  return (
    <div>
      <div className="section-title">Prompt Management</div>
      <div className="section-sub mb-6">
        Admin prompts are global and immediately available to all users
        in the bot and web app.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">{prompts.length}</div>
          <div className="text-sm text-text-muted mt-1">Total Prompts</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">{NICHE_OPTIONS.length}</div>
          <div className="text-sm text-text-muted mt-1">Niche Categories</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">
            {new Set(prompts.map((p) => p.niche)).size}
          </div>
          <div className="text-sm text-text-muted mt-1">Active Niches</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-2xl font-bold text-text-primary">—</div>
          <div className="text-sm text-text-muted mt-1">User Prompts</div>
        </div>
      </div>

      {/* Niche filters + Add button */}
      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <div className="flex flex-wrap gap-1">
          <Tab label="All" active={niche === "all"} onClick={() => setNiche("all")} />
          {NICHE_OPTIONS.map((n) => (
            <Tab
              key={n}
              label={`${NICHE_EMOJI[n]} ${NICHE_LABEL[n]}`}
              active={niche === n}
              onClick={() => setNiche(n)}
            />
          ))}
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ Add Prompt"}
        </Button>
      </div>

      {/* Inline add form */}
      {showAdd && (
        <div className="bg-surface border border-accent/30 rounded-xl p-5 mb-5">
          <div className="font-bold mb-4">+ New Admin Prompt</div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-text-muted block mb-1">Niche *</label>
              <Select value={addNiche} onChange={(e) => setAddNiche(e.target.value)}>
                {NICHE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {NICHE_EMOJI[n]} {NICHE_LABEL[n]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Title *</label>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. Dramatic Food Close-up"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted block mb-1">Prompt Text *</label>
              <Textarea
                value={addPrompt}
                onChange={(e) => setAddPrompt(e.target.value)}
                placeholder="Describe the prompt instructions..."
                rows={4}
              />
            </div>
          </div>
          <Button onClick={handleAdd}>Save to Bot</Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <span className="font-bold">Admin Prompts</span>
          <span className="text-xs text-text-muted">
            {prompts.length} prompt{prompts.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-muted gap-2">
            <Spinner /> Loading…
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-400">{error}</div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-10 text-text-muted">
            No prompts for this niche. Click "+ Add Prompt" to create one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs">
                <th className="text-left px-4 py-3 font-medium">Niche</th>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Prompt</th>
                <th className="text-left px-4 py-3 font-medium">Used</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/50 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent">
                      {NICHE_EMOJI[p.niche] || ""} {p.niche}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{p.title}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-text-muted max-w-[400px] truncate">
                      {p.prompt.slice(0, 120)}
                      {p.prompt.length > 120 ? "…" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{p.successRate}x</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="text-xs px-2 py-1"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs px-2 py-1 text-red-400"
                        onClick={() => handleDelete(p)}
                      >
                        Del
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="bg-surface border border-border rounded-xl p-7 w-[520px] shadow-2xl">
            <h3 className="font-bold mb-4">Edit Prompt</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Niche</label>
                <Select value={editNiche} onChange={(e) => setEditNiche(e.target.value)}>
                  {NICHE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {NICHE_EMOJI[n]} {NICHE_LABEL[n]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Prompt Text</label>
                <Textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={handleUpdate}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} visible={true} />}
    </div>
  );
}
