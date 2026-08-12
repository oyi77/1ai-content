import { useState, useEffect, useCallback } from "react";
import {
  fetchJson,
  postJson,
  fetchCustomProviders,
  createCustomProvider,
  updateCustomProvider,
  deleteCustomProvider,
  testCustomProvider,
  fetchCustomProviderModels,
  checkCustomProviderBalance,
  fetchModelsCatalog,
  fetchAITaskSettings,
  updateAITaskSettings,
  testAiChatCompletion,
} from "../api/client";
import type {
  CustomProvider,
  CustomProviderUpdate,
  CustomProviderTestResult,
  ModelsCatalogEntry,
  AITaskSettings,
} from "../api/client";
import { Button, Spinner, Tab, Toast } from "../components/UI";

/* ── Types ── */

interface ProviderInfo {
  key: string;
  type: "video" | "image";
  name: string;
  priority: number;
  enabled: boolean;
  hasApiKey: boolean;
  strengths?: string[];
  quirks?: string | string[];
  avoid?: string[];
  maxDuration?: number;
  supportsRefImage?: boolean;
  costPerGenerationUsd?: number;
  supportsImg2Img?: boolean;
  supportsIPAdapter?: boolean;
}

interface ProviderAllResponse {
  video: ProviderInfo[];
  image: ProviderInfo[];
}

/* ── Helpers ── */

function statusColor(status: string): string {
  switch (status) {
    case "enabled":
      return "text-green-400";
    case "disabled":
      return "text-red-400";
    default:
      return "text-yellow-400";
  }
}

function pillColor(cat: string): string {
  switch (cat) {
    case "strengths":
    case "strength":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "quirks":
    case "quirk":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "avoid":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  }
}

/* ── Component ── */

