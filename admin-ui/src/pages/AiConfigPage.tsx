import { useState, useEffect, useCallback } from "react";
import {
  fetchAIConfig,
  resetAIConfig,
  fetchCustomProviders,
  createCustomProvider,
  updateCustomProvider,
  deleteCustomProvider,
  testCustomProvider,
  fetchCustomProviderModels,
  checkCustomProviderBalance,
  fetchAITaskSettings,
  updateAITaskSettings,
  fetchModelsCatalog,
  testAiChatCompletion,
  type AIConfigResponse,
  type CustomProvider,
  type AITaskSettings,
  type ModelsCatalogEntry,
} from "../api/client";
import { Input, Select, Button, Textarea, Tab, Spinner, Toast } from "../components/UI";

type AiTabKey = "config" | "providers" | "catalog";

interface ProviderFormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  id?: string;
}

const emptyProviderForm: ProviderFormState = { name: "", baseUrl: "", apiKey: "", models: "" };

function dt(s?: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

function ModelBadge({ model }: { model: string }) {
  return <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/15 text-purple-400 border border-purple-500/25">{model}</span>;
}

export default function AiConfigPage() {
  const [activeTab, setActiveTab] = useState<AiTabKey>("config");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // AI Config
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(true);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [prompts, setPrompts] = useState<Record<string, unknown>[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);

  // Chat test
  const [chatMessage, setChatMessage] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Custom Providers
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm);
  const [providerFormSaving, setProviderFormSaving] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; message: string }>>({});

  // AI Task Settings
  const [taskSettings, setTaskSettings] = useState<AITaskSettings | null>(null);
  const [taskSettingsLoading, setTaskSettingsLoading] = useState(false);

  // Models Catalog
  const [catalogModels, setCatalogModels] = useState<ModelsCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  async function loadConfig() {
    setAiConfigLoading(true);
    try {
      const cfg = await fetchAIConfig();
      setAiConfig(cfg);
      if (Array.isArray(cfg.tasks)) setTasks(cfg.tasks as Record<string, unknown>[]);
      if (Array.isArray(cfg.prompts)) setPrompts(cfg.prompts as Record<string, unknown>[]);
    } catch (e) {
      setToast({ message: `Failed to load AI Config: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setAiConfigLoading(false);
    }
  }

  async function loadProviders() {
    setProvidersLoading(true);
    try {
      const data = await fetchCustomProviders();
      setProviders(data);
    } catch (e) {
      setToast({ message: `Failed to load custom providers: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setProvidersLoading(false);
    }
  }

  async function loadModelsCatalog() {
    if (catalogModels.length > 0) return;
    setCatalogLoading(true);
    try {
      const data = await fetchModelsCatalog();
      setCatalogModels(data.models);
    } catch (e) {
      setToast({ message: `Failed to load models catalog: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setCatalogLoading(false);
    }
  }

  // Chat test
  async function handleTestChat() {
    if (!chatMessage.trim()) return;
    setChatLoading(true);
    setChatResponse("");
    try {
      const res = await testAiChatCompletion(chatMessage);
      setChatResponse(typeof res === "string" ? res : JSON.stringify(res));
    } catch (e) {
      setChatResponse(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleResetConfig() {
    if (!confirm("Reset AI Config to defaults?")) return;
    try {
      await resetAIConfig();
      setToast({ message: "AI Config reset to defaults", type: "success" });
      loadConfig();
    } catch (e) {
      setToast({ message: `Failed to reset: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  }

  // Provider CRUD
  function openCreateProvider() {
    setProviderForm(emptyProviderForm);
    setShowProviderForm(true);
  }

  function openEditProvider(p: CustomProvider) {
    setProviderForm({
      id: p.id,
      name: p.name || "",
      baseUrl: (p as Record<string, unknown>).baseUrl as string || "",
      apiKey: (p as Record<string, unknown>).apiKey as string || "",
      models: Array.isArray(p.models) ? p.models.join(", ") : String((p as Record<string, unknown>).models || ""),
    });
    setShowProviderForm(true);
  }

  async function handleSaveProvider() {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim()) {
      setToast({ message: "Name and Base URL are required", type: "error" });
      return;
    }
    setProviderFormSaving(true);
    try {
      const modelsArr = providerForm.models.split(",").map((s) => s.trim()).filter(Boolean);
      if (providerForm.id) {
        await updateCustomProvider(providerForm.id, {
          name: providerForm.name,
          baseUrl: providerForm.baseUrl,
          apiKey: providerForm.apiKey,
          models: modelsArr,
        });
        setToast({ message: "Provider updated", type: "success" });
      } else {
        await createCustomProvider({
          name: providerForm.name,
          baseUrl: providerForm.baseUrl,
          apiKey: providerForm.apiKey,
          models: modelsArr,
        });
        setToast({ message: "Provider created", type: "success" });
      }
      setShowProviderForm(false);
      loadProviders();
    } catch (e) {
      setToast({ message: `Failed to save provider: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setProviderFormSaving(false);
    }
  }

  async function handleDeleteProvider(id: string) {
    if (!confirm("Delete this custom provider?")) return;
    try {
      await deleteCustomProvider(id);
      setToast({ message: "Provider deleted", type: "success" });
      loadProviders();
    } catch (e) {
      setToast({ message: `Failed to delete provider: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    }
  }

  async function handleTestProvider(id: string) {
    setTestingProviderId(id);
    try {
      const res = await testCustomProvider(id);
      setTestResult((prev) => ({ ...prev, [id]: res }));
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [id]: { status: "error", message: e instanceof Error ? e.message : "Unknown" } }));
    } finally {
      setTestingProviderId(null);
    }
  }

  async function handleCheckBalance(id: string) {
    try {
      const res = await checkCustomProviderBalance(id);
      setTestResult((prev) => ({ ...prev, [id]: res }));
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [id]: { status: "error", message: e instanceof Error ? e.message : "Unknown" } }));
    }
  }

  async function handleFetchModels(id: string) {
    try {
      const models = await fetchCustomProviderModels(id);
      setToast({ message: `Provider has ${models.length} models`, type: "info" });
      setTestResult((prev) => ({ ...prev, [id]: { status: "ok", message: `Models: ${models.join(", ")}` } }));
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [id]: { status: "error", message: e instanceof Error ? e.message : "Unknown" } }));
    }
  }

  // Task Settings
  async function handleLoadTaskSettings() {
    setTaskSettingsLoading(true);
    try {
      const settings = await fetchAITaskSettings();
      setTaskSettings(settings);
    } catch (e) {
      setToast({ message: `Failed to load task settings: ${e instanceof Error ? e.message : "Unknown"}`, type: "error" });
    } finally {
      setTaskSettingsLoading(false);
    }
  }


  function switchTab(tab: AiTabKey) {
    setActiveTab(tab);
    if (tab === "catalog" && catalogModels.length === 0 && !catalogLoading) loadModelsCatalog();
  }

  const filteredCatalog = catalogSearch
    ? catalogModels.filter((m) =>
        m.id?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        m.provider?.toLowerCase().includes(catalogSearch.toLowerCase())
      )
    : catalogModels;

  return (
    <div>
      {toast && (
        <div className="mb-4">
          <Toast message={toast.message} type={toast.type} visible={true} />
        </div>
      )}

      <div className="mb-5">
        <h2 className="text-lg font-bold text-text-primary mb-1">AI Configuration</h2>
        <p className="text-sm text-text-muted">Manage AI config, custom providers, and model catalog.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        <Tab label="Config" active={activeTab === "config"} onClick={() => switchTab("config")} />
        <Tab label="Custom Providers" active={activeTab === "providers"} onClick={() => switchTab("providers")} />
        <Tab label="Models Catalog" active={activeTab === "catalog"} onClick={() => switchTab("catalog")} />
      </div>

      {/* ── Config Tab ── */}
      {activeTab === "config" && (
        <div className="space-y-6">
          {aiConfigLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : (
            <>
              {/* AI Config JSON */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-text-primary">AI Config</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(JSON.stringify(aiConfig, null, 2)); setToast({ message: "Copied", type: "success" }); }}>
                      Copy
                    </Button>
                  </div>
                </div>
                <pre className="bg-[var(--bg2)] p-3 rounded-lg text-xs leading-relaxed overflow-x-auto text-text-secondary max-h-[400px]">
                  {JSON.stringify(aiConfig, null, 2)}
                </pre>
              </div>

              {/* Key Config Controls (display-only — no single-key update endpoint) */}
              {aiConfig && typeof aiConfig === "object" && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">Quick Settings (read-only)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(aiConfig)
                      .filter(([k]) => !k.startsWith("_") && typeof k === "string" && k.length < 40)
                      .map(([key, value]) => (
                        <div key={key} className="p-3 bg-[var(--bg2)] rounded-lg">
                          <label className="text-xs text-text-muted mb-1.5 block capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                          <div className="text-xs text-text-primary">{JSON.stringify(value)}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Tasks */}
              {tasks.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">AI Tasks ({tasks.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {tasks.map((task) => (
                      <div key={task.id || task.name} className="p-3 bg-[var(--bg2)] rounded-lg border border-border/50">
                        <div className="font-medium text-sm text-text-primary mb-1.5">{task.name}</div>
                        {task.model && <div className="flex items-center gap-2 mb-1"><span className="text-xs text-text-muted">Model:</span><ModelBadge model={task.model} /></div>}
                        {task.provider && <div className="text-xs text-text-muted mb-1">Provider: {task.provider}</div>}
                        {task.temperature != null && <div className="text-xs text-text-muted mb-1">Temperature: {task.temperature}</div>}
                        {task.maxTokens != null && <div className="text-xs text-text-muted mb-1">Max tokens: {task.maxTokens}</div>}
                        {task.prompt && (
                          <details className="mt-2">
                            <summary className="text-xs text-purple-400 cursor-pointer">Prompt</summary>
                            <pre className="mt-1 p-2 rounded text-xs text-text-secondary whitespace-pre-wrap bg-[var(--bg)] max-h-24 overflow-y-auto">{task.prompt}</pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompts */}
              {prompts.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-3">Prompts ({prompts.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {prompts.map((prompt) => (
                      <div key={prompt.id || prompt.name} className="p-3 bg-[var(--bg2)] rounded-lg border border-border/50">
                        <div className="font-medium text-sm text-text-primary mb-1.5">{prompt.name}</div>
                        <details>
                          <summary className="text-xs text-purple-400 cursor-pointer mb-1">Content</summary>
                          <pre className="p-2 rounded text-xs text-text-secondary whitespace-pre-wrap bg-[var(--bg)] max-h-32 overflow-y-auto">{prompt.content || prompt.prompt || JSON.stringify(prompt)}</pre>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task Settings */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-text-primary">AI Task Settings</h3>
                  {!taskSettings && <Button variant="ghost" size="sm" onClick={handleLoadTaskSettings}>{taskSettingsLoading ? <Spinner size={14} /> : "Load"}</Button>}
                </div>
                {taskSettings && (
                  <pre className="bg-[var(--bg2)] p-3 rounded-lg text-xs leading-relaxed overflow-x-auto text-text-secondary max-h-60">
                    {JSON.stringify(taskSettings, null, 2)}
                  </pre>
                )}
              </div>

              {/* Chat Test */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Test Chat Completion</h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Ask the AI something..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    className="flex-1 bg-[var(--bg2)] border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                    onKeyDown={(e) => { if (e.key === "Enter") handleTestChat(); }}
                  />
                  <Button variant="primary" onClick={handleTestChat} disabled={chatLoading || !chatMessage.trim()}>
                    {chatLoading ? <span className="flex items-center gap-2"><Spinner size={14} /> Sending...</span> : "Send"}
                  </Button>
                </div>
                {chatResponse && (
                  <div className="bg-[var(--bg2)] p-3 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">Response:</div>
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto">{chatResponse}</pre>
                  </div>
                )}
              </div>

              {/* Reset */}
              <div className="flex justify-end gap-2">
                <Button variant="danger" onClick={handleResetConfig}>Reset to Defaults</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Custom Providers Tab ── */}
      {activeTab === "providers" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Custom API Providers</h3>
            <Button variant="primary" onClick={openCreateProvider}>+ Add Provider</Button>
          </div>

          {providersLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : providers.length === 0 ? (
            <div className="text-center py-12 text-text-muted">No custom providers configured yet.</div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-purple-500/30 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-sm text-text-primary">{p.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {(p as Record<string, unknown>).baseUrl as string || "—"}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openEditProvider(p)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteProvider(p.id)}>Delete</Button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap my-2">
                    {Array.isArray(p.models) && p.models.map((m: string, i: number) => (
                      <ModelBadge key={i} model={m} />
                    ))}
                  </div>
                  <div className="flex gap-2 items-center mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestProvider(p.id)}
                      disabled={testingProviderId === p.id}
                    >
                      {testingProviderId === p.id ? <><Spinner size={12} /> Testing</> : "Test"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCheckBalance(p.id)}>Balance</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleFetchModels(p.id)}>Models</Button>
                    {testResult[p.id]?.message !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        testResult[p.id].status === "ok" ? "bg-emerald-500/20 text-emerald-400" :
                        testResult[p.id].status === "error" ? "bg-red-500/20 text-red-400" :
                        "bg-gray-500/20 text-gray-400"
                      }`}>
                        {testResult[p.id].message.length > 50
                          ? testResult[p.id].message.slice(0, 50) + "…"
                          : testResult[p.id].message}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Provider Form Modal */}
          {showProviderForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowProviderForm(false); }}>
              <div className="bg-surface border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-semibold text-text-primary">{providerForm.id ? "Edit Provider" : "Add Provider"}</h3>
                  <button className="text-text-muted hover:text-text-primary text-lg leading-none" onClick={() => setShowProviderForm(false)}>✕</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Provider Name</label>
                    <Input
                      placeholder="e.g. OpenAI, Anthropic"
                      value={providerForm.name}
                      onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Base URL</label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={providerForm.baseUrl}
                      onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Models (comma separated)</label>
                    <Input
                      placeholder="gpt-4, gpt-3.5-turbo"
                      value={providerForm.models}
                      onChange={(e) => setProviderForm({ ...providerForm, models: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2 border-t border-border">
                    <Button variant="ghost" onClick={() => setShowProviderForm(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleSaveProvider} disabled={providerFormSaving}>
                      {providerFormSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Models Catalog Tab ── */}
      {activeTab === "catalog" && (
        <div>
          <div className="flex gap-3 items-center mb-4">
            <input
              type="text"
              placeholder="Search models..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary flex-1 max-w-sm"
            />
            <Button variant="ghost" onClick={loadModelsCatalog}>{catalogLoading ? <Spinner size={14} /> : "Refresh"}</Button>
            <span className="text-xs text-text-muted">{filteredCatalog.length} models</span>
          </div>

          {catalogLoading ? (
            <div className="flex justify-center py-12"><Spinner size={32} /></div>
          ) : filteredCatalog.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              {catalogSearch ? "No matching models." : catalogModels.length === 0 ? "No models loaded. Click Refresh to fetch." : "No results."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr className="border-b border-border text-text-muted text-xs uppercase">
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-left px-4 py-3 font-medium">Provider</th>
                    <th className="text-left px-4 py-3 font-medium">Capabilities</th>
                    <th className="text-right px-4 py-3 font-medium">Max Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((m, i) => (
                    <tr key={m.id || i} className="border-b border-border/50 hover:bg-[var(--bg2)] transition-colors">
                      <td className="px-4 py-3 text-text-primary font-medium">{m.id}</td>
                      <td className="px-4 py-3 text-text-secondary">{m.providerName || m.provider || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {m.vision && <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400">vision</span>}
                          {m.reasoning && <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400">reasoning</span>}
                          {m.toolCall && <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/15 text-green-400">tool-call</span>}
                          {m.family && <span className="px-1.5 py-0.5 rounded text-xs bg-gray-500/15 text-gray-400">{m.family}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{m.contextWindow ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
