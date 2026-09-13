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
import { Button, Tab, Toast } from "../components/UI";
import type { ProviderInfo } from "./providers/ProviderTypes";
import { ProviderGrid, SummaryCards } from "./providers/ProviderCards";
import { TasksTab } from "./providers/TasksTab";
import { CustomTab } from "./providers/CustomTab";

interface ProviderAllResponse {
  video: ProviderInfo[];
  image: ProviderInfo[];
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
            <SummaryCards providers={videoProviders} />
            <ProviderGrid providers={videoProviders} isVideo={true} loading={providersLoading} toggleProvider={toggleProvider} resetCircuitBreaker={resetCircuitBreaker} testProvider={testProvider} />
          </>
        )}
        {tab === "image" && (
          <>
            <SummaryCards providers={imageProviders} />
            <ProviderGrid providers={imageProviders} isVideo={false} loading={providersLoading} toggleProvider={toggleProvider} resetCircuitBreaker={resetCircuitBreaker} testProvider={testProvider} />
          </>
        )}
        {tab === "tasks" && (
          <TasksTab
            settingsLoading={settingsLoading}
            taskSettings={taskSettings}
            handleSettingChange={handleSettingChange}
            saveTaskSettings={saveTaskSettings}
            resetAllCircuitBreakers={resetAllCircuitBreakers}
            catalogLoading={catalogLoading}
            catalogSearch={catalogSearch}
            setCatalogSearch={setCatalogSearch}
            catalogFamily={catalogFamily}
            setCatalogFamily={setCatalogFamily}
            catalog={catalog}
            catalogVisionOnly={catalogVisionOnly}
            setCatalogVisionOnly={setCatalogVisionOnly}
            catalogFiltered={catalogFiltered}
            chatPrompt={chatPrompt}
            setChatPrompt={setChatPrompt}
            runAiChat={runAiChat}
            chatLoading={chatLoading}
            chatResult={chatResult}
          />
        )}
        {tab === "custom" && (
          <CustomTab
            editForm={editForm}
            setEditForm={setEditForm}
            saveCustomProvider={saveCustomProvider}
            closeEditForm={closeEditForm}
            openCreateForm={openCreateForm}
            customLoading={customLoading}
            customProviders={customProviders}
            openEditForm={openEditForm}
            handleTestCustom={handleTestCustom}
            handleFetchModels={handleFetchModels}
            handleCheckBalance={handleCheckBalance}
            handleDeleteCustom={handleDeleteCustom}
            testModal={testModal}
            setTestModal={setTestModal}
            viewModels={viewModels}
            setViewModels={setViewModels}
            viewBalance={viewBalance}
            setViewBalance={setViewBalance}
          />
        )}
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