export default function ProvidersPage() {
  const [tab, setTab] = useState<"video" | "image" | "tasks" | "custom">("video");

  /* Shared */
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = useCallback((msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── Provider data ── */
  const [videoProviders, setVideoProviders] = useState<ProviderInfo[]>([]);
  const [imageProviders, setImageProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerTestResult, setProviderTestResult] = useState<{ key: string; result: unknown } | null>(null);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const data = await fetchJson<ProviderAllResponse>("/api/admin/providers/all");
      setVideoProviders(data.video ?? []);
      setImageProviders(data.image ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load providers", "error");
    } finally {
      setProvidersLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const toggleProvider = useCallback(async (key: string, enabled: boolean) => {
    try {
      await postJson(`/api/admin/providers/${encodeURIComponent(key)}/toggle`, {});
      showToast(`${enabled ? "Disabled" : "Enabled"} ${key}`, "success");
      loadProviders();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Toggle failed", "error");
    }
  }, [showToast, loadProviders]);

  const resetCircuitBreaker = useCallback(async (key: string) => {
    try {
      await postJson(`/api/admin/providers/${encodeURIComponent(key)}/reset-cb`, {});
      showToast(`Circuit breaker reset for ${key}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reset failed", "error");
    }
  }, [showToast]);

  const testProvider = useCallback(async (key: string) => {
    try {
      const result = await postJson(`/api/admin/providers/${encodeURIComponent(key)}/test`, {});
      setProviderTestResult({ key, result });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Test failed", "error");
    }
  }, [showToast]);

  /* ── AI Tasks ── */
  const [taskSettings, setTaskSettings] = useState<AITaskSettings>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [catalog, setCatalog] = useState<ModelsCatalogEntry[]>([]);
  const [catalogFiltered, setCatalogFiltered] = useState<ModelsCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogFamily, setCatalogFamily] = useState("");
  const [catalogVisionOnly, setCatalogVisionOnly] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatResult, setChatResult] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const loadTaskSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await fetchAITaskSettings();
      setTaskSettings(data ?? {});
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load settings", "error");
    } finally {
      setSettingsLoading(false);
    }
  }, [showToast]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const data = await fetchModelsCatalog();
      setCatalog(data.models ?? []);
      setCatalogFiltered(data.models ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load catalog", "error");
    } finally {
      setCatalogLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (tab === "tasks") {
      loadTaskSettings();
      loadCatalog();
    }
  }, [tab, loadTaskSettings, loadCatalog]);

  useEffect(() => {
    let filtered = catalog;
    if (catalogSearch) {
      const q = catalogSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.providerName.toLowerCase().includes(q) ||
          m.family.toLowerCase().includes(q)
      );
    }
    if (catalogFamily) {
      filtered = filtered.filter((m) => m.family === catalogFamily);
    }
    if (catalogVisionOnly) {
      filtered = filtered.filter((m) => m.vision);
    }
    setCatalogFiltered(filtered);
  }, [catalog, catalogSearch, catalogFamily, catalogVisionOnly]);

  const saveTaskSettings = useCallback(async () => {
    try {
      await updateAITaskSettings(taskSettings);
      showToast("Settings saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }, [taskSettings, showToast]);
  const handleSettingChange = useCallback((key: string, raw: string) => {
    const orig = taskSettings[key];
    let value: unknown = raw;
    if (typeof orig === "number") value = parseFloat(raw) || 0;
    else if (typeof orig === "boolean") value = raw === "true" || raw === "1";
    setTaskSettings((prev) => ({ ...prev, [key]: value }));
  }, [taskSettings]);

  const resetAllCircuitBreakers = useCallback(async () => {
    try {
      await postJson("/api/admin/providers/reset-all-cb", {});
      showToast("All circuit breakers reset", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reset all failed", "error");
    }
  }, [showToast]);

  const runAiChat = useCallback(async () => {
    if (!chatPrompt.trim()) return;
    setChatLoading(true);
    setChatResult(null);
    try {
      const result = await testAiChatCompletion(chatPrompt);
      setChatResult(result.reply);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Chat test failed", "error");
    } finally {
      setChatLoading(false);
    }
  }, [chatPrompt, showToast]);

  /* ── Custom Providers ── */
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [editForm, setEditForm] = useState<{
    id?: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string;
  } | null>(null);
  const [testModal, setTestModal] = useState<{
    id: string;
    name: string;
    result: CustomProviderTestResult;
  } | null>(null);
  const [viewModels, setViewModels] = useState<{
    id: string;
    name: string;
    models: string[];
    error?: string;
  } | null>(null);
  const [viewBalance, setViewBalance] = useState<{
    id: string;
    name: string;
    balance?: string;
    error?: string;
  } | null>(null);

  const loadCustomProviders = useCallback(async () => {
    setCustomLoading(true);
    try {
      const data = await fetchCustomProviders();
      setCustomProviders(data ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load custom providers", "error");
    } finally {
      setCustomLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (tab === "custom") {
      loadCustomProviders();
    }
  }, [tab, loadCustomProviders]);

  const openCreateForm = useCallback(() => {
    setEditForm({ name: "", baseUrl: "", apiKey: "", models: "" });
  }, []);

  const openEditForm = useCallback((p: CustomProvider) => {
    setEditForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey ?? "",
      models: (p.models ?? []).join(", "),
    });
  }, []);

  const closeEditForm = useCallback(() => {
    setEditForm(null);
  }, []);

  const saveCustomProvider = useCallback(async () => {
    if (!editForm) return;
    const data: CustomProviderUpdate = {
      name: editForm.name,
      baseUrl: editForm.baseUrl,
      apiKey: editForm.apiKey || undefined,
      models: editForm.models
        ? editForm.models.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    };
    try {
      if (editForm.id) {
        await updateCustomProvider(editForm.id, data);
        showToast("Provider updated", "success");
      } else {
        await createCustomProvider(data);
        showToast("Provider created", "success");
      }
      closeEditForm();
      loadCustomProviders();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }, [editForm, showToast, closeEditForm, loadCustomProviders]);

  const handleDeleteCustom = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete custom provider "${name}"?`)) return;
    try {
      await deleteCustomProvider(id);
      showToast(`Deleted ${name}`, "success");
      loadCustomProviders();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }, [showToast, loadCustomProviders]);

  const handleTestCustom = useCallback(async (id: string, name: string) => {
    try {
      const result = await testCustomProvider(id);
      setTestModal({ id, name, result });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Test failed", "error");
    }
  }, [showToast]);

  const handleFetchModels = useCallback(async (id: string, name: string) => {
    try {
      const result = await fetchCustomProviderModels(id);
      setViewModels({ id, name, models: result.models ?? [] });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fetch models failed", "error");
    }
  }, [showToast]);
  const handleCheckBalance = useCallback(async (id: string, name: string) => {
    try {
      const result = await checkCustomProviderBalance(id);
      setViewBalance({ id, name, balance: result.balance, error: result.error });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Check balance failed", "error");
    }
  }, [showToast]);

  /* ── Provider Card renderer ── */
  const renderProviderCard = (p: ProviderInfo, isVideo: boolean) => (
    <div
      key={p.key}
      className={`rounded-xl border border-border p-5 ${
        p.enabled ? "bg-[#0d0d14]" : "bg-[#0a0a0a] opacity-60"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{p.name}</h3>
          <code className="text-xs text-text-muted">{p.key}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${statusColor(p.enabled ? "enabled" : "disabled")}`}>
            {p.enabled ? "Enabled" : "Disabled"}
          </span>
          <Button
            variant="ghost"
            onClick={() => toggleProvider(p.key, p.enabled)}
            className="!px-2 !py-1 text-xs"
          >
            Toggle
          </Button>
        </div>
      </div>

      {/* API key indicator + priority */}
      <div className="flex items-center gap-3 mb-3">
        <span className="flex items-center gap-1 text-xs">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              p.hasApiKey ? "bg-green-400" : "bg-red-400"
            }`}
          />
          {p.hasApiKey ? "Has API Key" : "No API Key"}
        </span>
        <span className="text-xs text-text-muted">Priority: {p.priority}</span>
      </div>

      {/* Tags */}
      {p.strengths && p.strengths.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {p.strengths.map((s) => (
            <span
              key={s}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("strengths")}`}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {(Array.isArray(p.quirks) ? p.quirks : p.quirks ? [p.quirks] : []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {(Array.isArray(p.quirks) ? p.quirks : [p.quirks]).map((q) => (
            <span
              key={q}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("quirks")}`}
            >
              {q}
            </span>
          ))}
        </div>
      )}
      {p.avoid && p.avoid.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {p.avoid.map((a) => (
            <span
              key={a}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("avoid")}`}
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Video-specific indicators */}
      {isVideo && (
        <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-3">
          {p.maxDuration != null && <span>Max Duration: {p.maxDuration}s</span>}
          {p.supportsRefImage && (
            <span className="text-purple-400">Supports Ref Image</span>
          )}
        </div>
      )}

      {/* Image-specific indicators */}
      {!isVideo && (
        <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-3">
          {p.costPerGenerationUsd != null && (
            <span>Cost: ${p.costPerGenerationUsd.toFixed(4)}</span>
          )}
          {p.supportsImg2Img && (
            <span className="text-purple-400">Img2Img</span>
          )}
          {p.supportsIPAdapter && (
            <span className="text-purple-400">IP-Adapter</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
        <Button variant="ghost" onClick={() => resetCircuitBreaker(p.key)} className="!px-2 !py-1 text-xs">
          Reset CB
        </Button>
        <Button variant="ghost" onClick={() => testProvider(p.key)} className="!px-2 !py-1 text-xs">
          Test
        </Button>
      </div>
    </div>
  );

  /* ── Summary Cards ── */
  const renderSummaryCards = (providers: ProviderInfo[]) => {
    const total = providers.length;
    const active = providers.filter((p) => p.enabled).length;
    const withKey = providers.filter((p) => p.hasApiKey).length;
    const erroring = providers.filter((p) => !p.hasApiKey).length;

    const cards = [
      { label: "Total Providers", value: total, color: "text-blue-400" },
      { label: "Active", value: active, color: "text-green-400" },
      { label: "With API Key", value: withKey, color: "text-purple-400" },
      { label: "Erroring", value: erroring, color: "text-red-400" },
    ];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-surface border border-border rounded-xl p-4"
          >
            <div className="text-xs text-text-muted mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>
    );
  };

  /* ── Provider Grid ── */
  const renderProviderGrid = (providers: ProviderInfo[], isVideo: boolean) => (
    <div>
      {providersLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : providers.length === 0 ? (
        <p className="text-text-muted text-center py-8">No providers found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => renderProviderCard(p, isVideo))}
        </div>
      )}
    </div>
  );

  /* ── AI Tasks Tab ── */
  const renderTasksTab = () => (
    <div className="space-y-6">
      {/* Settings form */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          AI Task Settings
        </h2>
        {settingsLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size={24} />
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(taskSettings).length === 0 ? (
              <p className="text-text-muted text-sm">No settings available.</p>
            ) : (
              Object.entries(taskSettings).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-sm text-text-primary min-w-[160px] capitalize">
                    {key.replace(/_/g, " ")}
                  </label>
                  <input
                    className="flex-1 bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                    value={typeof val === "string" ? val : JSON.stringify(val)}
                    onChange={(e) => handleSettingChange(key, e.target.value)}
                  />
                </div>
              ))
            )}
            <div className="flex gap-3 pt-3">
              <Button onClick={saveTaskSettings}>Save Settings</Button>
              <Button variant="secondary" onClick={resetAllCircuitBreakers}>
                Reset All Circuit Breakers
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Model Catalog Browser */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          Model Catalog
        </h2>
        {catalogLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size={24} />
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                className="bg-[#0a0a14] border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-purple-500 min-w-[200px]"
                placeholder="Search models..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
              />
              <select
                className="bg-[#0a0a14] border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                value={catalogFamily}
                onChange={(e) => setCatalogFamily(e.target.value)}
              >
                <option value="">All Families</option>
                {[...new Set(catalog.map((m) => m.family))].sort().map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalogVisionOnly}
                  onChange={(e) => setCatalogVisionOnly(e.target.checked)}
                  className="rounded border-border bg-[#0a0a14]"
                />
                Vision only
              </label>
            </div>

            {/* Table */}
            {catalogFiltered.length === 0 ? (
              <p className="text-text-muted text-sm">No models match filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-text-muted font-medium">Name</th>
                      <th className="text-left py-2 px-2 text-text-muted font-medium">Provider</th>
                      <th className="text-left py-2 px-2 text-text-muted font-medium">Family</th>
                      <th className="text-center py-2 px-2 text-text-muted font-medium">Vision</th>
                      <th className="text-center py-2 px-2 text-text-muted font-medium">Reasoning</th>
                      <th className="text-center py-2 px-2 text-text-muted font-medium">Tools</th>
                      <th className="text-right py-2 px-2 text-text-muted font-medium">Context</th>
                      <th className="text-right py-2 px-2 text-text-muted font-medium">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogFiltered.map((m) => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-[#0a0a14]/50">
                        <td className="py-2 px-2 text-text-primary font-medium">{m.name}</td>
                        <td className="py-2 px-2 text-text-muted">{m.providerName}</td>
                        <td className="py-2 px-2 text-text-muted">{m.family}</td>
                        <td className="py-2 px-2 text-center">
                          {m.vision ? (
                            <span className="text-green-400">Yes</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {m.reasoning ? (
                            <span className="text-purple-400">Yes</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {m.toolCall ? (
                            <span className="text-blue-400">Yes</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-text-muted">
                          {m.contextWindow != null
                            ? `${(m.contextWindow / 1024).toFixed(0)}K`
                            : "-"}
                        </td>
                        <td className="py-2 px-2 text-right text-text-muted">
                          {m.outputLimit != null
                            ? `${(m.outputLimit / 1024).toFixed(0)}K`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-text-muted mt-2">
              Showing {catalogFiltered.length} of {catalog.length} models
              {catalog.length > 0 &&
                ` (${([...new Set(catalog.filter((m) => m.vision).map((m) => m.family))].length)} vision families)`}
            </p>
          </>
        )}
      </div>

      {/* AI Chat Test */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
          AI Chat Test
        </h2>
        <textarea
          className="w-full bg-[#0a0a14] border border-border rounded-lg p-3 text-sm text-text-primary focus:outline-none focus:border-purple-500 mb-3"
          rows={4}
          placeholder="Enter a prompt to test AI chat..."
          value={chatPrompt}
          onChange={(e) => setChatPrompt(e.target.value)}
        />
        <div className="flex items-start gap-3">
          <Button onClick={runAiChat} disabled={chatLoading || !chatPrompt.trim()}>
            {chatLoading ? "Testing..." : "Send Test"}
          </Button>
        </div>
        {chatLoading && (
          <div className="mt-3">
            <Spinner size={20} />
          </div>
        )}
        {chatResult && (
          <div className="mt-3 bg-[#0a0a14] border border-border rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Response:</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{chatResult}</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Custom Providers Tab ── */
  const renderCustomTab = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">
          Manage custom API providers.
        </p>
        <Button onClick={openCreateForm}>Add Custom Provider</Button>
      </div>

      {/* Inline Edit / Create Form */}
      {editForm && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            {editForm.id ? "Edit Provider" : "New Provider"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Name</label>
              <input
                className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="My Provider"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Base URL</label>
              <input
                className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                value={editForm.baseUrl}
                onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">API Key (optional)</label>
              <input
                className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                value={editForm.apiKey}
                onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                placeholder="sk-..."
                type="password"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Models (comma-separated, optional)
              </label>
              <input
                className="w-full bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                value={editForm.models}
                onChange={(e) => setEditForm({ ...editForm, models: e.target.value })}
                placeholder="gpt-4, claude-3"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveCustomProvider}>
              {editForm.id ? "Update" : "Create"}
            </Button>
            <Button variant="secondary" onClick={closeEditForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Custom Provider List */}
      {customLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : customProviders.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-text-muted text-sm">No custom providers yet.</p>
          <p className="text-text-muted text-xs mt-1">
            Click "Add Custom Provider" to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-3 text-text-muted font-medium">Name</th>
                <th className="text-left py-3 px-3 text-text-muted font-medium">Base URL</th>
                <th className="text-left py-3 px-3 text-text-muted font-medium">Models</th>
                <th className="text-left py-3 px-3 text-text-muted font-medium">Updated</th>
                <th className="text-right py-3 px-3 text-text-muted font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customProviders.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-[#0a0a14]/40">
                  <td className="py-3 px-3 text-text-primary font-medium">{p.name}</td>
                  <td className="py-3 px-3 text-text-muted max-w-[200px] truncate">
                    <code className="text-xs">{p.baseUrl}</code>
                  </td>
                  <td className="py-3 px-3 text-text-muted">
                    {p.models && p.models.length > 0
                      ? p.models.slice(0, 2).join(", ") +
                        (p.models.length > 2 ? ` +${p.models.length - 2}` : "")
                      : "-"}
                  </td>
                  <td className="py-3 px-3 text-text-muted text-xs">
                    {p.updated_at
                      ? new Date(p.updated_at).toLocaleDateString()
                      : p.created_at
                        ? new Date(p.created_at).toLocaleDateString()
                        : "-"}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <Button
                        variant="ghost"
                        onClick={() => openEditForm(p)}
                        className="!px-2 !py-1 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleTestCustom(p.id, p.name)}
                        className="!px-2 !py-1 text-xs"
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleFetchModels(p.id, p.name)}
                        className="!px-2 !py-1 text-xs"
                      >
                        Models
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleCheckBalance(p.id, p.name)}
                        className="!px-2 !py-1 text-xs"
                      >
                        Balance
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleDeleteCustom(p.id, p.name)}
                        className="!px-2 !py-1 text-xs text-red-400"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Test Result Modal */}
      {testModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTestModal(null)}>
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Test Result: {testModal.name}
            </h3>
            <div className="mb-3">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  testModal.result.success
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {testModal.result.success ? "Success" : "Failed"}
              </span>
              {testModal.result.error && (
                <p className="text-red-400 text-xs mt-2">{testModal.result.error}</p>
              )}
            </div>
            {testModal.result.response && (
              <div className="bg-[#0a0a14] border border-border rounded-lg p-3 mb-3">
                <p className="text-xs text-text-muted mb-1">Response:</p>
                <pre className="text-xs text-text-primary whitespace-pre-wrap overflow-x-auto">
                  {typeof testModal.result.response === "string"
                    ? testModal.result.response
                    : JSON.stringify(testModal.result.response, null, 2)}
                </pre>
              </div>
            )}
            <Button variant="secondary" onClick={() => setTestModal(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Fetch Models Modal */}
      {viewModels && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewModels(null)}>
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Models: {viewModels.name}
            </h3>
            {viewModels.error ? (
              <p className="text-red-400 text-sm">{viewModels.error}</p>
            ) : viewModels.models.length === 0 ? (
              <p className="text-text-muted text-sm">No models found.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {viewModels.models.map((m) => (
                  <span
                    key={m}
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/30 text-text-muted"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setViewModels(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Modal */}
      {viewBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewBalance(null)}>
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Balance: {viewBalance.name}
            </h3>
            {viewBalance.error ? (
              <p className="text-red-400 text-sm">{viewBalance.error}</p>
            ) : (
              <div className="text-lg font-bold text-green-400">
                {viewBalance.balance ? `$${viewBalance.balance}` : "$0.00"}
              </div>
            )}
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setViewBalance(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ── Render ── */
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-text-primary">Providers</h1>
        <p className="text-sm text-text-muted mt-1">
          Manage AI providers, view model catalog, configure custom endpoints
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        <Tab label="Video Providers" active={tab === "video"} onClick={() => setTab("video")} />
        <Tab label="Image Providers" active={tab === "image"} onClick={() => setTab("image")} />
        <Tab label="AI Tasks" active={tab === "tasks"} onClick={() => setTab("tasks")} />
        <Tab label="Custom Providers" active={tab === "custom"} onClick={() => setTab("custom")} />
      </div>

      <div className="min-h-[200px]">
        {tab === "video" && (
          <>
            {renderSummaryCards(videoProviders)}
            {renderProviderGrid(videoProviders, true)}
          </>
        )}
        {tab === "image" && (
          <>
            {renderSummaryCards(imageProviders)}
            {renderProviderGrid(imageProviders, false)}
          </>
        )}
        {tab === "tasks" && renderTasksTab()}
        {tab === "custom" && renderCustomTab()}
      </div>

      {/* Provider Test Result Modal */}
      {providerTestResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setProviderTestResult(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Test Result: {providerTestResult.key}
            </h3>
            <pre className="bg-[#0a0a14] border border-border rounded-lg p-3 text-xs text-text-primary whitespace-pre-wrap overflow-x-auto max-h-[50vh]">
              {JSON.stringify(providerTestResult.result, null, 2)}
            </pre>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setProviderTestResult(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} visible={true} />}
    </div>
  );
}
