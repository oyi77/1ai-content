import { useState, useEffect } from "react";
import {
  fetchPersonas,
  savePersona,
  saveWelcomeMessage,
  type Persona,
} from "../api/client";
import { Input, Button, Spinner, Toast } from "../components/UI";

const ALL_PRESETS = ["quick", "standard", "extended", "custom"];

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [savingWelcome, setSavingWelcome] = useState(false);

  // Edit state per persona (stored as map)
  const [editState, setEditState] = useState<
    Record<string, { allNiches: boolean; niches: string[]; presets: string[]; multiplier: number }>
  >({});

  useEffect(() => {
    loadPersonas();
  }, []);

  async function loadPersonas() {
    setLoading(true);
    try {
      const data = await fetchPersonas();
      setPersonas(data);
      // Init edit state for each persona
      const es: Record<string, any> = {};
      for (const p of data) {
        es[p.id] = {
          allNiches: p.allowedNiches === "ALL",
          niches:
            p.allowedNiches === "ALL"
              ? []
              : (p.allowedNiches as string[]) || [],
          presets: p.allowedPresets || [],
          multiplier: p.priceMultiplier || 1.0,
        };
      }
      setEditState(es);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string, type: "success" | "error" | "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function toggleEdit(id: string) {
    setEditingId(editingId === id ? null : id);
  }

  async function handleSave(id: string) {
    const es = editState[id];
    if (!es) return;
    try {
      const payload: {
        id: string;
        allowedNiches: string[] | "ALL";
        allowedPresets: string[];
        priceMultiplier: number;
      } = {
        id,
        allowedNiches: es.allNiches ? "ALL" : es.niches,
        allowedPresets: es.presets,
        priceMultiplier: es.multiplier,
      };
      await savePersona(payload);
      showToast(`Persona "${id}" saved`, "success");
      setEditingId(null);
      // Refresh display row
      setPersonas((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, allowedNiches: payload.allowedNiches, allowedPresets: payload.allowedPresets, priceMultiplier: payload.priceMultiplier }
            : p,
        ),
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  function toggleNiche(id: string, niche: string) {
    setEditState((prev) => {
      const es = prev[id];
      if (!es) return prev;
      const niches = es.niches.includes(niche)
        ? es.niches.filter((n) => n !== niche)
        : [...es.niches, niche];
      return { ...prev, [id]: { ...es, niches } };
    });
  }

  function togglePreset(id: string, preset: string) {
    setEditState((prev) => {
      const es = prev[id];
      if (!es) return prev;
      const presets = es.presets.includes(preset)
        ? es.presets.filter((p) => p !== preset)
        : [...es.presets, preset];
      return { ...prev, [id]: { ...es, presets } };
    });
  }

  const niches = Array.from(
    new Set(personas.flatMap((p) => (Array.isArray(p.allowedNiches) ? p.allowedNiches : []))),
  ).sort();

  async function handleSaveWelcome() {
    if (!welcomeMessage.trim()) return;
    setSavingWelcome(true);
    try {
      await saveWelcomeMessage(welcomeMessage.trim());
      showToast("Welcome message saved", "success");
      setWelcomeMessage("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSavingWelcome(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={32} />
      </div>
    );
  if (error)
    return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">🎭 Persona Management</h1>
        <p className="text-text-muted text-sm mt-1">
          Override persona settings — allowed niches, presets, and price multipliers.
          Changes are persisted to DB and cached for 5 minutes.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-text-muted text-sm">{personas.length} personas loaded</span>
        <Button variant="ghost" onClick={loadPersonas}>
          🔃 Reload
        </Button>
      </div>

      {/* Personas Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs border-b border-border bg-surface-hover">
              <th className="text-left py-3 px-4 font-medium">Persona</th>
              <th className="text-left py-3 px-4 font-medium">Allowed Niches</th>
              <th className="text-left py-3 px-4 font-medium">Allowed Presets</th>
              <th className="text-left py-3 px-4 font-medium">Price Multiplier</th>
              <th className="text-right py-3 px-4 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {personas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-text-muted text-sm text-center py-8">
                  No personas found
                </td>
              </tr>
            ) : (
              personas.map((p) => {
                const es = editState[p.id];
                return (
                  <tr key={p.id} className="border-b border-border/50 text-text-secondary hover:bg-surface-hover/50">
                    <td className="py-3 px-4">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="ml-2 font-semibold text-text-primary">{p.name}</span>
                      <div className="text-xs text-text-muted mt-0.5">
                        <code className="bg-black/30 px-1.5 py-0.5 rounded text-text-muted">{p.id}</code>
                      </div>
                    </td>
                    <td className="py-3 px-4" id={`niches-display-${p.id}`}>
                      {p.allowedNiches === "ALL" ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-400">
                          ALL
                        </span>
                      ) : (
                        (Array.isArray(p.allowedNiches) ? p.allowedNiches : []).map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400 mr-1 mb-1"
                          >
                            {n}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {(p.allowedPresets || []).map((pr) => (
                        <span
                          key={pr}
                          className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/15 text-purple-400 mr-1 mb-1"
                        >
                          {pr}
                        </span>
                      ))}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-accent">
                        {(p.priceMultiplier || 1.0).toFixed(2)}x
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" onClick={() => toggleEdit(p.id)}>
                        ✏️ Edit
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* Inline Edit Rows */}
            {personas.map((p) => {
              if (editingId !== p.id) return null;
              const es = editState[p.id];
              if (!es) return null;
              return (
                <tr key={`edit-${p.id}`} className="bg-black/30 border-b border-border/50">
                  <td colSpan={5} className="py-4 px-4">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-4 items-start">
                      {/* Allowed Niches */}
                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                          Allowed Niches
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm mb-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-accent"
                            checked={es.allNiches}
                            onChange={(e) =>
                              setEditState((prev) => ({
                                ...prev,
                                [p.id]: { ...es, allNiches: e.target.checked },
                              }))
                            }
                          />
                          Allow ALL niches
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {niches.map((nid) => (
                            <label
                              key={nid}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-colors ${
                                es.allNiches
                                  ? "opacity-40 pointer-events-none border-border"
                                  : es.niches.includes(nid)
                                    ? "border-accent bg-accent/10"
                                    : "border-border bg-surface-hover"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={es.allNiches || es.niches.includes(nid)}
                                disabled={es.allNiches}
                                onChange={() => toggleNiche(p.id, nid)}
                              />
                              {nid}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Allowed Presets + Multiplier */}
                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                          Allowed Presets
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {ALL_PRESETS.map((pr) => (
                            <label
                              key={pr}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-colors ${
                                es.presets.includes(pr)
                                  ? "border-purple-500 bg-purple-500/10"
                                  : "border-border bg-surface-hover"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={es.presets.includes(pr)}
                                onChange={() => togglePreset(p.id, pr)}
                              />
                              {pr}
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                            Price Multiplier
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-20 px-2 py-1.5 rounded-lg bg-surface border border-border text-text-primary text-sm outline-none focus:border-accent/50"
                              value={es.multiplier}
                              min="0.1"
                              max="10"
                              step="0.05"
                              onChange={(e) =>
                                setEditState((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...es,
                                    multiplier: parseFloat(e.target.value) || 1.0,
                                  },
                                }))
                              }
                            />
                            <span className="text-xs text-text-muted">x (1.0 = no change)</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 pt-7">
                        <Button onClick={() => handleSave(p.id)}>💾 Save</Button>
                        <Button variant="ghost" onClick={() => toggleEdit(p.id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Welcome Message */}
      <div className="bg-surface border border-border rounded-xl p-5 mt-6">
        <h2 className="text-base font-semibold text-text-primary mb-1">Welcome Message</h2>
        <p className="text-text-muted text-xs mb-3">
          Set the welcome message shown to new users. Saved to system config.
        </p>
        <textarea
          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-border text-text-primary text-sm placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors resize-y min-h-[80px]"
          placeholder="Enter welcome message..."
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
        />
        <div className="mt-3">
          <Button onClick={handleSaveWelcome} disabled={savingWelcome || !welcomeMessage.trim()}>
            {savingWelcome ? "Saving…" : "Save Welcome Message"}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} visible />}
    </div>
  );
}
